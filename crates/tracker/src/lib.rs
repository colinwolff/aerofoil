//! Sharded aircraft state table, ADS-R deduplication, and track lifecycle (`docs/SPEC.md` §4).
//!
//! Provides the [`Tracker`] state fusion engine partitioned across 64 striped
//! [`parking_lot::RwLock`] segments in accordance with `ADR-0005`.

pub mod shard;
pub mod table;
pub mod update;

pub use shard::{NUM_SHARDS, Shard, ShardData, shard_index};
pub use table::Tracker;
pub use update::TargetUpdate;
