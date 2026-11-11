# Architecture Decision Records

Decisions listed in the order they were **made**, not the order they were written down. Backfilled records
are numbered by decision date, because a record's number is how it is cited and a number reflecting write
order would misrepresent history. `chalkline docs check` enforces that ordering.

Format: MADR. One file per decision, `NNNN-slug.md`, front matter carrying `status` and `date`, sections
`Context and Problem Statement` and `Decision Outcome`. This index must list every record - an unlisted
record is a decision nobody will find.

| # | Date | Decision |
|:--|:--|:--|
| [0001](0001-virtual-workspace-and-zero-allocation.md) | 2026-11-04 | Use Cargo Virtual Workspace and Zero-Allocation Core Decoders |
| [0002](0002-dedicated-do-282b-rs-codec.md) | 2026-11-04 | Implement Dedicated DO-282B Reed-Solomon Codec |
| [0003](0003-dual-tier-1090es-error-correction.md) | 2026-11-04 | Dual-Tier Error Correction Strategy for 1090ES Parity |
| [0004](0004-inject-address-filter-trait.md) | 2026-11-04 | Inject an `AddressFilter` trait instead of reaching up into the tracker |
| [0005](0005-tracker-concurrency-rwlock.md) | 2026-11-09 | Choose the tracker concurrency model |
| [0006](0006-server-egress-sse-websocket.md) | 2026-11-09 | Choose the server egress transport surface |
| [0007](0007-reserve-aerofoil-namespaces.md) | 2026-11-09 | Reserve the aerofoil namespaces from the maintainer account |
| [0008](0008-long-term-organisation-handle.md) | 2026-11-09 | Choose the long-term organisation handle |
| [0009](0009-persistence-seam.md) | 2026-11-09 | Choose the persistence seam, not the storage engine |
| [0010](0010-ingest-topology-frames-in.md) | 2026-11-09 | Ingest topology: frames in, one fusion process, demodulation outside the decoders |
| [0011](0011-standalone-replay-and-datasets.md) | 2026-11-10 | Dedicated standalone replay tool (`aerofoil-replay`) and multi-tier datasets |
| [0012](0012-dual-mode-tui-and-web-radar.md) | 2026-11-10 | Dual-mode terminal UI (`aerofoil-tui`) and hybrid Bun/embedded web radar architecture |
| [0013](0013-production-web-radar-and-containers.md) | 2026-11-10 | Production Web Radar Architecture, Multi-Topology API Delivery, and Containerization Strategy |
| [0014](0014-pluggable-map-engine-and-overlays.md) | 2026-11-10 | Pluggable AirspaceMapEngine, 12-Class SVG Icon Matrix, and Map Overlay Architecture |
| [0015](0015-multi-tier-configuration-and-design-system.md) | 2026-11-10 | Multi-Tier Configuration Architecture and Avionics Glass-Cockpit Design System |
| [0016](0016-mlat-multilateration-architecture.md) | 2026-11-10 | Multilateration (MLAT) Dual-Topology Architecture and TDOA Hyperboloid Solver |
