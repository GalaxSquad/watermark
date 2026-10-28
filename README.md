# Watermark — Kafka GUI Management

<p align="center">
  <strong>A premium, native desktop Kafka management tool for macOS and Windows.</strong><br/>
  Built with Go (Wails v3) + React + TypeScript.
</p>

---

## Overview

**Watermark** is a cross-platform desktop application that provides a rich, visual interface for managing Apache Kafka clusters. Think of it as a modern alternative to Kafka UI tools — native performance, no Docker needed, and a sleek dark-mode design inspired by developer tools.

### Key Capabilities

| Feature | Description |
|---------|-------------|
| **Cluster Overview** | Real-time broker health, partition counts, storage metrics |
| **Topic Management** | Browse, create, edit, delete topics with searchable data grids |
| **Message Browser** | Live-tail messages with VS Code-like JSON viewer (Monaco Editor) |
| **Consumer Groups** | Monitor consumer lag, group states, partition assignments |
| **Schema Registry** | View and manage Avro/JSON/Protobuf schemas |
| **ACL Management** | Browse and manage Kafka ACL rules |
| **Settings** | Multi-cluster connection profiles with secure credential storage |
| **Auto-Update** | Seamless binary updates via `go-rocket-update` |

## Tech Stack

### Backend (Go)

| Component | Library | Purpose |
|-----------|---------|---------|
| Desktop Framework | `wails/v3` | Native desktop app with embedded webview |
| Kafka Client | `twmb/franz-go` | Pure-Go Kafka client (no C-bindings) |
| Secure Storage | `zalando/go-keyring` | macOS Keychain / Windows Credential Manager |
| Auto-Update | `go-rocket-update` | Self-updating binary distribution |

### Frontend (React + TypeScript)

| Component | Library | Purpose |
|-----------|---------|---------|
| Data Fetching | `@tanstack/react-query` | Polling consumer lag, caching cluster states |
| Data Grids | `@tanstack/react-table` | Searchable Topics & Consumer Groups grids |
| Virtualization | `@tanstack/react-virtual` | Live-tail messages without browser crashes |
| Routing | `@tanstack/react-router` | Navigation across 7 pages |
| Code Editor | `@monaco-editor/react` | VS Code-like JSON/Schema viewer |
| UI Primitives | `shadcn/ui` + Radix UI | Accessible, composable component library |
| Icons | `lucide-react` | Consistent icon system |
| Styling | Tailwind CSS | Utility-first CSS framework |

## Project Structure

```
watermark/
├── main.go                 # Wails app entry point
├── app.go                  # App struct with Go↔JS bindings
├── go.mod / go.sum         # Go module dependencies
├── wails.json              # Wails project configuration
├── build/                  # Build assets (icons, platform configs)
│   ├── darwin/             # macOS build resources
│   └── windows/            # Windows build resources
├── frontend/               # React + TypeScript frontend
│   ├── src/
│   │   ├── App.tsx         # Root React component
│   │   ├── main.tsx        # React entry point
│   │   ├── assets/         # Static assets (fonts, images)
│   │   └── *.css           # Stylesheets
│   ├── bindings/           # Auto-generated Wails v3 TS bindings
│   ├── package.json        # Node.js dependencies
│   ├── tsconfig.json       # TypeScript configuration
│   └── vite.config.ts      # Vite bundler configuration
├── Taskfile.yml            # Wails v3 build & dev task definitions
├── docs/                   # Project documentation
│   └── mock/               # UI mockups / prototypes
└── plans/                  # Implementation plans
```

## Development

### Prerequisites

- **Go** ≥ 1.25
- **Node.js** ≥ 20
- **Wails v3 CLI** — `go install github.com/wailsapp/wails/v3/cmd/wails3@latest`
- **macOS**: Xcode Command Line Tools
- **Windows**: WebView2 runtime

### Quick Start

```bash
# Clone the repository
git clone <repo-url> && cd watermark

# Install frontend dependencies
cd frontend && npm install && cd ..

# Regenerate frontend TypeScript bindings
wails3 generate bindings -ts

# Run in live development mode
wails3 dev

# Build production binary / package .app bundle
wails3 build
wails3 package
```

### Development URLs

- **Frontend dev server**: Hot-reloaded via Vite (integrated with Wails)
- **Browser dev server**: `http://localhost:34115` (for browser-based Go method testing)

## Design Philosophy

- **Dark-first UI** with glassmorphism panels and monospace typography
- **Purple accent** (#8B5CF6) as primary brand color
- **JetBrains Mono** for data displays, **Inter/Space Grotesk** for UI labels
- **Minimal, data-dense layouts** optimized for DevOps/SRE workflows

## Documentation

| Document | Description |
|----------|-------------|
| [Project Overview](./docs/project-overview-pdr.md) | Product requirements and vision |
| [System Architecture](./docs/system-architecture.md) | Technical architecture and data flow |
| [Code Standards](./docs/code-standards.md) | Coding conventions and patterns |
| [Codebase Summary](./docs/codebase-summary.md) | File-by-file codebase overview |
| [Design Guidelines](./docs/design-guidelines.md) | UI/UX design system |
| [Development Roadmap](./docs/development-roadmap.md) | Implementation phases and progress |
| [Go Best Practices](./docs/golang-best-practices.md) | 100 Go Mistakes distilled into actionable rules |
| [React Best Practices](./docs/react-best-practices.md) | Performance, TanStack patterns, component architecture |
| [Deployment Guide](./docs/deployment-guide.md) | Build and distribution guide |

## Author

**Kezlo98** — [github.com/Kezlo98](https://github.com/Kezlo98)

## License

Proprietary. All rights reserved.
