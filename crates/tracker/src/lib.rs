//! Sharded aircraft state table, ADS-R deduplication, and track lifecycle (`docs/SPEC.md` §4).
//!
//! Provides the [`Tracker`] state fusion engine partitioned across 64 striped
//! [`parking_lot::RwLock`] segments in accordance with `ADR-0005`.

pub mod dedup;
pub mod shard;
pub mod table;
pub mod update;

pub use dedup::{
    DEDUP_MAX_DISTANCE_MICRODEGREES, DEDUP_MAX_TIME_DELTA_MS, is_within_spatial_window,
    should_deduplicate,
};
pub use shard::{NUM_SHARDS, Shard, ShardData, TrackEntry, shard_index};
pub use table::Tracker;
pub use update::TargetUpdate;
