//! DO-282B Universal Access Transceiver (978 MHz UAT) protocol engine.
//!
//! This crate implements zero-allocation decoding and forward error correction (FEC) for 978 MHz
//! UAT broadcasts according to RTCA DO-282B.
//!
//! Landed so far: $GF(2^8)$ Galois Field arithmetic over primitive polynomial `0x11D` ([`gf`]),
//! $RS(48,34)$ Reed-Solomon forward error correction ([`rs`]), framing/de-interleaving ([`frame`]),
//! and State Vector / Mode Status bitfield parsing ([`downlink`]).
#![no_std]

pub mod downlink;
pub mod frame;
pub mod gf;
pub mod rs;

pub use downlink::{
    AirgroundState, ModeStatus, StateVector, parse_mode_status, parse_state_vector,
};
pub use frame::{
    UatDownlinkFrame, UatFrameKind, deinterleave_downlink, deinterleave_uplink,
    interleave_downlink, interleave_uplink,
};
pub use rs::{
    RS_BLOCK_LEN, RS_DATA_LEN, RS_FCR, RS_MAX_CORRECTABLE, RS_PARITY_LEN, Rs48_34, decode_rs_48_34,
};
