//! Mode S Altitude Code (AC) field decoding (`docs/SPEC.md` §2).
//!
//! Handles:
//! - 13-bit AC field in short surveillance replies (DF0, DF4, DF16, DF20)
//! - 12-bit AC field in ADS-B Extended Squitter airborne position messages (DF17, DF18)
//! - 25-foot resolution ($Q=1$)
//! - 100-foot Gillham Gray code resolution ($Q=0, M=0$)

use aerofoil_common::{Altitude, AltitudeKind};

/// Decodes an 8-bit Gray code value to binary.
#[inline]
const fn gray_to_binary(gray: u8) -> u8 {
    let mut b = gray;
    b ^= b >> 4;
    b ^= b >> 2;
    b ^= b >> 1;
    b
}

/// Decodes an 11-bit Gillham (Mode C Gray code) word to feet.
///
/// Returns `None` if the 100-foot Gray pattern is invalid.
#[must_use]
pub fn decode_gillham(code: u16) -> Option<i32> {
    let c1 = ((code >> 10) & 1) as u8;
    let a1 = ((code >> 9) & 1) as u8;
    let c2 = ((code >> 8) & 1) as u8;
    let a2 = ((code >> 7) & 1) as u8;
    let c4 = ((code >> 6) & 1) as u8;
    let a4 = ((code >> 5) & 1) as u8;
    let b1 = ((code >> 4) & 1) as u8;
    let b2 = ((code >> 3) & 1) as u8;
    let d2 = ((code >> 2) & 1) as u8;
    let b4 = ((code >> 1) & 1) as u8;
    let d4 = (code & 1) as u8;

    let c_gray = (c1 << 2) | (c2 << 1) | c4;
    let mut one_hundreds: i32 = match c_gray {
        0b001 => 1,
        0b011 => 2,
        0b010 => 3,
        0b110 => 4,
        0b100 => 5,
        _ => return None,
    };

    let d_gray =
        (d2 << 7) | (d4 << 6) | (a1 << 5) | (a2 << 4) | (a4 << 3) | (b1 << 2) | (b2 << 1) | b4;
    let five_hundreds = gray_to_binary(d_gray) as i32;
    if (five_hundreds & 1) != 0 {
        one_hundreds = 6 - one_hundreds;
    }

    Some(five_hundreds * 500 + one_hundreds * 100 - 1300)
}

/// Decodes a 13-bit AC field from bytes 2 and 3 of a Mode S short frame.
///
/// Bit 19 starts at `msg[2] & 0x1F`.
#[must_use]
pub fn decode_ac13(msg: &[u8]) -> Option<Altitude> {
    if msg.len() < 4 {
        return None;
    }
    let m_bit = (msg[3] & 0x40) != 0;
    let q_bit = (msg[3] & 0x10) != 0;

    if m_bit {
        // Metric altitude (uncommon, Annex 10 §3.1.2.6.5.4)
        return None;
    }

    if q_bit {
        // 25-foot resolution
        let n = (((msg[2] & 0x1F) as i32) << 6)
            | (((msg[3] & 0x80) as i32) >> 2)
            | (((msg[3] & 0x20) as i32) >> 1)
            | ((msg[3] & 0x0F) as i32);
        let feet = n * 25 - 1000;
        Altitude::new(feet, AltitudeKind::Barometric)
    } else {
        // 100-foot Gillham code
        let code = (((msg[2] & 0x1F) as u16) << 6)
            | (((msg[3] & 0x80) as u16) >> 2)
            | (((msg[3] & 0x20) as u16) >> 1)
            | ((msg[3] & 0x0F) as u16);
        let feet = decode_gillham(code)?;
        Altitude::new(feet, AltitudeKind::Barometric)
    }
}

/// Decodes a 12-bit AC field from an Extended Squitter airborne position message.
#[must_use]
pub fn decode_ac12(raw_12: u16) -> Option<Altitude> {
    if raw_12 == 0 {
        return None;
    }
    let q_bit = (raw_12 & 0x0010) != 0;

    if q_bit {
        let n = (((raw_12 & 0x0FE0) >> 1) | (raw_12 & 0x000F)) as i32;
        let feet = n * 25 - 1000;
        Altitude::new(feet, AltitudeKind::Barometric)
    } else {
        let code = ((raw_12 & 0x0FE0) >> 1) | (raw_12 & 0x000F);
        let feet = decode_gillham(code)?;
        Altitude::new(feet, AltitudeKind::Barometric)
    }
}
