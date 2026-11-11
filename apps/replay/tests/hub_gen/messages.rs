//! Mode S DF17 / DF5 and Beast binary encoding utilities.

use aerofoil_1090::crc::crc24;

pub fn encode_beast_frame_timestamped(msg_type: u8, payload: &[u8], mlat_ticks: u64) -> Vec<u8> {
    let mut out = Vec::new();
    out.push(0x1A);
    out.push(msg_type);
    let ts_bytes = mlat_ticks.to_be_bytes();
    out.extend_from_slice(&ts_bytes[2..8]); // 6-byte MLAT counter
    out.push(0x90); // Signal level
    for &b in payload {
        out.push(b);
        if b == 0x1A {
            out.push(0x1A);
        }
    }
    out
}

pub fn encode_beast_frame(msg_type: u8, payload: &[u8]) -> Vec<u8> {
    encode_beast_frame_timestamped(msg_type, payload, 0x2710)
}

pub fn make_df17_ident(icao: u32, callsign: &str) -> [u8; 14] {
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

pub fn make_df17_pos(icao: u32, alt_ft: i32, is_odd: bool, lat_cpr: u32, lon_cpr: u32) -> [u8; 14] {
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

pub fn make_df17_velocity(icao: u32, ew_knots: i16, ns_knots: i16, vr_fpm: i16) -> [u8; 14] {
    let mut msg = [0u8; 14];
    msg[0] = 0x8D;
    msg[1] = (icao >> 16) as u8;
    msg[2] = (icao >> 8) as u8;
    msg[3] = icao as u8;

    // ME byte 0: Type Code 19 (Airborne Velocity), Subtype 1 (Ground speed normal)
    msg[4] = (19 << 3) | 1;

    // ME byte 1: Intent change (0), IFR (1), NAC_v = 1
    let nac_v = 1u8;
    msg[5] = (1 << 6) | (nac_v << 3);

    // East-West direction and speed
    let ew_sign = if ew_knots < 0 { 1u8 } else { 0u8 };
    let ew_raw = ew_knots.unsigned_abs() + 1;
    msg[5] |= (ew_sign << 2) | ((ew_raw >> 8) & 0x03) as u8;
    msg[6] = (ew_raw & 0xFF) as u8;

    // North-South direction and speed
    let ns_sign = if ns_knots < 0 { 1u8 } else { 0u8 };
    let ns_raw = ns_knots.unsigned_abs() + 1;
    msg[7] = (ns_sign << 7) | ((ns_raw >> 3) & 0x7F) as u8;
    msg[8] = ((ns_raw & 0x07) << 5) as u8;

    // Vertical rate
    let vr_down = if vr_fpm < 0 { 1u8 } else { 0u8 };
    let vr_raw = vr_fpm.unsigned_abs() / 64 + 1;
    msg[8] |= (vr_down << 3) | ((vr_raw >> 6) & 0x07) as u8;
    msg[9] = ((vr_raw & 0x3F) << 2) as u8;

    let parity = crc24(&msg[..11]);
    msg[11] = (parity >> 16) as u8;
    msg[12] = (parity >> 8) as u8;
    msg[13] = parity as u8;
    msg
}

pub fn make_df5_squawk(icao: u32, squawk_octal: u16) -> [u8; 7] {
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
