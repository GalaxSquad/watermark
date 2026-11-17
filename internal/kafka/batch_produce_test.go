package kafka

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"testing/synctest"
	"time"
)

func TestValidateBatchOptions(t *testing.T) {
	tests := []struct {
		name    string
		opts    ProduceBatchOptions
		wantErr bool
	}{
		{"valid zero tps", ProduceBatchOptions{Count: 1, TargetTPS: 0}, false},
		{"valid positive tps", ProduceBatchOptions{Count: 100, TargetTPS: 250}, false},
		{"count zero", ProduceBatchOptions{Count: 0}, true},
		{"count negative", ProduceBatchOptions{Count: -5}, true},
		{"count over guard", ProduceBatchOptions{Count: maxBatchCount + 1}, true},
		{"tps negative", ProduceBatchOptions{Count: 1, TargetTPS: -0.5}, true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := validateBatchOptions(tc.opts)
			if (err != nil) != tc.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tc.wantErr)
			}
		})
	}
}

func TestRunPacedBatchSendsEverySequenceOnce(t *testing.T) {
	const count = 100
	var mu sync.Mutex
	seen := make(map[int]int, count)

	outcome := runPacedBatch(context.Background(), count, 0, batchConcurrency, nil, func(_ context.Context, seq int) error {
		mu.Lock()
		seen[seq]++
		mu.Unlock()
		return nil
	})

	if outcome.Sent != count || outcome.Failed != 0 || outcome.Cancelled {
		t.Fatalf("outcome = %+v, want sent=%d failed=0 cancelled=false", outcome, count)
	}
	if len(seen) != count {
		t.Fatalf("distinct sequences = %d, want %d", len(seen), count)
	}
	for seq := 1; seq <= count; seq++ {
		if seen[seq] != 1 {
			t.Fatalf("sequence %d dispatched %d times, want 1", seq, seen[seq])
		}
	}
}

func TestRunPacedBatchHonoursTargetTPS(t *testing.T) {
	const (
		count     = 100
		targetTPS = 100
	)
	outcome := runPacedBatch(context.Background(), count, targetTPS, batchConcurrency, nil, func(context.Context, int) error {
		return nil
	})

	if outcome.Sent != count {
		t.Fatalf("sent = %d, want %d", outcome.Sent, count)
	}
	want := time.Second
	low := time.Duration(float64(want) * (1 - batchPacingTolerance))
	high := time.Duration(float64(want) * (1 + batchPacingTolerance))
	if outcome.Elapsed < low || outcome.Elapsed > high {
		t.Errorf("elapsed = %s, want within [%s, %s] for %d messages at %d tps", outcome.Elapsed, low, high, count, targetTPS)
	}

	observed := ratePerSecond(outcome.Sent, outcome.Elapsed)
	t.Logf("paced run: sent=%d elapsed=%s observed_tps=%.1f target_tps=%d", outcome.Sent, outcome.Elapsed, observed, targetTPS)
	if diff := observed - targetTPS; diff > targetTPS*batchPacingTolerance || diff < -targetTPS*batchPacingTolerance {
		t.Errorf("observed tps = %.1f, want %d ±%.0f%%", observed, targetTPS, batchPacingTolerance*100)
	}
}

func TestRunPacedBatchUnthrottled(t *testing.T) {
	const count = 2000
	outcome := runPacedBatch(context.Background(), count, 0, batchConcurrency, nil, func(context.Context, int) error {
		return nil
	})
	if outcome.Sent != count || outcome.Failed != 0 {
		t.Fatalf("outcome = %+v, want %d sent", outcome, count)
	}
	if outcome.Elapsed > time.Second {
		t.Errorf("unthrottled run of %d took %s, expected no pacing delay", count, outcome.Elapsed)
	}
	t.Logf("unthrottled run: sent=%d elapsed=%s observed_tps=%.0f", outcome.Sent, outcome.Elapsed, ratePerSecond(outcome.Sent, outcome.Elapsed))
}

func TestRunPacedBatchCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())

	var sends atomic.Int64
	done := make(chan batchOutcome, 1)
	go func() {
		done <- runPacedBatch(ctx, 10000, 50, batchConcurrency, nil, func(sendCtx context.Context, _ int) error {
			sends.Add(1)
			return nil
		})
	}()

	time.Sleep(120 * time.Millisecond)
	cancel()

	select {
	case outcome := <-done:
		if !outcome.Cancelled {
			t.Errorf("cancelled = false, want true")
		}
		if outcome.Sent >= 10000 || outcome.Sent == 0 {
			t.Errorf("sent = %d, want 0 < sent < 10000", outcome.Sent)
		}
		if outcome.Elapsed > 500*time.Millisecond {
			t.Errorf("cancellation took %s, want prompt stop", outcome.Elapsed)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("runPacedBatch did not return after cancellation")
	}
}

func TestRunPacedBatchCancelledAfterFullDispatch(t *testing.T) {
	const count = 3

	synctest.Test(t, func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())

		done := make(chan batchOutcome, 1)
		go func() {
			done <- runPacedBatch(ctx, count, 0, count, nil, func(sendCtx context.Context, _ int) error {
				<-sendCtx.Done()
				return sendCtx.Err()
			})
		}()

		// Every message is in flight and every worker is blocked in send, so the
		// dispatch loop has already finished (dispatched == count). Cancelling
		// here exercises the drain window that a dispatch-count check misses.
		synctest.Wait()
		cancel()
		synctest.Wait()

		select {
		case outcome := <-done:
			if !outcome.Cancelled {
				t.Fatalf("cancelled = false after cancellation; summary would look complete: %+v", outcome)
			}
			if outcome.Sent+outcome.Failed >= count {
				t.Fatalf("sent+failed = %d, want < %d so partiality is visible", outcome.Sent+outcome.Failed, count)
			}
			if outcome.Sent != 0 || outcome.Failed != 0 {
				t.Errorf("aborted sends counted: sent=%d failed=%d, want 0/0", outcome.Sent, outcome.Failed)
			}
		default:
			t.Fatal("runPacedBatch did not return after cancellation")
		}
	})
}

func TestRunPacedBatchMaxInFlight(t *testing.T) {
	const concurrency = 8
	var inFlight, maxInFlight atomic.Int64

	outcome := runPacedBatch(context.Background(), 64, 0, concurrency, nil, func(context.Context, int) error {
		current := inFlight.Add(1)
		for {
			peak := maxInFlight.Load()
			if current <= peak || maxInFlight.CompareAndSwap(peak, current) {
				break
			}
		}
		time.Sleep(5 * time.Millisecond)
		inFlight.Add(-1)
		return nil
	})

	if outcome.Sent != 64 {
		t.Fatalf("sent = %d, want 64", outcome.Sent)
	}
	if peak := maxInFlight.Load(); peak > concurrency {
		t.Errorf("max in-flight = %d, want <= %d", peak, concurrency)
	}
}

func TestRunPacedBatchConcurrencyClampedToCount(t *testing.T) {
	var inFlight, maxInFlight atomic.Int64

	runPacedBatch(context.Background(), 3, 0, batchConcurrency, nil, func(context.Context, int) error {
		current := inFlight.Add(1)
		for {
			peak := maxInFlight.Load()
			if current <= peak || maxInFlight.CompareAndSwap(peak, current) {
				break
			}
		}
		time.Sleep(10 * time.Millisecond)
		inFlight.Add(-1)
		return nil
	})

	if peak := maxInFlight.Load(); peak > 3 {
		t.Errorf("max in-flight = %d, want <= 3", peak)
	}
}

func TestRunPacedBatchCapsErrorSamples(t *testing.T) {
	const count = 25
	outcome := runPacedBatch(context.Background(), count, 0, batchConcurrency, nil, func(_ context.Context, seq int) error {
		return fmt.Errorf("boom %d", seq)
	})

	if outcome.Failed != count || outcome.Sent != 0 {
		t.Fatalf("outcome = %+v, want failed=%d", outcome, count)
	}
	if len(outcome.Errors) != batchErrorSampleLimit {
		t.Fatalf("error samples = %d, want %d", len(outcome.Errors), batchErrorSampleLimit)
	}
	if outcome.Errors[0].Index < 0 || outcome.Errors[0].Index >= count {
		t.Errorf("sample index %d out of range", outcome.Errors[0].Index)
	}
	if !strings.Contains(outcome.Errors[0].Error, "boom") {
		t.Errorf("sample error = %q, want wrapped message", outcome.Errors[0].Error)
	}
}

func TestRunPacedBatchProgressCadence(t *testing.T) {
	var mu sync.Mutex
	var calls [][2]int

	outcome := runPacedBatch(context.Background(), 100, 100, batchConcurrency, func(sent, failed int) {
		mu.Lock()
		calls = append(calls, [2]int{sent, failed})
		mu.Unlock()
	}, func(context.Context, int) error {
		return nil
	})

	if outcome.Sent != 100 {
		t.Fatalf("sent = %d, want 100", outcome.Sent)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(calls) < 2 {
		t.Fatalf("progress calls = %d, want initial call plus at least one tick", len(calls))
	}
	if calls[0] != [2]int{0, 0} {
		t.Errorf("first progress = %v, want [0 0]", calls[0])
	}
	if len(calls) > 12 {
		t.Errorf("progress calls = %d, want at most 12 for a one second run", len(calls))
	}
	for i := 1; i < len(calls); i++ {
		if calls[i][0] < calls[i-1][0] {
			t.Errorf("sent count went backwards: %v -> %v", calls[i-1], calls[i])
		}
	}
}

func TestBatchSlotExclusiveAndCancellable(t *testing.T) {
	service := NewKafkaService(nil)

	ctx, cancel, err := service.beginBatch()
	if err != nil {
		t.Fatalf("beginBatch: %v", err)
	}
	if ctx.Err() != nil {
		t.Fatal("fresh batch context already cancelled")
	}

	if _, _, err := service.beginBatch(); !errors.Is(err, ErrProduceBatchInProgress) {
		t.Fatalf("second beginBatch = %v, want ErrProduceBatchInProgress", err)
	}

	if err := service.CancelProduceMessageBatch(); err != nil {
		t.Fatalf("CancelProduceMessageBatch: %v", err)
	}
	select {
	case <-ctx.Done():
	case <-time.After(time.Second):
		t.Fatal("cancel did not stop the batch context")
	}

	service.endBatch(cancel)

	// A no-op cancel outside a run must not fail.
	if err := service.CancelProduceMessageBatch(); err != nil {
		t.Fatalf("idle CancelProduceMessageBatch: %v", err)
	}

	ctx2, cancel2, err := service.beginBatch()
	if err != nil {
		t.Fatalf("beginBatch after release: %v", err)
	}
	if ctx2.Err() != nil {
		t.Error("context ended before endBatch")
	}
	service.endBatch(cancel2)
}

func TestCollectUnknownVariables(t *testing.T) {
	opts := ProduceBatchOptions{
		Key:   "${BAZ}",
		Value: "${FOO} ${bar}",
		Headers: map[string]string{
			"a": "${bar} ${qux}",
			"b": "static",
		},
	}
	got := collectUnknownVariables(opts)
	want := []string{"${BAZ}", "${FOO}", "${bar}", "${qux}"}
	if len(got) != len(want) {
		t.Fatalf("unknown = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("unknown = %v, want %v", got, want)
		}
	}
}

func TestBuildBatchRecordExpandsPerMessage(t *testing.T) {
	opts := ProduceBatchOptions{
		Partition: 2,
		Key:       "key-${SEQUENCE}",
		Value:     "${UUID}-${SEQUENCE}",
		Headers: map[string]string{
			"trace": "t-${SEQUENCE}",
			"raw":   "static",
		},
	}

	first := buildBatchRecord("orders", opts, 1)
	second := buildBatchRecord("orders", opts, 2)

	if first.Topic != "orders" || first.Partition != 2 {
		t.Errorf("record topic/partition = %s/%d", first.Topic, first.Partition)
	}
	if string(first.Key) != "key-1" || string(second.Key) != "key-2" {
		t.Errorf("keys = %q / %q, want key-1 / key-2", first.Key, second.Key)
	}
	if !strings.HasSuffix(string(first.Value), "-1") || !strings.HasSuffix(string(second.Value), "-2") {
		t.Errorf("values = %q / %q, want sequence suffixes", first.Value, second.Value)
	}
	if string(first.Value) == string(second.Value) {
		t.Error("values should differ per message because of the UUID token")
	}

	headers := make(map[string]string, len(first.Headers))
	for _, header := range first.Headers {
		headers[header.Key] = string(header.Value)
	}
	if headers["trace"] != "t-1" {
		t.Errorf("header trace = %q, want t-1", headers["trace"])
	}
	if headers["raw"] != "static" {
		t.Errorf("header raw = %q, want static", headers["raw"])
	}
}

func TestBuildBatchRecordLeavesUnknownTokensLiteral(t *testing.T) {
	record := buildBatchRecord("t", ProduceBatchOptions{Value: "${NOPE}"}, 1)
	if string(record.Value) != "${NOPE}" {
		t.Errorf("value = %q, want literal token", record.Value)
	}
}
