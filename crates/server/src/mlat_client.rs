//! Outbound MLAT streaming feeder client for community mlat-server networks.
//! Encapsulates Beast frames with 48MHz timestamps and parses incoming multilateration solutions.

use std::env;

/// Configuration for an outbound MLAT community feeder connection.
#[derive(Debug, Clone, PartialEq)]
pub struct MlatClientConfig {
    /// Remote mlat-server hostname and TCP port (e.g. "feed.airspace.net:40123").
    pub server_addr: String,
    /// Feeder station username or callsign.
    pub user: String,
    /// Surveyed station latitude in decimal degrees.
    pub lat: f64,
    /// Surveyed station longitude in decimal degrees.
    pub lon: f64,
    /// Surveyed station altitude in meters above ellipsoid.
    pub alt_m: f64,
}

impl MlatClientConfig {
    /// Loads MLAT feeder configuration from environment variables if configured.
    pub fn from_env() -> Option<Self> {
        let server_addr = env::var("AEROFOIL_MLAT_SERVER").ok()?;
        let user = env::var("AEROFOIL_MLAT_USER").unwrap_or_else(|_| "aerofoil-feeder".to_string());
        let lat = env::var("AEROFOIL_RECEIVER_LAT")
            .ok()?
            .parse::<f64>()
            .ok()?;
        let lon = env::var("AEROFOIL_RECEIVER_LON")
            .ok()?
            .parse::<f64>()
            .ok()?;
        let alt_m = env::var("AEROFOIL_RECEIVER_ALT")
            .unwrap_or_else(|_| "10.0".to_string())
            .parse::<f64>()
            .unwrap_or(10.0);

        Some(Self {
            server_addr,
            user,
            lat,
            lon,
            alt_m,
        })
    }

    /// Returns the surveyed station position in ECEF cartesian coordinates.
    pub fn ecef_position(&self) -> aerofoil_mlat::EcefCoord {
        aerofoil_mlat::geodetic_to_ecef(self.lat, self.lon, self.alt_m)
    }
}

/// Encodes initial feeder identification and geodetic coordinate synchronization packet.
pub fn encode_handshake(cfg: &MlatClientConfig) -> Vec<u8> {
    format!(
        "{{\"user\":\"{}\",\"lat\":{:.5},\"lon\":{:.5},\"alt\":{:.1}}}\n",
        cfg.user, cfg.lat, cfg.lon, cfg.alt_m
    )
    .into_bytes()
}

/// Encapsulates a Mode S raw frame into a Beast binary frame with 48MHz timestamp.
/// Automatically escapes internal `0x1A` escape bytes.
pub fn encode_beast_timestamped_frame(
    frame: &[u8],
    timestamp_48mhz: u64,
    signal_level: u8,
) -> Vec<u8> {
    let mut out = Vec::with_capacity(frame.len() * 2 + 10);
    out.push(0x1A);
    // 0x33 indicates Mode S long frame with 48MHz timestamp
    out.push(if frame.len() <= 7 { 0x32 } else { 0x33 });

    // 6-byte 48MHz timestamp big-endian
    let ts_bytes = timestamp_48mhz.to_be_bytes();
    for &b in &ts_bytes[2..8] {
        out.push(b);
        if b == 0x1A {
            out.push(0x1A);
        }
    }

    // Signal level
    out.push(signal_level);
    if signal_level == 0x1A {
        out.push(0x1A);
    }

    // Frame payload
    for &b in frame {
        out.push(b);
        if b == 0x1A {
            out.push(0x1A);
        }
    }

    out
}

/// Parses an incoming MLAT solution packet from mlat-server (Basestation format).
/// Format: `MSG,3,1,1,4CA705,1,2026/11/10,21:00:00.000,2026/11/10,21:00:00.000,,35000,,,52.3676,4.9041,,,,,,`
/// Returns `Some((icao_address, lat, lon, altitude_ft))` on successful parse.
pub fn parse_mlat_solution_line(line: &str) -> Option<(u32, f64, f64, f64)> {
    let parts: Vec<&str> = line.trim().split(',').collect();
    if parts.len() < 16 || parts[0] != "MSG" {
        return None;
    }

    let icao = u32::from_str_radix(parts[4], 16).ok()?;
    let alt_ft = parts[11].parse::<f64>().ok()?;
    let lat = parts[14].parse::<f64>().ok()?;
    let lon = parts[15].parse::<f64>().ok()?;

    Some((icao, lat, lon, alt_ft))
}
