//! 1090 MHz Mode S / Extended Squitter (DO-260B) demodulation, CRC-24 division,
//! error correction, and Downlink Format (DF0..DF24) parsing.
//!
//! Conforming to `docs/SPEC.md`:
//! - `#![no_std]` core with zero dynamic heap allocation on decode hot paths.
//! - Pure functions: fixed slices in, typed frames out, no hidden state, no I/O.
//! - Non-panicking typed error reporting via [`aerofoil_common::DecodeError`].
#![no_std]

pub mod crc;

pub use crc::{
    CRC24_POLYNOMIAL, CRC24_TABLE, crc24, extract_parity_long, extract_parity_short, syndrome,
    syndrome_long, syndrome_short,
};
