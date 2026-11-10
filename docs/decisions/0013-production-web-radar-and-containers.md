---
status: accepted
date: 2026-11-10
---

# 13. Production Web Radar Architecture, Multi-Topology API Delivery, and Containerization Strategy

* Deciders: Colin Wolff
* Related: `ADR-0006`, `ADR-0010`, `ADR-0012`, `docs/ARCHITECTURE.md` §4

## Context and Problem Statement

Following the Milestone 4 delivery of `examples/web-radar`, `aerofoil` requires a transition strategy
to elevate the browser visualization into a production, best-in-class airspace surveillance platform.
Key architectural questions include:
1. Should Web Radar live in the `aerofoil` monorepo or split into a standalone repository?
2. How should the frontend and `aerofoil-server` API/streaming surfaces be delivered across heterogeneous
   production deployments (single-board computers, Docker containers, Kubernetes clusters)?
3. How should dynamic flight trajectories and dependencies be managed?

## Considered Options

### Repository Boundary:
1. **Standalone Repository (`aerofoil-web`):** Publish `@aerofoil-rs/sdk` to npm and build the frontend
   in a separate repository.
   - *Rejected:* Increases release coordination friction; prevents atomic end-to-end verification and
     shared TypeScript type synchronization with domain crate models during active pre-1.0 development.
2. **First-Class Monorepo Application (`apps/web`)** (Chosen):
   - Promote `examples/web-radar` to `apps/web` (`@aerofoil-rs/web-radar`), directly consuming `@aerofoil-rs/sdk`
     via workspace protocol (`workspace:*`).

### Production API & Deployment Topology:
To maximize versatility and operator choice, three deployment topologies are supported across the
milestone horizon:
- **Topology 1 (Unified Embedded Server — Target Default):** `aerofoil-server` serves both real-time
  streaming (`/ws`, `/events`) and embedded production web assets (`/`) from a single binary and port.
  Provides zero-CORS, single-container Docker/K8s deployment with zero external reverse-proxy requirements.
- **Topology 2 (Decoupled Microservices):** Separate static web container (Nginx/Caddy) and headless
  `aerofoil-server` container routed via Kubernetes Ingress or Docker Compose reverse proxy.
- **Topology 3 (Static Edge / CDN):** Static frontend hosted on Cloudflare Pages / Vercel connecting
  over secure TLS WebSocket (`wss://`) to an external `aerofoil-server` endpoint.

## Decision Outcome

Chosen option: **First-class Monorepo App (`apps/web`) with Multi-Topology API Strategy (Topology 1 Default)**.

### Operational Model:
1. **Workspace Layout:**
   - Migrate `examples/web-radar` to `apps/web`.
   - Maintain lockstep alignment with `@aerofoil-rs/sdk`.
2. **Containerization & Deployment:**
   - Multi-stage distroless Dockerfile building both `aerofoil-server` and `apps/web`.
   - Production Docker Compose and Kubernetes Helm chart providing deployment configurations for both
     unified (Topology 1) and decoupled (Topology 2) architectures.
3. **Target Milestone:**
   - Scoped as the foundation of **Milestone 5** targeting version `0.1.0-beta.2`.
