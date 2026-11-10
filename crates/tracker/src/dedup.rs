//! Spatio-temporal deduplication for ADS-R cross-band broadcasts (`docs/SPEC.md` Invariant 10).
//!
//! A ground re-broadcast update is applied only when no direct-reception update arrived within
//! `Δt ≤ 1.0 s` **and** within `Δd ≤ 0.001°` of the track's position. Direct reception always wins.

use aerofoil_common::Position;

/// Maximum temporal window for cross-band deduplication (1.0 second in milliseconds).
pub const DEDUP_MAX_TIME_DELTA_MS: u64 = 1_000;

/// Maximum spatial distance window for cross-band deduplication (0.001 degrees in micro-degrees).
pub const DEDUP_MAX_DISTANCE_MICRODEGREES: i32 = 1_000;

/// Squared maximum distance in micro-degrees squared ($1000^2 = 1,000,000$).
pub const DEDUP_MAX_DISTANCE_SQUARED: i64 = 1_000_000;

/// Checks whether two geographic positions are within `Δd ≤ 0.001°` (1000 micro-degrees).
#[inline]
#[must_use]
pub fn is_within_spatial_window(p1: Position, p2: Position) -> bool {
    let d_lat = (p1.lat().microdegrees() - p2.lat().microdegrees()).abs() as i64;
    let d_lon = (p1.lon().microdegrees() - p2.lon().microdegrees()).abs() as i64;
    d_lat * d_lat + d_lon * d_lon <= DEDUP_MAX_DISTANCE_SQUARED
}

/// Evaluates whether a rebroadcast update should be deduplicated and suppressed against direct reception.
///
/// Returns `true` if a direct-reception update was observed within `Δt ≤ 1.0 s` and `Δd ≤ 0.001°`.
#[must_use]
pub fn should_deduplicate(
    last_direct_seen_ms: Option<u64>,
    last_direct_pos: Option<Position>,
    update_time_ms: u64,
    update_pos: Option<Position>,
    track_pos: Option<Position>,
) -> bool {
    let Some(direct_ts) = last_direct_seen_ms else {
        return false;
    };

    let delta_t = update_time_ms.abs_diff(direct_ts);
    if delta_t > DEDUP_MAX_TIME_DELTA_MS {
        return false;
    }

    match (update_pos.or(track_pos), last_direct_pos.or(track_pos)) {
        (Some(p1), Some(p2)) => is_within_spatial_window(p1, p2),
        // If neither position is known, temporal collision alone triggers deduplication
        _ => true,
    }
}
