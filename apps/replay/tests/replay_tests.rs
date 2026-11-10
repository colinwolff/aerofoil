//! Integration tests for `aerofoil-replay`.

#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::{
    io::{Cursor, Read},
    net::TcpListener,
    sync::{Arc, Mutex},
    thread,
};

use aerofoil_replay::{
    InputFormat, PacingSpeed, ReplayEngine, ReplaySink, StreamPacer, TcpClientSink, detect_format,
    load_frames,
};

#[derive(Debug)]
struct BufferSink {
    buffer: Arc<Mutex<Vec<u8>>>,
}

impl ReplaySink for BufferSink {
    fn emit(&mut self, bytes: &[u8]) -> std::io::Result<()> {
        let mut lock = self.buffer.lock().unwrap();
        lock.extend_from_slice(bytes);
        Ok(())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

#[test]
fn test_pacing_speed_multipliers() {
    assert_eq!(PacingSpeed::OneX.multiplier(), Some(1.0));
    assert_eq!(PacingSpeed::TwoX.multiplier(), Some(2.0));
    assert_eq!(PacingSpeed::FiveX.multiplier(), Some(5.0));
    assert_eq!(PacingSpeed::TenX.multiplier(), Some(10.0));
    assert_eq!(PacingSpeed::Burst.multiplier(), None);
}

#[test]
fn test_format_detection() {
    assert_eq!(detect_format(None, &[0x1A, 0x33, 0x01]), InputFormat::Beast);
    assert_eq!(
        detect_format(None, b"*8D4840D6202CC371C32CE0576098;\n"),
        InputFormat::Avr
    );
    assert_eq!(
        detect_format(None, b"{\"schema\":\"aerofoil.target\"}\n"),
        InputFormat::Jsonl
    );
}

#[test]
fn test_beast_replay_burst_engine() {
    // 2 beast messages
    let mut raw = Vec::new();
    raw.extend_from_slice(&[0x1A, 0x32, 0, 0, 0, 0, 0, 10, 100, 1, 2, 3, 4, 5, 6, 7]);
    raw.extend_from_slice(&[0x1A, 0x32, 0, 0, 0, 0, 0, 20, 100, 7, 6, 5, 4, 3, 2, 1]);

    let frames = load_frames(Cursor::new(&raw), InputFormat::Beast).unwrap();
    assert_eq!(frames.len(), 2);

    let output = Arc::new(Mutex::new(Vec::new()));
    let sink = Box::new(BufferSink {
        buffer: Arc::clone(&output),
    });

    let pacer = StreamPacer::new(PacingSpeed::Burst);
    let mut engine = ReplayEngine::new(frames, pacer, sink, false);

    let stats = engine.run().unwrap();
    assert_eq!(stats.frames_sent, 2);
    assert_eq!(stats.bytes_sent, raw.len() as u64);
    assert_eq!(*output.lock().unwrap(), raw);
}

#[test]
fn test_tcp_streaming() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();

    let server_handle = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut received = Vec::new();
        let mut buf = [0u8; 128];
        loop {
            let n = stream.read(&mut buf).unwrap();
            if n == 0 {
                break;
            }
            received.extend_from_slice(&buf[..n]);
            if received.len() >= 10 {
                break;
            }
        }
        received
    });

    let mut client_sink = TcpClientSink::connect(&format!("127.0.0.1:{port}")).unwrap();
    client_sink.emit(b"0123456789").unwrap();
    client_sink.flush().unwrap();

    let received = server_handle.join().unwrap();
    assert_eq!(&received[..10], b"0123456789");
}

#[test]
fn test_avr_and_jsonl_replay() {
    let avr_data = b"*8D4840D6202CC371C32CE0576098;\n*5D4840D6F8740F;\n";
    let frames = load_frames(Cursor::new(avr_data), InputFormat::Avr).unwrap();
    assert_eq!(frames.len(), 2);

    let jsonl_data = b"{\"key\":\"val1\"}\n{\"key\":\"val2\"}\n";
    let j_frames = load_frames(Cursor::new(jsonl_data), InputFormat::Jsonl).unwrap();
    assert_eq!(j_frames.len(), 2);

    let iq_data = vec![0x80u8; 8192];
    let iq_frames = load_frames(Cursor::new(iq_data), InputFormat::Iq).unwrap();
    assert_eq!(iq_frames.len(), 2);
}
