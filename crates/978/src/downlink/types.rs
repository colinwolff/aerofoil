//! Common UAT downlink types: State Vector, Mode Status, and operational states.

use aerofoil_common::{Altitude, Position, Squawk};

/// Air-ground status encoded in bits 7..6 of State Vector byte 8 (payload byte 12).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum AirgroundState {
    /// Subsonic airborne (speed < 800 kt).
    Subsonic,
    /// Supersonic airborne (speed >= 800 kt).
    Supersonic,
    /// Surface vehicle or aircraft on the airport surface.
    Surface,
    /// Reserved / unassigned state.
    Reserved,
}

/// Parsed kinematic State Vector from a UAT ADS-B downlink message (payload bytes 4..17).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StateVector {
    /// Geographic position in micro-degrees, or `None` if invalid or unavailable.
    pub position: Option<Position>,
    /// Altitude in whole feet with datum, or `None` if invalid or unavailable.
    pub altitude: Option<Altitude>,
    /// Navigation Integrity Category (0..=15).
    pub nic: u8,
    /// Air-ground operational status.
    pub airground_state: AirgroundState,
    /// Horizontal ground speed in knots, or `None` if unavailable.
    pub horizontal_velocity: Option<u16>,
    /// Ground track in whole degrees (0..360), or `None` if unavailable.
    pub track_degrees: Option<u16>,
}

/// Parsed Mode Status element from a UAT Long downlink message (payload bytes 17..29).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ModeStatus {
    /// Emitter category (0..=39).
    pub emitter_category: u8,
    /// Callsign (flight ID), or `None` if squawk broadcast or unavailable.
    pub callsign: Option<[u8; 8]>,
    /// Mode A identity code (squawk), if broadcast instead of callsign.
    pub squawk: Option<Squawk>,
    /// Emergency / priority status code (0 = None, 1..=6 = Emergency/priority).
    pub emergency_status: u8,
    /// UAT protocol version (e.g. 2 for DO-282B).
    pub uat_version: u8,
    /// Surveillance Integrity Level (0..=3).
    pub sil: u8,
    /// Navigation Accuracy Category - Position (0..=15).
    pub nac_p: u8,
}
