//! Core primitives shared by the `aerofoil` decoders.
//!
//! This crate owns the canonical value types (altitudes, squawk codes, headings, coordinates) and
//! the traits the protocol engines consume. It depends on nothing else in the workspace and is
//! `#![no_std]` by construction: no heap, no clock, no I/O on the decode path (`docs/SPEC.md` §1).
//!
//! Landed so far: the decoder error model ([`DecodeError`]) and the unit types ([`Altitude`],
//! [`Squawk`], [`Heading`]). Fixed-point coordinates arrive with `AF-7`, CPR with `AF-8`–`AF-10`.
#![no_std]

mod error;
mod units;

pub use error::DecodeError;
pub use units::{Altitude, AltitudeKind, Heading, Squawk};
