# Changelog

All notable changes to Watermark are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.2.0] - 2026-10-28

### Added

- Per-cluster connection pool with automatic Idle TTL eviction (15m for warm background clusters, 30m for inactive active cluster) and `Warm` status indicators
- Reusable `CopyableText` component with full-text hover tooltip and 1-click copy across broker hosts, topic names, consumer group IDs, member IDs, and client IDs
- Dashboard Quick Insights panel (Top Consumer Lag & Top Topics by Partitions) and actionable Schemas empty/guide states
- Explicit lag threshold legend and stale lag indicators for `Empty` / `Dead` consumer groups

### Changed

- Migrate desktop runtime and bindings from Wails v2 to Wails v3 (`@wailsio/runtime`)
- Reuse warm Kafka client (`AddConsumePartitions` / `PurgeTopicsFromConsuming`) and parallelize low/high watermark resolution (`ListStartOffsets` + `ListEndOffsets`) for near-instant message fetching

### Fixed

- Prevent 5s poll timeout hangs when fetching messages from empty, compacted, or transactional topic partitions
- Fix nil-pointer dereference panic in `GetConsumerGroups` when `DescribeGroups` returns an error alongside partial group data
- Fix topic tagging (`ServiceNameInput`, `AnnotationEditorModal`, `BatchTagModal`, and `TopicListTable`) so typed service names commit without requiring `Enter` first and work on read-only clusters
- Fix sidebar active/focus states, `1279px` Monitoring table overflow, dialog width constraints, and `LagChartsTab` loading timeout/retry handling

## [1.1.6] - 2026-10-28

### Fixed

- Enable smooth vertical scrolling inside update changelog modal
- Pin action footer buttons to ensure visibility on long release notes
- Clean up duplicate 'v' prefix in version comparison display

## [1.1.5] - 2026-10-28

### Changed

- UI/UX overhaul: Geist typography, calibrated dark theme, and compact 48px header
- High data density: expanded desktop shell to 1720px with standardized pagination
- Tactile feedback: active button press animations, skeleton loading, and keyboard navigation

### Fixed

- Responsive header: prevent action buttons from being clipped on narrow windows

## [1.1.4] - 2026-09-09

### Changed

- Message timestamps display in the machine's local timezone (compact `YYYY-MM-DD HH:mm:ss`) instead of UTC `Z`; the raw UTC form is kept when the timestamp cannot be parsed or no local timezone can be resolved

## [1.1.3] - 2026-05-19

### Added

- Drop consumer group dialog with action gating
- Light theme with full component coverage
- ASC/DESC sort toggle for messages filter bar
- Row right-click context menu for tables

### Changed

- Migrate from lucide-react to Phosphor icons (thin weight)

### Fixed

- Drop consumer group race condition and stale config
- Multi-partition latest-N fetch with per-partition budget
- Command+K search palette subscribe error and theme mismatch

## [1.1.2] - 2026-04-01

### Changed

- New app logo with SVG watermark icon

### Fixed

- Backend readOnly flag now syncs correctly when editing active cluster config

## [1.1.1] - 2026-03-27

### Fixed

- AWS MSK support with enhanced connection validation and IAM authentication
- AWS MSK IAM error prioritized over generic SASL check for clearer error messages
- Changelog URL in auto-updater corrected from main to master branch
- Read-only mode guards for Kafka write operations (replay, clone topic)

## [1.1.0] - 2026-03-23

### Added

- Delete records from topic functionality
- Comprehensive Alerts page with monitor, ranking, history, charts, and config tabs
- Backend lag recorder service with time-series storage for consumer group monitoring
- Selective chart tracking for monitor UI with unified and auto-refresh controls
- Interactive lag charts visualization with shadcn aesthetic and multi-entity support

### Changed

- Revamped monitor UI optimized for 1080p layouts with improved inbox notifications
- Codebase cleanup: dead code removal, route splitting, component modularization, and file deduplication

### Fixed

- Area chart visualization issues including fill gaps, tooltip color dots, and name truncation
- Configuration reliability with nullish coalescing fallbacks for array fields in `ClusterAlertConfig`
- Fix state synchronization issues
- Clean up lingering background tasks on component teardown
- Fix async event handling edge cases

## [1.0.4] - 2026-03-20

### Added

- Consumer lag alerting with configurable thresholds and notification center
- Message replay tool — context menu, single & batch replay with progress tracking
- Batch produce via `ProduceMessages` endpoint with lazy-loaded Monaco editor
- Topic templates & cloning with editable config rows and settings panel
- Changelog modal in auto-update workflow with fallback and cache invalidation
- shadcn/ui component library with dark glassmorphism theme
- Read-only mode enforcement — backend guards on write operations and frontend UI hiding
- Cluster name coloring with label color; dot reserved for connection status

### Changed

- Migrate form controls (Switch, Checkbox, Slider), modals, settings, selects, overlays, and navigation to shadcn/ui
- Remove unused notification-bell component

### Fixed

- WKWebView table header corruption and column overflow
- Switch/Dialog Tailwind v4 syntax incompatibility with v3
- Per-cluster color dots restored in cluster dropdown
- Updater changelog fallback, cache invalidation, and release body quoting


## [1.0.3] - 2026-03-13

### Added

- Manual update check in Settings About section with Cmd+, keyboard shortcut
- Messages tab filters: From Offset, From Date, and Body Contains
- Consumer group offsets and lag table grouped by topic with expandable partitions

### Changed

- Extract shared filter types across messages tab components

### Fixed

- Error feedback display and dead-code branch removed in AppVersionSection

## [1.0.2] - 2026-03-12

### Fixed

- `darwin_all` filter to correctly match universal binary asset name in auto-updater

## [1.0.1] - 2026-03-12

### Added

- Back navigation buttons to topic and consumer detail pages

### Changed

- Message inspector now renders below the table instead of a side panel
- Removed unused New Resource and notification buttons from header

### Fixed

- Table height uses `vh` units; navigation uses `history.back()` correctly

## [1.0.0] - 2026-03-10

### Added

- Auto-update via GitHub Releases with download progress tracking
- Create topic modal with name validation, config options, and toast notifications
- AWS MSK IAM authentication with region and profile support

### Fixed

- Produce message modal wired to Wails backend
- Select-all only targets search-filtered results
- Skip non-profile sections when parsing AWS config file

## [0.3.0] - 2026-03-09

### Fixed

- Clear stale data on cluster switch
- Align query status flags with data override on disconnect
- Sticky header slicing artifact in WebKit

## [0.2.0] - 2026-03-09

### Added

- Per-cluster response cache with 30-minute TTL

### Changed

- Merge producers and consumers into topic name flow line

### Fixed

- Cluster switch resilience and error handling

## [0.1.0] - 2026-03-08

### Added

- Kafka topic management: list, detail, partitions, configs, ACLs
- Consumer groups list and detail view
- Cluster health dashboard
- Schema registry browser
- Multi-cluster support with connection profiles
- Message inspector with multi-partition support
- Per-page cache refresh with ⌘R shortcut
- Custom Watermark branding and logo
- macOS universal binary build pipeline with GitHub Actions
