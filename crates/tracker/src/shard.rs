//! Sharded hash table partition primitives (`docs/SPEC.md` Invariant 10).
//!
//! Defined in `ADR-0005`: 64 independent striped `parking_lot::RwLock` segments.

use crate::dedup::should_deduplicate;
use crate::update::TargetUpdate;
use aerofoil_common::{AddressType, AircraftTarget, AirspaceEvent, Position, ReceptionSource};
use parking_lot::RwLock;
use std::collections::HashMap;

/// Number of independent striped shards across the track table (`ADR-0005`).
pub const NUM_SHARDS: usize = 64;

/// Computes the shard index for a 24-bit ICAO or target address.
#[inline]
#[must_use]
pub const fn shard_index(address: u32) -> usize {
    (address as usize) & (NUM_SHARDS - 1)
}

/// An internal track entry holding target telemetry and direct reception provenance (`docs/SPEC.md` §4).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TrackEntry {
    /// Active target telemetry state.
    pub target: AircraftTarget,
    /// Timestamp of most recent direct-reception update, if any.
    pub last_direct_seen_ms: Option<u64>,
    /// Position of most recent direct-reception update, if any.
    pub last_direct_pos: Option<Position>,
}

impl TrackEntry {
    /// Initializes a new [`TrackEntry`] from an [`AircraftTarget`].
    #[must_use]
    pub fn new(target: AircraftTarget) -> Self {
        let is_direct = target.reception == ReceptionSource::Direct;
        Self {
            last_direct_seen_ms: if is_direct {
                Some(target.last_seen_ms)
            } else {
                None
            },
            last_direct_pos: if is_direct { target.position } else { None },
            target,
        }
    }
}

/// Inner state held within a single lockable shard.
#[derive(Debug, Default)]
pub struct ShardData {
    tracks: HashMap<(AddressType, u32), TrackEntry>,
}

impl ShardData {
    /// Creates empty shard data.
    #[must_use]
    pub fn new() -> Self {
        Self {
            tracks: HashMap::new(),
        }
    }

    /// Checks if a verified standard ICAO address exists in this shard.
    #[inline]
    #[must_use]
    pub fn contains_icao(&self, address: u32) -> bool {
        self.tracks.contains_key(&(AddressType::Icao, address))
    }

    /// Retrieves a reference to an aircraft target by key.
    #[inline]
    #[must_use]
    pub fn get(&self, key: &(AddressType, u32)) -> Option<&AircraftTarget> {
        self.tracks.get(key).map(|e| &e.target)
    }

    /// Inserts or replaces a target in the shard.
    #[inline]
    pub fn insert(&mut self, target: AircraftTarget) -> Option<AircraftTarget> {
        let key = target.track_key();
        let entry = TrackEntry::new(target);
        self.tracks.insert(key, entry).map(|e| e.target)
    }

    /// Removes a target by its track key.
    #[inline]
    pub fn remove(&mut self, key: &(AddressType, u32)) -> Option<AircraftTarget> {
        self.tracks.remove(key).map(|e| e.target)
    }

    /// Returns the number of active tracks in this shard.
    #[inline]
    #[must_use]
    pub fn len(&self) -> usize {
        self.tracks.len()
    }

    /// Returns `true` if this shard contains no tracks.
    #[inline]
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.tracks.is_empty()
    }

    /// Returns an iterator over all targets in this shard.
    pub fn values(&self) -> impl Iterator<Item = &AircraftTarget> {
        self.tracks.values().map(|e| &e.target)
    }

    /// Merges an incremental update into this shard, evaluating ADS-R cross-band deduplication.
    ///
    /// Direct reception always wins. Re-broadcast updates within `Δt ≤ 1.0 s` and `Δd ≤ 0.001°`
    /// of direct reception are deduplicated and return `None` (`SPEC.md` Invariant 10).
    pub fn apply_update(&mut self, update: &TargetUpdate) -> Option<AirspaceEvent> {
        let key = update.track_key();
        if let Some(entry) = self.tracks.get_mut(&key) {
            // ADS-R cross-band deduplication check
            if update.reception == ReceptionSource::Rebroadcast
                && should_deduplicate(
                    entry.last_direct_seen_ms,
                    entry.last_direct_pos,
                    update.timestamp_ms,
                    update.position,
                    entry.target.position,
                )
            {
                return None;
            }

            if update.reception == ReceptionSource::Direct {
                entry.last_direct_seen_ms = Some(update.timestamp_ms);
                if let Some(pos) = update.position {
                    entry.last_direct_pos = Some(pos);
                }
            }

            update.apply_to(&mut entry.target);
            Some(AirspaceEvent::TargetUpdated(entry.target))
        } else {
            let target = update.to_target();
            let entry = TrackEntry::new(target);
            self.tracks.insert(key, entry);
            Some(AirspaceEvent::TargetAcquired(target))
        }
    }

    /// Prunes targets whose age exceeds `ttl_ms`, collecting `TargetLost` events.
    pub fn prune_expired(
        &mut self,
        current_time_ms: u64,
        ttl_ms: u64,
        events: &mut Vec<AirspaceEvent>,
    ) {
        let mut expired_keys = Vec::new();
        for (key, entry) in &self.tracks {
            if current_time_ms.saturating_sub(entry.target.last_seen_ms) >= ttl_ms {
                expired_keys.push(*key);
            }
        }
        for key in expired_keys {
            self.tracks.remove(&key);
            events.push(AirspaceEvent::TargetLost {
                track_key: key,
                timestamp_ms: current_time_ms,
            });
        }
    }
}

/// A thread-safe striped shard protected by a read-write lock.
#[derive(Debug, Default)]
pub struct Shard {
    inner: RwLock<ShardData>,
}

impl Shard {
    /// Initializes a new empty shard.
    #[must_use]
    pub fn new() -> Self {
        Self {
            inner: RwLock::new(ShardData::new()),
        }
    }

    /// Obtains a read lock on the shard data.
    #[inline]
    pub fn read(&self) -> parking_lot::RwLockReadGuard<'_, ShardData> {
        self.inner.read()
    }

    /// Obtains an exclusive write lock on the shard data.
    #[inline]
    pub fn write(&self) -> parking_lot::RwLockWriteGuard<'_, ShardData> {
        self.inner.write()
    }
}
