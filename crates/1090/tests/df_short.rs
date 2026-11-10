#![allow(clippy::unwrap_used, clippy::expect_used)]

use aerofoil_1090::{
    Df0ShortAirAir, Df4AltReply, Df5IdentityReply, Df11AllCallReply, Df20CommBAlt, Df21CommBId,
    ModeSFrame, TransponderCapability, parse_frame, parse_frame_long, parse_frame_short,
};
use aerofoil_common::{AltitudeKind, DecodeError};

#[test]
fn test_df0_short_air_air() {
    let raw = [0x02, 0x80, 0x00, 0x00, 0xf5, 0xbe, 0xdd];
    let frame = parse_frame(&raw).expect("valid DF0");
    match frame {
        ModeSFrame::ShortAirAir(Df0ShortAirAir {
            vertical_status_ground,
            cross_link_capability,
            sensitivity_level,
            ap,
            ..
        }) => {
            assert!(!vertical_status_ground);
            assert!(cross_link_capability);
            assert_eq!(sensitivity_level, 4);
            assert_eq!(ap, 0xf5bedd);
        }
        other => panic!("expected ShortAirAir, got {other:?}"),
    }
}

#[test]
fn test_df4_surveillance_altitude() {
    let raw = [0x20, 0x00, 0x18, 0x38, 0x12, 0x34, 0x56];
    let frame = parse_frame_short(&raw).expect("valid DF4");
    match frame {
        ModeSFrame::AltitudeReply(Df4AltReply {
            flight_status,
            altitude,
            ..
        }) => {
            assert!(!flight_status.is_alert());
            assert!(!flight_status.is_on_ground());
            let alt = altitude.expect("valid altitude");
            assert_eq!(alt.feet(), 38_000);
            assert_eq!(alt.kind(), AltitudeKind::Barometric);
        }
        other => panic!("expected AltitudeReply, got {other:?}"),
    }
}

#[test]
fn test_df5_surveillance_identity() {
    let raw = [0x28, 0x00, 0x18, 0x70, 0x12, 0x34, 0x56];
    let frame = parse_frame_short(&raw).expect("valid DF5");
    match frame {
        ModeSFrame::IdentityReply(Df5IdentityReply {
            flight_status,
            squawk,
            ..
        }) => {
            assert!(!flight_status.is_on_ground());
            assert!(squawk.is_some());
        }
        other => panic!("expected IdentityReply, got {other:?}"),
    }
}

#[test]
fn test_df11_all_call_reply() {
    let raw = [0x5d, 0x48, 0x40, 0xd6, 0xf8, 0x74, 0x0f];
    let frame = parse_frame(&raw).expect("valid DF11");
    match frame {
        ModeSFrame::AllCallReply(Df11AllCallReply {
            capability,
            address,
            pi,
        }) => {
            assert_eq!(capability, TransponderCapability::Airborne);
            assert_eq!(address, 0x4840D6);
            assert_eq!(pi, 0xF8740F);
        }
        other => panic!("expected AllCallReply, got {other:?}"),
    }
}

#[test]
fn test_df20_df21_comm_b() {
    let mut raw20 = [0u8; 14];
    raw20[0] = 20 << 3; // DF20
    let f20 = parse_frame_long(&raw20).expect("valid DF20");
    assert!(matches!(
        f20,
        ModeSFrame::CommBAltitude(Df20CommBAlt { .. })
    ));

    let mut raw21 = [0u8; 14];
    raw21[0] = 21 << 3; // DF21
    let f21 = parse_frame_long(&raw21).expect("valid DF21");
    assert!(matches!(f21, ModeSFrame::CommBIdentity(Df21CommBId { .. })));
}

#[test]
fn test_unsupported_format_and_truncation() {
    let mut raw = [0u8; 14];
    raw[0] = 24 << 3; // DF24
    let err = parse_frame_long(&raw).unwrap_err();
    assert_eq!(err, DecodeError::UnsupportedFormat { format: 24 });

    let trunc = [0u8; 5];
    let err = parse_frame(&trunc).unwrap_err();
    assert!(matches!(err, DecodeError::Truncated { .. }));
}
