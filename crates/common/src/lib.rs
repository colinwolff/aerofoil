//! Core primitives shared by the `aerofoil` decoders.
//!
//! This crate owns the canonical value types (altitudes, squawk codes, headings, coordinates) and
//! the traits the protocol engines consume. It depends on nothing else in the workspace and is
//! `#![no_std]` by construction: no heap, no clock, no I/O on the decode path (`docs/SPEC.md` §1).
//!
//! Landed so far: the decoder error model ([`DecodeError`]), unit types ([`Altitude`], [`Squawk`],
//! [`Heading`]), fixed-point coordinates ([`Latitude`], [`Longitude`], [`Position`]), and CPR zone
//! math ([`cpr`]). Global and local CPR decoders arrive with `AF-9` and `AF-10`.
#![no_std]

mod coords;
pub mod cpr;
mod error;
mod units;

pub use coords::{Latitude, Longitude, Position};
pub use error::DecodeError;
pub use units::{Altitude, AltitudeKind, Heading, Squawk};
