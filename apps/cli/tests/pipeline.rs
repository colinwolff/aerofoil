//! Tests for stream pipeline and format detection (`docs/SPEC.md` §5).

#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::io::{self, BufReader, Cursor};

use aerofoil_cli::{CliArgs, InputFormat, OutputFormat, detect_format, process_frame};
use aerofoil_tracker::Tracker;

#[test]
fn test_detect_format_beast_and_avr() {
    let beast_bytes = [0x1A, 0x33, 0x01, 0x02];
    let mut reader = BufReader::new(Cursor::new(&beast_bytes));
    assert_eq!(detect_format(&mut reader).unwrap(), InputFormat::Beast);

    let avr_bytes = b"*8D4840D6202CC371C32CE0576098;\n";
    let mut reader2 = BufReader::new(Cursor::new(avr_bytes));
    assert_eq!(detect_format(&mut reader2).unwrap(), InputFormat::Avr);
}

#[test]
fn test_process_frame_emits_json_line() {
    let tracker = Tracker::new();
    let args = CliArgs {
        format: InputFormat::Auto,
        output: OutputFormat::Json,
        filter_altitude: None,
        filter_squawk: None,
    };

    // Valid DF17 Airborne Position frame
    let frame = [
        0x8D, 0x40, 0x62, 0x1D, 0x58, 0xC3, 0x82, 0xD6, 0x90, 0xC8, 0xAC, 0x28, 0x63, 0xA7,
    ];

    let mut out = Vec::new();
    process_frame(&frame, &tracker, &args, &mut out).unwrap();

    let output_str = String::from_utf8(out).unwrap();
    assert!(output_str.contains(r#""schema":"aerofoil.target""#));
    assert!(output_str.contains(r#""address":"40621D""#));
    assert!(output_str.contains(r#""altitude":38000"#));
}

/// A writer that simulates downstream SIGPIPE / broken pipe.
struct BrokenPipeWriter;

impl io::Write for BrokenPipeWriter {
    fn write(&mut self, _buf: &[u8]) -> io::Result<usize> {
        Err(io::Error::new(
            io::ErrorKind::BrokenPipe,
            "simulated downstream SIGPIPE",
        ))
    }

    fn flush(&mut self) -> io::Result<()> {
        Err(io::Error::new(
            io::ErrorKind::BrokenPipe,
            "simulated downstream SIGPIPE",
        ))
    }
}

#[test]
fn test_broken_pipe_is_propagated_as_io_error() {
    let tracker = Tracker::new();
    let args = CliArgs {
        format: InputFormat::Auto,
        output: OutputFormat::Json,
        filter_altitude: None,
        filter_squawk: None,
    };

    let frame = [
        0x8D, 0x40, 0x62, 0x1D, 0x58, 0xC3, 0x82, 0xD6, 0x90, 0xC8, 0xAC, 0x28, 0x63, 0xA7,
    ];

    let mut out = BrokenPipeWriter;
    let res = process_frame(&frame, &tracker, &args, &mut out);
    assert!(res.is_err());
    assert_eq!(res.unwrap_err().kind(), io::ErrorKind::BrokenPipe);
}
