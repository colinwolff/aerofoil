//! Tests for Mode-S Beast binary stream decoding (`docs/SPEC.md` §5).

#![allow(clippy::unwrap_used, clippy::expect_used)]

use aerofoil_cli::BeastReader;
use std::io::Cursor;

#[test]
fn test_beast_long_frame_parsing() {
    // 0x1A + '3' (long frame) + 6-byte MLAT (0x01..=0x06) + signal (0x50) + 14-byte payload
    let mut stream = vec![0x1A, 0x33, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x50];
    let payload = [
        0x8D, 0x48, 0x40, 0xD6, 0x20, 0x2C, 0xC3, 0x71, 0xC3, 0x2C, 0xE0, 0x57, 0x60, 0x98,
    ];
    stream.extend_from_slice(&payload);

    let mut reader = BeastReader::new(Cursor::new(stream));
    let msg = reader
        .next_message()
        .unwrap()
        .expect("expected Beast message");

    assert_eq!(msg.message_type, 0x33);
    assert_eq!(msg.mlat_timestamp, [0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);
    assert_eq!(msg.signal_level, 0x50);
    assert_eq!(msg.payload_len, 14);
    assert_eq!(msg.payload_slice(), &payload);

    // Subsequent read should hit EOF
    assert!(reader.next_message().unwrap().is_none());
}

#[test]
fn test_beast_escape_sequence_unescaping() {
    // Stream with an escaped 0x1A inside the payload: 0x1A 0x1A -> single 0x1A
    let mut stream = vec![0x1A, 0x32, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF];
    // Short frame (7 bytes): 0x5D, 0x1A (escaped as 0x1A, 0x1A), 0x48, 0x40, 0xD6, 0xF8, 0x74
    stream.extend_from_slice(&[0x5D, 0x1A, 0x1A, 0x48, 0x40, 0xD6, 0xF8, 0x74]);

    let mut reader = BeastReader::new(Cursor::new(stream));
    let msg = reader
        .next_message()
        .unwrap()
        .expect("expected Beast message");

    assert_eq!(msg.message_type, 0x32);
    assert_eq!(msg.payload_len, 7);
    assert_eq!(
        msg.payload_slice(),
        &[0x5D, 0x1A, 0x48, 0x40, 0xD6, 0xF8, 0x74]
    );
}

#[test]
fn test_beast_resync_after_junk() {
    let mut stream = vec![0xFF, 0x00, 0xAA, 0xBB]; // Leading garbage
    // Valid frame follows
    stream.extend_from_slice(&[0x1A, 0x31, 0, 0, 0, 0, 0, 0, 0x40, 0x12, 0x34]);

    let mut reader = BeastReader::new(Cursor::new(stream));
    let msg = reader
        .next_message()
        .unwrap()
        .expect("expected message after resync");

    assert_eq!(msg.message_type, 0x31);
    assert_eq!(msg.payload_len, 2);
    assert_eq!(msg.payload_slice(), &[0x12, 0x34]);
}
