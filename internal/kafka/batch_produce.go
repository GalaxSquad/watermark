package kafka

import (
	"context"
	"errors"
	"fmt"
	"math"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/wailsapp/wails/v3/pkg/application"
)

const (
	// batchConcurrency is the fixed worker-pool size for batch produce. It does
	// not scale with Count, so goroutine count stays constant regardless of load.
	batchConcurrency = 8

	// maxBatchCount is the upper guard on a single batch. Records are never
	// preallocated in bulk; the limit only protects against runaway input.
	maxBatchCount = 1_000_000

	// batchErrorSampleLimit caps the per-batch error samples returned to the UI.
	batchErrorSampleLimit = 10

	// batchProgressInterval bounds progress event frequency. The awaited summary
	// is authoritative; progress is best-effort UI feedback.
	batchProgressInterval = 150 * time.Millisecond

	// batchPacingTolerance documents the accepted deviation between requested
	// and observed TPS for runs of at least one second, assuming the broker keeps
	// up (workers are not the bottleneck). Tests assert against this bound.
	batchPacingTolerance = 0.20

	// minBatchTPS is the slowest pace worth running — one message every five
	// minutes. Slower than this a run is indistinguishable from a hang, and the
	// time.Duration conversion of the interval saturates far sooner than it
	// turns negative, so it cannot be detected downstream.
	minBatchTPS = 1.0 / 300

	// maxBatchInterval caps one pacing interval as a second line of defence for
	// callers that bypass validateBatchOptions.
	maxBatchInterval = 5 * time.Minute
)

// ErrProduceBatchInProgress is returned when a second batch is started while one
// is still running. Only one batch may run at a time.
var ErrProduceBatchInProgress = errors.New("produce batch: another batch is already running")

// ProduceBatchOptions describes a batch of Count identical message bodies sent
// to one topic/partition, with ${VARIABLE} expansion applied per message.
type ProduceBatchOptions struct {
	Partition int32             `json:"partition"`
	Key       string            `json:"key"`
	Value     string            `json:"value"`
	Headers   map[string]string `json:"headers,omitempty"`
	Count     int               `json:"count"`
	TargetTPS float64           `json:"targetTps"` // 0 = unthrottled
}

// ProduceBatchProgress is the payload of the "produce:batch:progress" event.
type ProduceBatchProgress struct {
	OpID      string  `json:"opId"`
	Total     int     `json:"total"`
	Sent      int     `json:"sent"`
	Failed    int     `json:"failed"`
	ElapsedMS int64   `json:"elapsedMs"`
	ActualTPS float64 `json:"actualTps"`
}

// ProduceErrorSample identifies one failed message. Index is the 0-based message
// ordinal, matching ProduceResult.Index.
type ProduceErrorSample struct {
	Index int    `json:"index"`
	Error string `json:"error"`
}

// ProduceBatchSummary is the authoritative result of a batch produce run.
type ProduceBatchSummary struct {
	Total            int                  `json:"total"`
	Sent             int                  `json:"sent"`
	Failed           int                  `json:"failed"`
	Cancelled        bool                 `json:"cancelled"`
	ElapsedMS        int64                `json:"elapsedMs"`
	ActualTPS        float64              `json:"actualTps"`
	Errors           []ProduceErrorSample `json:"errors,omitempty"`
	UnknownVariables []string             `json:"unknownVariables,omitempty"`
}

// ProduceMessageBatch sends opts.Value opts.Count times to topicName, expanding
// ${VARIABLE} tokens in the key, value and header values for every message.
// Progress is emitted on "produce:batch:progress"; the returned summary is
// authoritative. A cancelled run returns a summary with Cancelled=true and no error.
func (k *KafkaService) ProduceMessageBatch(topicName string, opts ProduceBatchOptions) (ProduceBatchSummary, error) {
	if err := validateBatchOptions(opts); err != nil {
		return ProduceBatchSummary{}, err
	}

	ctx, cancel, err := k.beginBatch()
	if err != nil {
		return ProduceBatchSummary{}, err
	}
	defer k.endBatch(cancel)

	// Take the client reference under the lock, then release it: a batch can run
	// for minutes, and holding k.mu.RLock would block Connect/Disconnect and the
	// idle reaper for the whole run. kgo clients are safe for concurrent use, so
	// a concurrent cluster switch closes this client and the in-flight messages
	// fail individually instead of wedging the UI.
	k.mu.RLock()
	err = k.ensureWritable()
	client := k.client
	k.mu.RUnlock()
	if err != nil {
		return ProduceBatchSummary{}, err
	}
	if client == nil {
		return ProduceBatchSummary{}, ErrNotConnected
	}

	opID := uuid.NewString()
	start := time.Now()
	emitProgress := func(sent, failed int) {
		app := application.Get()
		if app == nil {
			return
		}
		elapsed := time.Since(start)
		app.Event.Emit("produce:batch:progress", ProduceBatchProgress{
			OpID:      opID,
			Total:     opts.Count,
			Sent:      sent,
			Failed:    failed,
			ElapsedMS: elapsed.Milliseconds(),
			ActualTPS: ratePerSecond(sent, elapsed),
		})
	}

	send := func(sendCtx context.Context, seq int) error {
		return produceBatchRecord(sendCtx, client, topicName, opts, seq)
	}
	outcome := runPacedBatch(ctx, opts.Count, opts.TargetTPS, batchConcurrency, emitProgress, send)

	return ProduceBatchSummary{
		Total:            opts.Count,
		Sent:             outcome.Sent,
		Failed:           outcome.Failed,
		Cancelled:        outcome.Cancelled,
		ElapsedMS:        outcome.Elapsed.Milliseconds(),
		ActualTPS:        ratePerSecond(outcome.Sent, outcome.Elapsed),
		Errors:           outcome.Errors,
		UnknownVariables: collectUnknownVariables(opts),
	}, nil
}

// CancelProduceMessageBatch stops the running batch, if any. It is a no-op when
// nothing is running. The cancelled run returns normally with Cancelled=true.
func (k *KafkaService) CancelProduceMessageBatch() error {
	k.batchMu.Lock()
	cancel := k.batchCancel
	k.batchMu.Unlock()

	if cancel != nil {
		cancel()
	}
	return nil
}

// beginBatch claims the single batch slot and returns a cancellable context
// derived from the Wails runtime context.
func (k *KafkaService) beginBatch() (context.Context, context.CancelFunc, error) {
	k.batchMu.Lock()
	defer k.batchMu.Unlock()

	if k.batchCancel != nil {
		return nil, nil, ErrProduceBatchInProgress
	}
	ctx, cancel := context.WithCancel(k.getCtx())
	k.batchCancel = cancel
	return ctx, cancel, nil
}

// endBatch releases the batch slot. Safe to call more than once per batch.
func (k *KafkaService) endBatch(cancel context.CancelFunc) {
	if cancel != nil {
		cancel()
	}
	k.batchMu.Lock()
	k.batchCancel = nil
	k.batchMu.Unlock()
}

// validateBatchOptions rejects options that cannot produce a sensible run.
func validateBatchOptions(opts ProduceBatchOptions) error {
	if opts.Count < 1 {
		return fmt.Errorf("produce batch: count must be at least 1, got %d", opts.Count)
	}
	if opts.Count > maxBatchCount {
		return fmt.Errorf("produce batch: count must be at most %d, got %d", maxBatchCount, opts.Count)
	}
	if math.IsNaN(opts.TargetTPS) || math.IsInf(opts.TargetTPS, 0) {
		return fmt.Errorf("produce batch: target tps must be a finite number, got %v", opts.TargetTPS)
	}
	if opts.TargetTPS < 0 {
		return fmt.Errorf("produce batch: target tps must not be negative, got %v", opts.TargetTPS)
	}
	if opts.TargetTPS > 0 && opts.TargetTPS < minBatchTPS {
		return fmt.Errorf(
			"produce batch: target tps must be 0 (unthrottled) or at least %.4f, got %v",
			minBatchTPS, opts.TargetTPS,
		)
	}
	return nil
}

// batchOutcome is the raw result of a paced run, independent of Kafka.
type batchOutcome struct {
	Sent      int
	Failed    int
	Cancelled bool
	Elapsed   time.Duration
	Errors    []ProduceErrorSample
}

// runPacedBatch dispatches sequences 1..count through a fixed worker pool,
// pacing dispatch to targetTPS (<= 0 means unthrottled) and stopping on ctx
// cancellation. send performs one message; onProgress is called once at start
// and then at most every batchProgressInterval. Neither argument may be nil
// except onProgress.
//
// Messages never started because of cancellation are counted as neither sent
// nor failed.
func runPacedBatch(
	ctx context.Context,
	count int,
	targetTPS float64,
	concurrency int,
	onProgress func(sent, failed int),
	send func(ctx context.Context, seq int) error,
) batchOutcome {
	start := time.Now()

	workers := max(1, min(concurrency, count))

	var sentCount, failedCount atomic.Int64
	var errMu sync.Mutex
	var errs []ProduceErrorSample

	jobs := make(chan int)
	var wg sync.WaitGroup
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for seq := range jobs {
				if ctx.Err() != nil {
					continue
				}
				err := send(ctx, seq)
				if err != nil {
					// Errors caused by our own cancellation are not failures.
					if ctx.Err() != nil {
						continue
					}
					failedCount.Add(1)
					errMu.Lock()
					if len(errs) < batchErrorSampleLimit {
						errs = append(errs, ProduceErrorSample{Index: seq - 1, Error: err.Error()})
					}
					errMu.Unlock()
					continue
				}
				sentCount.Add(1)
			}
		}()
	}

	progressDone := make(chan struct{})
	if onProgress != nil {
		onProgress(0, 0)
		go func() {
			ticker := time.NewTicker(batchProgressInterval)
			defer ticker.Stop()
			for {
				select {
				case <-progressDone:
					return
				case <-ticker.C:
					onProgress(int(sentCount.Load()), int(failedCount.Load()))
				}
			}
		}()
	}

	var ticks <-chan time.Time
	if targetTPS > 0 {
		interval := time.Duration(float64(time.Second) / targetTPS)
		if interval <= 0 {
			interval = time.Nanosecond
		}
		if interval > maxBatchInterval {
			interval = maxBatchInterval
		}
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		ticks = ticker.C
	}

	dispatched := 0
dispatch:
	for seq := 1; seq <= count; seq++ {
		if ticks != nil {
			select {
			case <-ctx.Done():
				break dispatch
			case <-ticks:
			}
		} else if ctx.Err() != nil {
			break dispatch
		}
		select {
		case jobs <- seq:
			dispatched++
		case <-ctx.Done():
			break dispatch
		}
	}
	close(jobs)
	wg.Wait()
	close(progressDone)

	errMu.Lock()
	samples := errs
	errMu.Unlock()

	// Cancellation may land after the last dispatch but before workers drain, so
	// the dispatch shortfall alone under-reports it. Evaluate the run's own
	// cancellation state after wg.Wait so the flag is stable.
	return batchOutcome{
		Sent:      int(sentCount.Load()),
		Failed:    int(failedCount.Load()),
		Cancelled: dispatched < count || ctx.Err() != nil,
		Elapsed:   time.Since(start),
		Errors:    samples,
	}
}

// ratePerSecond converts a completed count and duration into throughput.
func ratePerSecond(n int, elapsed time.Duration) float64 {
	seconds := elapsed.Seconds()
	if seconds <= 0 {
		return 0
	}
	return float64(n) / seconds
}

// collectUnknownVariables returns the sorted union of unknown ${VAR} tokens
// found in the key, value and header values. Token support does not depend on
// the sequence number, so a single expansion pass over the template is enough.
func collectUnknownVariables(opts ProduceBatchOptions) []string {
	seen := make(map[string]struct{})
	var unknown []string

	// Header map order is random; sort so the summary is stable.
	headerNames := make([]string, 0, len(opts.Headers))
	for name := range opts.Headers {
		headerNames = append(headerNames, name)
	}
	slices.Sort(headerNames)

	sources := make([]string, 0, 2+len(headerNames))
	sources = append(sources, opts.Key, opts.Value)
	for _, name := range headerNames {
		sources = append(sources, opts.Headers[name])
	}

	for _, src := range sources {
		_, tokens := ExpandVariables(src, 1)
		for _, token := range tokens {
			key := strings.ToLower(token)
			if _, dup := seen[key]; dup {
				continue
			}
			seen[key] = struct{}{}
			unknown = append(unknown, token)
		}
	}
	slices.Sort(unknown)
	return unknown
}

// buildBatchRecord builds one record with all tokens expanded for seq.
func buildBatchRecord(topicName string, opts ProduceBatchOptions, seq int) *kgo.Record {
	key, _ := ExpandVariables(opts.Key, seq)
	value, _ := ExpandVariables(opts.Value, seq)

	record := &kgo.Record{
		Topic:     topicName,
		Partition: opts.Partition,
		Key:       []byte(key),
		Value:     []byte(value),
	}
	if len(opts.Headers) > 0 {
		record.Headers = make([]kgo.RecordHeader, 0, len(opts.Headers))
		for name, raw := range opts.Headers {
			expanded, _ := ExpandVariables(raw, seq)
			record.Headers = append(record.Headers, kgo.RecordHeader{
				Key:   name,
				Value: []byte(expanded),
			})
		}
	}
	return record
}

// produceBatchRecord expands all tokens for seq, sends one message and waits
// for the broker acknowledgement.
func produceBatchRecord(ctx context.Context, client *kgo.Client, topicName string, opts ProduceBatchOptions, seq int) error {
	record := buildBatchRecord(topicName, opts, seq)

	done := make(chan error, 1)
	client.Produce(ctx, record, func(_ *kgo.Record, err error) {
		done <- err
	})

	select {
	case err := <-done:
		if err != nil {
			return fmt.Errorf("produce: %w", err)
		}
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
