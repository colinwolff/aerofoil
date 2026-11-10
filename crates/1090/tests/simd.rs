#![allow(clippy::unwrap_used, clippy::expect_used, unsafe_code)]

use aerofoil_1090::{
    crc24, crc24_clmul, crc24_fast, has_clmul_support, syndrome_long, syndrome_long_fast,
    syndrome_short, syndrome_short_fast,
};

#[test]
fn test_has_clmul_support() {
    let supported = has_clmul_support();
    #[cfg(target_arch = "x86_64")]
    {
        // On modern x86_64 macOS CI and dev machines, PCLMULQDQ is universally supported
        println!("x86_64 hardware PCLMULQDQ supported: {supported}");
    }
}

#[cfg(target_arch = "x86_64")]
#[test]
fn test_clmul_hardware_matches_software() {
    use aerofoil_1090::crc::simd::{clmul_software, clmul_x86};

    if !has_clmul_support() {
        return;
    }

    let test_pairs: [(u64, u64); 8] = [
        (0, 0),
        (1, 1),
        (0xFFFFFFFF, 0x1FFF409),
        (0x180090b3e02, 0x1FFF409),
        (0xf52612, 0x123456789ABCDEF0),
        (0xAAAAAAAAAAAAAAAA, 0x5555555555555555),
        (0xFFFFFFFFFFFFFFFF, 0xFFFFFFFFFFFFFFFF),
        (0x8D4840D6202CC371, 0x1FFF409),
    ];

    for (a, b) in test_pairs {
        let sw = clmul_software(a, b);
        let hw = unsafe { clmul_x86(a, b) };
        assert_eq!(
            sw, hw,
            "CLMUL mismatch for ({a:#018x}, {b:#018x}): sw={sw:?}, hw={hw:?}"
        );
    }
}

#[test]
fn test_crc24_clmul_standard_vectors() {
    // Standard DO-260B DF17 11-byte ME payload
    let v11 = [
        0x8D, 0x48, 0x40, 0xD6, 0x20, 0x2C, 0xC3, 0x71, 0xC3, 0x2C, 0xE0,
    ];
    let expected = crc24(&v11);
    assert_eq!(expected, 0x57_6098);
    assert_eq!(crc24_clmul(&v11), expected);
    assert_eq!(crc24_fast(&v11), expected);

    // Standard DF11 4-byte payload
    let v4 = [0x5D, 0x48, 0x40, 0xD6];
    let expected_v4 = crc24(&v4);
    assert_eq!(expected_v4, 0xF8_740F);
    assert_eq!(crc24_clmul(&v4), expected_v4);
    assert_eq!(crc24_fast(&v4), expected_v4);
}

#[test]
fn test_crc24_clmul_exhaustive_patterns() {
    // Test 500 deterministic pseudo-random patterns for 11 bytes
    let mut state: u64 = 0x1234_5678_9ABC_DEF0;
    let mut lcg = || {
        state = state.wrapping_mul(6364136223846793005).wrapping_add(1);
        (state >> 32) as u32
    };

    for _ in 0..500 {
        let mut d11 = [0u8; 11];
        for b in &mut d11 {
            *b = (lcg() & 0xFF) as u8;
        }
        let exp = crc24(&d11);
        let act = crc24_clmul(&d11);
        assert_eq!(exp, act, "11-byte mismatch on {d11:?}");

        let mut d4 = [0u8; 4];
        for b in &mut d4 {
            *b = (lcg() & 0xFF) as u8;
        }
        let exp4 = crc24(&d4);
        let act4 = crc24_clmul(&d4);
        assert_eq!(exp4, act4, "4-byte mismatch on {d4:?}");
    }
}

#[test]
fn test_syndrome_fast_matches_syndrome_standard() {
    let raw14 = [
        0x8D, 0x48, 0x40, 0xD6, 0x20, 0x2C, 0xC3, 0x71, 0xC3, 0x2C, 0xE0, 0x57, 0x60, 0x98,
    ];
    assert_eq!(syndrome_long(&raw14), 0);
    assert_eq!(syndrome_long_fast(&raw14), 0);

    // Test with single-bit error
    let mut corrupted14 = raw14;
    corrupted14[5] ^= 0x08;
    assert_eq!(
        syndrome_long(&corrupted14),
        syndrome_long_fast(&corrupted14)
    );

    let raw7 = [0x5D, 0x48, 0x40, 0xD6, 0xF8, 0x74, 0x0F];
    assert_eq!(syndrome_short(&raw7), 0);
    assert_eq!(syndrome_short_fast(&raw7), 0);

    let mut corrupted7 = raw7;
    corrupted7[2] ^= 0x10;
    assert_eq!(
        syndrome_short(&corrupted7),
        syndrome_short_fast(&corrupted7)
    );
}
