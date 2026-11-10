//! Synthetic multi-aircraft scenario generator for `datasets/fixtures/dual_band_hub.beast`.

#![allow(clippy::unwrap_used, clippy::expect_used)]

mod hub_gen;

use hub_gen::{
    cpr::encode_cpr_exact,
    messages::{
        encode_beast_frame, make_df5_squawk, make_df17_ident, make_df17_pos, make_df17_velocity,
    },
    types::{AircraftSimState, FlightProfile},
};
use std::{fs::File, io::Write};

#[test]
fn generate_multi_aircraft_hub_fixture() {
    let profiles = vec![
        FlightProfile {
            icao: 0x4840D6,
            callsign: "KLM1023",
            squawk: 0o4201,
            start_alt: 4000,
            alt_rate_fpm: -600,
            start_lat: 52.48,
            start_lon: 5.15,
            speed_kts: 190.0,
            start_heading_deg: 240.0,
            turn_rate_deg_per_step: -0.3,
        },
        FlightProfile {
            icao: 0x484B12,
            callsign: "TRA542",
            squawk: 0o1000,
            start_alt: 2500,
            alt_rate_fpm: 1200,
            start_lat: 52.33,
            start_lon: 4.65,
            speed_kts: 240.0,
            start_heading_deg: 310.0,
            turn_rate_deg_per_step: 0.2,
        },
        FlightProfile {
            icao: 0x400892,
            callsign: "BAW431",
            squawk: 0o6214,
            start_alt: 34000,
            alt_rate_fpm: 0,
            start_lat: 52.65,
            start_lon: 4.20,
            speed_kts: 460.0,
            start_heading_deg: 95.0,
            turn_rate_deg_per_step: 0.0,
        },
        FlightProfile {
            icao: 0x47812A,
            callsign: "SAS553",
            squawk: 0o3412,
            start_alt: 28000,
            alt_rate_fpm: -300,
            start_lat: 52.85,
            start_lon: 5.30,
            speed_kts: 420.0,
            start_heading_deg: 215.0,
            turn_rate_deg_per_step: -0.1,
        },
        FlightProfile {
            icao: 0x4855AA,
            callsign: "MEDIC1",
            squawk: 0o7700, // EMERGENCY
            start_alt: 1200,
            alt_rate_fpm: 0,
            start_lat: 52.28,
            start_lon: 4.96,
            speed_kts: 90.0,
            start_heading_deg: 0.0,
            turn_rate_deg_per_step: 3.0, // Orbiting circle over Amsterdam AMC
        },
        FlightProfile {
            icao: 0x3C49A8,
            callsign: "DLH12A",
            squawk: 0o2105,
            start_alt: 36000,
            alt_rate_fpm: 0,
            start_lat: 52.55,
            start_lon: 5.60,
            speed_kts: 470.0,
            start_heading_deg: 135.0,
            turn_rate_deg_per_step: 0.0,
        },
        FlightProfile {
            icao: 0x40621D,
            callsign: "EZY291",
            squawk: 0o7000,
            start_alt: 9000,
            alt_rate_fpm: 0,
            start_lat: 52.15,
            start_lon: 4.70,
            speed_kts: 220.0,
            start_heading_deg: 270.0,
            turn_rate_deg_per_step: 2.0, // Holding pattern turn
        },
    ];

    let mut aircraft_states: Vec<AircraftSimState> =
        profiles.into_iter().map(AircraftSimState::new).collect();
    let mut beast_bytes = Vec::new();

    // Initial identification and squawk bursts
    for ac in &aircraft_states {
        let ident = make_df17_ident(ac.profile.icao, ac.profile.callsign);
        beast_bytes.extend(encode_beast_frame(0x33, &ident));
        let df5 = make_df5_squawk(ac.profile.icao, ac.profile.squawk);
        beast_bytes.extend(encode_beast_frame(0x32, &df5));
    }

    // Simulate 60 time steps (1 Hz updates for 60 seconds)
    for step in 0..60 {
        for ac in &mut aircraft_states {
            ac.step(1.0);

            // Alternate even and odd CPR frames every second
            let is_odd = (step % 2) == 1;
            let (lat_cpr, lon_cpr) = encode_cpr_exact(ac.current_lat, ac.current_lon, is_odd);
            let pos_msg = make_df17_pos(ac.profile.icao, ac.current_alt, is_odd, lat_cpr, lon_cpr);
            beast_bytes.extend(encode_beast_frame(0x33, &pos_msg));

            // Also emit opposite parity occasionally for fast pairing
            if step < 5 || step % 10 == 0 {
                let (lat_opp, lon_opp) = encode_cpr_exact(ac.current_lat, ac.current_lon, !is_odd);
                let opp_msg =
                    make_df17_pos(ac.profile.icao, ac.current_alt, !is_odd, lat_opp, lon_opp);
                beast_bytes.extend(encode_beast_frame(0x33, &opp_msg));
            }

            // Emit airborne velocity squitters (Subtype 1 GroundSpeed)
            let (ew, ns) = ac.velocity_components();
            let vel_msg = make_df17_velocity(ac.profile.icao, ew, ns, ac.profile.alt_rate_fpm);
            beast_bytes.extend(encode_beast_frame(0x33, &vel_msg));

            // Periodic ident reaffirmation every 15 seconds
            if step % 15 == 0 {
                let ident = make_df17_ident(ac.profile.icao, ac.profile.callsign);
                beast_bytes.extend(encode_beast_frame(0x33, &ident));
            }
        }

        // Emit UAT 978 frame once per 5 seconds
        if step % 5 == 0 {
            let uat_48 = [
                0x0A, 0x14, 0x28, 0x3C, 0x50, 0x64, 0x78, 0x8C, 0xA0, 0xCD, 0x0C, 0xBD, 0xA1, 0x19,
                0x2D, 0x41, 0x55, 0x69, 0x7D, 0x91, 0xA5, 0xAB, 0x57, 0x2D, 0xB2, 0x1E, 0x32, 0x46,
                0x5A, 0x6E, 0x82, 0x96, 0x05, 0x96, 0x35, 0xC6, 0xC3, 0x23, 0x37, 0x4B, 0x5F, 0x73,
                0x87, 0x9B, 0x0E, 0x62, 0x06, 0x22,
            ];
            beast_bytes.extend(encode_beast_frame(0x34, &uat_48));
        }
    }

    let path = if std::path::Path::new("datasets/fixtures").exists() {
        "datasets/fixtures/dual_band_hub.beast"
    } else {
        "../../datasets/fixtures/dual_band_hub.beast"
    };
    let mut out_file = File::create(path).unwrap();
    out_file.write_all(&beast_bytes).unwrap();
    assert!(
        beast_bytes.len() > 10_000,
        "Fixture should contain rich flight time-series data"
    );
}
