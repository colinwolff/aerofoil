//! `aerofoil-server` — Multi-source streaming daemon for aerofoil.
//!
//! Ingests dual-band Beast streams (1090 MHz Mode S on port 30005, 978 MHz UAT on port 30978),
//! fusing target states into a shared concurrent tracker.

pub mod beast;
pub mod dispatch;
pub mod ingest;
pub mod metrics;
pub mod source;

pub use beast::{BeastMessage, BeastReader};
pub use dispatch::{dispatch_978, dispatch_1090};
pub use ingest::DualBandIngest;
pub use metrics::IngestMetrics;
pub use source::{BandSource, DEFAULT_PORT_978, DEFAULT_PORT_1090};
