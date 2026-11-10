# =============================================================================
# Stage 1: Build Frontend Assets (apps/web)
# =============================================================================
FROM oven/bun:1.1-alpine AS web-builder
WORKDIR /build

COPY apps/web/package.json ./apps/web/
COPY sdk/package.json ./sdk/
COPY sdk/src ./sdk/src
COPY apps/web/src ./apps/web/src
COPY apps/web/public ./apps/web/public
COPY apps/web/index.html apps/web/tsconfig.json ./apps/web/

WORKDIR /build/apps/web
RUN bun install
RUN bun run build

# =============================================================================
# Stage 2: Build Rust Workspace Binaries (aerofoil-server)
# =============================================================================
FROM rust:1.90-slim-bookworm AS rust-builder
WORKDIR /workspace

RUN apt-get update && apt-get install -y --no-install-recommends pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
COPY apps ./apps

RUN cargo build --release -p aerofoil-server -p aerofoil-replay -p aerofoil-cli

# =============================================================================
# Stage 3: Distroless Minimal Production Container
# =============================================================================
FROM gcr.io/distroless/cc-debian12:nonroot
WORKDIR /app

# Copy compiled backend binaries
COPY --from=rust-builder /workspace/target/release/aerofoil-server /app/aerofoil-server
COPY --from=rust-builder /workspace/target/release/aerofoil-replay /app/aerofoil-replay
COPY --from=rust-builder /workspace/target/release/aerofoil-cli /app/aerofoil-cli

# Copy static frontend assets into default search location
COPY --from=web-builder /build/apps/web/dist /app/web

# Environment configuration
ENV AEROFOIL_WEB_DIR=/app/web

# Port 3000: HTTP/SSE/WebSocket streaming & static web UI
# Port 30005: Beast 1090 MHz ingest
# Port 30978: Beast 978 MHz ingest
EXPOSE 3000 30005 30978

ENTRYPOINT ["/app/aerofoil-server"]
CMD ["--port-1090", "30005", "--port-978", "30978", "--port-egress", "3000"]
