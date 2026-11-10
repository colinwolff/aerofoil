//! Integration tests for `aerofoil-mcp` tool execution.

use std::sync::Arc;

use aerofoil_common::{
    AddressType, Altitude, AltitudeKind, Position, ReceptionSource, Squawk, TransponderSource,
};
use aerofoil_mcp::McpServer;
use aerofoil_tracker::{TargetUpdate, Tracker};
use serde_json::{Value, json};

fn setup_test_tracker() -> Arc<Tracker> {
    let tracker = Arc::new(Tracker::new());

    // Target 1: KLM1023 near Amsterdam (52.308, 4.763), alt 32000
    let mut t1 = TargetUpdate::new(
        AddressType::Icao,
        0x4840D6,
        TransponderSource::ModeS1090,
        ReceptionSource::Direct,
        1000,
    );
    t1.callsign = Some(*b"KLM1023 ");
    t1.altitude = Altitude::new(32000, AltitudeKind::Barometric);
    t1.ground_speed_knots = Some(450);
    t1.position = Position::from_microdegrees(52_308_000, 4_763_000);
    t1.squawk = Squawk::new(0o1200);
    tracker.update(&t1);

    // Target 2: BAW123 near London (51.507, -0.127), alt 8000
    let mut t2 = TargetUpdate::new(
        AddressType::Icao,
        0x400A01,
        TransponderSource::Uat978,
        ReceptionSource::Direct,
        1000,
    );
    t2.callsign = Some(*b"BAW123  ");
    t2.altitude = Altitude::new(8000, AltitudeKind::Barometric);
    t2.ground_speed_knots = Some(240);
    t2.position = Position::from_microdegrees(51_507_000, -127_000);
    t2.squawk = Squawk::new(0o7700);
    tracker.update(&t2);

    tracker
}

fn parse_json(raw: &str) -> Value {
    let Ok(v) = serde_json::from_str(raw) else {
        panic!("failed to parse json");
    };
    v
}

#[test]
fn test_mcp_tool_airspace_summary() {
    let tracker = setup_test_tracker();
    let server = McpServer::new(tracker);

    let call_req = json!({
        "jsonrpc": "2.0",
        "id": 10,
        "method": "tools/call",
        "params": {
            "name": "get_airspace_summary",
            "arguments": {}
        }
    });
    let resp = server.dispatch_line(&call_req.to_string());
    assert!(resp.is_some());
    let val = parse_json(&resp.unwrap_or_default());
    assert_eq!(val["id"], 10);
    assert_eq!(val["result"]["isError"], false);
    let Some(text) = val["result"]["content"][0]["text"].as_str() else {
        panic!("expected text");
    };
    assert!(text.contains("\"total_tracks\": 2"));
    assert!(text.contains("\"emergencies\": 1"));
    assert!(text.contains("\"source_1090es\": 1"));
    assert!(text.contains("\"source_uat978\": 1"));

    let call_filtered = json!({
        "jsonrpc": "2.0",
        "id": 11,
        "method": "tools/call",
        "params": {
            "name": "get_airspace_summary",
            "arguments": { "min_altitude": 20000 }
        }
    });
    let resp = server.dispatch_line(&call_filtered.to_string());
    assert!(resp.is_some());
    let val = parse_json(&resp.unwrap_or_default());
    let Some(text) = val["result"]["content"][0]["text"].as_str() else {
        panic!("expected text");
    };
    assert!(text.contains("\"filtered_tracks\": 1"));
    assert!(text.contains("KLM1023"));
    assert!(!text.contains("BAW123"));
}

#[test]
fn test_mcp_tool_get_track() {
    let tracker = setup_test_tracker();
    let server = McpServer::new(tracker);

    let req_addr = json!({
        "jsonrpc": "2.0",
        "id": 20,
        "method": "tools/call",
        "params": {
            "name": "get_track",
            "arguments": { "address": "0x4840D6" }
        }
    });
    let resp = server.dispatch_line(&req_addr.to_string());
    assert!(resp.is_some());
    let val = parse_json(&resp.unwrap_or_default());
    assert_eq!(val["result"]["isError"], false);
    let Some(text) = val["result"]["content"][0]["text"].as_str() else {
        panic!("expected text");
    };
    assert!(text.contains("KLM1023"));
    assert!(text.contains("4840D6"));

    let req_cs = json!({
        "jsonrpc": "2.0",
        "id": 21,
        "method": "tools/call",
        "params": {
            "name": "get_track",
            "arguments": { "callsign": "BAW123" }
        }
    });
    let resp = server.dispatch_line(&req_cs.to_string());
    assert!(resp.is_some());
    let val = parse_json(&resp.unwrap_or_default());
    let Some(text) = val["result"]["content"][0]["text"].as_str() else {
        panic!("expected text");
    };
    assert!(text.contains("BAW123"));
    assert!(text.contains("7700"));

    let req_not_found = json!({
        "jsonrpc": "2.0",
        "id": 22,
        "method": "tools/call",
        "params": {
            "name": "get_track",
            "arguments": { "address": "0xFFFFFF" }
        }
    });
    let resp = server.dispatch_line(&req_not_found.to_string());
    assert!(resp.is_some());
    let val = parse_json(&resp.unwrap_or_default());
    assert_eq!(val["result"]["isError"], true);
}

#[test]
fn test_mcp_tool_find_closest() {
    let tracker = setup_test_tracker();
    let server = McpServer::new(tracker);

    let req = json!({
        "jsonrpc": "2.0",
        "id": 30,
        "method": "tools/call",
        "params": {
            "name": "find_closest",
            "arguments": {
                "latitude": 52.3,
                "longitude": 4.7,
                "limit": 1
            }
        }
    });
    let resp = server.dispatch_line(&req.to_string());
    assert!(resp.is_some());
    let val = parse_json(&resp.unwrap_or_default());
    assert_eq!(val["result"]["isError"], false);
    let Some(text) = val["result"]["content"][0]["text"].as_str() else {
        panic!("expected text");
    };
    assert!(text.contains("KLM1023"));
    assert!(text.contains("distance_nm"));
    assert!(!text.contains("BAW123"));
}
