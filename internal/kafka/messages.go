package kafka

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kgo"
	"golang.org/x/sync/errgroup"
)

// consumeFromOffsets attaches the requested topic/partition offsets to the
// warm Kafka client, polls until all non-empty partitions reach their budget
// or high watermark, and immediately purges the topic from consuming state.
// Shared by ConsumeMessages and ConsumeMessagesFromTimestamp.
func (k *KafkaService) consumeFromOffsets(
	ctx context.Context,
	topicName string,
	partOffsets map[int32]kgo.Offset,
	partEndOffsets map[int32]int64,
	perPartition int,
	totalCap int,
) ([]Message, error) {
	if len(partOffsets) == 0 {
		return []Message{}, nil
	}

	k.browseMu.Lock()
	defer k.browseMu.Unlock()

	offsets := map[string]map[int32]kgo.Offset{topicName: partOffsets}
	k.client.AddConsumePartitions(offsets)
	defer k.client.PurgeTopicsFromConsuming(topicName)

	messages := make([]Message, 0, totalCap)

	// Safety timeout — warm client typically finishes in 1-2 poll cycles (<300ms)
	pollCtx, pollCancel := context.WithTimeout(ctx, 3*time.Second)
	defer pollCancel()

	partitions := make([]int32, 0, len(partOffsets))
	for p := range partOffsets {
		partitions = append(partitions, p)
	}

	// Track highest consumed offset and per-partition fetch count
	consumed := make(map[int32]int64, len(partitions))
	fetchedFromPart := make(map[int32]int, len(partitions))

	for len(messages) < totalCap {
		fetches := k.client.PollFetches(pollCtx)

		if pollCtx.Err() != nil {
			break
		}

		if errs := fetches.Errors(); len(errs) > 0 {
			return messages, fmt.Errorf("consume: poll: %v", errs[0].Err)
		}

		fetches.EachPartition(func(fp kgo.FetchTopicPartition) {
			if fp.Topic != topicName {
				return
			}
			// If broker returned an empty batch for this partition (e.g. compacted
			// gap or transaction control markers at the tail), mark it exhausted
			// immediately so we don't wait for pollCtx timeout.
			if len(fp.Records) == 0 {
				consumed[fp.Partition] = partEndOffsets[fp.Partition]
				return
			}

			for _, r := range fp.Records {
				if r.Offset+1 > consumed[r.Partition] {
					consumed[r.Partition] = r.Offset + 1
				}
				// Drop records from partitions that already hit their budget
				if fetchedFromPart[r.Partition] >= perPartition {
					continue
				}
				if len(messages) >= totalCap {
					continue
				}
				headers := make(map[string]string, len(r.Headers))
				for _, h := range r.Headers {
					headers[h.Key] = string(h.Value)
				}
				messages = append(messages, Message{
					Partition: r.Partition,
					Offset:    r.Offset,
					Timestamp: r.Timestamp.UTC().Format(time.RFC3339),
					Key:       string(r.Key),
					Value:     string(r.Value),
					Headers:   headers,
				})
				fetchedFromPart[r.Partition]++
			}

			// Also respect broker's reported HighWatermark if lower than cached endOffset
			if fp.HighWatermark >= 0 && consumed[fp.Partition] >= fp.HighWatermark {
				consumed[fp.Partition] = partEndOffsets[fp.Partition]
			}
		})

		allExhausted := true
		for _, p := range partitions {
			partBudgetHit := fetchedFromPart[p] >= perPartition
			partEndReached := consumed[p] >= partEndOffsets[p]
			if !partBudgetHit && !partEndReached {
				allExhausted = false
				break
			}
		}
		if allExhausted {
			break
		}
	}

	return messages, nil
}

// ConsumeMessages fetches N messages from a topic starting at given offset.
// partition=-1 reads from all partitions; startOffset=-1 for latest, -2 for earliest.
func (k *KafkaService) ConsumeMessages(topicName string, partition int32, startOffset int64, limit int) ([]Message, error) {
	k.mu.RLock()
	defer k.mu.RUnlock()

	if err := k.ensureConnected(); err != nil {
		return nil, err
	}
	if limit <= 0 {
		limit = 100
	}

	ctx := k.getCtx()

	// Fetch start (low watermark) and end (high watermark) offsets in parallel.
	// ListEndOffsets also gives us the full partition list for the topic,
	// eliminating a separate ListTopics round-trip.
	var startOffsets, endOffsets kadm.ListedOffsets
	g, gCtx := errgroup.WithContext(ctx)
	g.Go(func() error {
		var err error
		startOffsets, err = k.admin.ListStartOffsets(gCtx, topicName)
		if err != nil {
			return fmt.Errorf("consume: list start offsets: %w", err)
		}
		return nil
	})
	g.Go(func() error {
		var err error
		endOffsets, err = k.admin.ListEndOffsets(gCtx, topicName)
		if err != nil {
			return fmt.Errorf("consume: list end offsets: %w", err)
		}
		return nil
	})
	if err := g.Wait(); err != nil {
		return nil, err
	}

	topicEndOffsets, ok := endOffsets[topicName]
	if !ok || len(topicEndOffsets) == 0 {
		return nil, ErrTopicNotFound
	}

	var partitions []int32
	if partition >= 0 {
		if _, exists := topicEndOffsets[partition]; !exists {
			return nil, fmt.Errorf("consume: partition %d not found in topic %s", partition, topicName)
		}
		partitions = []int32{partition}
	} else {
		partitions = make([]int32, 0, len(topicEndOffsets))
		for p := range topicEndOffsets {
			if p >= 0 {
				partitions = append(partitions, p)
			}
		}
	}

	perPartition, totalCap := clampedBudget(limit, len(partitions))

	partOffsets := make(map[int32]kgo.Offset, len(partitions))
	partEndOffsets := make(map[int32]int64, len(partitions))
	for _, p := range partitions {
		eo := topicEndOffsets[p].Offset
		var so int64
		if lso, ok := startOffsets.Lookup(topicName, p); ok && lso.Offset > 0 {
			so = lso.Offset
		}
		// Skip empty partitions (lowWatermark >= highWatermark) so we never block polling them
		if eo <= so {
			continue
		}
		offset := resolveStartOffsetFromEndOffsets(eo, startOffset, perPartition)
		if offset < so {
			offset = so
		}
		if offset >= eo {
			continue
		}
		partEndOffsets[p] = eo
		partOffsets[p] = kgo.NewOffset().At(offset)
	}

	if len(partOffsets) == 0 {
		return []Message{}, nil
	}

	// Recompute budget across only non-empty partitions so a single active
	// partition can still fulfill the full requested limit when sibling partitions are empty.
	perPartition, totalCap = clampedBudget(limit, len(partOffsets))
	for p, eo := range partEndOffsets {
		var so int64
		if lso, ok := startOffsets.Lookup(topicName, p); ok && lso.Offset > 0 {
			so = lso.Offset
		}
		offset := resolveStartOffsetFromEndOffsets(eo, startOffset, perPartition)
		if offset < so {
			offset = so
		}
		partOffsets[p] = kgo.NewOffset().At(offset)
	}

	msgs, err := k.consumeFromOffsets(ctx, topicName, partOffsets, partEndOffsets, perPartition, totalCap)
	if err != nil {
		return nil, err
	}
	return mergeSortTrim(msgs, limit, startOffset == -1), nil
}

// ConsumeMessagesFromTimestamp fetches N messages from a topic starting at the
// first offset whose timestamp >= timestampMs (Unix milliseconds).
// partition=-1 reads from all partitions.
func (k *KafkaService) ConsumeMessagesFromTimestamp(topicName string, partition int32, timestampMs int64, limit int) ([]Message, error) {
	k.mu.RLock()
	defer k.mu.RUnlock()

	if err := k.ensureConnected(); err != nil {
		return nil, err
	}
	if limit <= 0 {
		limit = 100
	}

	ctx := k.getCtx()

	// Parallel: resolve timestamp offsets and end offsets in a single round-trip window
	var timestampOffsets, endOffsets kadm.ListedOffsets
	g, gCtx := errgroup.WithContext(ctx)
	g.Go(func() error {
		var err error
		timestampOffsets, err = k.admin.ListOffsetsAfterMilli(gCtx, timestampMs, topicName)
		if err != nil {
			return fmt.Errorf("consume: list offsets after milli: %w", err)
		}
		return nil
	})
	g.Go(func() error {
		var err error
		endOffsets, err = k.admin.ListEndOffsets(gCtx, topicName)
		if err != nil {
			return fmt.Errorf("consume: list end offsets: %w", err)
		}
		return nil
	})
	if err := g.Wait(); err != nil {
		return nil, err
	}

	topicEndOffsets, ok := endOffsets[topicName]
	if !ok || len(topicEndOffsets) == 0 {
		return nil, ErrTopicNotFound
	}

	var partitions []int32
	if partition >= 0 {
		partitions = []int32{partition}
	} else {
		partitions = make([]int32, 0, len(topicEndOffsets))
		for p := range topicEndOffsets {
			if p >= 0 {
				partitions = append(partitions, p)
			}
		}
	}

	partOffsets := make(map[int32]kgo.Offset, len(partitions))
	partEndOffsets := make(map[int32]int64, len(partitions))
	for _, p := range partitions {
		eo := topicEndOffsets[p].Offset
		to, ok := timestampOffsets.Lookup(topicName, p)
		if !ok || to.Offset < 0 || to.Offset >= eo {
			// No messages at or after timestampMs in this partition — skip it
			continue
		}
		partEndOffsets[p] = eo
		partOffsets[p] = kgo.NewOffset().At(to.Offset)
	}

	if len(partOffsets) == 0 {
		return []Message{}, nil
	}

	perPartition, totalCap := clampedBudget(limit, len(partOffsets))

	msgs, err := k.consumeFromOffsets(ctx, topicName, partOffsets, partEndOffsets, perPartition, totalCap)
	if err != nil {
		return nil, err
	}
	return mergeSortTrim(msgs, limit, false), nil
}

// resolvePartitions returns the target partition IDs for a topic.
// When partition >= 0, returns just that partition. Otherwise lists all via admin.
func (k *KafkaService) resolvePartitions(ctx context.Context, topicName string, partition int32) ([]int32, error) {
	if partition >= 0 {
		return []int32{partition}, nil
	}

	topics, err := k.admin.ListTopics(ctx, topicName)
	if err != nil {
		return nil, fmt.Errorf("consume: list topic: %w", err)
	}
	td, ok := topics[topicName]
	if !ok || td.Err != nil {
		return nil, ErrTopicNotFound
	}

	partitions := make([]int32, 0, len(td.Partitions))
	for _, p := range td.Partitions {
		partitions = append(partitions, p.Partition)
	}
	return partitions, nil
}

// resolveStartOffsetFromEndOffsets computes the actual start offset for a partition
// using pre-fetched end offsets. No additional broker calls needed.
// perPartition is the per-partition fetch budget (used for the latest-N window).
func resolveStartOffsetFromEndOffsets(endOffset int64, startOffset int64, perPartition int) int64 {
	if startOffset == -2 {
		return 0 // earliest
	}
	if startOffset >= 0 {
		return startOffset // explicit offset
	}
	// startOffset == -1: latest → read last perPartition messages from this partition
	actual := endOffset - int64(perPartition)
	if actual < 0 {
		actual = 0
	}
	return actual
}

// ProduceMessages sends a batch of messages to a topic concurrently and returns per-message results.
// Partial failures are reported individually — successful messages are not rolled back.
// Delegates to ProduceMessage for each item to avoid duplicated record-building logic.
func (k *KafkaService) ProduceMessages(topicName string, messages []ProduceMessageRequest) ([]ProduceResult, error) {
	results := make([]ProduceResult, len(messages))
	var wg sync.WaitGroup

	for i, msg := range messages {
		wg.Add(1)
		go func(idx int, m ProduceMessageRequest) {
			defer wg.Done()
			err := k.ProduceMessage(topicName, m.Partition, m.Key, m.Value, m.Headers)
			if err != nil {
				results[idx] = ProduceResult{Index: idx, Error: err.Error()}
				return
			}
			results[idx] = ProduceResult{Index: idx, Partition: m.Partition}
		}(i, msg)
	}

	wg.Wait()
	return results, nil
}
func (k *KafkaService) ProduceMessage(topicName string, partition int32, key string, value string, headers map[string]string) error {
	k.mu.RLock()
	defer k.mu.RUnlock()

	if err := k.ensureWritable(); err != nil {
		return err
	}

	record := &kgo.Record{
		Topic:     topicName,
		Partition: partition,
		Key:       []byte(key),
		Value:     []byte(value),
	}

	for k, v := range headers {
		record.Headers = append(record.Headers, kgo.RecordHeader{
			Key:   k,
			Value: []byte(v),
		})
	}

	ctx := k.getCtx()
	errCh := make(chan error, 1)
	k.client.Produce(ctx, record, func(_ *kgo.Record, err error) {
		errCh <- err
	})

	if err := <-errCh; err != nil {
		return fmt.Errorf("produce: %w", err)
	}

	return nil
}
