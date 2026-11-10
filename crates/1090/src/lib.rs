//! 1090 MHz Mode S / Extended Squitter (DO-260B) demodulation, CRC-24 division,
//! error correction, and Downlink Format (DF0..DF24) parsing.
//!
//! Conforming to `docs/SPEC.md`:
//! - `#![no_std]` core with zero dynamic heap allocation on decode hot paths.
//! - Pure functions: fixed slices in, typed frames out, no hidden state, no I/O.
//! - Non-panicking typed error reporting via [`aerofoil_common::DecodeError`].
#![no_std]

pub mod crc;
pub mod df;
pub mod fec;

pub use crc::{
    CRC24_POLYNOMIAL, CRC24_TABLE, crc24, extract_parity_long, extract_parity_short, syndrome,
    syndrome_long, syndrome_short,
};
pub use df::{
    AirbornePosition, AirborneVelocity, AircraftIdentification, Df0ShortAirAir, Df4AltReply,
    Df5IdentityReply, Df11AllCallReply, Df20CommBAlt, Df21CommBId, EsPayload, ExtendedSquitter,
    FlightStatus, ModeSFrame, SurfacePosition, SurveillanceStatus, TransponderCapability,
    VelocityPayload, VerticalRateSource, parse_frame, parse_frame_filtered, parse_frame_long,
    parse_frame_short,
};
pub use fec::{
    FecResult, SYNDROMES_56, SYNDROMES_112, correct_frame_long, correct_frame_short,
    find_single_bit_error_long, find_single_bit_error_short,
};
