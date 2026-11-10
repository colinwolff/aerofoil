//! UAT downlink State Vector (SV) and Mode Status (MS) bitfield parsing.
//!
//! RTCA DO-282B specifies the downlink message payload layout for 978 MHz UAT.
//! In accordance with `docs/SPEC.md`:
//! - All operations are pure functions with zero dynamic memory allocation.
//! - Coordinates are decoded to micro-degrees ([`aerofoil_common::Position`]).
//! - Incomplete or invalid telemetry returns `None` rather than falling back to sentinel values.

mod ms;
mod sv;
mod types;

pub use ms::parse_mode_status;
pub use sv::parse_state_vector;
pub use types::{AirgroundState, ModeStatus, StateVector};

use crate::frame::UatDownlinkFrame;

impl UatDownlinkFrame {
    /// Parses the State Vector element (payload bytes 4..17).
    #[inline]
    #[must_use]
    pub fn state_vector(&self) -> StateVector {
        parse_state_vector(self.payload())
    }

    /// Parses the Mode Status element (payload bytes 17..29) of a Long downlink frame.
    #[inline]
    #[must_use]
    pub fn mode_status(&self) -> Option<ModeStatus> {
        if self.payload_type() != 1 {
            return None;
        }
        Some(parse_mode_status(self.payload()))
    }
}
