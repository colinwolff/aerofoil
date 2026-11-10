//! Integration tests for UAT downlink State Vector and Mode Status parsing.

#![allow(clippy::unwrap_used, clippy::expect_used)]

use aerofoil_978::downlink::{AirgroundState, parse_mode_status, parse_state_vector};
use aerofoil_978::frame::{UatDownlinkFrame, interleave_downlink};
use aerofoil_978::gf::{EXP_TABLE, gf_add, gf_mul};
use aerofoil_978::rs::{RS_BLOCK_LEN, RS_DATA_LEN, RS_FCR, RS_PARITY_LEN};
use aerofoil_common::{AltitudeKind, Squawk};

fn compute_generator_poly() -> [u8; 15] {
    let mut g = [0u8; 15];
    g[0] = 1;
    for (deg, i) in (0..RS_PARITY_LEN).enumerate() {
        let root = EXP_TABLE[RS_FCR + i];
        let mut next_g = [0u8; 15];
        for j in 0..=deg {
            next_g[j] = gf_add(next_g[j], g[j]);
            next_g[j + 1] = gf_add(next_g[j + 1], gf_mul(g[j], root));
        }
        g = next_g;
    }
    g
}

fn encode_and_interleave(payload: &[u8; RS_DATA_LEN]) -> [u8; RS_BLOCK_LEN] {
    let g = compute_generator_poly();
    let mut codeword = [0u8; RS_BLOCK_LEN];
    codeword[..RS_DATA_LEN].copy_from_slice(payload);

    for i in 0..RS_DATA_LEN {
        let lead = codeword[i];
        if lead != 0 {
            for j in 0..=RS_PARITY_LEN {
                codeword[i + j] = gf_add(codeword[i + j], gf_mul(lead, g[j]));
            }
        }
    }
    codeword[..RS_DATA_LEN].copy_from_slice(payload);
    interleave_downlink(&codeword)
}

#[test]
fn do282b_ramp_test_vector_decodes_accurately() {
    // Standard DO-282B / dump978 test vector for ground beacon RAMPTEST
    let hex_payload = "0d1abba154d8ec198ba602f0800000000074c28d855bfd0b4aa5c2a0000000000000";
    let mut payload = [0u8; 34];
    for (i, chunk) in hex_payload.as_bytes().chunks(2).enumerate() {
        let s = core::str::from_utf8(chunk).unwrap();
        payload[i] = u8::from_str_radix(s, 16).unwrap();
    }

    let interleaved = encode_and_interleave(&payload);
    let frame = UatDownlinkFrame::decode_long(&interleaved).unwrap();

    assert_eq!(frame.address(), 0x1ABBA1);
    assert_eq!(frame.address_qualifier(), 5); // Fixed ADS-B beacon
    assert_eq!(frame.payload_type(), 1); // Long message

    let sv = frame.state_vector();
    assert_eq!(sv.nic, 0);
    assert_eq!(sv.airground_state, AirgroundState::Surface);
    assert_eq!(sv.horizontal_velocity, None);

    let pos = sv.position.expect("position must be valid");
    assert_eq!(pos.lat().microdegrees(), 59_658_294); // +59.6583 deg
    assert_eq!(pos.lon().microdegrees(), 17_961_681); // +17.9617 deg

    let alt = sv.altitude.expect("altitude must be present");
    assert_eq!(alt.feet(), 150);
    assert_eq!(alt.kind(), AltitudeKind::Barometric);

    let ms = frame.mode_status().expect("mode status must be present");
    assert_eq!(ms.emitter_category, 18); // Service vehicle
    assert_eq!(ms.callsign, Some(*b"RAMPTEST"));
    assert_eq!(ms.emergency_status, 0);
    assert_eq!(ms.uat_version, 2);
    assert_eq!(ms.sil, 3);
}

#[test]
fn airborne_subsonic_telemetry_vector() {
    let mut payload = [0u8; 34];
    payload[0] = 0x08; // payload_type = 1, qualifier = 0

    // Set altitude: 2300 ft geometric -> raw_alt = (2300 + 1000)/25 + 1 = 133 = 0x085
    // payload[9] bit 0 = 1 (geometric)
    payload[9] = 0x01;
    payload[10] = (133 >> 4) as u8; // 0x08
    payload[11] = ((133 & 0x0f) << 4) as u8 | 7; // nic = 7

    // Set airground_state = 0 (subsonic), N/S = -65 kt, E/W = -98 kt
    // raw_ns = (65 + 1) | 0x400 = 66 | 1024 = 1090 = 0x442
    // bits: payload[12] bits 4..0 = top 5 bits of 1090 (1090 >> 6 = 17)
    payload[12] = (1090 >> 6) as u8 & 0x1f;
    // payload[13] top 6 bits = lower 6 bits of 1090 (1090 & 0x3f = 2) << 2
    // raw_ew = (98 + 1) | 0x400 = 99 | 1024 = 1123 = 0x463
    // payload[13] lower 2 bits = top 2 bits of 1123 (1123 >> 9 = 2)
    payload[13] = (((1090 & 0x3f) as u8) << 2) | ((1123 >> 9) as u8 & 0x03);
    // payload[14] = bits 8..1 of 1123 ((1123 >> 1) as u8 = 0x31)
    payload[14] = (1123 >> 1) as u8;
    // payload[15] bit 7 = bit 0 of 1123 (1) << 7 = 0x80
    payload[15] = ((1123 & 1) as u8) << 7;

    let sv = parse_state_vector(&payload);
    assert_eq!(sv.nic, 7);
    assert_eq!(sv.airground_state, AirgroundState::Subsonic);
    let alt = sv.altitude.unwrap();
    assert_eq!(alt.feet(), 2300);
    assert_eq!(alt.kind(), AltitudeKind::Geometric);

    // Speed: sqrt(65^2 + 98^2) = 117 kt
    assert_eq!(sv.horizontal_velocity, Some(117));
    // Track: atan2(-98, -65) = 236 deg
    assert_eq!(sv.track_degrees, Some(236));
}

#[test]
fn zero_coordinates_with_zero_nic_reports_none() {
    let mut payload = [0u8; 34];
    payload[0] = 0x08; // payload_type = 1
    let sv = parse_state_vector(&payload);
    assert_eq!(sv.position, None);
    assert_eq!(sv.altitude, None);
    assert_eq!(sv.nic, 0);
}

#[test]
fn mode_status_squawk_code_decoding() {
    let mut payload = [0u8; 34];
    payload[0] = 0x08; // payload_type = 1
    payload[23] = 2 << 2; // uat_version = 2
    payload[26] = 0; // csid = 0 (Mode A squawk)

    // Squawk: 1200 octal -> sq_a = 1, sq_b = 2, sq_c = 0, sq_d = 0
    // v1 = 1 * 40 + 2 = 42
    payload[17] = (42 >> 8) as u8;
    payload[18] = 42;
    // v2 = 0, v3 = 0
    payload[19] = 0;
    payload[20] = 0;

    let ms = parse_mode_status(&payload);
    assert_eq!(ms.callsign, None);
    assert_eq!(ms.squawk, Squawk::new(0o1200));
}
