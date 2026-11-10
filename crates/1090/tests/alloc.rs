//! Zero-allocation proof harness for `aerofoil-1090` (`docs/SPEC.md` Invariant 1).

#![allow(clippy::unwrap_used, clippy::expect_used, unsafe_code)]

use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::Cell;

use aerofoil_1090::{
    correct_frame_long, correct_frame_short, crc24, crc24_clmul, crc24_fast, parse_frame,
    parse_frame_filtered, parse_frame_long, parse_frame_short, syndrome_long, syndrome_long_fast,
    syndrome_short, syndrome_short_fast,
};

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
fn crc24_and_syndrome_allocate_zero() {
    let raw14 = [
        0x8D, 0x48, 0x40, 0xD6, 0x20, 0x2C, 0xC3, 0x71, 0xC3, 0x2C, 0xE0, 0x57, 0x60, 0x98,
    ];
    let raw7 = [0x5D, 0x48, 0x40, 0xD6, 0xF8, 0x74, 0x0F];

    assert_zero_alloc(|| {
        let _ = crc24(&raw14[..11]);
        let _ = crc24_clmul(&raw14[..11]);
        let _ = crc24_fast(&raw14[..11]);

        let _ = crc24(&raw7[..4]);
        let _ = crc24_clmul(&raw7[..4]);
        let _ = crc24_fast(&raw7[..4]);

        let _ = syndrome_long(&raw14);
        let _ = syndrome_long_fast(&raw14);
        let _ = syndrome_short(&raw7);
        let _ = syndrome_short_fast(&raw7);
    });
}

#[test]
fn df_parsing_allocates_zero() {
    let df17_ident = [
        0x8d, 0x48, 0x40, 0xd6, 0x20, 0x2c, 0xc3, 0x71, 0xc3, 0x2c, 0xe0, 0x57, 0x60, 0x98,
    ];
    let df17_pos = [
        0x8d, 0x40, 0x62, 0x1d, 0x58, 0xc3, 0x82, 0xd6, 0x90, 0xc8, 0xac, 0x28, 0x63, 0xa7,
    ];
    let df17_vel = [
        0x8d, 0xa0, 0x5f, 0x21, 0x99, 0x00, 0x02, 0x8a, 0x38, 0x08, 0x20, 0xf5, 0x3a, 0x6a,
    ];
    let df11 = [0x5d, 0x48, 0x40, 0xd6, 0xf8, 0x74, 0x0f];
    let df0 = [0x02, 0x80, 0x00, 0x00, 0xf5, 0xbe, 0xdd];

    assert_zero_alloc(|| {
        let _ = parse_frame(&df17_ident).unwrap();
        let _ = parse_frame_long(&df17_pos).unwrap();
        let _ = parse_frame_long(&df17_vel).unwrap();
        let _ = parse_frame_short(&df11).unwrap();
        let _ = parse_frame_short(&df0).unwrap();
    });
}

#[test]
fn fec_and_filtering_allocate_zero() {
    let mut df17 = [
        0x8d, 0x48, 0x40, 0xd6, 0x20, 0x2c, 0xc3, 0x71, 0xc3, 0x2c, 0xe0, 0x57, 0x60, 0x98,
    ];
    df17[4] ^= 0x10; // Corrupt 1 bit
    let filter = |addr| addr == 0x4840D6;

    assert_zero_alloc(|| {
        let _ = correct_frame_long(&mut df17, &filter).unwrap();
    });

    let mut df11 = [0x5d, 0x48, 0x40, 0xd6, 0xf8, 0x74, 0x0f];
    df11[2] ^= 0x04; // Corrupt 1 bit

    assert_zero_alloc(|| {
        let _ = correct_frame_short(&mut df11, &filter).unwrap();
        let _ = parse_frame_filtered(&df17, &filter).unwrap();
    });
}
