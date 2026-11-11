//! Stream frame extraction and format autodetection.

use std::{
    io::{self, BufRead, BufReader, Cursor, Read},
    path::Path,
};

use crate::args::InputFormat;

/// An unescaped, framed surveillance message ready for paced emission.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReplayFrame {
    /// Microsecond timestamp if available.
    pub timestamp_us: Option<u64>,
    /// Wire bytes representing the complete frame (e.g. Beast escape sequence or AVR line).
    pub raw_bytes: Vec<u8>,
}

/// Autodetects stream framing from a peekable byte buffer or file path.
#[must_use]
pub fn detect_format(path: Option<&Path>, sample: &[u8]) -> InputFormat {
    if let Some(p) = path
        && let Some(ext) = p.extension().and_then(|s| s.to_str())
    {
        match ext.to_ascii_lowercase().as_str() {
            "beast" => return InputFormat::Beast,
            "avr" => return InputFormat::Avr,
            "jsonl" | "json" => return InputFormat::Jsonl,
            "iq" | "cu8" | "sc16" | "cf32" => return InputFormat::Iq,
            _ => {}
        }
    }

    for &b in sample {
        if b == 0x1A {
            return InputFormat::Beast;
        }
        if b == b'*' {
            return InputFormat::Avr;
        }
        if b == b'{' {
            return InputFormat::Jsonl;
        }
    }

    InputFormat::Beast
}

/// Reads all frames from a byte stream into an in-memory sequence for paced replay and looping.
pub fn load_frames<R: Read>(mut reader: R, format: InputFormat) -> io::Result<Vec<ReplayFrame>> {
    let mut buf = Vec::new();
    reader.read_to_end(&mut buf)?;

    let detected = if format == InputFormat::Auto {
        detect_format(None, &buf[..buf.len().min(512)])
    } else {
        format
    };

    match detected {
        InputFormat::Beast | InputFormat::Auto => parse_beast_frames(&buf),
        InputFormat::Avr => parse_avr_frames(&buf),
        InputFormat::Jsonl => parse_jsonl_frames(&buf),
        InputFormat::Iq => parse_iq_chunks(&buf),
    }
}

fn parse_beast_frames(buf: &[u8]) -> io::Result<Vec<ReplayFrame>> {
    let mut frames = Vec::new();
    let mut i = 0;
    while i < buf.len() {
        if buf[i] != 0x1A {
            i += 1;
            continue;
        }
        let start = i;
        i += 1; // skip 0x1A
        if i >= buf.len() {
            break;
        }
        let msg_type = buf[i];
        i += 1;
        let payload_len = match msg_type {
            0x31 => 2,
            0x32 => 7,
            0x33 => 14,
            0x34 => 48,
            _ => continue,
        };
        // 6 mlat bytes + 1 signal byte + payload_len bytes (accounting for 0x1A escaping)
        let needed_fields = 7 + payload_len;
        let mut read_fields = 0;
        let mut mlat_bytes = [0u8; 6];
        while i < buf.len() && read_fields < needed_fields {
            let b = buf[i];
            i += 1;
            if b == 0x1A && i < buf.len() && buf[i] == 0x1A {
                i += 1;
            }
            if read_fields < 6 {
                mlat_bytes[read_fields] = b;
            }
            read_fields += 1;
        }
        let raw = buf[start..i].to_vec();
        let mlat_ticks = u64::from_be_bytes([
            0,
            0,
            mlat_bytes[0],
            mlat_bytes[1],
            mlat_bytes[2],
            mlat_bytes[3],
            mlat_bytes[4],
            mlat_bytes[5],
        ]);
        // 12 MHz clock -> approx ticks / 12 for microseconds
        let ts_us = mlat_ticks / 12;
        frames.push(ReplayFrame {
            timestamp_us: Some(ts_us),
            raw_bytes: raw,
        });
    }
    Ok(frames)
}

fn parse_avr_frames(buf: &[u8]) -> io::Result<Vec<ReplayFrame>> {
    let mut frames = Vec::new();
    let cursor = Cursor::new(buf);
    let reader = BufReader::new(cursor);
    for line in reader.lines() {
        let l = line?;
        let trimmed = l.trim();
        if trimmed.starts_with('*') && trimmed.ends_with(';') {
            let mut raw = trimmed.as_bytes().to_vec();
            raw.push(b'\n');
            frames.push(ReplayFrame {
                timestamp_us: None,
                raw_bytes: raw,
            });
        }
    }
    Ok(frames)
}

fn parse_jsonl_frames(buf: &[u8]) -> io::Result<Vec<ReplayFrame>> {
    let mut frames = Vec::new();
    let cursor = Cursor::new(buf);
    let reader = BufReader::new(cursor);
    for line in reader.lines() {
        let l = line?;
        let trimmed = l.trim();
        if trimmed.is_empty() {
            continue;
        }
        let mut raw = trimmed.as_bytes().to_vec();
        raw.push(b'\n');
        frames.push(ReplayFrame {
            timestamp_us: None,
            raw_bytes: raw,
        });
    }
    Ok(frames)
}

fn parse_iq_chunks(buf: &[u8]) -> io::Result<Vec<ReplayFrame>> {
    let mut replayer = crate::iq_replay::IqDemodulatingReplayer::new();
    let frames = replayer.demodulate_cu8_to_frames(buf);
    if frames.is_empty() {
        let chunk_size = 4096;
        return Ok(buf
            .chunks(chunk_size)
            .map(|chunk| ReplayFrame {
                timestamp_us: None,
                raw_bytes: chunk.to_vec(),
            })
            .collect());
    }
    Ok(frames)
}
