//! Zero-allocation proof harness for [`Tracker`] read and filter hot paths (`docs/SPEC.md` §1).

#![allow(clippy::unwrap_used, clippy::expect_used, unsafe_code)]

use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::Cell;

use aerofoil_common::{
    AddressFilter, AddressType, AircraftTarget, ReceptionSource, TransponderSource,
};
use aerofoil_tracker::Tracker;

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
fn address_filter_and_get_allocate_zero() {
    let tracker = Tracker::new();

    // Populate several tracks across different shards
    for i in 0..100 {
        let target = AircraftTarget::new(
            AddressType::Icao,
            0x484000 + i,
            TransponderSource::ModeS1090,
            ReceptionSource::Direct,
            1_000_000,
        );
        tracker.insert(target);
    }

    // Proves AddressFilter::contains executes with exactly 0 heap allocations
    for i in 0..100 {
        let found = assert_zero_alloc(|| AddressFilter::contains(&tracker, 0x484000 + i));
        assert!(found);
    }

    // Proves non-existent address query executes with exactly 0 heap allocations
    for i in 0..100 {
        let found = assert_zero_alloc(|| AddressFilter::contains(&tracker, 0x100000 + i));
        assert!(!found);
    }

    // Proves tracker.get executes with exactly 0 heap allocations
    for i in 0..100 {
        let target = assert_zero_alloc(|| tracker.get(AddressType::Icao, 0x484000 + i));
        assert!(target.is_some());
    }
}
