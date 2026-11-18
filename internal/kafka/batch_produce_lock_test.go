package kafka

import (
	"context"
	"testing"
	"time"

	"github.com/twmb/franz-go/pkg/kgo"
)

// A batch must not hold the service lock: Connect, Disconnect and the idle
// reaper all need the write lock, and a long run would otherwise freeze cluster
// switching until the user cancels. The client reference is snapshotted under
// the lock instead, so a concurrent switch fails in-flight messages rather than
// blocking the UI.
func TestProduceMessageBatchReleasesServiceLock(t *testing.T) {
	// Unreachable broker: every send stays pending until the batch is cancelled,
	// which is exactly the long-running case this test guards.
	client, err := kgo.NewClient(kgo.SeedBrokers("127.0.0.1:1"))
	if err != nil {
		t.Fatalf("client: %v", err)
	}
	defer client.Close()

	svc := &KafkaService{client: client, connected: true, ctx: context.Background()}

	done := make(chan ProduceBatchSummary, 1)
	go func() {
		summary, _ := svc.ProduceMessageBatch("lock-test", ProduceBatchOptions{
			Count:     10,
			TargetTPS: 1,
			Value:     "lock-test",
		})
		done <- summary
	}()

	// Give the run time to reach the send loop before probing the lock.
	time.Sleep(100 * time.Millisecond)

	locked := make(chan struct{})
	go func() {
		svc.mu.Lock()
		svc.mu.Unlock()
		close(locked)
	}()

	select {
	case <-locked:
	case <-time.After(2 * time.Second):
		t.Fatal("service write lock is still held while a batch is running")
	}

	if err := svc.CancelProduceMessageBatch(); err != nil {
		t.Fatalf("cancel: %v", err)
	}

	select {
	case summary := <-done:
		if !summary.Cancelled {
			t.Fatalf("expected cancelled summary, got %+v", summary)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("batch did not return after cancellation")
	}
}
