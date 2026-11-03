package kafka

import (
	"fmt"

	"github.com/twmb/franz-go/pkg/kadm"
)

// GetTopicConsumers returns consumer groups reading a specific topic.
func (k *KafkaService) GetTopicConsumers(topicName string) ([]ConsumerGroup, error) {
	k.mu.RLock()
	defer k.mu.RUnlock()

	if err := k.ensureConnected(); err != nil {
		return nil, err
	}

	ctx := k.getCtx()
	groups, err := k.admin.ListGroups(ctx)
	if err != nil {
		return nil, fmt.Errorf("topic consumers: %w", err)
	}

	groupIDs := make([]string, 0)
	for _, g := range groups {
		groupIDs = append(groupIDs, g.Group)
	}

	if len(groupIDs) == 0 {
		return []ConsumerGroup{}, nil
	}

	lags, err := k.safeLag(ctx, groupIDs...)
	if err != nil {
		return nil, fmt.Errorf("topic consumers lag: %w", err)
	}

	var result []ConsumerGroup
	lags.Each(func(gl kadm.DescribedGroupLag) {
		// Check if this group consumes the target topic
		partitionLags, ok := gl.Lag[topicName]
		if !ok {
			return
		}

		var topicLag int64
		for _, ml := range partitionLags {
			_, lag := effectivePartitionLag(ml)
			topicLag += lag
		}

		result = append(result, ConsumerGroup{
			GroupID:  gl.Group,
			State:    mapGroupState(gl.State),
			Members:  len(gl.Members),
			TotalLag: topicLag,
		})
	})

	if result == nil {
		return []ConsumerGroup{}, nil
	}

	return result, nil
}
