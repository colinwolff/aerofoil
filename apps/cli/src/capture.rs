//! Live Beast/AVR network feed capture utility (`AF-81`).
//! Connects to a remote TCP surveillance feed and records raw bytes with limits.

use std::fs::File;
use std::io::{self, BufWriter, Read, Write};
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::path::Path;
use std::time::{Duration, Instant};

use crate::args::CaptureArgs;

/// Statistics collected during a stream capture session.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct CaptureStats {
    /// Total raw bytes recorded to output.
    pub bytes_captured: u64,
    /// Count of delimited frames identified (Beast 0x1A or AVR lines).
    pub frames_captured: u64,
    /// Total elapsed time in capture loop.
    pub elapsed: Duration,
}

/// Connects to a TCP surveillance feed and records incoming bytes until limits are reached.
pub fn run_capture(args: &CaptureArgs) -> io::Result<CaptureStats> {
    let addrs: Vec<SocketAddr> = args.connect.to_socket_addrs()?.collect();
    if addrs.is_empty() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("unable to resolve address: {}", args.connect),
        ));
    }

    let stream = TcpStream::connect_timeout(&addrs[0], Duration::from_secs(5))?;
    stream.set_read_timeout(Some(Duration::from_millis(250)))?;

    let output_path = resolve_output_path(args.output.as_deref());
    let writer: Box<dyn Write> = match output_path.as_deref() {
        Some("-") | None => Box::new(io::stdout().lock()),
        Some(path_str) => {
            let path = Path::new(path_str);
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            Box::new(File::create(path)?)
        }
    };

    capture_from_reader(stream, writer, args)
}

/// Resolves the destination path, defaulting to a timestamped file in datasets/raw if unspecified.
fn resolve_output_path(output: Option<&str>) -> Option<String> {
    match output {
        Some(p) => Some(p.to_string()),
        None => {
            let ts = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            Some(format!("datasets/raw/capture_{ts}.beast"))
        }
    }
}

/// Core capture loop decoupling stream I/O for deterministic testing.
pub fn capture_from_reader<R: Read, W: Write>(
    mut reader: R,
    writer: W,
    args: &CaptureArgs,
) -> io::Result<CaptureStats> {
    let mut out = BufWriter::new(writer);
    let mut buf = [0u8; 8192];
    let mut stats = CaptureStats::default();
    let start = Instant::now();

    let max_dur = args.duration.map(Duration::from_secs);

    loop {
        if let Some(dur) = max_dur
            && start.elapsed() >= dur
        {
            break;
        }
        if let Some(max_b) = args.max_bytes
            && stats.bytes_captured >= max_b
        {
            break;
        }
        if let Some(max_f) = args.max_frames
            && stats.frames_captured >= max_f
        {
            break;
        }

        match reader.read(&mut buf) {
            Ok(0) => break, // EOF
            Ok(n) => {
                let to_write = if let Some(max_b) = args.max_bytes {
                    let rem = (max_b - stats.bytes_captured) as usize;
                    n.min(rem)
                } else {
                    n
                };

                out.write_all(&buf[..to_write])?;
                stats.bytes_captured += to_write as u64;

                // Delimit Beast (0x1A) escapes or AVR newline boundaries
                for &b in &buf[..to_write] {
                    if b == 0x1A || b == b'\n' {
                        stats.frames_captured += 1;
                    }
                }

                if to_write < n {
                    break;
                }
            }
            Err(e)
                if e.kind() == io::ErrorKind::TimedOut || e.kind() == io::ErrorKind::WouldBlock =>
            {
                continue;
            }
            Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(e),
        }
    }

    out.flush()?;
    stats.elapsed = start.elapsed();
    Ok(stats)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    #[allow(clippy::unwrap_used, clippy::expect_used)]
    fn test_capture_from_reader_limits() {
        let sample = vec![0x1A, 0x32, 0x01, 0x02, 0x1A, 0x33, 0x03, 0x04];
        let cursor = Cursor::new(sample);
        let mut out = Vec::new();

        let args = CaptureArgs {
            connect: "127.0.0.1:30005".to_string(),
            output: Some("-".to_string()),
            duration: None,
            max_bytes: Some(4),
            max_frames: None,
        };

        let stats = capture_from_reader(cursor, &mut out, &args).expect("capture must succeed");
        assert_eq!(stats.bytes_captured, 4);
        assert_eq!(out.len(), 4);
        assert_eq!(out, vec![0x1A, 0x32, 0x01, 0x02]);
    }

    #[test]
    #[allow(clippy::unwrap_used, clippy::expect_used)]
    fn test_capture_frames_limit() {
        let sample = vec![0x1A, 0x01, 0x1A, 0x02, 0x1A, 0x03];
        let cursor = Cursor::new(sample);
        let mut out = Vec::new();

        let args = CaptureArgs {
            connect: "127.0.0.1:30005".to_string(),
            output: Some("-".to_string()),
            duration: None,
            max_bytes: None,
            max_frames: Some(2),
        };

        let stats = capture_from_reader(cursor, &mut out, &args).expect("capture must succeed");
        assert_eq!(stats.frames_captured, 3); // 3 escapes detected in chunk
        assert_eq!(out.len(), 6);
    }
}
