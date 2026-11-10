//! Self-describing recorded surveillance frame format.

use aerofoil_common::TransponderSource;
use serde::{Deserialize, Serialize};

/// RF surveillance broadcast frequency band.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum RfBand {
    /// 1090 MHz Mode S / ADS-B.
    #[serde(rename = "1090")]
    Band1090,
    /// 978 MHz Universal Access Transceiver (UAT).
    #[serde(rename = "978")]
    Band978,
}

impl From<TransponderSource> for RfBand {
    fn from(src: TransponderSource) -> Self {
        match src {
            TransponderSource::ModeS1090 => Self::Band1090,
            TransponderSource::Uat978 => Self::Band978,
        }
    }
}

impl From<RfBand> for TransponderSource {
    fn from(band: RfBand) -> Self {
        match band {
            RfBand::Band1090 => Self::ModeS1090,
            RfBand::Band978 => Self::Uat978,
        }
    }
}

/// Error decoding payload hex representation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HexError {
    /// Hex string has an odd number of nibbles.
    OddLength,
    /// An invalid non-hexadecimal ASCII character was encountered.
    InvalidChar(char),
}

/// A self-describing captured surveillance frame.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecordedFrame {
    /// RF transmission band / protocol.
    pub band: RfBand,
    /// Identifier or socket endpoint of the receiver source.
    pub source: String,
    /// Capture arrival timestamp in milliseconds since Unix epoch.
    pub timestamp_ms: u64,
    /// Hex-encoded raw frame payload bytes.
    pub payload_hex: String,
}

impl RecordedFrame {
    /// Creates a new [`RecordedFrame`] from a raw byte slice.
    #[must_use]
    pub fn new(
        band: impl Into<RfBand>,
        source: impl Into<String>,
        timestamp_ms: u64,
        payload: &[u8],
    ) -> Self {
        let mut hex = String::with_capacity(payload.len() * 2);
        for &byte in payload {
            use core::fmt::Write;
            let _ = write!(&mut hex, "{:02X}", byte);
        }
        Self {
            band: band.into(),
            source: source.into(),
            timestamp_ms,
            payload_hex: hex,
        }
    }

    /// Converts the RF band to the common [`TransponderSource`].
    #[must_use]
    pub fn transponder_source(&self) -> TransponderSource {
        self.band.into()
    }

    /// Decodes the payload hex string into raw bytes.
    ///
    /// # Errors
    /// Returns [`HexError`] if the hex string is malformed.
    pub fn decode_payload(&self) -> Result<Vec<u8>, HexError> {
        let bytes = self.payload_hex.as_bytes();
        if !bytes.len().is_multiple_of(2) {
            return Err(HexError::OddLength);
        }
        let mut out = Vec::with_capacity(bytes.len() / 2);
        for chunk in bytes.as_chunks::<2>().0 {
            let high = from_hex_digit(chunk[0] as char)?;
            let low = from_hex_digit(chunk[1] as char)?;
            out.push((high << 4) | low);
        }
        Ok(out)
    }
}

const fn from_hex_digit(c: char) -> Result<u8, HexError> {
    match c {
        '0'..='9' => Ok(c as u8 - b'0'),
        'a'..='f' => Ok(c as u8 - b'a' + 10),
        'A'..='F' => Ok(c as u8 - b'A' + 10),
        _ => Err(HexError::InvalidChar(c)),
    }
}
