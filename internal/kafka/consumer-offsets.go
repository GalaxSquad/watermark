package kafka

import (
	"fmt"

	"github.com/twmb/franz-go/pkg/kadm"
)

// ResetConsumerGroupOffsets resets offsets for a consumer group.
// strategy: "earliest", "latest".
func (k *KafkaService) ResetConsumerGroupOffsets(groupID string, strategy string) error {
	k.mu.RLock()
	defer k.mu.RUnlock()

	if err := k.ensureWritable(); err != nil {
		return err
	}

	ctx := k.getCtx()

	// Check group state — must be Empty or Dead
	described, err := k.admin.DescribeGroups(ctx, groupID)
	if err != nil {
		return fmt.Errorf("reset offsets: describe: %w", err)
	}
	dg := described[groupID]
	if dg.State == "Stable" || dg.State == "PreparingRebalance" || dg.State == "CompletingRebalance" {
		return ErrGroupActive
	}

	// Get current committed offsets to determine which topics/partitions
	committed, err := k.admin.FetchOffsets(ctx, groupID)
	if err != nil {
		return fmt.Errorf("reset offsets: fetch current: %w", err)
	}

	// Collect topic names from committed offsets
	topicMap := make(map[string]bool)
	committed.Each(func(o kadm.OffsetResponse) {
		topicMap[o.Topic] = true
	})
	topicNames := make([]string, 0, len(topicMap))
	for t := range topicMap {
		topicNames = append(topicNames, t)
	}
	if len(topicNames) == 0 {
		return fmt.Errorf("reset offsets: no committed offsets found")
	}

	// Build target offsets
	var targetOffsets kadm.Offsets
	switch strategy {
	case "earliest":
		starts, err := k.admin.ListStartOffsets(ctx, topicNames...)
		if err != nil {
			return fmt.Errorf("reset offsets: list start: %w", err)
		}
		targetOffsets = starts.Offsets()
	case "latest":
		ends, err := k.admin.ListEndOffsets(ctx, topicNames...)
		if err != nil {
			return fmt.Errorf("reset offsets: list end: %w", err)
		}
		targetOffsets = ends.Offsets()
	default:
		return fmt.Errorf("reset offsets: unsupported strategy: %s", strategy)
	}

	if _, err := k.admin.CommitOffsets(ctx, groupID, targetOffsets); err != nil {
		return fmt.Errorf("reset offsets: commit: %w", err)
	}

	return nil
}

// isGroupActiveState returns true when a consumer group has active members or is rebalancing,
// meaning external OffsetCommit requests without a member generation ID will be rejected by Kafka.
func isGroupActiveState(state string) bool {
	return state == "Stable" || state == "PreparingRebalance" || state == "CompletingRebalance"
}

// ClearConsumerGroupLag clears lag for the specified consumer group up to the current EndOffset
// on partitions where lag > 0.
//   - topicName == "" clears all lagging topics for the group; otherwise only topicName.
//   - partition < 0 clears all lagging partitions; otherwise only that partition.
//   - For Empty/Dead groups: commits EndOffset directly via CommitOffsets (leaving topic records untouched).
//   - For Stable/Rebalancing groups: truncates lagging records up to EndOffset via DeleteRecords on
//     ONLY the lagging partitions of this consumer group so active consumers skip them immediately.
func (k *KafkaService) ClearConsumerGroupLag(groupID string, topicName string, partition int32) ([]ClearLagResult, error) {
	k.mu.RLock()
	defer k.mu.RUnlock()

	if err := k.ensureWritable(); err != nil {
		return nil, err
	}

	ctx := k.getCtx()

	lags, lagErr := k.safeLag(ctx, groupID)
	if lagErr != nil {
		return nil, fmt.Errorf("clear lag: fetch group lag: %w", lagErr)
	}

	gl, ok := lags[groupID]
	if !ok {
		return nil, ErrGroupNotFound
	}
	if gl.DescribeErr != nil {
		return nil, fmt.Errorf("clear lag: describe group %s: %w", groupID, gl.DescribeErr)
	}
	if gl.FetchErr != nil {
		return nil, fmt.Errorf("clear lag: fetch offsets %s: %w", groupID, gl.FetchErr)
	}

	type partMeta struct {
		topic          string
		partition      int32
		previousOffset int64
		endOffset      int64
		lag            int64
	}
	var targets []partMeta
	targetOffsets := make(kadm.Offsets)

	for _, ml := range gl.Lag.Sorted() {
		if topicName != "" && ml.Topic != topicName {
			continue
		}
		if partition >= 0 && ml.Partition != partition {
			continue
		}
		currentOffset, lag := effectivePartitionLag(ml)
		if lag <= 0 || ml.End.Offset < 0 {
			continue
		}
		targets = append(targets, partMeta{
			topic:          ml.Topic,
			partition:      ml.Partition,
			previousOffset: currentOffset,
			endOffset:      ml.End.Offset,
			lag:            lag,
		})
		targetOffsets.Add(kadm.Offset{
			Topic:     ml.Topic,
			Partition: ml.Partition,
			At:        ml.End.Offset,
		})
	}

	if len(targets) == 0 {
		return []ClearLagResult{}, nil
	}

	results := make([]ClearLagResult, 0, len(targets))

	// Inactive groups (Empty/Dead): advance committed offsets directly without deleting topic records.
	// Active groups (Stable/Rebalancing): Kafka rejects external OffsetCommit without member generation ID,
	// so truncate lagging records up to EndOffset on only this group's lagging partitions via DeleteRecords.
	if !isGroupActiveState(gl.State) {
		commitResps, err := k.admin.CommitOffsets(ctx, groupID, targetOffsets)
		if err != nil {
			return nil, fmt.Errorf("clear lag: commit offsets: %w", err)
		}
		fallbackOffsets := make(kadm.Offsets)
		for _, t := range targets {
			res := ClearLagResult{
				GroupID:        groupID,
				Topic:          t.topic,
				Partition:      t.partition,
				PreviousOffset: t.previousOffset,
				NewOffset:      t.endOffset,
				ClearedLag:     t.lag,
				Method:         "commit_offsets",
			}
			if r, ok := commitResps.Lookup(t.topic, t.partition); ok && r.Err != nil {
				res.Error = r.Err.Error()
				fallbackOffsets.Add(kadm.Offset{
					Topic:     t.topic,
					Partition: t.partition,
					At:        t.endOffset,
				})
			}
			results = append(results, res)
		}
		if len(fallbackOffsets) > 0 {
			delResps, delErr := k.admin.DeleteRecords(ctx, fallbackOffsets)
			for i := range results {
				if results[i].Error == "" {
					continue
				}
				commitErrMsg := results[i].Error
				if delErr != nil {
					results[i].Error = fmt.Sprintf("commit_offsets: %s; delete_records: %s", commitErrMsg, delErr.Error())
				} else if r, ok := delResps.Lookup(results[i].Topic, results[i].Partition); ok {
					if r.Err != nil {
						results[i].Error = fmt.Sprintf("commit_offsets: %s; delete_records: %s", commitErrMsg, r.Err.Error())
					} else {
						results[i].Method = "delete_records"
						results[i].Error = ""
						results[i].NewOffset = r.LowWatermark
					}
				}
			}
		}
	} else {
		delResps, delErr := k.admin.DeleteRecords(ctx, targetOffsets)
		if delErr != nil {
			return nil, fmt.Errorf("clear lag: delete records: %w", delErr)
		}
		for _, t := range targets {
			res := ClearLagResult{
				GroupID:        groupID,
				Topic:          t.topic,
				Partition:      t.partition,
				PreviousOffset: t.previousOffset,
				NewOffset:      t.endOffset,
				ClearedLag:     t.lag,
				Method:         "delete_records",
			}
			if r, ok := delResps.Lookup(t.topic, t.partition); ok {
				if r.Err != nil {
					res.Error = r.Err.Error()
				} else {
					res.NewOffset = r.LowWatermark
				}
			}
			results = append(results, res)
		}
	}

	if k.cache != nil {
		k.cache.invalidate()
	}
	return results, nil
}

// ClearTopicLag clears ALL lag on the given topic across all consumer groups.
// It truncates lagging records on the topic partitions up to EndOffset via DeleteRecords
// and also advances committed offsets to EndOffset for inactive consumer groups consuming the topic.
func (k *KafkaService) ClearTopicLag(topicName string) ([]ClearLagResult, error) {
	k.mu.RLock()
	defer k.mu.RUnlock()

	if err := k.ensureWritable(); err != nil {
		return nil, err
	}
	if topicName == "" {
		return nil, fmt.Errorf("clear topic lag: topic name is required")
	}

	ctx := k.getCtx()
	groups, err := k.admin.ListGroups(ctx)
	if err != nil {
		return nil, fmt.Errorf("clear topic lag: list groups: %w", err)
	}
	if len(groups) == 0 {
		return []ClearLagResult{}, nil
	}

	groupIDs := make([]string, 0, len(groups))
	for _, g := range groups {
		groupIDs = append(groupIDs, g.Group)
	}

	lags, lagErr := k.safeLag(ctx, groupIDs...)
	if lagErr != nil {
		return nil, fmt.Errorf("clear topic lag: fetch lag: %w", lagErr)
	}

	type groupPartTarget struct {
		groupID        string
		state          string
		partition      int32
		previousOffset int64
		endOffset      int64
		lag            int64
	}

	var allTargets []groupPartTarget
	deleteOffsets := make(kadm.Offsets)
	inactiveGroupOffsets := make(map[string]kadm.Offsets)

	lags.Each(func(gl kadm.DescribedGroupLag) {
		partLags, ok := gl.Lag[topicName]
		if !ok {
			return
		}

		for _, ml := range partLags {
			currentOffset, lag := effectivePartitionLag(ml)
			if lag <= 0 || ml.End.Offset < 0 {
				continue
			}
			allTargets = append(allTargets, groupPartTarget{
				groupID:        gl.Group,
				state:          gl.State,
				partition:      ml.Partition,
				previousOffset: currentOffset,
				endOffset:      ml.End.Offset,
				lag:            lag,
			})
			if existing, ok := deleteOffsets.Lookup(topicName, ml.Partition); !ok || ml.End.Offset > existing.At {
				deleteOffsets.Add(kadm.Offset{
					Topic:     topicName,
					Partition: ml.Partition,
					At:        ml.End.Offset,
				})
			}
			if !isGroupActiveState(gl.State) {
				grpOffsets := inactiveGroupOffsets[gl.Group]
				grpOffsets.Add(kadm.Offset{
					Topic:     topicName,
					Partition: ml.Partition,
					At:        ml.End.Offset,
				})
				inactiveGroupOffsets[gl.Group] = grpOffsets
			}
		}
	})

	if len(allTargets) == 0 {
		return []ClearLagResult{}, nil
	}

	// 1. Delete lagging records up to EndOffset across all lagging partitions of the topic
	delResps, delErr := k.admin.DeleteRecords(ctx, deleteOffsets)

	// 2. Also commit EndOffset for inactive consumer groups so their stored lag immediately becomes 0
	commitRespsByGroup := make(map[string]kadm.OffsetResponses, len(inactiveGroupOffsets))
	commitErrByGroup := make(map[string]error, len(inactiveGroupOffsets))
	for groupID, grpOffsets := range inactiveGroupOffsets {
		cResps, cErr := k.admin.CommitOffsets(ctx, groupID, grpOffsets)
		commitRespsByGroup[groupID] = cResps
		commitErrByGroup[groupID] = cErr
	}

	results := make([]ClearLagResult, 0, len(allTargets))
	for _, t := range allTargets {
		res := ClearLagResult{
			GroupID:        t.groupID,
			Topic:          topicName,
			Partition:      t.partition,
			PreviousOffset: t.previousOffset,
			NewOffset:      t.endOffset,
			ClearedLag:     t.lag,
			Method:         "delete_records",
		}
		if delErr != nil {
			res.Error = delErr.Error()
		} else if r, ok := delResps.Lookup(topicName, t.partition); ok {
			if r.Err != nil {
				res.Error = r.Err.Error()
			} else {
				res.NewOffset = r.LowWatermark
			}
		}

		// For inactive consumer groups, if DeleteRecords failed (e.g. compacted topic)
		// but CommitOffsets succeeded, the group's lag was still cleared via offset commit.
		if !isGroupActiveState(t.state) {
			cErr := commitErrByGroup[t.groupID]
			cResps := commitRespsByGroup[t.groupID]
			if cErr == nil {
				if cr, ok := cResps.Lookup(topicName, t.partition); ok && cr.Err == nil {
					if res.Error != "" {
						res.Method = "commit_offsets"
						res.NewOffset = t.endOffset
						res.Error = ""
					}
				} else if ok && cr.Err != nil && res.Error != "" {
					res.Error = fmt.Sprintf("delete_records: %s; commit_offsets: %s", res.Error, cr.Err.Error())
				}
			} else if res.Error != "" {
				res.Error = fmt.Sprintf("delete_records: %s; commit_offsets: %s", res.Error, cErr.Error())
			}
		}
		results = append(results, res)
	}

	if k.cache != nil {
		k.cache.invalidate()
	}
	return results, nil
}
