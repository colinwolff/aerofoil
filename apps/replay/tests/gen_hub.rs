//! Synthetic multi-aircraft scenario generator for `datasets/fixtures/dual_band_hub.beast`.

#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::{fs::File, io::Write};

use aerofoil_1090::crc::crc24;
use aerofoil_common::{
    Position,
    cpr::{RawCpr, decode_cpr_local},
};

fn encode_cpr_exact(lat_deg: f64, lon_deg: f64, is_odd: bool) -> (u32, u32) {
    let k = if is_odd { 59.0 } else { 60.0 };
    let dlat = 360.0 / k;
    let yz = (((lat_deg % dlat + dlat) % dlat) / dlat * 131_072.0).round() as u32;

    let nl = aerofoil_common::cpr::cpr_nl_from_microdegrees((lat_deg * 1_000_000.0) as i32);
    let n = if is_odd { (nl - 1).max(1) } else { nl.max(1) } as f64;
    let dlon = 360.0 / n;
    let xz = (((lon_deg % dlon + dlon) % dlon) / dlon * 131_072.0).round() as u32;

    (yz % 131_072, xz % 131_072)
}

fn encode_beast_frame(msg_type: u8, payload: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    out.push(0x1A);
    out.push(msg_type);
    out.extend_from_slice(&[0, 0, 0, 0, 0x27, 0x10]); // MLAT timestamp
    out.push(0x90); // Signal level
    for &b in payload {
        out.push(b);
        if b == 0x1A {
            out.push(0x1A);
        }
    }
    out
}

fn make_df17_ident(icao: u32, callsign: &str) -> [u8; 14] {
    let mut msg = [0u8; 14];
    msg[0] = 0x8D;
    msg[1] = (icao >> 16) as u8;
    msg[2] = (icao >> 8) as u8;
    msg[3] = icao as u8;
    msg[4] = 4 << 3; // TC 4

    let mut cs_bytes = [32u8; 8];
    for (i, b) in callsign.as_bytes().iter().take(8).enumerate() {
        cs_bytes[i] = match b {
            b'A'..=b'Z' => b - b'A' + 1,
            b'0'..=b'9' => b - b'0' + 48,
            _ => 32,
        };
    }

    let mut bits = 0u64;
    for &c in &cs_bytes {
        bits = (bits << 6) | (c as u64 & 0x3F);
    }

    let b_bytes = bits.to_be_bytes();
    msg[5..11].copy_from_slice(&b_bytes[2..8]);

    let parity = crc24(&msg[..11]);
    msg[11] = (parity >> 16) as u8;
    msg[12] = (parity >> 8) as u8;
    msg[13] = parity as u8;
    msg
}

fn make_df17_pos(icao: u32, alt_ft: i32, is_odd: bool, lat_cpr: u32, lon_cpr: u32) -> [u8; 14] {
    let mut msg = [0u8; 14];
    msg[0] = 0x8D;
    msg[1] = (icao >> 16) as u8;
    msg[2] = (icao >> 8) as u8;
    msg[3] = icao as u8;
    msg[4] = 11 << 3; // TC 11

    let alt_code = (((alt_ft + 1000) / 25) as u16) & 0x0FFF;
    let n = ((alt_code & 0x0FE0) << 1) | 0x0010 | (alt_code & 0x000F); // Q-bit = 1
    msg[5] = (n >> 4) as u8;
    msg[6] = ((n & 0x0F) as u8) << 4;

    if is_odd {
        msg[6] |= 0x04;
    }
    msg[6] |= ((lat_cpr >> 15) & 0x03) as u8;
    msg[7] = ((lat_cpr >> 7) & 0xFF) as u8;
    msg[8] = (((lat_cpr & 0x7F) << 1) | ((lon_cpr >> 16) & 0x01)) as u8;
    msg[9] = ((lon_cpr >> 8) & 0xFF) as u8;
    msg[10] = (lon_cpr & 0xFF) as u8;

    let parity = crc24(&msg[..11]);
    msg[11] = (parity >> 16) as u8;
    msg[12] = (parity >> 8) as u8;
    msg[13] = parity as u8;
    msg
}

fn make_df5_squawk(icao: u32, squawk_octal: u16) -> [u8; 7] {
    let mut msg = [0u8; 7];
    msg[0] = 0x28; // DF 5
    let a = (squawk_octal >> 9) & 0x07;
    let b = (squawk_octal >> 6) & 0x07;
    let c = (squawk_octal >> 3) & 0x07;
    let d = squawk_octal & 0x07;

    let c1 = c & 1;
    let a1 = a & 1;
    let c2 = (c >> 1) & 1;
    let a2 = (a >> 1) & 1;
    let c4 = (c >> 2) & 1;
    let a4 = (a >> 2) & 1;
    let b1 = b & 1;
    let d1 = d & 1;
    let b2 = (b >> 1) & 1;
    let d2 = (d >> 1) & 1;
    let b4 = (b >> 2) & 1;
    let d4 = (d >> 2) & 1;

    let code = (c1 << 12)
        | (a1 << 11)
        | (c2 << 10)
        | (a2 << 9)
        | (c4 << 8)
        | (a4 << 7)
        | (b1 << 5)
        | (d1 << 4)
        | (b2 << 3)
        | (d2 << 2)
        | (b4 << 1)
        | d4;

    msg[2] = (code >> 8) as u8;
    msg[3] = (code & 0xFF) as u8;

    msg[4] = (icao >> 16) as u8;
    msg[5] = (icao >> 8) as u8;
    msg[6] = icao as u8;
    msg
}

#[test]
fn generate_multi_aircraft_hub_fixture() {
    let aircraft = [
        (0x4840D6, "KLM1023", 3500, 52.45, 4.85, 0o4201),
        (0x484B12, "TRA542", 8200, 52.32, 4.60, 0o1000),
        (0x400892, "BAW431", 32000, 52.60, 4.40, 0o6214),
        (0x47812A, "SAS553", 18000, 52.80, 5.20, 0o3412),
        (0x4855AA, "MEDIC1", 1500, 52.25, 4.95, 0o7700), // EMERGENCY
        (0x3C49A8, "DLH12A", 36000, 52.50, 5.50, 0o2105),
        (0x40621D, "EZY291", 24000, 52.15, 4.70, 0o7000),
    ];

    let ref_pos = Position::from_microdegrees(52_367_600, 4_904_100).unwrap();
    let mut beast_bytes = Vec::new();

    for (icao, cs, alt, lat, lon, sq) in aircraft {
        let ident = make_df17_ident(icao, cs);
        beast_bytes.extend(encode_beast_frame(0x33, &ident));

        let (lat_even, lon_even) = encode_cpr_exact(lat, lon, false);
        let pos_even = make_df17_pos(icao, alt, false, lat_even, lon_even);
        beast_bytes.extend(encode_beast_frame(0x33, &pos_even));

        let (lat_odd, lon_odd) = encode_cpr_exact(lat, lon, true);
        let pos_odd = make_df17_pos(icao, alt, true, lat_odd, lon_odd);
        beast_bytes.extend(encode_beast_frame(0x33, &pos_odd));

        let raw_cpr = RawCpr::new(false, lat_even, lon_even, 1_000_000).unwrap();
        let decoded = decode_cpr_local(&raw_cpr, ref_pos).unwrap();
        let (d_lat, d_lon) = decoded.to_f64();
        assert!((d_lat - lat).abs() < 0.05);
        assert!((d_lon - lon).abs() < 0.05);

        let df5 = make_df5_squawk(icao, sq);
        beast_bytes.extend(encode_beast_frame(0x32, &df5));
    }

    // Add valid UAT 978 MHz downlink frame (address 0xA1B2C3)
    let uat_48 = [
        0x0A, 0x14, 0x28, 0x3C, 0x50, 0x64, 0x78, 0x8C, 0xA0, 0xCD, 0x0C, 0xBD, 0xA1, 0x19, 0x2D,
        0x41, 0x55, 0x69, 0x7D, 0x91, 0xA5, 0xAB, 0x57, 0x2D, 0xB2, 0x1E, 0x32, 0x46, 0x5A, 0x6E,
        0x82, 0x96, 0x05, 0x96, 0x35, 0xC6, 0xC3, 0x23, 0x37, 0x4B, 0x5F, 0x73, 0x87, 0x9B, 0x0E,
        0x62, 0x06, 0x22,
    ];
    beast_bytes.extend(encode_beast_frame(0x34, &uat_48));

    let path = if std::path::Path::new("datasets/fixtures").exists() {
        "datasets/fixtures/dual_band_hub.beast"
    } else {
        "../../datasets/fixtures/dual_band_hub.beast"
    };
    let mut out_file = File::create(path).unwrap();
    out_file.write_all(&beast_bytes).unwrap();
    assert!(beast_bytes.len() > 500);
}
