//! CPR encoding helper for test fixture generation.

pub fn encode_cpr_exact(lat_deg: f64, lon_deg: f64, is_odd: bool) -> (u32, u32) {
    let k = if is_odd { 59.0 } else { 60.0 };
    let dlat = 360.0 / k;
    let yz = (((lat_deg % dlat + dlat) % dlat) / dlat * 131_072.0).round() as u32;

    let nl = aerofoil_common::cpr::cpr_nl_from_microdegrees((lat_deg * 1_000_000.0) as i32);
    let n = if is_odd { (nl - 1).max(1) } else { nl.max(1) } as f64;
    let dlon = 360.0 / n;
    let xz = (((lon_deg % dlon + dlon) % dlon) / dlon * 131_072.0).round() as u32;

    (yz % 131_072, xz % 131_072)
}
