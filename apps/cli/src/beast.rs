//! Mode-S Beast binary stream framing and unescaping decoder (`docs/SPEC.md` §5).
//!
//! Framing specification:
//! - Escaped with `0x1A`. An occurrence of `0x1A` in the body is doubled (`0x1A 0x1A`).
//! - Structure: `0x1A <type_byte> <6_byte_mlat_timestamp> <1_byte_signal> <payload_bytes>`.
//! - Supported type bytes:
//!   - `0x31` ('1'): Mode AC (2 bytes payload)
//!   - `0x32` ('2'): Mode S Short (7 bytes payload)
//!   - `0x33` ('3'): Mode S Long (14 bytes payload)

use std::io::{self, Read};

/// A decoded Beast binary frame.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BeastMessage {
    /// Beast message type (`0x31`='1', `0x32`='2', `0x33`='3').
    pub message_type: u8,
    /// 6-byte MLAT receiver timestamp.
    pub mlat_timestamp: [u8; 6],
    /// 1-byte receiver signal level.
    pub signal_level: u8,
    /// Payload length in bytes (2, 7, or 14).
    pub payload_len: usize,
    /// Fixed-size payload buffer.
    pub payload: [u8; 14],
}

impl BeastMessage {
    /// Returns the active payload slice.
    #[inline]
    #[must_use]
    pub fn payload_slice(&self) -> &[u8] {
        &self.payload[..self.payload_len]
    }
}

/// Streaming reader that extracts unescaped [`BeastMessage`] frames from an arbitrary byte reader.
#[derive(Debug)]
pub struct BeastReader<R> {
    reader: R,
}

impl<R: Read> BeastReader<R> {
    /// Creates a new [`BeastReader`] wrapping the given byte reader.
    pub fn new(reader: R) -> Self {
        Self { reader }
    }

    /// Reads an unescaped single byte from the stream, processing `0x1A 0x1A` escape sequences.
    fn read_unescaped_byte(&mut self) -> io::Result<Option<u8>> {
        let mut b = [0u8; 1];
        if self.reader.read_exact(&mut b).is_err() {
            return Ok(None);
        }
        if b[0] == 0x1A {
            let mut next = [0u8; 1];
            if self.reader.read_exact(&mut next).is_err() {
                return Ok(None);
            }
            if next[0] == 0x1A {
                return Ok(Some(0x1A));
            }
            // Unexpected unescaped 0x1A encountered in body; resynchronize with this new start
            return Ok(Some(next[0]));
        }
        Ok(Some(b[0]))
    }

    /// Reads the next complete [`BeastMessage`] from the underlying stream.
    pub fn next_message(&mut self) -> io::Result<Option<BeastMessage>> {
        let mut b = [0u8; 1];
        loop {
            // Find 0x1A start delimiter
            match self.reader.read_exact(&mut b) {
                Ok(()) => {
                    if b[0] == 0x1A {
                        break;
                    }
                }
                Err(ref e) if e.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
                Err(e) => return Err(e),
            }
        }

        // Read message type
        let Some(msg_type) = self.read_unescaped_byte()? else {
            return Ok(None);
        };

        let payload_len = match msg_type {
            0x31 => 2,
            0x32 => 7,
            0x33 => 14,
            _ => return self.next_message(), // Unknown or unsupported type, resynchronize
        };

        // Read 6-byte MLAT timestamp
        let mut mlat = [0u8; 6];
        for slot in &mut mlat {
            let Some(byte) = self.read_unescaped_byte()? else {
                return Ok(None);
            };
            *slot = byte;
        }

        // Read 1-byte signal level
        let Some(signal_level) = self.read_unescaped_byte()? else {
            return Ok(None);
        };

        // Read payload bytes
        let mut payload = [0u8; 14];
        for slot in payload.iter_mut().take(payload_len) {
            let Some(byte) = self.read_unescaped_byte()? else {
                return Ok(None);
            };
            *slot = byte;
        }

        Ok(Some(BeastMessage {
            message_type: msg_type,
            mlat_timestamp: mlat,
            signal_level,
            payload_len,
            payload,
        }))
    }
}
