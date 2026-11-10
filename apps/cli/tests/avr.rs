//! Tests for Mode-S AVR hexadecimal stream decoding (`docs/SPEC.md` §5).

#![allow(clippy::unwrap_used, clippy::expect_used)]

use aerofoil_cli::AvrReader;
use std::io::Cursor;

#[test]
fn test_avr_long_frame_parsing() {
    let input = "*8D4840D6202CC371C32CE0576098;\n";
    let mut reader = AvrReader::new(Cursor::new(input));

    let msg = reader
        .next_message()
        .unwrap()
        .expect("expected AVR message");
    assert_eq!(msg.payload_len, 14);
    assert_eq!(
        msg.payload_slice(),
        &[
            0x8D, 0x48, 0x40, 0xD6, 0x20, 0x2C, 0xC3, 0x71, 0xC3, 0x2C, 0xE0, 0x57, 0x60, 0x98
        ]
    );

    assert!(reader.next_message().unwrap().is_none());
}

#[test]
fn test_avr_short_frame_parsing() {
    let input = "*5D4840D6F8740F;\r\n";
    let mut reader = AvrReader::new(Cursor::new(input));

    let msg = reader
        .next_message()
        .unwrap()
        .expect("expected AVR message");
    assert_eq!(msg.payload_len, 7);
    assert_eq!(
        msg.payload_slice(),
        &[0x5D, 0x48, 0x40, 0xD6, 0xF8, 0x74, 0x0F]
    );
}

#[test]
fn test_avr_skips_malformed_lines() {
    let input = "JUNK LINE\n\
                 *NOT_HEX;\n\
                 *123;\n\
                 *8D4840D6202CC371C32CE0576098;\n\
                 *TOOLONG8D4840D6202CC371C32CE05760981122;\n";

    let mut reader = AvrReader::new(Cursor::new(input));
    let msg = reader
        .next_message()
        .unwrap()
        .expect("expected valid message");
    assert_eq!(msg.payload_len, 14);
    assert_eq!(msg.payload_slice()[0], 0x8D);

    // No further valid messages
    assert!(reader.next_message().unwrap().is_none());
}
