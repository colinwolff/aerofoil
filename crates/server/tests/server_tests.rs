//! Integration tests for `aerofoil-server` dual-band Beast ingest.

use std::{
    io::{Cursor, Write},
    net::TcpStream,
    sync::Arc,
    thread,
    time::Duration,
};

use aerofoil_common::TransponderSource;
use aerofoil_server::{BandSource, BeastReader, DualBandIngest};
use aerofoil_tracker::Tracker;

#[test]
fn test_band_source_constructors() {
    let s1 = BandSource::mode_s_1090(30005);
    assert_eq!(s1.name, "1090ES");
    assert_eq!(s1.band, TransponderSource::ModeS1090);
    assert_eq!(s1.port, 30005);

    let s2 = BandSource::uat_978(30978);
    assert_eq!(s2.name, "UAT978");
    assert_eq!(s2.band, TransponderSource::Uat978);
    assert_eq!(s2.port, 30978);
}

#[test]
fn test_beast_reader_framing() {
    let mut raw = Vec::new();
    // Beast frame: 0x1A 0x32 (Mode S Short), 6 mlat bytes, 1 signal byte, 7 payload bytes
    raw.extend_from_slice(&[0x1A, 0x32]);
    raw.extend_from_slice(&[0, 1, 2, 3, 4, 5]); // MLAT
    raw.push(100); // Signal
    raw.extend_from_slice(&[0x20, 0x00, 0x06, 0x07, 0x5D, 0xDE, 0x48]); // 7 bytes Mode S

    let mut reader = BeastReader::new(Cursor::new(raw));
    let msg = reader.next_message();
    assert!(msg.is_ok());
    let Ok(Some(m)) = msg else {
        panic!("expected message");
    };

    assert_eq!(m.message_type, 0x32);
    assert_eq!(m.payload_len, 7);
    assert_eq!(m.signal_level, 100);
}

#[test]
fn test_dual_band_ingest_fusion() {
    let tracker = Arc::new(Tracker::new());
    let src_1090 = BandSource::mode_s_1090(0); // Port 0 for ephemeral port allocation
    let src_978 = BandSource::uat_978(0);

    let Ok(ingest) = DualBandIngest::start(Arc::clone(&tracker), src_1090, src_978) else {
        panic!("failed to bind ingest");
    };

    let p1090 = ingest.port_1090();
    let p978 = ingest.port_978();
    assert!(p1090 > 0);
    assert!(p978 > 0);

    // Connect to 1090 port and send Beast frame
    let Ok(mut stream_1090) = TcpStream::connect(("127.0.0.1", p1090)) else {
        panic!("failed to connect 1090 stream");
    };

    // Construct synthetic Beast Mode S frame for DF17 (ICAO 0x4840D6)
    let mut beast_1090 = vec![0x1A, 0x33, 0, 0, 0, 0, 0, 0, 150];
    beast_1090.extend_from_slice(&[
        0x8D, 0x48, 0x40, 0xD6, 0x20, 0x2C, 0xC3, 0x71, 0xC3, 0x2C, 0xE0, 0x57, 0x60, 0x98,
    ]);
    let _ = stream_1090.write_all(&beast_1090);
    let _ = stream_1090.flush();

    // Connect to 978 port and send invalid byte to test error tracking
    let Ok(mut stream_978) = TcpStream::connect(("127.0.0.1", p978)) else {
        panic!("failed to connect 978 stream");
    };
    let _ = stream_978.write_all(&[0x1A, 0x31, 0, 0, 0, 0, 0, 0, 100, 1, 2]);
    let _ = stream_978.flush();

    // Give background threads time to process
    thread::sleep(Duration::from_millis(100));

    assert!(
        ingest
            .metrics()
            .frames_1090
            .load(core::sync::atomic::Ordering::Relaxed)
            >= 1
    );
    assert!(
        ingest
            .metrics()
            .bytes_1090
            .load(core::sync::atomic::Ordering::Relaxed)
            >= 7
    );

    // Verify tracker contains the address
    assert!(tracker.contains_address(0x4840D6));

    ingest.shutdown();
}

#[test]
fn test_egress_static_web_serving() {
    let tracker = Arc::new(Tracker::new());
    let Ok(server) = aerofoil_server::EgressServer::start(Arc::clone(&tracker), 0) else {
        panic!("failed to start egress server");
    };
    let port = server.port();

    let Ok(mut stream) = TcpStream::connect(("127.0.0.1", port)) else {
        panic!("failed to connect");
    };
    assert!(
        stream
            .write_all(b"GET / HTTP/1.1\r\nHost: localhost\r\n\r\n")
            .is_ok()
    );

    let mut response = String::new();
    let mut reader = std::io::BufReader::new(stream);
    let mut line = String::new();
    while std::io::BufRead::read_line(&mut reader, &mut line).is_ok() && !line.is_empty() {
        response.push_str(&line);
        if line == "\r\n" {
            let mut body = String::new();
            let _ = std::io::Read::read_to_string(&mut reader, &mut body);
            response.push_str(&body);
            break;
        }
        line.clear();
    }

    assert!(response.contains("HTTP/1.1 200 OK"));
    assert!(response.contains("text/html"));
    assert!(response.contains("AEROFOIL") || response.contains("aerofoil"));

    server.shutdown();
}

#[test]
fn test_egress_api_config() {
    let tracker = Arc::new(Tracker::new());
    let Ok(server) = aerofoil_server::EgressServer::start(tracker, 0) else {
        panic!("failed to start egress server");
    };
    let port = server.port();

    let Ok(mut stream) = TcpStream::connect(("127.0.0.1", port)) else {
        panic!("failed to connect");
    };
    assert!(
        stream
            .write_all(b"GET /api/config HTTP/1.1\r\nHost: localhost\r\n\r\n")
            .is_ok()
    );

    let mut response = String::new();
    let mut reader = std::io::BufReader::new(stream);
    let mut line = String::new();
    while std::io::BufRead::read_line(&mut reader, &mut line).is_ok() && !line.is_empty() {
        response.push_str(&line);
        if line == "\r\n" {
            let mut body = String::new();
            let _ = std::io::Read::read_to_string(&mut reader, &mut body);
            response.push_str(&body);
            break;
        }
        line.clear();
    }

    assert!(response.contains("HTTP/1.1 200 OK"));
    assert!(response.contains("application/json"));
    assert!(response.contains("\"receiverLat\":"));
    assert!(response.contains("\"defaultBasemap\":"));
    assert!(response.contains("\"units\":"));

    server.shutdown();
}
