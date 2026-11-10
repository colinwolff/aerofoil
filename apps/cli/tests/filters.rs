//! Tests for CLI filtering arguments (`--filter-altitude`, `--filter-squawk`).

#![allow(clippy::unwrap_used, clippy::expect_used)]

use aerofoil_cli::{CliArgs, InputFormat, OutputFormat};

#[test]
fn test_altitude_filters() {
    let mut args = CliArgs {
        format: InputFormat::Auto,
        output: OutputFormat::Json,
        filter_altitude: Some(">10000".to_string()),
        filter_squawk: None,
    };

    assert!(args.matches_altitude(Some(12000)));
    assert!(!args.matches_altitude(Some(10000)));
    assert!(!args.matches_altitude(Some(8000)));
    assert!(!args.matches_altitude(None));

    args.filter_altitude = Some("<5000".to_string());
    assert!(args.matches_altitude(Some(4500)));
    assert!(!args.matches_altitude(Some(5000)));
    assert!(!args.matches_altitude(Some(8000)));

    args.filter_altitude = Some("10000..20000".to_string());
    assert!(args.matches_altitude(Some(10000)));
    assert!(args.matches_altitude(Some(15000)));
    assert!(args.matches_altitude(Some(20000)));
    assert!(!args.matches_altitude(Some(9999)));
    assert!(!args.matches_altitude(Some(20001)));
}

#[test]
fn test_squawk_filters() {
    let args = CliArgs {
        format: InputFormat::Auto,
        output: OutputFormat::Json,
        filter_altitude: None,
        filter_squawk: Some("7700".to_string()),
    };

    assert!(args.matches_squawk(Some(0o7700)));
    assert!(!args.matches_squawk(Some(0o1200)));
    assert!(!args.matches_squawk(Some(0o7600)));
    assert!(!args.matches_squawk(None));
}
