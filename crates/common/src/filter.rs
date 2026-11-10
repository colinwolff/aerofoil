//! Address filtering for bounded error correction (`docs/SPEC.md` Invariant 5).
//!
//! Defined in `ADR-0004`: inject an `AddressFilter` trait rather than coupling
//! protocol decoders upward into tracker state.

/// Trait for querying whether an ICAO 24-bit address is verified and active.
pub trait AddressFilter {
    /// Returns `true` if the given 24-bit ICAO address is verified/active in tracking state.
    fn contains(&self, address: u32) -> bool;
}

/// A filter that rejects all addresses, disabling error correction.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct DenyAll;

impl AddressFilter for DenyAll {
    #[inline]
    fn contains(&self, _address: u32) -> bool {
        false
    }
}

impl AddressFilter for () {
    #[inline]
    fn contains(&self, _address: u32) -> bool {
        false
    }
}

impl<F> AddressFilter for F
where
    F: Fn(u32) -> bool,
{
    #[inline]
    fn contains(&self, address: u32) -> bool {
        (self)(address)
    }
}

impl AddressFilter for &dyn AddressFilter {
    #[inline]
    fn contains(&self, address: u32) -> bool {
        (**self).contains(address)
    }
}
