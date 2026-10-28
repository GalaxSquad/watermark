package kafka

import (
	"context"
	"fmt"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/twmb/franz-go/pkg/kgo"
)

// liveTailState manages a single live-tail session (one per topic at a time).
type liveTailState struct {
	cancel context.CancelFunc
	topic  string
}

// StartLiveTail begins streaming new messages from a topic to the frontend
// via Wails events ("liveTail:message" and "liveTail:error").
// Only one live-tail session can be active at a time.
func (k *KafkaService) StartLiveTail(topicName string) error {
	k.activeTailMu.Lock()
	defer k.activeTailMu.Unlock()

	// Stop any existing live-tail
	if k.activeTail != nil {
		k.activeTail.cancel()
		k.activeTail = nil
	}

	// Hold RLock across resolvePartitions to prevent data race with Disconnect()
	k.mu.RLock()
	if err := k.ensureConnected(); err != nil {
		k.mu.RUnlock()
		return err
	}
	baseOpts := append([]kgo.Opt{}, k.baseOpts...)

	ctx := k.getCtx()

	// Resolve partitions while still holding the read lock (uses k.admin)
	partitions, err := k.resolvePartitions(ctx, topicName, -1)
	k.mu.RUnlock()
	if err != nil {
		return fmt.Errorf("live tail: resolve partitions: %w", err)
	}

	// Start from latest offset (end of each partition)
	partOffsets := make(map[int32]kgo.Offset, len(partitions))
	for _, p := range partitions {
		partOffsets[p] = kgo.NewOffset().AtEnd()
	}
	offsets := map[string]map[int32]kgo.Offset{topicName: partOffsets}

	consumerOpts := append(baseOpts, kgo.ConsumePartitions(offsets))
	consumer, err := kgo.NewClient(consumerOpts...)
	if err != nil {
		return fmt.Errorf("live tail: new consumer: %w", err)
	}

	tailCtx, cancel := context.WithCancel(ctx)
	k.activeTail = &liveTailState{cancel: cancel, topic: topicName}

	// Streaming goroutine — polls and emits events
	go func() {
		defer consumer.Close()

		for {
			select {
			case <-tailCtx.Done():
				return
			default:
			}

			fetches := consumer.PollFetches(tailCtx)
			if tailCtx.Err() != nil {
				return // context cancelled
			}
			if errs := fetches.Errors(); len(errs) > 0 {
				if app := application.Get(); app != nil {
					app.Event.Emit("liveTail:error", errs[0].Err.Error())
				}
				time.Sleep(time.Second)
				continue
			}

			fetches.EachRecord(func(r *kgo.Record) {
				headers := make(map[string]string)
				for _, h := range r.Headers {
					headers[h.Key] = string(h.Value)
				}
				msg := Message{
					Partition: r.Partition,
					Offset:    r.Offset,
					Timestamp: r.Timestamp.UTC().Format(time.RFC3339),
					Key:       string(r.Key),
					Value:     string(r.Value),
					Headers:   headers,
				}
				if app := application.Get(); app != nil {
					app.Event.Emit("liveTail:message", msg)
				}
			})
		}
	}()

	return nil
}

// StopLiveTail stops the current live-tail session if one is active.
func (k *KafkaService) StopLiveTail() {
	k.activeTailMu.Lock()
	defer k.activeTailMu.Unlock()

	if k.activeTail != nil {
		k.activeTail.cancel()
		k.activeTail = nil
	}
}
