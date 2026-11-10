//! Zero-allocation proof harness using a counting allocator (`docs/SPEC.md` Invariant 1).

#![allow(clippy::unwrap_used, clippy::expect_used, unsafe_code)]

use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::Cell;

use aerofoil_common::cpr::{
    CPR_MODULUS, RawCpr, decode_airborne_cpr_local_raw, decode_airborne_cpr_raw, decode_cpr_global,
    decode_cpr_local,
};
use aerofoil_common::{Altitude, AltitudeKind, Heading, Latitude, Longitude, Position, Squawk};

struct CountingAllocator;

thread_local! {
    static ALLOC_COUNT: Cell<usize> = const { Cell::new(0) };
    static COUNTING_ACTIVE: Cell<bool> = const { Cell::new(false) };
}

unsafe impl GlobalAlloc for CountingAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let _ = COUNTING_ACTIVE.try_with(|active| {
            if active.get() {
                let _ = ALLOC_COUNT.try_with(|count| {
                    count.set(count.get() + 1);
                });
            }
        });
        unsafe { System.alloc(layout) }
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        unsafe { System.dealloc(ptr, layout) }
    }
}

#[global_allocator]
static ALLOCATOR: CountingAllocator = CountingAllocator;

/// Asserts that closure `f` executes with zero heap allocations on this thread.
fn assert_zero_alloc<R>(f: impl FnOnce() -> R) -> R {
    COUNTING_ACTIVE.with(|active| active.set(true));
    ALLOC_COUNT.with(|count| count.set(0));

    let res = core::hint::black_box(f());

    let count = ALLOC_COUNT.with(|count| count.get());
    COUNTING_ACTIVE.with(|active| active.set(false));

    assert_eq!(count, 0, "expected 0 heap allocations, observed {count}");
    res
}

#[test]
fn coordinates_and_units_allocate_zero() {
    assert_zero_alloc(|| {
        let lat = Latitude::from_microdegrees(49_824_097).unwrap();
        let lon = Longitude::from_microdegrees(6_067_850).unwrap();
        let pos = Position::new(lat, lon);

        assert_eq!(pos.lat().microdegrees(), 49_824_097);
        assert_eq!(pos.lon().microdegrees(), 6_067_850);
        let _ = pos.to_f64();

        let alt = Altitude::new(35_000, AltitudeKind::Barometric).unwrap();
        assert_eq!(alt.feet(), 35_000);

        let sq = Squawk::new(0o7700).unwrap();
        assert_eq!(sq.code(), 0o7700);

        let hdg = Heading::from_raw_128ths(12_800).unwrap();
        assert_eq!(hdg.whole_degrees(), 100);
    });
}

#[test]
fn global_cpr_decoding_allocates_zero() {
    let even = RawCpr::new(false, 39_848, 83_951, 1_000).unwrap();
    let odd = RawCpr::new(true, 21_567, 81_965, 2_000).unwrap();

    assert_zero_alloc(|| {
        for _ in 0..10_000 {
            let pos = decode_cpr_global(&even, &odd).unwrap();
            assert_eq!(pos.lat().microdegrees(), 49_817_551);
            assert_eq!(pos.lon().microdegrees(), 6_084_422);

            let pos_raw = decode_airborne_cpr_raw(39_848, 83_951, 21_567, 81_965, false).unwrap();
            assert_eq!(pos_raw, pos);
        }
    });
}

#[test]
fn local_cpr_decoding_allocates_zero() {
    let even = RawCpr::new(false, 39_848, 83_951, 1_000).unwrap();
    let odd = RawCpr::new(true, 21_567, 81_965, 2_000).unwrap();
    let ref_pos = Position::from_microdegrees(50_000_000, 6_000_000).unwrap();

    assert_zero_alloc(|| {
        for _ in 0..10_000 {
            let pos_even = decode_cpr_local(&even, ref_pos).unwrap();
            assert_eq!(pos_even.lat().microdegrees(), 49_824_097);
            assert_eq!(pos_even.lon().microdegrees(), 6_067_850);

            let pos_odd = decode_cpr_local(&odd, ref_pos).unwrap();
            assert_eq!(pos_odd.lat().microdegrees(), 49_817_551);
            assert_eq!(pos_odd.lon().microdegrees(), 6_084_422);

            let pos_raw = decode_airborne_cpr_local_raw(false, 39_848, 83_951, ref_pos).unwrap();
            assert_eq!(pos_raw, pos_even);
        }
    });
}

#[test]
fn display_formatting_to_stack_buffer_allocates_zero() {
    use core::fmt::Write;

    struct StackBuf<'a> {
        buf: &'a mut [u8],
        pos: usize,
    }

    impl Write for StackBuf<'_> {
        fn write_str(&mut self, s: &str) -> core::fmt::Result {
            let bytes = s.as_bytes();
            if self.pos + bytes.len() > self.buf.len() {
                return Err(core::fmt::Error);
            }
            self.buf[self.pos..self.pos + bytes.len()].copy_from_slice(bytes);
            self.pos += bytes.len();
            Ok(())
        }
    }

    let lat = Latitude::from_microdegrees(49_824_097).unwrap();
    let alt = Altitude::new(10_000, AltitudeKind::Barometric).unwrap();
    let sq = Squawk::new(0o1200).unwrap();
    let hdg = Heading::from_raw_128ths(12_800).unwrap();

    assert_zero_alloc(|| {
        let mut raw = [0u8; 128];
        let mut buf = StackBuf {
            buf: &mut raw,
            pos: 0,
        };
        write!(&mut buf, "{lat} {alt} {sq} {hdg}").unwrap();
        assert!(buf.pos > 0);
    });
}

#[test]
fn cpr_rejections_and_errors_allocate_zero() {
    let even = RawCpr::new(false, 39_848, 83_951, 1_000).unwrap();
    let expired_odd = RawCpr::new(true, 21_567, 81_965, 20_000).unwrap();
    let ref_pos = Position::from_microdegrees(50_000_000, 6_000_000).unwrap();

    assert_zero_alloc(|| {
        for _ in 0..1_000 {
            assert!(decode_cpr_global(&even, &expired_odd).is_err());
            assert!(decode_cpr_global(&even, &even).is_err());
            assert!(decode_airborne_cpr_raw(CPR_MODULUS, 0, 0, 0, true).is_err());
            assert!(decode_airborne_cpr_local_raw(false, CPR_MODULUS, 0, ref_pos).is_err());
        }
    });
}
