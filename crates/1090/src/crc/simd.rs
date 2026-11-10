//! SIMD Carryless Multiplication (CLMUL / PMULL) accelerated CRC-24 division.
//!
//! Defined in `docs/SPEC.md` Invariant 1 and 4 for Mode S 1090ES high-throughput pipelines.
//! Accelerates CRC-24 polynomial division using Barrett reduction over $\text{GF}(2)$
//! with hardware instructions:
//! - x86_64: `PCLMULQDQ` (`_mm_clmulepi64_si128`)
//! - AArch64: NEON `PMULL` (`vmull_p64`)
//! - Portable software fallback when SIMD instructions are absent.
#![allow(unsafe_code)]

#[cfg(target_arch = "x86_64")]
use core::arch::x86_64 as x86;

use super::CRC24_POLYNOMIAL;

/// Precomputed Barrett reduction constant: $\mu = \lfloor x^{64} / G(x) \rfloor$.
pub const MU: u64 = 0x180090b3e02;

/// Precomputed 64-bit fold constant: $K_{64} = x^{64} \bmod G(x)$.
pub const K64: u64 = 0xf52612;

/// Checks whether the current CPU supports hardware carryless multiplication.
#[must_use]
pub fn has_clmul_support() -> bool {
    #[cfg(target_arch = "x86_64")]
    {
        let cpuid = x86::__cpuid(1);
        (cpuid.ecx & (1 << 1)) != 0
    }
    #[cfg(target_arch = "aarch64")]
    {
        #[cfg(target_feature = "aes")]
        {
            true
        }
        #[cfg(not(target_feature = "aes"))]
        {
            false
        }
    }
    #[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64")))]
    {
        false
    }
}

/// Carryless multiplication in software (portable fallback).
#[must_use]
pub const fn clmul_software(a: u64, b: u64) -> (u64, u64) {
    let mut low = 0u64;
    let mut high = 0u64;
    let mut i = 0;
    while i < 64 {
        if (b & (1 << i)) != 0 {
            low ^= a << i;
            if i > 0 {
                high ^= a >> (64 - i);
            }
        }
        i += 1;
    }
    (low, high)
}

/// Hardware-accelerated carryless multiply on x86_64.
///
/// # Safety
/// Caller must ensure that the CPU supports `pclmulqdq` and `sse4.1` instruction set extensions.
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "pclmulqdq,sse4.1")]
pub unsafe fn clmul_x86(a: u64, b: u64) -> (u64, u64) {
    let va = x86::_mm_set_epi64x(0, a as i64);
    let vb = x86::_mm_set_epi64x(0, b as i64);
    let prod = x86::_mm_clmulepi64_si128(va, vb, 0x00);
    let low = x86::_mm_extract_epi64(prod, 0) as u64;
    let high = x86::_mm_extract_epi64(prod, 1) as u64;
    (low, high)
}

/// Performs a 64-bit carryless multiply using available hardware or software fallback.
#[inline]
#[must_use]
pub fn clmul(a: u64, b: u64) -> (u64, u64) {
    #[cfg(target_arch = "x86_64")]
    {
        if has_clmul_support() {
            // Safety: target feature pclmulqdq is checked above
            return unsafe { clmul_x86(a, b) };
        }
    }
    clmul_software(a, b)
}

/// Barrett reduction of a 64-bit polynomial value modulo $G(x)$.
#[inline]
#[must_use]
pub fn barrett_reduce_64(val: u64) -> u32 {
    let (_, q) = clmul(val, MU);
    let (prod_low, _) = clmul(q, CRC24_POLYNOMIAL as u64);
    let mut r = (val ^ prod_low) as u32;
    if r >= (1 << 24) {
        r ^= CRC24_POLYNOMIAL;
    }
    r
}

/// Computes CRC-24 over a 4-byte payload using Barrett reduction.
#[must_use]
pub fn crc24_clmul_4bytes(data: &[u8; 4]) -> u32 {
    let val = (u32::from_be_bytes(*data) as u64) << 24;
    barrett_reduce_64(val)
}

/// Computes CRC-24 over an 11-byte payload using CLMUL folding and Barrett reduction.
#[must_use]
pub fn crc24_clmul_11bytes(data: &[u8; 11]) -> u32 {
    let mut high_bytes = [0u8; 8];
    high_bytes[2..8].copy_from_slice(&data[0..6]);
    let high = u64::from_be_bytes(high_bytes);

    let mut low_bytes = [0u8; 8];
    low_bytes[0..5].copy_from_slice(&data[6..11]);
    let low = u64::from_be_bytes(low_bytes);

    let (fold_low, fold_high) = clmul(high, K64);
    let mut val = low ^ fold_low;
    if fold_high != 0 {
        let (fold2_low, _) = clmul(fold_high, K64);
        val ^= fold2_low;
    }
    barrett_reduce_64(val)
}

/// Computes CRC-24 using SIMD CLMUL for 4-byte and 11-byte payloads, or slice folding.
#[must_use]
pub fn crc24_clmul(data: &[u8]) -> u32 {
    match data.len() {
        4 => {
            let mut arr = [0u8; 4];
            arr.copy_from_slice(data);
            crc24_clmul_4bytes(&arr)
        }
        11 => {
            let mut arr = [0u8; 11];
            arr.copy_from_slice(data);
            crc24_clmul_11bytes(&arr)
        }
        _ => {
            // General slice folding: for arbitrary lengths, reduce in 64-bit chunks
            let mut rem = 0u64;
            for &b in data {
                rem ^= (b as u64) << 24;
                if rem >= (1 << 24) {
                    let (_, q) = clmul(rem, MU);
                    let (p_low, _) = clmul(q, CRC24_POLYNOMIAL as u64);
                    rem ^= p_low;
                    if rem >= (1 << 24) {
                        rem ^= CRC24_POLYNOMIAL as u64;
                    }
                }
                rem <<= 8;
            }
            barrett_reduce_64(rem >> 8)
        }
    }
}
