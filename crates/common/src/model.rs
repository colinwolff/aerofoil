//! Domain telemetry and aircraft target models (`docs/SPEC.md` §4).
//!
//! In accordance with `docs/SPEC.md`:
//! - All models are `#![no_std]` compliant with zero heap allocations.
//! - Tracks are disambiguated by `(AddressType, u32)` to isolate key spaces (Invariant 10).
//! - Fields use strongly typed domain primitives ([`Position`], [`Altitude`], [`Squawk`], [`Heading`]).

use crate::{Altitude, Heading, Position, Squawk};

/// Surveillance transponder address qualifier or type (`docs/SPEC.md` Invariant 10).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "export-ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "export-ts", ts(export))]
pub enum AddressType {
    /// Standard 24-bit ICAO aircraft address.
    Icao,
    /// Anonymous 24-bit self-assigned address (UAT).
    Anonymous,
    /// Traffic Information Service - Broadcast (TIS-B) with ICAO address.
    TisbIcao,
    /// TIS-B track file address.
    TisbTrack,
    /// Surface vehicle address.
    SurfaceVehicle,
    /// Fixed ground beacon / obstruction marker.
    GroundBeacon,
}

/// The RF protocol band / link transmitting the surveillance broadcast.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "export-ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "export-ts", ts(export))]
pub enum TransponderSource {
    /// 1090 MHz Mode S / Extended Squitter (DO-260B).
    ModeS1090,
    /// 978 MHz Universal Access Transceiver (DO-282B).
    Uat978,
}

/// Surveillance broadcast reception provenance (`docs/SPEC.md` Invariant 10).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "export-ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "export-ts", ts(export))]
pub enum ReceptionSource {
    /// Directly received RF broadcast from target transponder.
    Direct,
    /// Ground station re-broadcast (ADS-R / TIS-B).
    Rebroadcast,
}

/// Kinematic 3D velocity and ground track.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
#[cfg_attr(feature = "export-ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "export-ts", ts(export))]
pub struct Velocity {
    /// Horizontal ground speed in whole knots, or `None` if unavailable.
    pub ground_speed_knots: Option<u16>,
    /// Ground track angle, referenced to true north.
    pub heading: Option<Heading>,
    /// Vertical speed in feet per minute (positive = climb, negative = descent).
    pub vertical_rate_fpm: Option<i16>,
}

impl Velocity {
    /// Creates a new [`Velocity`] with optional ground speed, heading, and vertical rate.
    #[must_use]
    pub const fn new(
        ground_speed_knots: Option<u16>,
        heading: Option<Heading>,
        vertical_rate_fpm: Option<i16>,
    ) -> Self {
        Self {
            ground_speed_knots,
            heading,
            vertical_rate_fpm,
        }
    }
}

/// A tracked aircraft or surface target.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "export-ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "export-ts", ts(export))]
pub struct AircraftTarget {
    /// Transponder address type.
    pub address_type: AddressType,
    /// 24-bit aircraft or beacon address.
    pub address: u32,
    /// Callsign (flight ID) as up to 8 ASCII bytes.
    pub callsign: Option<[u8; 8]>,
    /// Last decoded geographic position.
    pub position: Option<Position>,
    /// Last decoded altitude.
    pub altitude: Option<Altitude>,
    /// Kinematic velocity and track vector.
    pub velocity: Velocity,
    /// Mode A identity code (squawk).
    pub squawk: Option<Squawk>,
    /// Emitter category (0..=39).
    pub emitter_category: Option<u8>,
    /// Navigation Integrity Category (0..=15).
    pub nic: Option<u8>,
    /// Surveillance transponder source link.
    pub source: TransponderSource,
    /// Direct vs. rebroadcast reception provenance.
    pub reception: ReceptionSource,
    /// Monotonic timestamp in milliseconds when last seen.
    pub last_seen_ms: u64,
}

impl AircraftTarget {
    /// Initializes a new [`AircraftTarget`] for an address.
    #[must_use]
    pub const fn new(
        address_type: AddressType,
        address: u32,
        source: TransponderSource,
        reception: ReceptionSource,
        timestamp_ms: u64,
    ) -> Self {
        Self {
            address_type,
            address,
            callsign: None,
            position: None,
            altitude: None,
            velocity: Velocity::new(None, None, None),
            squawk: None,
            emitter_category: None,
            nic: None,
            source,
            reception,
            last_seen_ms: timestamp_ms,
        }
    }

    /// Disambiguated track key `(AddressType, u32)` per `docs/SPEC.md` Invariant 10.
    #[inline]
    #[must_use]
    pub const fn track_key(&self) -> (AddressType, u32) {
        (self.address_type, self.address)
    }
}

/// Airspace and tracking events emitted when target state changes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "export-ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "export-ts", ts(export))]
pub enum AirspaceEvent {
    /// Target first observed and admitted to state table.
    TargetAcquired(AircraftTarget),
    /// Target updated with new telemetry.
    TargetUpdated(AircraftTarget),
    /// Target expired after TTL timeout.
    TargetLost {
        /// Key of the expired target.
        track_key: (AddressType, u32),
        /// Millisecond timestamp of expiration.
        timestamp_ms: u64,
    },
}
