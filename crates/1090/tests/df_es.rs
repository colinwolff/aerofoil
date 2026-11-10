#![allow(clippy::unwrap_used, clippy::expect_used)]

use aerofoil_1090::{
    AirbornePosition, AirborneVelocity, AircraftIdentification, EsPayload, ExtendedSquitter,
    ModeSFrame, VelocityPayload, VerticalRateSource, parse_frame,
};

#[test]
fn test_df17_aircraft_identification() {
    let raw = [
        0x8d, 0x48, 0x40, 0xd6, 0x20, 0x2c, 0xc3, 0x71, 0xc3, 0x2c, 0xe0, 0x57, 0x60, 0x98,
    ];
    let frame = parse_frame(&raw).expect("valid DF17 callsign");
    match frame {
        ModeSFrame::ExtendedSquitter(ExtendedSquitter {
            df,
            icao_address,
            payload:
                EsPayload::Identification(AircraftIdentification {
                    type_code,
                    emitter_category,
                    callsign,
                }),
            ..
        }) => {
            assert_eq!(df, 17);
            assert_eq!(icao_address, 0x4840D6);
            assert_eq!(type_code, 4);
            assert_eq!(emitter_category, 0);
            assert_eq!(&callsign, b"KLM1023 ");
        }
        other => panic!("expected Identification, got {other:?}"),
    }
}

#[test]
fn test_df17_airborne_position() {
    let raw = [
        0x8d, 0x40, 0x62, 0x1d, 0x58, 0xc3, 0x82, 0xd6, 0x90, 0xc8, 0xac, 0x28, 0x63, 0xa7,
    ];
    let frame = parse_frame(&raw).expect("valid DF17 position");
    match frame {
        ModeSFrame::ExtendedSquitter(ExtendedSquitter {
            df,
            icao_address,
            payload:
                EsPayload::AirbornePosition(AirbornePosition {
                    type_code,
                    altitude,
                    cpr_odd,
                    lat_cpr,
                    lon_cpr,
                    ..
                }),
            ..
        }) => {
            assert_eq!(df, 17);
            assert_eq!(icao_address, 0x40621D);
            assert_eq!(type_code, 11);
            assert_eq!(altitude.map(|a| a.feet()), Some(38_000));
            assert!(!cpr_odd);
            assert_eq!(lat_cpr, 93000);
            assert_eq!(lon_cpr, 51372);
        }
        other => panic!("expected AirbornePosition, got {other:?}"),
    }
}

#[test]
fn test_df17_airborne_velocity() {
    let raw = [
        0x8d, 0xa0, 0x5f, 0x21, 0x99, 0x00, 0x02, 0x8a, 0x38, 0x08, 0x20, 0xf5, 0x3a, 0x6a,
    ];
    let frame = parse_frame(&raw).expect("valid DF17 velocity");
    match frame {
        ModeSFrame::ExtendedSquitter(ExtendedSquitter {
            df,
            icao_address,
            payload:
                EsPayload::AirborneVelocity(AirborneVelocity {
                    subtype,
                    payload,
                    vertical_rate_fpm,
                    vertical_rate_source,
                    geo_minus_baro_ft,
                    ..
                }),
            ..
        }) => {
            assert_eq!(df, 17);
            assert_eq!(icao_address, 0xA05F21);
            assert_eq!(subtype, 1);
            match payload {
                VelocityPayload::GroundSpeed {
                    ew_velocity_knots,
                    ns_velocity_knots,
                    supersonic,
                } => {
                    assert_eq!(ew_velocity_knots, Some(1));
                    assert_eq!(ns_velocity_knots, Some(-80));
                    assert!(!supersonic);
                    assert_eq!(payload.ground_speed_knots(), Some(80));
                }
                other => panic!("expected GroundSpeed, got {other:?}"),
            }
            assert_eq!(vertical_rate_fpm, Some(-64));
            assert_eq!(vertical_rate_source, VerticalRateSource::Barometric);
            assert_eq!(geo_minus_baro_ft, Some(775));
        }
        other => panic!("expected AirborneVelocity, got {other:?}"),
    }
}
