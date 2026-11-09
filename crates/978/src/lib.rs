//! DO-282B Universal Access Transceiver (978 MHz UAT) protocol engine.
//!
//! This crate implements zero-allocation decoding and forward error correction (FEC) for 978 MHz
//! UAT broadcasts according to RTCA DO-282B.
//!
//! Landed so far: $GF(2^8)$ Galois Field arithmetic over primitive polynomial `0x11D` ([`gf`]).
//! RS(48,34) Reed-Solomon decoding arrives with `AF-12`.
#![no_std]

pub mod gf;
