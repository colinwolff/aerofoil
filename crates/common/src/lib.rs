//! Core primitives shared by the `aerofoil` decoders.
//!
//! This crate owns the canonical value types (altitudes, squawk codes, headings, coordinates),
//! target and telemetry domain models ([`model`]), and the traits the protocol engines consume.
//! It depends on nothing else in the workspace and is `no_std` by construction: no heap, no clock,
//! no I/O on the decode path (`docs/SPEC.md` §1).
//!
//! Landed so far: the decoder error model ([`DecodeError`]), unit types ([`Altitude`], [`Squawk`],
//! [`Heading`]), fixed-point coordinates ([`Latitude`], [`Longitude`], [`Position`]), global / local
//! CPR decoding ([`cpr`]), and target telemetry models ([`AircraftTarget`]).
#![cfg_attr(not(feature = "export-ts"), no_std)]

mod coords;
pub mod cpr;
mod error;
pub mod model;
mod units;

pub use coords::{Latitude, Longitude, Position};
pub use error::DecodeError;
pub use model::{
    AddressType, AircraftTarget, AirspaceEvent, ReceptionSource, TransponderSource, Velocity,
};
pub use units::{Altitude, AltitudeKind, Heading, Squawk};
