//! Full pipeline stream ingestion, SSE (/api/stream), and WebSocket E2E integration tests (`docs/SPEC.md` §5).

#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::{
    io::{BufRead, BufReader, Read, Write},
    net::TcpStream,
    sync::Arc,
    thread,
    time::Duration,
};

use aerofoil_common::{AddressType, ReceptionSource, TransponderSource};
use aerofoil_server::{BandSource, DualBandIngest, EgressServer};
use aerofoil_tracker::{TargetUpdate, Tracker};
use tungstenite::{Message, client};

fn make_beast_ident(icao: u32) -> Vec<u8> {
    let mut out = vec![0x1A, 0x33, 0, 0, 0, 0, 0, 0, 150];
    let mut msg = [0u8; 14];
    msg[0] = 0x8D;
    msg[1] = (icao >> 16) as u8;
    msg[2] = (icao >> 8) as u8;
    msg[3] = icao as u8;
    msg[4] = 4 << 3; // TC 4
    let parity = aerofoil_1090::crc::crc24(&msg[..11]);
    msg[11..14].copy_from_slice(&parity.to_be_bytes()[1..4]);
    for &b in &msg {
        out.push(b);
        if b == 0x1A {
            out.push(0x1A);
        }
    }
    out
}

#[test]
fn test_full_pipeline_beast_to_sse_api_stream() {
    let tracker = Arc::new(Tracker::new());
    let ingest = DualBandIngest::start(
        Arc::clone(&tracker),
        BandSource::mode_s_1090(0),
        BandSource::uat_978(0),
    )
    .expect("ingest must start");
    let server = EgressServer::start(Arc::clone(&tracker), 0).expect("egress must start");

    let mut feed = TcpStream::connect(("127.0.0.1", ingest.port_1090())).unwrap();
    feed.write_all(&make_beast_ident(0x4840D6)).unwrap();
    thread::sleep(Duration::from_millis(50));

    let mut sse = TcpStream::connect(("127.0.0.1", server.port())).unwrap();
    sse.write_all(b"GET /api/stream HTTP/1.1\r\nHost: localhost\r\n\r\n")
        .unwrap();

    let mut reader = BufReader::new(sse);
    let mut line = String::new();
    let mut headers = String::new();
    while reader.read_line(&mut line).is_ok() && line != "\r\n" {
        headers.push_str(&line);
        line.clear();
    }
    assert!(headers.contains("HTTP/1.1 200 OK"));
    assert!(headers.contains("Content-Type: text/event-stream"));

    let mut payload = String::new();
    for _ in 0..4 {
        line.clear();
        if reader.read_line(&mut line).is_ok() {
            payload.push_str(&line);
        }
    }
    assert!(payload.contains("event: target") && payload.contains("4840D6"));

    server.shutdown();
    ingest.shutdown();
}

#[test]
fn test_full_pipeline_beast_to_websocket() {
    let tracker = Arc::new(Tracker::new());
    let ingest = DualBandIngest::start(
        Arc::clone(&tracker),
        BandSource::mode_s_1090(0),
        BandSource::uat_978(0),
    )
    .expect("ingest must start");
    let server = EgressServer::start(Arc::clone(&tracker), 0).expect("egress must start");

    let mut feed = TcpStream::connect(("127.0.0.1", ingest.port_1090())).unwrap();
    feed.write_all(&make_beast_ident(0x3C49A8)).unwrap();
    thread::sleep(Duration::from_millis(50));

    let stream = TcpStream::connect(("127.0.0.1", server.port())).unwrap();
    let (mut ws, _) = client(format!("ws://127.0.0.1:{}/ws", server.port()), stream)
        .expect("ws handshake succeeds");

    let msg = ws.read().expect("ws message read");
    match msg {
        Message::Text(txt) => {
            assert!(txt.contains("3C49A8") && txt.contains("1090"));
        }
        _ => panic!("expected text message"),
    }

    server.shutdown();
    ingest.shutdown();
}

#[test]
fn test_sse_reconnection_recovery_with_last_event_id() {
    let tracker = Arc::new(Tracker::new());
    let server = EgressServer::start(Arc::clone(&tracker), 0).expect("egress must start");

    let mut update = TargetUpdate::new(
        AddressType::Icao,
        0x400892,
        TransponderSource::ModeS1090,
        ReceptionSource::Direct,
        1000,
    );
    update.callsign = Some(*b"BAW431  ");
    tracker.update(&update);

    let mut sse = TcpStream::connect(("127.0.0.1", server.port())).unwrap();
    sse.write_all(b"GET /api/stream HTTP/1.1\r\nHost: localhost\r\nLast-Event-ID: 42\r\n\r\n")
        .unwrap();

    let mut reader = BufReader::new(sse);
    let mut line = String::new();
    while reader.read_line(&mut line).is_ok() && line != "\r\n" {
        line.clear();
    }

    let mut payload = String::new();
    for _ in 0..4 {
        line.clear();
        if reader.read_line(&mut line).is_ok() {
            payload.push_str(&line);
        }
    }
    assert!(payload.contains("id: 43") && payload.contains("400892"));
    server.shutdown();
}

#[test]
fn test_sse_client_backpressure_and_isolation() {
    let tracker = Arc::new(Tracker::new());
    let server = EgressServer::start(Arc::clone(&tracker), 0).expect("egress must start");

    let mut update = TargetUpdate::new(
        AddressType::Icao,
        0x47812A,
        TransponderSource::ModeS1090,
        ReceptionSource::Direct,
        1000,
    );
    update.callsign = Some(*b"SAS553  ");
    tracker.update(&update);

    let mut c1 = TcpStream::connect(("127.0.0.1", server.port())).unwrap();
    c1.write_all(b"GET /api/stream HTTP/1.1\r\nHost: localhost\r\n\r\n")
        .unwrap();
    let mut reader1 = BufReader::new(c1);

    // Stalled consumer
    let mut c2 = TcpStream::connect(("127.0.0.1", server.port())).unwrap();
    c2.write_all(b"GET /api/stream HTTP/1.1\r\nHost: localhost\r\n\r\n")
        .unwrap();

    let mut line = String::new();
    let mut received = false;
    for _ in 0..10 {
        line.clear();
        if reader1.read_line(&mut line).is_ok() && line.contains("47812A") {
            received = true;
            break;
        }
    }
    assert!(
        received,
        "Client 1 must receive events despite Client 2 backpressure"
    );

    drop(c2);
    thread::sleep(Duration::from_millis(50));

    let mut buf = [0u8; 128];
    assert!(reader1.get_mut().read(&mut buf).is_ok());

    server.shutdown();
}

#[test]
fn test_websocket_coalesced_batch_frame() {
    let tracker = Arc::new(Tracker::new());
    let server = EgressServer::start(Arc::clone(&tracker), 0).expect("egress must start");

    for (icao, cs) in [(0x4840D6, *b"KLM1023 "), (0xA00001, *b"UAL102  ")] {
        let mut up = TargetUpdate::new(
            AddressType::Icao,
            icao,
            TransponderSource::ModeS1090,
            ReceptionSource::Direct,
            2000,
        );
        up.callsign = Some(cs);
        tracker.update(&up);
    }

    let stream = TcpStream::connect(("127.0.0.1", server.port())).unwrap();
    let (mut ws, _) = client(format!("ws://127.0.0.1:{}/ws", server.port()), stream)
        .expect("ws handshake succeeds");

    let Message::Text(txt) = ws.read().expect("batch frame") else {
        panic!("expected text frame");
    };
    let parsed: Vec<serde_json::Value> = serde_json::from_str(&txt).expect("JSON array batch");
    assert_eq!(parsed.len(), 2);
    server.shutdown();
}
