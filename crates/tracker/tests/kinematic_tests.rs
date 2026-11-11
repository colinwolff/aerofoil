//! Long-run flight kinematic trajectory and continuous tracking integration test suite (`docs/SPEC.md` §4).

#![allow(clippy::unwrap_used, clippy::expect_used)]

mod kinematic;

use aerofoil_common::{
    AddressType, AirspaceEvent, Altitude, AltitudeKind, Heading, ReceptionSource, Squawk,
    TransponderSource,
    cpr::{RawCpr, decode_cpr_global},
};
use aerofoil_tracker::{TargetUpdate, Tracker};
use kinematic::sim::{SimState, encode_cpr, generate_55_sim_profiles};

#[test]
fn test_multi_minute_50_plus_aircraft_kinematic_continuity() {
    let tracker = Tracker::new();
    let mut fleet: Vec<SimState> = generate_55_sim_profiles()
        .into_iter()
        .map(SimState::new)
        .collect();
    assert!(fleet.len() >= 50);

    // Initial acquisition: emit callsign and squawk
    for ac in &fleet {
        let mut cs = [b' '; 8];
        cs[..ac.profile.callsign.len().min(8)].copy_from_slice(ac.profile.callsign.as_bytes());
        let update = TargetUpdate::new(
            AddressType::Icao,
            ac.profile.icao,
            TransponderSource::ModeS1090,
            ReceptionSource::Direct,
            1000,
        )
        .with_callsign(cs)
        .with_squawk(Squawk::new(ac.profile.squawk).expect("valid squawk"));
        let event = tracker.update(&update).expect("initial target acquisition");
        assert!(matches!(event, AirspaceEvent::TargetAcquired(_)));
    }
    assert_eq!(tracker.len(), fleet.len());

    // Run 120-second continuous simulation
    for sec in 0..120 {
        let t_ms = 1000 + (sec as u64) * 1000;
        let is_odd = (sec % 2) == 1;

        for ac in &mut fleet {
            ac.step(1.0, sec as f64);

            // 1. CPR encode & decode validation
            let (lat_cpr, lon_cpr) = encode_cpr(ac.lat, ac.lon, is_odd);
            let raw = RawCpr::new(is_odd, lat_cpr, lon_cpr, t_ms).expect("valid raw cpr");
            if is_odd {
                ac.cpr_pair.1 = Some(raw);
            } else {
                ac.cpr_pair.0 = Some(raw);
            }

            let decoded_pos = if let (Some(even), Some(odd)) = (ac.cpr_pair.0, ac.cpr_pair.1) {
                let pos = decode_cpr_global(&even, &odd)
                    .expect("global cpr decode must succeed without errors");
                // Check position continuity: delta must be physically plausible (< 0.05 degrees in 1 sec)
                if let Some(prev) = ac.last_pos {
                    let d_lat = (pos.lat().microdegrees() - prev.lat().microdegrees()).abs();
                    let d_lon = (pos.lon().microdegrees() - prev.lon().microdegrees()).abs();
                    assert!(
                        d_lat < 50_000,
                        "Position lat jump detected: {d_lat} microdeg"
                    );
                    assert!(
                        d_lon < 50_000,
                        "Position lon jump detected: {d_lon} microdeg"
                    );
                }
                ac.last_pos = Some(pos);
                Some(pos)
            } else {
                None
            };

            // 2. Heading continuity
            let hdg_val = ac.heading.round() as u16;
            if let Some(prev_hdg) = ac.last_heading {
                let diff = (hdg_val as i32 - prev_hdg as i32).abs();
                let wrapped_diff = diff.min(360 - diff);
                assert!(
                    wrapped_diff <= 6,
                    "Heading discontinuity: {wrapped_diff} deg"
                );
            }
            ac.last_heading = Some(hdg_val);

            // 3. Ingest into tracker
            let mut u = TargetUpdate::new(
                AddressType::Icao,
                ac.profile.icao,
                TransponderSource::ModeS1090,
                ReceptionSource::Direct,
                t_ms,
            )
            .with_altitude(Altitude::new(ac.alt, AltitudeKind::Barometric).expect("valid alt"))
            .with_velocity(
                Some(ac.speed.round() as u16),
                Heading::from_raw_128ths((hdg_val % 360) * 128),
                Some(ac.profile.alt_rate),
            );
            if let Some(p) = decoded_pos {
                u = u.with_position(p);
            }
            let ev = tracker.update(&u).expect("tracker update succeeds");
            assert!(matches!(ev, AirspaceEvent::TargetUpdated(_)));

            // 4. Verify monotonic integrity in tracker
            let track = tracker
                .get_icao(ac.profile.icao)
                .expect("target must exist in tracker");
            assert_eq!(track.squawk, Squawk::new(ac.profile.squawk));
            assert!(track.callsign.is_some());
            assert_eq!(track.last_seen_ms, t_ms);
            assert!(!Tracker::is_stale(&track, t_ms));
        }
    }

    // 5. Test expiry after simulation halts
    let expire_time_ms = 1000 + 120_000 + Tracker::DEFAULT_TRACK_TTL_MS + 1000;
    let lost_events = tracker.prune_expired(expire_time_ms, Tracker::DEFAULT_TRACK_TTL_MS);
    assert_eq!(
        lost_events.len(),
        fleet.len(),
        "All aircraft tracks must be pruned when traffic ceases"
    );
    assert_eq!(tracker.len(), 0);
}
