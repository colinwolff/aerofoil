#![allow(clippy::unwrap_used, clippy::expect_used)]

use aerofoil_1090::{
    CRC24_POLYNOMIAL, CRC24_TABLE, crc24, extract_parity_long, extract_parity_short, syndrome,
    syndrome_long, syndrome_short,
};
use aerofoil_common::DecodeError;

/// Bit-by-bit reference implementation of Mode S CRC-24 division.
fn bit_by_bit_crc24(data: &[u8]) -> u32 {
    let mut rem = 0u32;
    for &byte in data {
        rem ^= (byte as u32) << 16;
        for _ in 0..8 {
            if (rem & 0x80_0000) != 0 {
                rem = ((rem << 1) ^ CRC24_POLYNOMIAL) & 0x00FF_FFFF;
            } else {
                rem = (rem << 1) & 0x00FF_FFFF;
            }
        }
    }
    rem
}

#[test]
fn lookup_table_matches_polynomial_division() {
    for (i, &table_entry) in CRC24_TABLE.iter().enumerate() {
        let expected = bit_by_bit_crc24(&[i as u8]);
        assert_eq!(
            table_entry, expected,
            "Table entry {i} mismatch: got {table_entry:06X}, expected {expected:06X}",
        );
    }
}

#[test]
fn arbitrary_data_table_matches_bit_by_bit() {
    let test_patterns: [&[u8]; 4] = [
        b"123456789",
        &[
            0x8D, 0x48, 0x40, 0xD6, 0x20, 0x2C, 0xC3, 0x71, 0xC3, 0x2C, 0xE0,
        ],
        &[0x5D, 0x48, 0x40, 0xD6],
        &[0x00, 0x00, 0x00, 0x00],
    ];

    for pattern in test_patterns {
        assert_eq!(crc24(pattern), bit_by_bit_crc24(pattern));
    }
}

#[test]
fn df17_standard_vectors_syndrome_zero() {
    // DO-260B / ICAO Annex 10 DF17 Airborne Position frame
    let v1 = [
        0x8D, 0x48, 0x40, 0xD6, 0x20, 0x2C, 0xC3, 0x71, 0xC3, 0x2C, 0xE0, 0x57, 0x60, 0x98,
    ];
    assert_eq!(extract_parity_long(&v1), 0x57_6098);
    assert_eq!(crc24(&v1[..11]), 0x57_6098);
    assert_eq!(syndrome_long(&v1), 0);
    assert_eq!(syndrome(&v1).unwrap(), 0);

    // DF17 Surface Position frame
    let v2 = [
        0x8D, 0x40, 0x62, 0x1D, 0x58, 0xC3, 0x82, 0xD6, 0x90, 0xC8, 0xAC, 0x28, 0x63, 0xA7,
    ];
    assert_eq!(extract_parity_long(&v2), 0x28_63A7);
    assert_eq!(crc24(&v2[..11]), 0x28_63A7);
    assert_eq!(syndrome_long(&v2), 0);
    assert_eq!(syndrome(&v2).unwrap(), 0);
}

#[test]
fn df11_standard_vector_syndrome_zero() {
    // DF11 All-call reply with zero interrogator ID
    let v3 = [0x5D, 0x48, 0x40, 0xD6, 0xF8, 0x74, 0x0F];
    assert_eq!(extract_parity_short(&v3), 0xF8_740F);
    assert_eq!(crc24(&v3[..4]), 0xF8_740F);
    assert_eq!(syndrome_short(&v3), 0);
    assert_eq!(syndrome(&v3).unwrap(), 0);
}

#[test]
fn df0_address_parity_recovery() {
    // DF0 with Address/Parity: payload 0x02800000, ICAO 0x4840D6
    let v4 = [0x02, 0x80, 0x00, 0x00, 0xF5, 0xBE, 0xDD];
    let recovered_icao = syndrome_short(&v4);
    assert_eq!(recovered_icao, 0x48_40D6);
    assert_eq!(syndrome(&v4).unwrap(), 0x48_40D6);
}

#[test]
fn error_detection_on_bit_flip() {
    let mut v = [
        0x8D, 0x48, 0x40, 0xD6, 0x20, 0x2C, 0xC3, 0x71, 0xC3, 0x2C, 0xE0, 0x57, 0x60, 0x98,
    ];
    assert_eq!(syndrome_long(&v), 0);

    // Flip single bit
    v[0] ^= 0x01;
    assert_ne!(syndrome_long(&v), 0);
}

#[test]
fn frame_length_validation() {
    let short_frame = [0u8; 7];
    let long_frame = [0u8; 14];
    assert!(syndrome(&short_frame).is_ok());
    assert!(syndrome(&long_frame).is_ok());

    // Truncated frames
    assert_eq!(
        syndrome(&[0u8; 5]),
        Err(DecodeError::Truncated {
            expected: 7,
            actual: 5
        })
    );

    // Invalid length (between 7 and 14)
    assert_eq!(
        syndrome(&[0u8; 10]),
        Err(DecodeError::InvalidField {
            field: "frame_length",
            value: 10
        })
    );
}
