use core::hint::black_box;
use criterion::{BenchmarkId, Criterion, criterion_group, criterion_main};

use aerofoil_1090::{correct_frame_long, crc24, crc24_clmul, parse_frame, parse_frame_filtered};

fn bench_crc24(c: &mut Criterion) {
    let mut group = c.benchmark_group("crc24");
    let payload_11 = [
        0x8D, 0x48, 0x40, 0xD6, 0x20, 0x2C, 0xC3, 0x71, 0xC3, 0x2C, 0xE0,
    ];

    group.bench_function(BenchmarkId::new("table", 11), |b| {
        b.iter(|| crc24(black_box(&payload_11)))
    });

    group.bench_function(BenchmarkId::new("clmul", 11), |b| {
        b.iter(|| crc24_clmul(black_box(&payload_11)))
    });

    group.finish();
}

fn bench_df_parsing(c: &mut Criterion) {
    let mut group = c.benchmark_group("df_parsing");
    let df17_raw = [
        0x8D, 0x40, 0x62, 0x1D, 0x58, 0xC3, 0x82, 0xD6, 0x90, 0xC8, 0xAC, 0x28, 0x63, 0xA7,
    ];

    group.bench_function("df17_position", |b| {
        b.iter(|| parse_frame(black_box(&df17_raw)))
    });

    let filter = |addr| addr == 0x40621D;
    group.bench_function("df17_filtered_clean", |b| {
        b.iter(|| parse_frame_filtered(black_box(&df17_raw), &filter))
    });

    let mut corrupted = df17_raw;
    corrupted[5] ^= 0x08; // Single-bit error
    group.bench_function("df17_filtered_corrected", |b| {
        b.iter(|| {
            let mut buf = corrupted;
            correct_frame_long(&mut buf, &filter)
        })
    });

    group.finish();
}

criterion_group!(benches, bench_crc24, bench_df_parsing);
criterion_main!(benches);
