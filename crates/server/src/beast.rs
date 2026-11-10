//! Dual-band Beast binary stream decoder supporting 1090 Mode S and 978 UAT.

use std::io::{self, Read};

/// A decoded Beast binary message.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BeastMessage {
    /// Message type: 0x31 ('1', Mode A/C 2B), 0x32 ('2', Mode S 7B), 0x33 ('3', Mode S 14B), 0x34 ('4', UAT 48B).
    pub message_type: u8,
    /// 6-byte MLAT timestamp.
    pub mlat_timestamp: [u8; 6],
    /// 1-byte signal level.
    pub signal_level: u8,
    /// Active payload length in bytes.
    pub payload_len: usize,
    /// Fixed payload buffer.
    pub payload: [u8; 48],
}

impl BeastMessage {
    /// Returns the active payload slice.
    #[must_use]
    pub fn payload_slice(&self) -> &[u8] {
        &self.payload[..self.payload_len]
    }
}

/// Streaming Beast binary reader.
#[derive(Debug)]
pub struct BeastReader<R> {
    reader: R,
}

impl<R: Read> BeastReader<R> {
    /// Constructs a new [`BeastReader`].
    pub const fn new(reader: R) -> Self {
        Self { reader }
    }

    fn read_unescaped_byte(&mut self) -> io::Result<Option<u8>> {
        let mut b = [0u8; 1];
        match self.reader.read_exact(&mut b) {
            Ok(()) => {}
            Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
            Err(e) => return Err(e),
        }
        if b[0] == 0x1A {
            let mut next = [0u8; 1];
            match self.reader.read_exact(&mut next) {
                Ok(()) => {}
                Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
                Err(e) => return Err(e),
            }
            if next[0] == 0x1A {
                return Ok(Some(0x1A));
            }
            return Ok(Some(next[0]));
        }
        Ok(Some(b[0]))
    }

    /// Reads the next unescaped Beast message.
    pub fn next_message(&mut self) -> io::Result<Option<BeastMessage>> {
        let mut b = [0u8; 1];
        loop {
            match self.reader.read_exact(&mut b) {
                Ok(()) => {}
                Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
                Err(e) => return Err(e),
            }
            if b[0] != 0x1A {
                continue;
            }

            let Some(msg_type) = self.read_unescaped_byte()? else {
                return Ok(None);
            };

            let payload_len = match msg_type {
                0x31 => 2,
                0x32 => 7,
                0x33 => 14,
                0x34 => 48,
                _ => continue,
            };

            let mut mlat = [0u8; 6];
            for byte in &mut mlat {
                let Some(val) = self.read_unescaped_byte()? else {
                    return Ok(None);
                };
                *byte = val;
            }

            let Some(sig) = self.read_unescaped_byte()? else {
                return Ok(None);
            };

            let mut payload = [0u8; 48];
            for byte in payload.iter_mut().take(payload_len) {
                let Some(val) = self.read_unescaped_byte()? else {
                    return Ok(None);
                };
                *byte = val;
            }

            return Ok(Some(BeastMessage {
                message_type: msg_type,
                mlat_timestamp: mlat,
                signal_level: sig,
                payload_len,
                payload,
            }));
        }
    }
}
