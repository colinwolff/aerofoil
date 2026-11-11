//! Integration tests for aerofoil-server outbound MLAT feeder protocol.

use aerofoil_server::mlat_client::{
    MlatClientConfig, encode_beast_timestamped_frame, encode_handshake, parse_mlat_solution_line,
};

#[test]
fn test_mlat_handshake_encoding() {
    let cfg = MlatClientConfig {
        server_addr: "feed.example.com:40123".to_string(),
        user: "station-alpha".to_string(),
        lat: 52.3676,
        lon: 4.9041,
        alt_m: 15.5,
    };

    let handshake = encode_handshake(&cfg);
    let json_str = String::from_utf8(handshake).unwrap_or_default();

    assert!(json_str.contains("\"user\":\"station-alpha\""));
    assert!(json_str.contains("\"lat\":52.36760"));
    assert!(json_str.contains("\"lon\":4.90410"));
    assert!(json_str.contains("\"alt\":15.5"));
    assert!(json_str.ends_with('\n'));
}

#[test]
fn test_beast_timestamped_frame_encoding_and_escaping() {
    // Mode S DF17 frame containing 0x1A bytes to verify escape byte doubling
    let frame = [
        0x8D, 0x48, 0x40, 0xD6, 0x1A, 0x8B, 0x58, 0x30, 0x1A, 0x24, 0x68, 0xC2, 0x3A, 0x4B,
    ];
    let timestamp_48mhz = 0x0102_0304_0506;
    let signal = 120;

    let encoded = encode_beast_timestamped_frame(&frame, timestamp_48mhz, signal);

    // Initial prefix: 0x1A, 0x33
    assert_eq!(encoded[0], 0x1A);
    assert_eq!(encoded[1], 0x33);

    // Count 0x1A bytes: 1 leading prefix + (2 in payload * 2) = 5 occurrences
    let count_1a = encoded.iter().filter(|&&b| b == 0x1A).count();
    assert_eq!(count_1a, 5);
}

#[test]
fn test_parse_mlat_solution_line() {
    let line = "MSG,3,1,1,4CA705,1,2026/11/10,21:00:00.000,2026/11/10,21:00:00.000,,35000,,,52.3676,4.9041,,,,,,";
    let parsed = parse_mlat_solution_line(line);

    assert!(parsed.is_some());
    let Some((icao, lat, lon, alt_ft)) = parsed else {
        panic!("expected parsed solution");
    };

    assert_eq!(icao, 0x4CA705);
    assert!((lat - 52.3676).abs() < 1e-4);
    assert!((lon - 4.9041).abs() < 1e-4);
    assert_eq!(alt_ft, 35000.0);
}

#[test]
fn test_parse_invalid_mlat_solution_line() {
    assert_eq!(parse_mlat_solution_line("MALFORMED,1,2,3"), None);
    assert_eq!(parse_mlat_solution_line(""), None);
}
