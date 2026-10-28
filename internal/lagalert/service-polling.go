package lagalert

import (
	"context"
	"fmt"
	"log"
	"time"

	"watermark-01/internal/lagrecorder"

	"github.com/google/uuid"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// pollLoop runs the periodic lag check. Uses panic recovery like consumers.go.
// Executes an immediate first poll before waiting for the ticker.
func (s *LagAlertService) pollLoop(ctx context.Context, clusterID string, interval time.Duration) {
	log.Printf("lagalert: pollLoop started for cluster=%s interval=%v", clusterID, interval)

	// Immediate first poll so data appears without waiting for full interval
	func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("lagalert: recovered panic in initial poll: %v", r)
			}
		}()
		if err := s.pollOnce(clusterID); err != nil {
			log.Printf("lagalert: initial poll error: %v", err)
		}
	}()

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Printf("lagalert: pollLoop stopped for cluster=%s", clusterID)
			return
		case <-ticker.C:
			func() {
				defer func() {
					if r := recover(); r != nil {
						log.Printf("lagalert: recovered panic in poll: %v", r)
					}
				}()
				if err := s.pollOnce(clusterID); err != nil {
					log.Printf("lagalert: poll error: %v", err)
				}
				// Run hourly cleanup if due (single disk-read)
				s.store.RunCleanupIfNeeded()
			}()
		}
	}
}

// pollOnce fetches lag, matches rules, detects transitions, and emits events.
func (s *LagAlertService) pollOnce(clusterID string) error {
	cfg := s.store.GetClusterConfig(clusterID)
	if cfg == nil || !cfg.Enabled {
		return nil
	}
	if !cfg.RecordingEnabled && !hasEnabledRules(cfg.Rules) {
		return nil
	}

	groups, err := s.kafkaSvc.GetConsumerGroups()
	if err != nil {
		return fmt.Errorf("get consumer groups: %w", err)
	}

	// Record lag snapshot for charting (piggyback on poll loop)
	// Single-tier recording: only entities matching include AND NOT matching exclude
	if cfg.RecordingEnabled && s.recorder != nil {
		snapshot := lagrecorder.LagSnapshot{
			Timestamp: time.Now().UTC(),
			Groups:    make(map[string]int64),
			Topics:    make(map[string]int64),
		}

		// Filter groups: empty TrackedGroups = record nothing (same as topics)
		for _, g := range groups {
			included := len(cfg.TrackedGroups) > 0 && matchesAnyGlob(g.GroupID, cfg.TrackedGroups)
			excluded := len(cfg.ExcludedGroups) > 0 && matchesAnyGlob(g.GroupID, cfg.ExcludedGroups)
			if included && !excluded {
				snapshot.Groups[g.GroupID] = g.TotalLag
			}
		}

		// Filter topics: empty TrackedTopics = record nothing (opt-in)
		if topicLags, err := s.kafkaSvc.GetAllGroupsLagDetail(); err == nil {
			for _, tl := range topicLags {
				included := len(cfg.TrackedTopics) > 0 && matchesAnyGlob(tl.Topic, cfg.TrackedTopics)
				excluded := len(cfg.ExcludedTopics) > 0 && matchesAnyGlob(tl.Topic, cfg.ExcludedTopics)
				if included && !excluded {
					snapshot.Topics[tl.Topic] = tl.TotalLag
				}
			}
		}

		// Only record if we have data
		if len(snapshot.Topics) > 0 || len(snapshot.Groups) > 0 {
			log.Printf("lagalert: recording snapshot — topics=%d groups=%d", len(snapshot.Topics), len(snapshot.Groups))
			s.recorder.Record(snapshot)
		}
	}

	var newAlerts []AlertEvent
	var recoveries []AlertEvent

	s.mu.Lock()
	for _, group := range groups {
		rule := matchRule(group.GroupID, cfg.Rules)
		if rule == nil {
			// No matching rule — check if was in breach (recovery)
			if prev, ok := s.breachState[group.GroupID]; ok && prev != "" {
				delete(s.breachState, group.GroupID)
				s.notifier.ClearState(clusterID, group.GroupID)
				// Mark existing alert as resolved
				go s.resolveActiveAlert(clusterID, group.GroupID)
				recoveries = append(recoveries, AlertEvent{
					ID:        uuid.New().String(),
					ClusterID: clusterID,
					GroupID:   group.GroupID,
					Resolved:  true,
				})
			}
			continue
		}

		currentLevel := determineLevel(group.TotalLag, rule)
		prevLevel := s.breachState[group.GroupID]

		if currentLevel == "" {
			// Healthy — check for recovery
			if prevLevel != "" {
				delete(s.breachState, group.GroupID)
				s.notifier.ClearState(clusterID, group.GroupID)
				go s.resolveActiveAlert(clusterID, group.GroupID)
				recoveries = append(recoveries, AlertEvent{
					ID:        uuid.New().String(),
					ClusterID: clusterID,
					GroupID:   group.GroupID,
					Resolved:  true,
				})
			}
			continue
		}

		// In breach — check for new or escalated state
		if currentLevel != prevLevel {
			s.breachState[group.GroupID] = currentLevel
			threshold := rule.WarningLag
			if currentLevel == AlertLevelCritical {
				threshold = rule.CriticalLag
			}

			event := AlertEvent{
				ID:          uuid.New().String(),
				ClusterID:   clusterID,
				GroupID:     group.GroupID,
				MatchedRule: rule.ID,
				RulePattern: rule.GroupPattern,
				Level:       currentLevel,
				Lag:         group.TotalLag,
				Threshold:   threshold,
				Timestamp:   time.Now().UTC(),
			}
			newAlerts = append(newAlerts, event)

			// OS notification (debounced by notifier)
			if cfg.NotifyOS {
				go s.notifier.NotifyBreach(clusterID, group.GroupID, currentLevel, group.TotalLag, threshold, cfg.NotificationSound)
			}
		}
	}
	s.mu.Unlock()

	// Persist new alerts
	for _, a := range newAlerts {
		if err := s.store.AppendAlert(a); err != nil {
			log.Printf("lagalert: append alert: %v", err)
		}
	}

	// Emit Wails events
	if app := application.Get(); app != nil {
		if len(newAlerts) > 0 {
			app.Event.Emit("lag:alert", LagAlertPayload{
				Type:   "breach",
				Alerts: newAlerts,
			})
		}
		if len(recoveries) > 0 {
			app.Event.Emit("lag:alert", LagAlertPayload{
				Type:   "recovery",
				Alerts: recoveries,
			})
		}
	}

	return nil
}

// resolveActiveAlert finds the most recent unresolved alert for a group and resolves it.
func (s *LagAlertService) resolveActiveAlert(clusterID, groupID string) {
	alerts := s.store.GetAlerts(clusterID)
	for _, a := range alerts {
		if a.GroupID == groupID && !a.Resolved {
			if err := s.store.ResolveAlert(a.ID); err != nil {
				log.Printf("lagalert: resolve alert error: %v", err)
			}
			return
		}
	}
}
