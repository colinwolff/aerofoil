//! Integration tests for `aerofoil-server` SSE and WebSocket egress streaming.

use std::{
    io::{BufRead, BufReader, Read, Write},
    net::TcpStream,
    sync::Arc,
    thread,
    time::Duration,
};

use aerofoil_common::{
    AddressType, Altitude, AltitudeKind, Position, ReceptionSource, TransponderSource,
};
use aerofoil_server::EgressServer;
use aerofoil_tracker::{TargetUpdate, Tracker};
use tungstenite::{Message, client};

#[test]
fn test_egress_health_and_404() {
    let tracker = Arc::new(Tracker::new());
    let Ok(server) = EgressServer::start(Arc::clone(&tracker), 0) else {
        panic!("failed to start egress server");
    };
    let port = server.port();

    // Health check
    let Ok(mut stream) = TcpStream::connect(("127.0.0.1", port)) else {
        panic!("failed to connect");
    };
    assert!(
        stream
            .write_all(b"GET /health HTTP/1.1\r\nHost: localhost\r\n\r\n")
            .is_ok()
    );

    let mut response = String::new();
    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    while reader.read_line(&mut line).is_ok() && !line.is_empty() {
        response.push_str(&line);
        if line == "\r\n" {
            // Read body
            let mut body = String::new();
            let _ = reader.read_line(&mut body);
            response.push_str(&body);
            break;
        }
        line.clear();
    }

    assert!(response.contains("HTTP/1.1 200 OK"));
    assert!(response.contains("{\"status\":\"ok\",\"tracks\":0}"));

    // 404 check
    let Ok(mut stream404) = TcpStream::connect(("127.0.0.1", port)) else {
        panic!("failed to connect");
    };
    assert!(
        stream404
            .write_all(b"GET /unknown HTTP/1.1\r\nHost: localhost\r\n\r\n")
            .is_ok()
    );
    let mut resp404 = [0u8; 128];
    let Ok(n) = stream404.read(&mut resp404) else {
        panic!("read 404 failed");
    };
    let resp404_str = std::str::from_utf8(&resp404[..n]).unwrap_or("");
    assert!(resp404_str.contains("404 Not Found"));

    server.shutdown();
}

#[test]
fn test_egress_sse_stream() {
    let tracker = Arc::new(Tracker::new());
    let Ok(server) = EgressServer::start(Arc::clone(&tracker), 0) else {
        panic!("failed to start egress server");
    };
    let port = server.port();

    // Populate a track
    let mut update = TargetUpdate::new(
        AddressType::Icao,
        0x4840D6,
        TransponderSource::ModeS1090,
        ReceptionSource::Direct,
        1000,
    );
    update.callsign = Some(*b"KLM1023 ");
    update.altitude = Altitude::new(32000, AltitudeKind::Barometric);
    update.ground_speed_knots = Some(450);
    update.position = Position::from_microdegrees(52_300_000, 4_760_000);
    tracker.update(&update);

    let Ok(mut stream) = TcpStream::connect(("127.0.0.1", port)) else {
        panic!("failed to connect");
    };
    assert!(
        stream
            .write_all(b"GET /events HTTP/1.1\r\nHost: localhost\r\n\r\n")
            .is_ok()
    );

    let mut reader = BufReader::new(stream);
    let mut initial_headers = String::new();
    let mut line = String::new();
    while reader.read_line(&mut line).is_ok() && line != "\r\n" {
        initial_headers.push_str(&line);
        line.clear();
    }

    assert!(initial_headers.contains("HTTP/1.1 200 OK"));
    assert!(initial_headers.contains("Content-Type: text/event-stream"));

    // Next lines should be id, event, data
    let mut event_content = String::new();
    for _ in 0..4 {
        line.clear();
        if reader.read_line(&mut line).is_ok() {
            event_content.push_str(&line);
        }
    }

    assert!(event_content.contains("id: 1"));
    assert!(event_content.contains("event: target"));
    assert!(event_content.contains("4840D6"));
    assert!(event_content.contains("KLM1023"));

    server.shutdown();
}

#[test]
fn test_egress_websocket_stream() {
    let tracker = Arc::new(Tracker::new());
    let Ok(server) = EgressServer::start(Arc::clone(&tracker), 0) else {
        panic!("failed to start egress server");
    };
    let port = server.port();

    // Populate a track
    let mut update = TargetUpdate::new(
        AddressType::Icao,
        0xA12345,
        TransponderSource::Uat978,
        ReceptionSource::Direct,
        1000,
    );
    update.callsign = Some(*b"N12345  ");
    update.altitude = Altitude::new(8500, AltitudeKind::Barometric);
    tracker.update(&update);

    let Ok(stream) = TcpStream::connect(("127.0.0.1", port)) else {
        panic!("failed to connect");
    };

    let Ok((mut ws, _response)) = client(format!("ws://127.0.0.1:{port}/ws"), stream) else {
        panic!("failed to perform websocket handshake");
    };

    let Ok(msg) = ws.read() else {
        panic!("read ws message failed");
    };
    match msg {
        Message::Text(txt) => {
            assert!(txt.contains("A12345"));
            assert!(txt.contains("N12345"));
            assert!(txt.contains("978"));
        }
        _ => panic!("expected text message"),
    }

    // Send filter to only receive tracks above 10,000 ft
    assert!(
        ws.send(Message::Text("{\"min_alt\": 10000}".into()))
            .is_ok()
    );

    thread::sleep(Duration::from_millis(200));

    // Send ping/pong test
    assert!(ws.send(Message::Ping(vec![1, 2, 3].into())).is_ok());

    server.shutdown();
}
