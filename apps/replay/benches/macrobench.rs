//! End-to-end dataset throughput macrobenchmarks and zero-allocation assertions (`docs/SPEC.md` Invariant 1).

#![allow(clippy::unwrap_used, clippy::expect_used, unsafe_code)]

use core::hint::black_box;
use std::{
    alloc::{GlobalAlloc, Layout, System},
    cell::Cell,
    fs::File,
    io::BufReader,
};

use aerofoil_1090::parse_frame_long;
use aerofoil_978::frame::UatDownlinkFrame;
use aerofoil_replay::{InputFormat, PacingSpeed, ReplayEngine, ReplaySink, StreamPacer, load_frames};
use criterion::{BenchmarkId, Criterion, criterion_group, criterion_main};

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

fn assert_zero_alloc<R>(f: impl FnOnce() -> R) -> R {
    COUNTING_ACTIVE.with(|active| active.set(true));
    ALLOC_COUNT.with(|count| count.set(0));

    let res = black_box(f());

    let count = ALLOC_COUNT.with(|count| count.get());
    COUNTING_ACTIVE.with(|active| active.set(false));

    assert_eq!(count, 0, "expected 0 heap allocations, detected {count}");
    res
}

#[derive(Debug, Default)]
struct NullSink {
    emitted_bytes: usize,
}

impl ReplaySink for NullSink {
    fn emit(&mut self, bytes: &[u8]) -> std::io::Result<()> {
        self.emitted_bytes += bytes.len();
        Ok(())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

fn bench_e2e_macrobenchmarks(c: &mut Criterion) {
    let mut group = c.benchmark_group("e2e_macrobench");

    let f_dense = File::open("datasets/fixtures/1090_dense.beast")
        .or_else(|_| File::open("../../datasets/fixtures/1090_dense.beast"))
        .expect("1090_dense.beast must exist");
    let dense_frames = load_frames(BufReader::new(f_dense), InputFormat::Beast).unwrap();

    // 1. Zero-allocation assertion across all frames in dataset
    let df17_payloads: Vec<[u8; 14]> = dense_frames
        .iter()
        .filter_map(|f| {
            if f.raw_bytes.len() >= 23 && f.raw_bytes[1] == 0x33 {
                let mut arr = [0u8; 14];
                arr.copy_from_slice(&f.raw_bytes[f.raw_bytes.len() - 14..]);
                Some(arr)
            } else {
                None
            }
        })
        .collect();

    assert!(!df17_payloads.is_empty(), "expected parsed DF17 frames");

    assert_zero_alloc(|| {
        for frame in &df17_payloads {
            let _ = black_box(parse_frame_long(frame));
        }
    });

    // 2. Burst mode throughput benchmark
    group.bench_function(BenchmarkId::new("burst_dense_replay", dense_frames.len()), |b| {
        b.iter(|| {
            let sink = Box::new(NullSink::default());
            let pacer = StreamPacer::new(PacingSpeed::Burst);
            let mut engine = ReplayEngine::new(dense_frames.clone(), pacer, sink, false);
            engine.run().unwrap()
        });
    });

    // 3. Multi-band UAT zero allocation
    let f_dual = File::open("datasets/fixtures/dual_band_hub.beast")
        .or_else(|_| File::open("../../datasets/fixtures/dual_band_hub.beast"))
        .expect("dual_band_hub.beast must exist");
    let dual_frames = load_frames(BufReader::new(f_dual), InputFormat::Beast).unwrap();

    let uat_payloads: Vec<[u8; 48]> = dual_frames
        .iter()
        .filter_map(|f| {
            if f.raw_bytes.len() >= 57 && f.raw_bytes[1] == 0x34 {
                let mut arr = [0u8; 48];
                arr.copy_from_slice(&f.raw_bytes[f.raw_bytes.len() - 48..]);
                Some(arr)
            } else {
                None
            }
        })
        .collect();

    if !uat_payloads.is_empty() {
        assert_zero_alloc(|| {
            for frame in &uat_payloads {
                let _ = black_box(UatDownlinkFrame::decode_long(frame));
            }
        });
    }

    group.finish();
}

criterion_group!(benches, bench_e2e_macrobenchmarks);
criterion_main!(benches);
