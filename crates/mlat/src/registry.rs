//! Geodetic receiver registry and clock drift synchronization.
//! Zero-allocation fixed-capacity table mapping receiver IDs to WGS84/ECEF positions.

use crate::coords::{EcefCoord, geodetic_to_ecef};
use crate::error::MlatError;

/// Maximum number of simultaneous ground receiver stations registered in a cluster.
pub const MAX_RECEIVERS: usize = 32;

/// A registered ground receiver with verified surveyed coordinates and clock calibration.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ReceiverStation {
    /// Unique 32-bit receiver numeric identifier.
    pub id: u32,
    /// Surveyed latitude in decimal degrees (-90 to +90).
    pub lat_deg: f64,
    /// Surveyed longitude in decimal degrees (-180 to +180).
    pub lon_deg: f64,
    /// Surveyed height above WGS84 reference ellipsoid in meters.
    pub alt_m: f64,
    /// Pre-computed Earth-Centered Earth-Fixed cartesian coordinate.
    pub ecef: EcefCoord,
    /// Calibrated clock offset in nanoseconds relative to master time base.
    pub clock_offset_ns: i64,
}

impl ReceiverStation {
    /// Constructs a receiver station and computes its ECEF position vector.
    pub fn new(id: u32, lat_deg: f64, lon_deg: f64, alt_m: f64) -> Self {
        let ecef = geodetic_to_ecef(lat_deg, lon_deg, alt_m);
        Self {
            id,
            lat_deg,
            lon_deg,
            alt_m,
            ecef,
            clock_offset_ns: 0,
        }
    }
}

/// Registry of surveyed receiver stations with zero-allocation array lookup.
#[derive(Debug, Clone, Copy)]
pub struct ReceiverRegistry {
    stations: [Option<ReceiverStation>; MAX_RECEIVERS],
    count: usize,
}

impl Default for ReceiverRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl ReceiverRegistry {
    /// Creates an empty receiver registry.
    pub const fn new() -> Self {
        Self {
            stations: [None; MAX_RECEIVERS],
            count: 0,
        }
    }

    /// Registers or updates a receiver station with surveyed geodetic coordinates.
    pub fn register(
        &mut self,
        id: u32,
        lat_deg: f64,
        lon_deg: f64,
        alt_m: f64,
    ) -> Result<(), MlatError> {
        let station = ReceiverStation::new(id, lat_deg, lon_deg, alt_m);

        // Check if updating existing
        for s in self.stations.iter_mut().flatten() {
            if s.id == id {
                *s = station;
                return Ok(());
            }
        }

        // Insert into first empty slot
        for slot in &mut self.stations {
            if slot.is_none() {
                *slot = Some(station);
                self.count += 1;
                return Ok(());
            }
        }

        Err(MlatError::SingularMatrix)
    }

    /// Looks up a receiver station by its numeric ID.
    pub fn get(&self, id: u32) -> Option<&ReceiverStation> {
        self.stations.iter().flatten().find(|s| s.id == id)
    }

    /// Calibrates the receiver's time base by recording clock offset in nanoseconds.
    pub fn calibrate_clock(&mut self, id: u32, offset_ns: i64) -> Result<(), MlatError> {
        for s in self.stations.iter_mut().flatten() {
            if s.id == id {
                s.clock_offset_ns = offset_ns;
                return Ok(());
            }
        }
        Err(MlatError::ReceiverNotFound { receiver_id: id })
    }

    /// Returns the number of currently active stations.
    pub const fn len(&self) -> usize {
        self.count
    }

    /// Returns true if no stations are registered.
    pub const fn is_empty(&self) -> bool {
        self.count == 0
    }
}
