//! Mode-S AVR ASCII hexadecimal stream decoder (`docs/SPEC.md` §5).
//!
//! Framing specification:
//! - ASCII format: `*<hex>;` followed by line breaks.
//! - Supported payload sizes:
//!   - 14 hexadecimal characters (7 bytes Mode S short)
//!   - 28 hexadecimal characters (14 bytes Mode S long)
//! - Invariant: Malformed hex or corrupted frames are skipped, never repaired.

use std::io::{self, BufRead};

/// An AVR decoded raw payload frame.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AvrMessage {
    /// Payload length in bytes (7 or 14).
    pub payload_len: usize,
    /// Fixed-size payload buffer.
    pub payload: [u8; 14],
}

impl AvrMessage {
    /// Returns the active payload slice.
    #[inline]
    #[must_use]
    pub fn payload_slice(&self) -> &[u8] {
        &self.payload[..self.payload_len]
    }
}

/// Parses a hexadecimal character into its 4-bit value, returning `None` if invalid.
#[inline]
const fn hex_nibble(c: u8) -> Option<u8> {
    match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        b'A'..=b'F' => Some(c - b'A' + 10),
        _ => None,
    }
}

/// Streaming reader that extracts valid [`AvrMessage`] frames from a buffered text reader.
#[derive(Debug)]
pub struct AvrReader<R> {
    reader: R,
    buffer: String,
}

impl<R: BufRead> AvrReader<R> {
    /// Creates a new [`AvrReader`] from a buffered reader.
    pub fn new(reader: R) -> Self {
        Self {
            reader,
            buffer: String::with_capacity(64),
        }
    }

    /// Reads lines and parses the next valid [`AvrMessage`].
    pub fn next_message(&mut self) -> io::Result<Option<AvrMessage>> {
        loop {
            self.buffer.clear();
            let bytes_read = self.reader.read_line(&mut self.buffer)?;
            if bytes_read == 0 {
                return Ok(None);
            }

            let trimmed = self.buffer.trim();
            if trimmed.is_empty() {
                continue;
            }

            // Must begin with '*' and end with ';' (or end of line)
            let without_start = match trimmed.strip_prefix('*') {
                Some(rest) => rest,
                None => continue, // Malformed, skip
            };
            let hex_str = without_start.trim_end_matches(';');

            let hex_len = hex_str.len();
            if hex_len != 14 && hex_len != 28 {
                continue; // Invalid length for Mode S frame, skip
            }

            let byte_len = hex_len / 2;
            let mut payload = [0u8; 14];
            let mut valid = true;

            let bytes = hex_str.as_bytes();
            for i in 0..byte_len {
                let Some(high) = hex_nibble(bytes[i * 2]) else {
                    valid = false;
                    break;
                };
                let Some(low) = hex_nibble(bytes[i * 2 + 1]) else {
                    valid = false;
                    break;
                };
                payload[i] = (high << 4) | low;
            }

            if !valid {
                continue; // Malformed hex, skipped
            }

            return Ok(Some(AvrMessage {
                payload_len: byte_len,
                payload,
            }));
        }
    }
}
