//! Mode S Identity (Squawk) code field decoding (`docs/SPEC.md` §2).
//!
//! Mode S Downlink Formats DF5 and DF21 encode the 12-bit Mode A squawk code
//! interleaved across 13 bits in the pattern:
//! $C_1 - A_1 - C_2 - A_2 - C_4 - A_4 - \text{ZERO} - B_1 - D_1 - B_2 - D_2 - B_4 - D_4$

use aerofoil_common::Squawk;

/// Decodes the 13-bit identity (squawk) field from bytes 2 and 3 of a Mode S frame.
///
/// Bit 19 starts at `msg[2] & 0x1F`.
#[must_use]
pub fn decode_id13(msg: &[u8]) -> Option<Squawk> {
    if msg.len() < 4 {
        return None;
    }
    let msg2 = msg[2] & 0x1F;
    let msg3 = msg[3];

    let c1 = (msg2 >> 4) & 1;
    let a1 = (msg2 >> 3) & 1;
    let c2 = (msg2 >> 2) & 1;
    let a2 = (msg2 >> 1) & 1;
    let c4 = msg2 & 1;

    let a4 = (msg3 >> 7) & 1;
    let b1 = (msg3 >> 5) & 1;
    let d1 = (msg3 >> 4) & 1;
    let b2 = (msg3 >> 3) & 1;
    let d2 = (msg3 >> 2) & 1;
    let b4 = (msg3 >> 1) & 1;
    let d4 = msg3 & 1;

    let a = (a4 << 2) | (a2 << 1) | a1;
    let b = (b4 << 2) | (b2 << 1) | b1;
    let c = (c4 << 2) | (c2 << 1) | c1;
    let d = (d4 << 2) | (d2 << 1) | d1;

    let code = ((a as u16) << 9) | ((b as u16) << 6) | ((c as u16) << 3) | (d as u16);
    Squawk::new(code)
}
