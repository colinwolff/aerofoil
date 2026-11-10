//! UAT State Vector (SV) bitfield parsing (payload bytes 4..17).

use aerofoil_common::{Altitude, AltitudeKind, Latitude, Longitude, Position};

use super::types::{AirgroundState, StateVector};

const TAN_TABLE: [u16; 46] = [
    0, 18, 36, 54, 72, 90, 108, 126, 144, 162, 181, 199, 218, 236, 255, 274, 294, 313, 333, 353,
    373, 393, 414, 435, 456, 478, 499, 522, 544, 568, 591, 615, 640, 665, 691, 717, 744, 772, 800,
    829, 859, 890, 922, 955, 989, 1024,
];

fn int_atan2_deg(y: i32, x: i32) -> u16 {
    if x == 0 && y == 0 {
        return 0;
    }
    let abs_y = y.unsigned_abs();
    let abs_x = x.unsigned_abs();
    let (num, den, swap) = if abs_y > abs_x {
        (abs_x, abs_y, true)
    } else {
        (abs_y, abs_x, false)
    };
    let ratio = ((num * 1024) + (den / 2)) / den;
    let mut deg = 0;
    let mut best_diff = u32::MAX;
    for (d, &val) in TAN_TABLE.iter().enumerate() {
        let diff = (val as u32).abs_diff(ratio);
        if diff < best_diff {
            best_diff = diff;
            deg = d as u16;
        }
    }
    if swap {
        deg = 90 - deg;
    }
    let final_deg = match (x < 0, y < 0) {
        (true, false) => 180 - deg,
        (true, true) => 180 + deg,
        (false, true) => 360 - deg,
        (false, false) => deg,
    };
    final_deg % 360
}

fn decode_lat_lon(raw_lat: u32, raw_lon: u32, nic: u8) -> Option<Position> {
    if raw_lat == 0 && raw_lon == 0 && nic == 0 {
        return None;
    }
    let signed_lat: i64 = if (raw_lat & (1 << 22)) != 0 {
        (raw_lat as i64) - (1 << 23)
    } else {
        raw_lat as i64
    };
    let signed_lon: i64 = if (raw_lon & (1 << 23)) != 0 {
        (raw_lon as i64) - (1 << 24)
    } else {
        raw_lon as i64
    };

    let lat_prod = signed_lat * 360_000_000;
    let lat_micro = if lat_prod >= 0 {
        (lat_prod + (1 << 23)) >> 24
    } else {
        -((-lat_prod + (1 << 23)) >> 24)
    };

    let lon_prod = signed_lon * 360_000_000;
    let lon_micro = if lon_prod >= 0 {
        (lon_prod + (1 << 23)) >> 24
    } else {
        -((-lon_prod + (1 << 23)) >> 24)
    };

    let lat = Latitude::from_microdegrees(lat_micro as i32)?;
    let lon = Longitude::from_microdegrees(lon_micro as i32)?;
    Some(Position::new(lat, lon))
}

/// Parses the State Vector element (payload bytes 4..17).
#[must_use]
pub fn parse_state_vector(payload: &[u8; 34]) -> StateVector {
    let raw_lat =
        ((payload[4] as u32) << 15) | ((payload[5] as u32) << 7) | ((payload[6] as u32) >> 1);
    let raw_lon = (((payload[6] & 1) as u32) << 23)
        | ((payload[7] as u32) << 15)
        | ((payload[8] as u32) << 7)
        | ((payload[9] as u32) >> 1);

    let nic = payload[11] & 0x0f;
    let position = decode_lat_lon(raw_lat, raw_lon, nic);

    let raw_alt = ((payload[10] as u16) << 4) | ((payload[11] as u16) >> 4);
    let altitude = if raw_alt == 0 {
        None
    } else {
        let feet = ((raw_alt as i32 - 1) * 25) - 1000;
        let is_geo = (payload[9] & 1) != 0;
        let kind = if is_geo {
            AltitudeKind::Geometric
        } else {
            AltitudeKind::Barometric
        };
        Altitude::new(feet, kind)
    };

    let airground_state = match (payload[12] >> 6) & 0x03 {
        0 => AirgroundState::Subsonic,
        1 => AirgroundState::Supersonic,
        2 => AirgroundState::Surface,
        _ => AirgroundState::Reserved,
    };

    let (horizontal_velocity, track_degrees) = match airground_state {
        AirgroundState::Subsonic | AirgroundState::Supersonic => {
            let raw_ns =
                (((payload[12] & 0x1f) as i32) << 6) | (((payload[13] & 0xfc) as i32) >> 2);
            let raw_ew = (((payload[13] & 0x03) as i32) << 9)
                | ((payload[14] as i32) << 1)
                | (((payload[15] & 0x80) as i32) >> 7);
            if (raw_ns & 0x3ff) != 0 && (raw_ew & 0x3ff) != 0 {
                let mut ns = (raw_ns & 0x3ff) - 1;
                if (raw_ns & 0x400) != 0 {
                    ns = -ns;
                }
                let mut ew = (raw_ew & 0x3ff) - 1;
                if (raw_ew & 0x400) != 0 {
                    ew = -ew;
                }
                if airground_state == AirgroundState::Supersonic {
                    ns *= 4;
                    ew *= 4;
                }
                let speed = ((ns * ns + ew * ew) as u32).isqrt() as u16;
                let track = int_atan2_deg(ew, ns);
                (Some(speed), Some(track))
            } else {
                (None, None)
            }
        }
        AirgroundState::Surface => {
            let raw_gs =
                (((payload[12] & 0x1f) as u16) << 6) | (((payload[13] & 0xfc) as u16) >> 2);
            let raw_track = (((payload[13] & 0x03) as u16) << 9)
                | ((payload[14] as u16) << 1)
                | (((payload[15] & 0x80) as u16) >> 7);
            let speed = if (raw_gs & 0x3ff) != 0 {
                Some((raw_gs & 0x3ff) - 1)
            } else {
                None
            };
            let track = if speed.is_some() || raw_track != 0 {
                Some(((raw_track & 0x1ff) * 360) / 512)
            } else {
                None
            };
            (speed, track)
        }
        AirgroundState::Reserved => (None, None),
    };

    StateVector {
        position,
        altitude,
        nic,
        airground_state,
        horizontal_velocity,
        track_degrees,
    }
}
