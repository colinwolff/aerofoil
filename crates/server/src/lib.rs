//! `aerofoil-server` — Multi-source streaming daemon for aerofoil.
//!
//! Ingests dual-band Beast streams (1090 MHz Mode S on port 30005, 978 MHz UAT on port 30978),
//! fusing target states into a shared concurrent tracker, and exposes HTTP/1.1 SSE (`/events`),
//! WebSocket (`/ws`), and health endpoints.

pub mod beast;
pub mod cpr;
pub mod dispatch;
pub mod egress;
pub mod ingest;
pub mod json;
pub mod metrics;
pub mod source;
pub mod sse;
pub mod web;
pub mod ws;

pub use beast::{BeastMessage, BeastReader};
pub use cpr::CprResolver;
pub use dispatch::{dispatch_978, dispatch_1090};
pub use egress::{DEFAULT_EGRESS_PORT, EgressServer};
pub use ingest::DualBandIngest;
pub use json::{TargetWireJson, TransponderSourceWire};
pub use metrics::IngestMetrics;
pub use source::{BandSource, DEFAULT_PORT_978, DEFAULT_PORT_1090};
pub use sse::handle_sse_stream;
pub use ws::handle_ws_client;
