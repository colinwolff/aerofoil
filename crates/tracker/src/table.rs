//! 64-shard striped track table implementing [`AddressFilter`] (`ADR-0005`).

use crate::shard::{NUM_SHARDS, Shard, shard_index};
use aerofoil_common::{AddressFilter, AddressType, AircraftTarget};
use core::array;

/// Thread-safe sharded aircraft state table.
///
/// Implements 64-way striped locking via [`parking_lot::RwLock`] segments
/// to achieve high-concurrency read/write operations without contention across
/// aircraft targets (`ADR-0005`).
#[derive(Debug)]
pub struct Tracker {
    shards: [Shard; NUM_SHARDS],
}

impl Default for Tracker {
    fn default() -> Self {
        Self::new()
    }
}

impl Tracker {
    /// Constructs a new empty [`Tracker`] with 64 empty shards.
    #[must_use]
    pub fn new() -> Self {
        Self {
            shards: array::from_fn(|_| Shard::new()),
        }
    }

    /// Accesses a specific shard by index (`0..64`).
    #[inline]
    #[must_use]
    pub fn shard(&self, index: usize) -> &Shard {
        &self.shards[index % NUM_SHARDS]
    }

    /// Checks if a standard 24-bit ICAO address is active in tracking state.
    ///
    /// Acquires a single uncontended read lock on the target shard with zero dynamic heap allocations.
    #[inline]
    #[must_use]
    pub fn contains_address(&self, address: u32) -> bool {
        let idx = shard_index(address);
        self.shards[idx].read().contains_icao(address)
    }

    /// Retrieves an aircraft target by its address type and address.
    #[inline]
    #[must_use]
    pub fn get(&self, address_type: AddressType, address: u32) -> Option<AircraftTarget> {
        let idx = shard_index(address);
        self.shards[idx]
            .read()
            .get(&(address_type, address))
            .copied()
    }

    /// Inserts or updates an aircraft target in its designated shard.
    #[inline]
    pub fn insert(&self, target: AircraftTarget) -> Option<AircraftTarget> {
        let idx = shard_index(target.address);
        self.shards[idx].write().insert(target)
    }

    /// Removes an aircraft target by its address type and address.
    #[inline]
    pub fn remove(&self, address_type: AddressType, address: u32) -> Option<AircraftTarget> {
        let idx = shard_index(address);
        self.shards[idx].write().remove(&(address_type, address))
    }

    /// Total number of active tracks across all 64 shards.
    #[must_use]
    pub fn len(&self) -> usize {
        self.shards.iter().map(|s| s.read().len()).sum()
    }

    /// Returns `true` if all shards are empty.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.shards.iter().all(|s| s.read().is_empty())
    }

    /// Captures a snapshot of all active tracks across the 64 shards.
    ///
    /// Shards are read sequentially in ascending index order to avoid deadlocks.
    #[must_use]
    pub fn snapshot(&self) -> Vec<AircraftTarget> {
        let mut targets = Vec::with_capacity(self.len());
        for shard in &self.shards {
            let guard = shard.read();
            targets.extend(guard.values().copied());
        }
        targets
    }

    /// Retains only targets specified by the predicate, sweeping expired tracks.
    ///
    /// Returns the total number of targets removed.
    pub fn retain<F>(&self, mut predicate: F) -> usize
    where
        F: FnMut(&AircraftTarget) -> bool,
    {
        let mut removed = 0;
        for shard in &self.shards {
            let mut guard = shard.write();
            let before = guard.len();
            // Collect keys to remove to adhere to borrow checker
            let to_remove: Vec<(AddressType, u32)> = guard
                .values()
                .filter(|t| !predicate(t))
                .map(|t| t.track_key())
                .collect();
            for key in to_remove {
                guard.remove(&key);
            }
            removed += before - guard.len();
        }
        removed
    }
}

impl AddressFilter for Tracker {
    #[inline]
    fn contains(&self, address: u32) -> bool {
        self.contains_address(address)
    }
}
