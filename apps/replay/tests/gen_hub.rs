//! Synthetic multi-aircraft scenario generator for Beast fixtures.

#![allow(clippy::unwrap_used, clippy::expect_used)]

mod hub_gen;

use hub_gen::{
    cpr::encode_cpr_exact,
    legacy::legacy_hub_profiles,
    messages::{
        encode_beast_frame, encode_beast_frame_timestamped, make_df5_squawk, make_df17_ident,
        make_df17_pos, make_df17_velocity,
    },
    types::{AircraftSimState, FlightProfile, generate_terminal_hub_profiles},
};
use std::{fs::File, io::Write, path::Path};

fn simulate_hub(profiles: Vec<FlightProfile>, duration_steps: usize, filename: &str) -> Vec<u8> {
    let mut states: Vec<AircraftSimState> =
        profiles.into_iter().map(AircraftSimState::new).collect();
    let mut beast_bytes = Vec::new();

    for ac in &states {
        let ident = make_df17_ident(ac.profile.icao, ac.profile.callsign);
        beast_bytes.extend(encode_beast_frame(0x33, &ident));
        let df5 = make_df5_squawk(ac.profile.icao, ac.profile.squawk);
        beast_bytes.extend(encode_beast_frame(0x32, &df5));
    }

    for step in 0..duration_steps {
        let mlat_ticks = (step as u64) * 12_000_000;
        for ac in &mut states {
            ac.step(1.0);

            let is_odd = (step % 2) == 1;
            let (lat_cpr, lon_cpr) = encode_cpr_exact(ac.current_lat, ac.current_lon, is_odd);
            let pos_msg = make_df17_pos(ac.profile.icao, ac.current_alt, is_odd, lat_cpr, lon_cpr);
            beast_bytes.extend(encode_beast_frame_timestamped(0x33, &pos_msg, mlat_ticks));

            if step < 5 || step % 10 == 0 {
                let (lat_opp, lon_opp) = encode_cpr_exact(ac.current_lat, ac.current_lon, !is_odd);
                let opp_msg =
                    make_df17_pos(ac.profile.icao, ac.current_alt, !is_odd, lat_opp, lon_opp);
                beast_bytes.extend(encode_beast_frame_timestamped(
                    0x33,
                    &opp_msg,
                    mlat_ticks + 50,
                ));
            }

            let (ew, ns) = ac.velocity_components();
            let vel_msg = make_df17_velocity(ac.profile.icao, ew, ns, ac.profile.alt_rate_fpm);
            beast_bytes.extend(encode_beast_frame_timestamped(
                0x33,
                &vel_msg,
                mlat_ticks + 100,
            ));

            if step % 15 == 0 {
                let ident = make_df17_ident(ac.profile.icao, ac.profile.callsign);
                beast_bytes.extend(encode_beast_frame_timestamped(
                    0x33,
                    &ident,
                    mlat_ticks + 150,
                ));
            }
            if step % 20 == 0 {
                let df5 = make_df5_squawk(ac.profile.icao, ac.profile.squawk);
                beast_bytes.extend(encode_beast_frame_timestamped(0x32, &df5, mlat_ticks + 200));
            }
        }

        if step % 5 == 0 {
            let uat_48 = [
                0x0A, 0x14, 0x28, 0x3C, 0x50, 0x64, 0x78, 0x8C, 0xA0, 0xCD, 0x0C, 0xBD, 0xA1, 0x19,
                0x2D, 0x41, 0x55, 0x69, 0x7D, 0x91, 0xA5, 0xAB, 0x57, 0x2D, 0xB2, 0x1E, 0x32, 0x46,
                0x5A, 0x6E, 0x82, 0x96, 0x05, 0x96, 0x35, 0xC6, 0xC3, 0x23, 0x37, 0x4B, 0x5F, 0x73,
                0x87, 0x9B, 0x0E, 0x62, 0x06, 0x22,
            ];
            beast_bytes.extend(encode_beast_frame_timestamped(
                0x34,
                &uat_48,
                mlat_ticks + 300,
            ));
        }
    }

    let rel_path = if Path::new("datasets/fixtures").exists() {
        format!("datasets/fixtures/{filename}")
    } else {
        format!("../../datasets/fixtures/{filename}")
    };
    let mut out_file = File::create(rel_path).unwrap();
    out_file.write_all(&beast_bytes).unwrap();
    beast_bytes
}

#[test]
fn generate_multi_aircraft_hub_fixture() {
    let profiles = legacy_hub_profiles();
    let bytes = simulate_hub(profiles, 60, "dual_band_hub.beast");
    assert!(
        bytes.len() > 10_000,
        "Fixture should contain flight time-series data"
    );
}

#[test]
fn generate_terminal_airspace_hub_fixture() {
    let profiles = generate_terminal_hub_profiles();
    assert!(
        profiles.len() >= 50,
        "Airspace hub requires 50+ aircraft profiles"
    );
    let bytes = simulate_hub(profiles, 120, "terminal_airspace_hub.beast");
    assert!(
        bytes.len() > 100_000,
        "Terminal hub fixture should contain 50+ aircraft flight data"
    );

    let frames = aerofoil_replay::load_frames(
        std::io::Cursor::new(&bytes),
        aerofoil_replay::InputFormat::Beast,
    )
    .expect("must parse generated beast frames");
    assert!(
        frames.len() >= 10_000,
        "Expected >= 10,000 frames from 55 aircraft over 2 minutes"
    );
}
