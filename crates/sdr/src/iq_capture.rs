//! Raw RF I/Q baseband sample recording sink (`AF-85`).
//! Supports `.cu8` (unsigned 8-bit offset binary) and `.cf32` (interleaved float32).

use std::fs::File;
use std::io::{self, BufWriter, Write};
use std::path::Path;

/// Supported sample encodings for raw RF baseband capture.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum IqFormat {
    /// Interleaved unsigned 8-bit offset binary `[I0, Q0, I1, Q1, ...]`.
    #[default]
    Cu8,
    /// Interleaved 32-bit floating point `[I0, Q0, I1, Q1, ...]`.
    Cf32,
}

impl IqFormat {
    /// Infers IQ format from file path extension.
    #[must_use]
    pub fn from_path(path: &Path) -> Self {
        match path.extension().and_then(|s| s.to_str()) {
            Some(ext) if ext.eq_ignore_ascii_case("cf32") => Self::Cf32,
            _ => Self::Cu8,
        }
    }
}

/// Disk recording sink for capturing raw RF I/Q baseband samples.
#[derive(Debug)]
pub struct IqWriter {
    writer: BufWriter<File>,
    format: IqFormat,
    samples_written: u64,
    bytes_written: u64,
}

impl IqWriter {
    /// Creates a new IQ capture file at `path`.
    pub fn create(path: impl AsRef<Path>, format: IqFormat) -> io::Result<Self> {
        let file = File::create(path)?;
        Ok(Self {
            writer: BufWriter::new(file),
            format,
            samples_written: 0,
            bytes_written: 0,
        })
    }

    /// Records interleaved unsigned 8-bit I/Q bytes into the sink.
    ///
    /// If target format is `Cf32`, automatically normalizes `[0..255]` to `[-1.0..+1.0]`.
    pub fn write_cu8(&mut self, cu8_bytes: &[u8]) -> io::Result<usize> {
        match self.format {
            IqFormat::Cu8 => {
                self.writer.write_all(cu8_bytes)?;
                let samples = (cu8_bytes.len() / 2) as u64;
                self.samples_written += samples;
                self.bytes_written += cu8_bytes.len() as u64;
                Ok(samples as usize)
            }
            IqFormat::Cf32 => {
                let num_samples = cu8_bytes.len() / 2;
                let mut float_buf = Vec::with_capacity(num_samples * 2 * 4);
                for &b in cu8_bytes {
                    let norm = (f32::from(b) - 128.0) / 128.0;
                    float_buf.extend_from_slice(&norm.to_le_bytes());
                }
                self.writer.write_all(&float_buf)?;
                self.samples_written += num_samples as u64;
                self.bytes_written += float_buf.len() as u64;
                Ok(num_samples)
            }
        }
    }

    /// Flushes any buffered bytes to disk.
    pub fn flush(&mut self) -> io::Result<()> {
        self.writer.flush()
    }

    /// Total complex I/Q samples written.
    #[must_use]
    pub const fn samples_written(&self) -> u64 {
        self.samples_written
    }

    /// Total raw bytes written to disk.
    #[must_use]
    pub const fn bytes_written(&self) -> u64 {
        self.bytes_written
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[allow(clippy::unwrap_used)]
    fn test_iq_writer_cu8_and_cf32() {
        let temp_dir = std::env::temp_dir();
        let cu8_path = temp_dir.join(format!("test_{}.cu8", std::process::id()));
        let cf32_path = temp_dir.join(format!("test_{}.cf32", std::process::id()));

        // Interleaved [I0, Q0, I1, Q1]
        let raw = [128u8, 255u8, 0u8, 128u8];

        {
            let mut writer = IqWriter::create(&cu8_path, IqFormat::Cu8).unwrap();
            let count = writer.write_cu8(&raw).unwrap();
            assert_eq!(count, 2);
            writer.flush().unwrap();
            assert_eq!(writer.bytes_written(), 4);
        }

        let read_cu8 = std::fs::read(&cu8_path).unwrap();
        assert_eq!(read_cu8, raw);
        let _ = std::fs::remove_file(cu8_path);

        {
            let mut writer = IqWriter::create(&cf32_path, IqFormat::Cf32).unwrap();
            let count = writer.write_cu8(&raw).unwrap();
            assert_eq!(count, 2);
            writer.flush().unwrap();
            assert_eq!(writer.bytes_written(), 16); // 4 floats * 4 bytes
        }

        let read_cf32 = std::fs::read(&cf32_path).unwrap();
        assert_eq!(read_cf32.len(), 16);
        let _ = std::fs::remove_file(cf32_path);
    }
}
