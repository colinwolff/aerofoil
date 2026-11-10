//! Ingest CPR coordinate tracker decoding global and local airborne positions.

use std::{collections::HashMap, sync::Mutex};

use aerofoil_common::{
    Position,
    cpr::{RawCpr, decode_cpr_global, decode_cpr_local},
};

/// Default reference position for local CPR decoding (Amsterdam FIR: 52.3676°N, 4.9041°E).
const DEFAULT_REF_LAT_MICRO: i32 = 52_367_600;
const DEFAULT_REF_LON_MICRO: i32 = 4_904_100;

/// Even and odd CPR frame pair stored for an aircraft.
type CprPair = (Option<RawCpr>, Option<RawCpr>);

/// State store tracking even and odd CPR frames for global/local position solving.
#[derive(Debug)]
pub struct CprResolver {
    reports: Mutex<HashMap<u32, CprPair>>,
    reference: Position,
}

impl Default for CprResolver {
    fn default() -> Self {
        Self::new()
    }
}

impl CprResolver {
    /// Constructs a new [`CprResolver`] with default receiver reference.
    #[must_use]
    pub fn new() -> Self {
        let reference = Position::from_microdegrees(DEFAULT_REF_LAT_MICRO, DEFAULT_REF_LON_MICRO)
            .unwrap_or(Position::ZERO);
        Self {
            reports: Mutex::new(HashMap::new()),
            reference,
        }
    }

    /// Ingests a raw 17-bit CPR position report and resolves coordinates if decodable.
    pub fn resolve(
        &self,
        icao: u32,
        is_odd: bool,
        lat_cpr: u32,
        lon_cpr: u32,
        timestamp_ms: u64,
    ) -> Option<Position> {
        let raw = RawCpr::new(is_odd, lat_cpr, lon_cpr, timestamp_ms)?;

        let mut lock = self.reports.lock().ok()?;
        let entry = lock.entry(icao).or_insert((None, None));

        // Attempt global decode first if opposite parity frame is available
        let opposite = if is_odd { entry.0 } else { entry.1 };
        if let Some(opp) = opposite {
            let (even, odd) = if is_odd { (opp, raw) } else { (raw, opp) };
            if let Ok(pos) = decode_cpr_global(&even, &odd) {
                if is_odd {
                    entry.1 = Some(raw);
                } else {
                    entry.0 = Some(raw);
                }
                return Some(pos);
            }
        }

        // Update stored frame
        if is_odd {
            entry.1 = Some(raw);
        } else {
            entry.0 = Some(raw);
        }

        // Fall back to local decoding against reference position
        decode_cpr_local(&raw, self.reference).ok()
    }
}
