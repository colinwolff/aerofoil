//! Aircraft Identification & Category Extended Squitter payload (Type Codes 1..=4).

/// 6-bit Mode S ASCII character set lookup table.
const MODES_CHARSET: &[u8; 64] =
    b"#ABCDEFGHIJKLMNOPQRSTUVWXYZ##### ###############0123456789######";

/// Aircraft Identification & Category (TC 1..=4).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AircraftIdentification {
    /// Extended Squitter type code (1..=4).
    pub type_code: u8,
    /// Emitter category within type code (0..=7).
    pub emitter_category: u8,
    /// 8-character ASCII callsign / flight identity.
    pub callsign: [u8; 8],
}

impl AircraftIdentification {
    /// Parses an Identification payload from a 7-byte ME field.
    #[must_use]
    pub fn parse(me: &[u8; 7]) -> Self {
        let tc = me[0] >> 3;
        let ec = me[0] & 0x07;

        // Unpack 8 6-bit characters from the remaining 48 bits (me[1..7])
        let mut callsign = [b' '; 8];
        let raw_bits = ((me[1] as u64) << 40)
            | ((me[2] as u64) << 32)
            | ((me[3] as u64) << 24)
            | ((me[4] as u64) << 16)
            | ((me[5] as u64) << 8)
            | (me[6] as u64);

        for (i, slot) in callsign.iter_mut().enumerate() {
            let shift = 42 - i * 6;
            let char_idx = ((raw_bits >> shift) & 0x3F) as usize;
            *slot = MODES_CHARSET[char_idx];
        }

        Self {
            type_code: tc,
            emitter_category: ec,
            callsign,
        }
    }
}
