//! Integration and unit tests for gzip HTTP content negotiation (`AF-97`).

use std::{
    io::{BufRead, BufReader, Read, Write},
    net::{TcpListener, TcpStream},
    sync::Arc,
};

use aerofoil_server::gzip::{accepts_gzip, encode_if_gzip, write_static_response};
use aerofoil_tracker::Tracker;
use flate2::read::GzDecoder;

#[test]
fn test_accepts_gzip_header_parsing() {
    assert!(accepts_gzip("gzip, deflate, br"));
    assert!(accepts_gzip("br, GZIP;q=0.8"));
    assert!(!accepts_gzip("br, deflate"));
    assert!(!accepts_gzip("gzip;q=0, br"));
    assert!(!accepts_gzip("gzip; q=0.000"));
    assert!(!accepts_gzip(""));
}

#[test]
fn test_encode_if_gzip_thresholds_and_mimes() {
    let small = vec![b'a'; 512];
    let (out_small, gz_small) = encode_if_gzip(&small, "application/javascript", true);
    assert!(!gz_small);
    assert_eq!(out_small.as_ref(), small.as_slice());

    let large_png = vec![b'x'; 4096];
    let (out_png, gz_png) = encode_if_gzip(&large_png, "image/png", true);
    assert!(!gz_png);
    assert_eq!(out_png.as_ref(), large_png.as_slice());

    let large_js = "console.log('aerofoil');\n".repeat(200).into_bytes();
    let (out_js, gz_js) = encode_if_gzip(&large_js, "application/javascript; charset=utf-8", true);
    assert!(gz_js);
    assert!(out_js.len() < large_js.len() / 4);

    let mut decoder = GzDecoder::new(out_js.as_ref());
    let mut restored = Vec::new();
    assert!(decoder.read_to_end(&mut restored).is_ok());
    assert_eq!(restored, large_js);
}

#[test]
fn test_write_static_response_gzip_tcp_roundtrip() {
    let listener = TcpListener::bind("127.0.0.1:0");
    assert!(listener.is_ok());
    let Ok(listener) = listener else { return };
    let Ok(addr) = listener.local_addr() else {
        panic!("missing local addr");
    };

    let payload = "{\"type\":\"Topology\",\"arcs\":[[[1,2],[3,4]]]}".repeat(80);
    let expected = payload.as_bytes().to_vec();

    let srv = std::thread::spawn(move || {
        if let Ok((mut s, _)) = listener.accept() {
            let _ = write_static_response(
                &mut s,
                "application/json; charset=utf-8",
                "public, max-age=86400",
                &expected,
                true,
            );
        }
    });

    let Ok(client) = TcpStream::connect(addr) else {
        panic!("failed to connect");
    };
    let mut reader = BufReader::new(client);
    let mut header = String::new();
    let mut line = String::new();
    while reader.read_line(&mut line).is_ok() && line != "\r\n" {
        header.push_str(&line);
        line.clear();
    }
    assert!(header.contains("HTTP/1.1 200 OK"));
    assert!(header.contains("Content-Encoding: gzip"));
    assert!(header.contains("Vary: Accept-Encoding"));
    assert!(header.contains("Cache-Control: public, max-age=86400"));

    let mut gz_body = Vec::new();
    assert!(reader.read_to_end(&mut gz_body).is_ok());
    let mut decoder = GzDecoder::new(gz_body.as_slice());
    let mut decoded = String::new();
    assert!(decoder.read_to_string(&mut decoded).is_ok());
    assert_eq!(decoded, payload);
    assert!(srv.join().is_ok());
}

#[test]
fn test_egress_gzip_negotiation_over_http() {
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
            .write_all(b"GET / HTTP/1.1\r\nHost: localhost\r\nAccept-Encoding: gzip, br\r\n\r\n")
            .is_ok()
    );

    let mut reader = BufReader::new(stream);
    let mut header = String::new();
    let mut line = String::new();
    while reader.read_line(&mut line).is_ok() && !line.is_empty() {
        header.push_str(&line);
        if line == "\r\n" {
            break;
        }
        line.clear();
    }

    assert!(header.contains("HTTP/1.1 200 OK"));
    assert!(header.contains("Content-Encoding: gzip"));
    assert!(header.contains("Vary: Accept-Encoding"));

    let mut body = Vec::new();
    assert!(reader.read_to_end(&mut body).is_ok());
    let mut decoder = GzDecoder::new(body.as_slice());
    let mut html = String::new();
    assert!(decoder.read_to_string(&mut html).is_ok());
    assert!(html.contains("AEROFOIL") || html.contains("aerofoil"));

    server.shutdown();
}
