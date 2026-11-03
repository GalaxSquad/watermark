package kafka

// ClusterHealth represents overall cluster status metrics for the Dashboard.
type ClusterHealth struct {
	Status        string `json:"status"` // "healthy", "degraded", "offline"
	BrokersOnline int    `json:"brokersOnline"`
	BrokersTotal  int    `json:"brokersTotal"`
	TopicCount    int    `json:"topicCount"`
	TotalSize     int64  `json:"totalSize"`
}

// Broker represents a Kafka broker node.
type Broker struct {
	ID           int32  `json:"id"`
	Host         string `json:"host"`
	Port         int32  `json:"port"`
	Partitions   int    `json:"partitions"`
	Size         int64  `json:"size"`
	IsController bool   `json:"isController"`
}

// Topic represents a Kafka topic with metadata.
type Topic struct {
	Name       string `json:"name"`
	Partitions int    `json:"partitions"`
	Replicas   int    `json:"replicas"`
	Size       int64  `json:"size"`
	Retention  string `json:"retention"`
	IsInternal bool   `json:"isInternal"`
}

// Partition represents a single partition of a topic.
type Partition struct {
	ID            int32   `json:"id"`
	Leader        int32   `json:"leader"`
	Replicas      []int32 `json:"replicas"`
	ISR           []int32 `json:"isr"`
	LowWatermark  int64   `json:"lowWatermark"`
	HighWatermark int64   `json:"highWatermark"`
}

// Message represents a Kafka message.
type Message struct {
	Partition int32             `json:"partition"`
	Offset    int64             `json:"offset"`
	Timestamp string            `json:"timestamp"`
	Key       string            `json:"key"`
	Value     string            `json:"value"`
	Headers   map[string]string `json:"headers,omitempty"`
}

// ConsumerGroup represents a consumer group summary.
type ConsumerGroup struct {
	GroupID  string `json:"groupId"`
	State    string `json:"state"`
	Members  int    `json:"members"`
	TotalLag int64  `json:"totalLag"`
}

// ConsumerGroupDetail represents full consumer group info.
type ConsumerGroupDetail struct {
	GroupID     string                `json:"groupId"`
	State       string                `json:"state"`
	Coordinator int32                 `json:"coordinator"`
	Members     []ConsumerGroupMember `json:"members"`
	Offsets     []ConsumerGroupOffset `json:"offsets"`
}

// ConsumerGroupMember represents a member of a consumer group.
type ConsumerGroupMember struct {
	ClientID           string  `json:"clientId"`
	Host               string  `json:"host"`
	AssignedPartitions []int32 `json:"assignedPartitions"`
}

// ConsumerGroupOffset represents offset and lag for a partition.
type ConsumerGroupOffset struct {
	Topic         string `json:"topic"`
	Partition     int32  `json:"partition"`
	Host          string `json:"host"`
	CurrentOffset int64  `json:"currentOffset"`
	EndOffset     int64  `json:"endOffset"`
	Lag           int64  `json:"lag"`
}

// TopicConfig represents a topic configuration entry.
type TopicConfig struct {
	Name         string `json:"name"`
	Value        string `json:"value"`
	DefaultValue string `json:"defaultValue"`
	IsOverridden bool   `json:"isOverridden"`
	Description  string `json:"description"`
}

// AclEntry represents a Kafka ACL entry.
type AclEntry struct {
	Principal      string `json:"principal"`
	Operation      string `json:"operation"`
	PermissionType string `json:"permissionType"` // "Allow" or "Deny"
	Host           string `json:"host"`
}

// ProduceMessageRequest represents a single message in a batch produce request.
type ProduceMessageRequest struct {
	Partition int32             `json:"partition"`
	Key       string            `json:"key"`
	Value     string            `json:"value"`
	Headers   map[string]string `json:"headers,omitempty"`
}

// ProduceResult represents the result of producing a single message in a batch.
type ProduceResult struct {
	Index     int    `json:"index"`
	Partition int32  `json:"partition"`
	Offset    int64  `json:"offset"`
	Error     string `json:"error,omitempty"`
}

// DeleteRecordsResult reports the outcome per partition after a delete records call.
type DeleteRecordsResult struct {
	Partition    int32  `json:"partition"`
	NewLowOffset int64  `json:"newLowOffset"`
	Error        string `json:"error,omitempty"`
}

// TopicLagSummary represents aggregated lag for a topic across all consumer groups.
type TopicLagSummary struct {
	Topic    string `json:"topic"`
	TotalLag int64  `json:"totalLag"`
	Groups   int    `json:"groups"`
}

// ClearLagResult reports the outcome per partition after clearing consumer lag.
type ClearLagResult struct {
	GroupID        string `json:"groupId"`
	Topic          string `json:"topic"`
	Partition      int32  `json:"partition"`
	PreviousOffset int64  `json:"previousOffset"`
	NewOffset      int64  `json:"newOffset"`
	ClearedLag     int64  `json:"clearedLag"`
	Method         string `json:"method"` // "commit_offsets" or "delete_records"
	Error          string `json:"error,omitempty"`
}
