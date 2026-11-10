//! Deterministic replay reader for recorded frame captures.

use std::io::BufRead;

use crate::frame::RecordedFrame;

/// Errors produced during replay parsing.
#[derive(Debug)]
pub enum ReplayError {
    /// Underlying I/O error reading the stream.
    Io(std::io::Error),
    /// JSON deserialization failure on a specific line.
    Json {
        /// Line number in the capture file (1-indexed).
        line: usize,
        /// Underlying serde error.
        source: serde_json::Error,
    },
}

impl core::fmt::Display for ReplayError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Io(err) => write!(f, "replay io error: {err}"),
            Self::Json { line, source } => {
                write!(f, "replay json error on line {line}: {source}")
            }
        }
    }
}

impl std::error::Error for ReplayError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(err) => Some(err),
            Self::Json { source, .. } => Some(source),
        }
    }
}

impl From<std::io::Error> for ReplayError {
    fn from(err: std::io::Error) -> Self {
        Self::Io(err)
    }
}

/// An iterator yielding [`RecordedFrame`] elements deterministically from a line-delimited stream.
#[derive(Debug)]
pub struct ReplayReader<R> {
    reader: R,
    buffer: String,
    line_number: usize,
}

impl<R: BufRead> ReplayReader<R> {
    /// Wraps a buffered reader to parse recorded JSON-lines frames.
    pub const fn new(reader: R) -> Self {
        Self {
            reader,
            buffer: String::new(),
            line_number: 0,
        }
    }
}

impl<R: BufRead> Iterator for ReplayReader<R> {
    type Item = Result<RecordedFrame, ReplayError>;

    fn next(&mut self) -> Option<Self::Item> {
        loop {
            self.buffer.clear();
            self.line_number += 1;
            match self.reader.read_line(&mut self.buffer) {
                Ok(0) => return None, // EOF
                Ok(_) => {
                    let trimmed = self.buffer.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    match serde_json::from_str::<RecordedFrame>(trimmed) {
                        Ok(frame) => return Some(Ok(frame)),
                        Err(source) => {
                            return Some(Err(ReplayError::Json {
                                line: self.line_number,
                                source,
                            }));
                        }
                    }
                }
                Err(err) => return Some(Err(ReplayError::Io(err))),
            }
        }
    }
}
