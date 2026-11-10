use core::hint::black_box;
use criterion::{Criterion, criterion_group, criterion_main};

use aerofoil_978::{
    downlink::parse_state_vector,
    frame::{UatDownlinkFrame, deinterleave_downlink, interleave_downlink},
    rs::{RS_BLOCK_LEN, Rs48_34},
};

fn bench_rs48_34(c: &mut Criterion) {
    let mut group = c.benchmark_group("rs48_34");

    // Codeword from Appendix of DO-282B
    let mut clean_codeword = [0u8; RS_BLOCK_LEN];
    let payload = b"0d1abba154d8ec198ba602f08000000000";
    clean_codeword[..payload.len()].copy_from_slice(payload);
    let interleaved = interleave_downlink(&clean_codeword);

    group.bench_function("decode_clean", |b| {
        b.iter(|| {
            let mut buf = clean_codeword;
            Rs48_34::decode(black_box(&mut buf))
        })
    });

    let mut corrupted = clean_codeword;
    corrupted[5] ^= 0x55; // 1-symbol error
    corrupted[15] ^= 0xAA; // 2-symbol error
    corrupted[25] ^= 0x33; // 3-symbol error

    group.bench_function("decode_3_errors", |b| {
        b.iter(|| {
            let mut buf = corrupted;
            Rs48_34::decode(black_box(&mut buf))
        })
    });

    group.bench_function("deinterleave_downlink", |b| {
        b.iter(|| deinterleave_downlink(black_box(&interleaved)))
    });

    group.finish();
}

fn bench_uat_parsing(c: &mut Criterion) {
    let mut group = c.benchmark_group("uat_parsing");
    let sv_raw = [0x54, 0xD8, 0xEC, 0x19, 0x8B, 0xA6, 0x02, 0xF0, 0x80, 0x00, 0x00, 0x00];
    let mut payload = [0u8; 34];
    payload[0] = 0x08;
    payload[4..16].copy_from_slice(&sv_raw);

    group.bench_function("parse_state_vector", |b| {
        b.iter(|| parse_state_vector(black_box(&payload)))
    });

    let interleaved = interleave_downlink(&[0u8; 48]);
    group.bench_function("uat_downlink_decode_long", |b| {
        b.iter(|| UatDownlinkFrame::decode_long(black_box(&interleaved)))
    });

    group.finish();
}

criterion_group!(benches, bench_rs48_34, bench_uat_parsing);
criterion_main!(benches);
