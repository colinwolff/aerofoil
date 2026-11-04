//! Core primitives shared by the `aerofoil` decoders.
//!
//! This crate owns the canonical value types (coordinates, altitudes, squawk codes) and the traits
//! the protocol engines consume. It depends on nothing else in the workspace and is `#![no_std]` by
//! construction: no heap, no clock, no I/O on the decode path (`docs/SPEC.md` §1).
//!
//! The API arrives with the M1 tickets: `DecodeError` and the unit types (`AF-6`), fixed-point
//! coordinates (`AF-7`), then CPR (`AF-8`–`AF-10`). Nothing is stubbed here in advance — an empty
//! crate compiles and lints honestly, whereas a placeholder API would make the gates pass over
//! code that promises behaviour it does not implement.
#![no_std]
