//! Sharded hash table partition primitives (`docs/SPEC.md` Invariant 10).
//!
//! Defined in `ADR-0005`: 64 independent striped `parking_lot::RwLock` segments.

use aerofoil_common::{AddressType, AircraftTarget};
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

/// Inner state held within a single lockable shard.
#[derive(Debug, Default)]
pub struct ShardData {
    tracks: HashMap<(AddressType, u32), AircraftTarget>,
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
        self.tracks.get(key)
    }

    /// Inserts or replaces a target in the shard.
    #[inline]
    pub fn insert(&mut self, target: AircraftTarget) -> Option<AircraftTarget> {
        self.tracks.insert(target.track_key(), target)
    }

    /// Removes a target by its track key.
    #[inline]
    pub fn remove(&mut self, key: &(AddressType, u32)) -> Option<AircraftTarget> {
        self.tracks.remove(key)
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
        self.tracks.values()
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
