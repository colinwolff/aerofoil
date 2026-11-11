//! Geodetic WGS84 and Earth-Centered Earth-Fixed (ECEF) coordinate transformations.
//! Pure floating-point math conforming to NIMA TR8350.2.

use core::f64::consts::PI;

use aerofoil_common::Position;

/// WGS84 semi-major axis in meters (equatorial radius).
pub const WGS84_A: f64 = 6_378_137.0;
/// WGS84 reciprocal flattening factor (1 / f).
pub const WGS84_F_RECIP: f64 = 298.257_223_563;
/// WGS84 flattening factor (f).
pub const WGS84_F: f64 = 1.0 / WGS84_F_RECIP;
/// WGS84 semi-minor axis in meters (polar radius).
pub const WGS84_B: f64 = WGS84_A * (1.0 - WGS84_F);
/// WGS84 first eccentricity squared (e^2).
pub const WGS84_E2: f64 = 2.0 * WGS84_F - WGS84_F * WGS84_F;
/// WGS84 second eccentricity squared (e'^2).
pub const WGS84_EP2: f64 = (WGS84_A * WGS84_A - WGS84_B * WGS84_B) / (WGS84_B * WGS84_B);
/// Speed of radio wave propagation in standard atmosphere (m/s).
pub const SPEED_OF_LIGHT: f64 = 299_792_458.0;

/// Earth-Centered Earth-Fixed cartesian vector in meters [X, Y, Z].
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct EcefCoord {
    /// X axis pointing towards prime meridian intersection at equator.
    pub x: f64,
    /// Y axis pointing towards 90 deg East longitude at equator.
    pub y: f64,
    /// Z axis pointing towards North Pole.
    pub z: f64,
}

impl EcefCoord {
    /// Constructs a new ECEF coordinate triple.
    #[inline]
    pub const fn new(x: f64, y: f64, z: f64) -> Self {
        Self { x, y, z }
    }

    /// Euclidean distance in meters between two ECEF points.
    #[inline]
    pub fn distance_to(&self, other: &Self) -> f64 {
        let dx = self.x - other.x;
        let dy = self.y - other.y;
        let dz = self.z - other.z;
        (dx * dx + dy * dy + dz * dz).sqrt()
    }
}

/// Converts WGS84 geodetic coordinates (lat, lon degrees, alt meters) to ECEF cartesian coordinates.
pub fn geodetic_to_ecef(lat_deg: f64, lon_deg: f64, alt_m: f64) -> EcefCoord {
    let phi = lat_deg * PI / 180.0;
    let lambda = lon_deg * PI / 180.0;

    let sin_phi = phi.sin();
    let cos_phi = phi.cos();
    let sin_lambda = lambda.sin();
    let cos_lambda = lambda.cos();

    // Prime vertical radius of curvature
    let n = WGS84_A / (1.0 - WGS84_E2 * sin_phi * sin_phi).sqrt();

    let x = (n + alt_m) * cos_phi * cos_lambda;
    let y = (n + alt_m) * cos_phi * sin_lambda;
    let z = (n * (1.0 - WGS84_E2) + alt_m) * sin_phi;

    EcefCoord::new(x, y, z)
}

/// Converts ECEF cartesian coordinates to WGS84 geodetic coordinates using Bowring's algorithm.
/// Returns `(latitude_deg, longitude_deg, altitude_meters)`.
pub fn ecef_to_geodetic(ecef: EcefCoord) -> (f64, f64, f64) {
    let p = (ecef.x * ecef.x + ecef.y * ecef.y).sqrt();
    let lon = ecef.y.atan2(ecef.x) * 180.0 / PI;

    if p < 1e-6 {
        let lat = if ecef.z >= 0.0 { 90.0 } else { -90.0 };
        let alt = ecef.z.abs() - WGS84_B;
        return (lat, lon, alt);
    }

    // Bowring's closed-form iteration
    let theta = (ecef.z * WGS84_A).atan2(p * WGS84_B);
    let sin_theta = theta.sin();
    let cos_theta = theta.cos();

    let phi = (ecef.z + WGS84_EP2 * WGS84_B * sin_theta * sin_theta * sin_theta)
        .atan2(p - WGS84_E2 * WGS84_A * cos_theta * cos_theta * cos_theta);

    let sin_phi = phi.sin();
    let cos_phi = phi.cos();
    let n = WGS84_A / (1.0 - WGS84_E2 * sin_phi * sin_phi).sqrt();
    let alt = p / cos_phi - n;

    (phi * 180.0 / PI, lon, alt)
}

impl From<Position> for EcefCoord {
    #[inline]
    fn from(pos: Position) -> Self {
        let (lat, lon) = pos.to_f64();
        geodetic_to_ecef(lat, lon, 0.0)
    }
}
