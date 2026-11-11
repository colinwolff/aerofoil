use aerofoil_mlat::{
    MlatError, ReceiverRegistry, SPEED_OF_LIGHT, TdoaObservation, ecef_to_geodetic,
    geodetic_to_ecef, solve_tdoa,
};

#[test]
fn test_wgs84_roundtrip_airports() {
    let airports = [
        ("EHAM", 52.3086, 4.7639, -3.0),
        ("EGLL", 51.4700, -0.4543, 25.0),
        ("KJFK", 40.6413, -73.7781, 4.0),
        ("RJTT", 35.5533, 139.7811, 6.0),
    ];

    for (name, lat, lon, alt) in airports {
        let ecef = geodetic_to_ecef(lat, lon, alt);
        let (lat_out, lon_out, alt_out) = ecef_to_geodetic(ecef);

        assert!((lat - lat_out).abs() < 1e-7, "{name} latitude mismatch");
        assert!((lon - lon_out).abs() < 1e-7, "{name} longitude mismatch");
        assert!((alt - alt_out).abs() < 1e-3, "{name} altitude mismatch");
    }
}

#[test]
fn test_receiver_registry() {
    let mut reg = ReceiverRegistry::new();
    assert_eq!(reg.len(), 0);
    assert!(reg.is_empty());

    assert!(reg.register(1, 52.0, 4.0, 10.0).is_ok());
    assert!(reg.register(2, 52.5, 4.5, 20.0).is_ok());
    assert_eq!(reg.len(), 2);

    let Some(s1) = reg.get(1) else {
        panic!("station 1 missing");
    };
    assert_eq!(s1.id, 1);
    assert_eq!(s1.clock_offset_ns, 0);

    assert!(reg.calibrate_clock(1, -250).is_ok());
    let Some(s1_cal) = reg.get(1) else {
        panic!("station 1 missing");
    };
    assert_eq!(s1_cal.clock_offset_ns, -250);

    assert_eq!(
        reg.calibrate_clock(99, 100),
        Err(MlatError::ReceiverNotFound { receiver_id: 99 })
    );
}

#[test]
fn test_bancroft_tdoa_synthetic_quad_solve() {
    let mut reg = ReceiverRegistry::new();

    // 4 Ground receivers distributed around Amsterdam
    assert!(reg.register(1, 52.10, 4.60, 10.0).is_ok());
    assert!(reg.register(2, 52.60, 4.60, 15.0).is_ok());
    assert!(reg.register(3, 52.10, 5.20, 20.0).is_ok());
    assert!(reg.register(4, 52.60, 5.20, 12.0).is_ok());

    // True target position (airborne target at 8,000m)
    let true_lat = 52.35;
    let true_lon = 4.90;
    let true_alt = 8_000.0;
    let target_ecef = geodetic_to_ecef(true_lat, true_lon, true_alt);

    // Compute exact arrival timestamps
    let mut obs = Vec::new();
    for id in 1..=4 {
        let Some(st) = reg.get(id) else {
            panic!("station {id} missing");
        };
        let dist = target_ecef.distance_to(&st.ecef);
        let time_s = dist / SPEED_OF_LIGHT;
        let ns = (time_s * 1e9).round() as u64;
        obs.push(TdoaObservation {
            receiver_id: id,
            timestamp_ns: 1_000_000_000 + ns,
        });
    }

    let Ok(solution) = solve_tdoa(&obs, &reg) else {
        panic!("solve_tdoa failed");
    };

    assert!(
        (solution.lat_deg - true_lat).abs() < 1e-4,
        "Lat diff: {}",
        solution.lat_deg - true_lat
    );
    assert!(
        (solution.lon_deg - true_lon).abs() < 1e-4,
        "Lon diff: {}",
        solution.lon_deg - true_lon
    );
    assert!(
        (solution.alt_m - true_alt).abs() < 500.0,
        "Alt diff: {}",
        solution.alt_m - true_alt
    );
}

#[test]
fn test_insufficient_receivers_returns_error() {
    let reg = ReceiverRegistry::new();
    let obs = [
        TdoaObservation {
            receiver_id: 1,
            timestamp_ns: 100,
        },
        TdoaObservation {
            receiver_id: 2,
            timestamp_ns: 200,
        },
    ];

    assert_eq!(
        solve_tdoa(&obs, &reg),
        Err(MlatError::InsufficientReceivers {
            required: 4,
            provided: 2
        })
    );
}
