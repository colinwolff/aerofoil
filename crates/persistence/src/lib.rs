//! `aerofoil-persistence` — Recording sink and capture replay for surveillance frames.
//!
//! Provides a bounded, drop-oldest subscriber ([`RecordSink`]) that decouples the decode hot
//! path from storage I/O, writing self-describing JSONL captures ([`RecordedFrame`]) that replay
//! deterministically ([`ReplayReader`]).

pub mod frame;
pub mod jsonl;
pub mod replay;
pub mod sink;

pub use frame::{HexError, RecordedFrame, RfBand};
pub use jsonl::JsonlRecordSink;
pub use replay::{ReplayError, ReplayReader};
pub use sink::{RecordSink, SinkError};
