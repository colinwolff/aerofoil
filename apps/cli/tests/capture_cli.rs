//! Integration tests for `aerofoil-cli capture` network feed recording (`AF-81`).

#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::io::Write;
use std::net::TcpListener;
use std::thread;
use std::time::Duration;

use aerofoil_cli::{CaptureArgs, run_capture};

#[test]
fn test_live_tcp_feed_capture_limits() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind local test listener");
    let addr = listener.local_addr().expect("local addr");

    let server_handle = thread::spawn(move || {
        if let Ok((mut socket, _)) = listener.accept() {
            // Write 5 sample Beast messages
            let payload = [
                0x1A, 0x32, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x1A, 0x33, 0x11, 0x12,
                0x13, 0x14, 0x15, 0x16, 0x17, 0x18,
            ];
            for _ in 0..5 {
                let _ = socket.write_all(&payload);
                thread::sleep(Duration::from_millis(20));
            }
        }
    });

    let temp_dir = std::env::temp_dir();
    let temp_file = temp_dir.join(format!("aerofoil_cap_test_{}.beast", std::process::id()));

    let args = CaptureArgs {
        connect: addr.to_string(),
        output: Some(temp_file.to_string_lossy().to_string()),
        duration: Some(2),
        max_bytes: Some(40),
        max_frames: None,
    };

    let stats = run_capture(&args).expect("run_capture must succeed");
    server_handle.join().expect("server thread finish");

    assert_eq!(stats.bytes_captured, 40);
    assert!(temp_file.exists());
    let file_bytes = std::fs::read(&temp_file).expect("read captured output");
    assert_eq!(file_bytes.len(), 40);

    let _ = std::fs::remove_file(temp_file);
}
