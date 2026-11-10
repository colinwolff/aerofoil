//! Concurrent multi-threaded test proving thread-safety and absence of deadlocks (`ADR-0005`).

#![allow(clippy::unwrap_used, clippy::expect_used)]

use aerofoil_common::{
    AddressFilter, AddressType, AircraftTarget, ReceptionSource, TransponderSource,
};
use aerofoil_tracker::Tracker;
use std::sync::Arc;
use std::thread;

#[test]
fn test_concurrent_readers_and_writers() {
    let tracker = Arc::new(Tracker::new());
    let mut handles = Vec::new();

    // 4 writer threads, each writing targets for a partition of addresses
    for thread_id in 0..4 {
        let tr = Arc::clone(&tracker);
        handles.push(thread::spawn(move || {
            for i in 0..250 {
                let addr = (thread_id * 1000) + i;
                let target = AircraftTarget::new(
                    AddressType::Icao,
                    addr,
                    TransponderSource::ModeS1090,
                    ReceptionSource::Direct,
                    1_000_000 + i as u64,
                );
                tr.insert(target);
            }
        }));
    }

    // 4 reader threads querying address filter concurrently
    for _ in 0..4 {
        let tr = Arc::clone(&tracker);
        handles.push(thread::spawn(move || {
            let mut verified_count = 0;
            for _ in 0..500 {
                for addr in (0..4000).step_by(17) {
                    if AddressFilter::contains(&*tr, addr) {
                        verified_count += 1;
                    }
                }
            }
            let _ = verified_count;
        }));
    }

    for handle in handles {
        handle.join().unwrap();
    }

    // After all writers finish, exactly 1000 targets must exist in tracker
    assert_eq!(tracker.len(), 1000);

    // Verify all 1000 targets exist
    for thread_id in 0..4 {
        for i in 0..250 {
            let addr = (thread_id * 1000) + i;
            assert!(AddressFilter::contains(&*tracker, addr));
        }
    }
}
