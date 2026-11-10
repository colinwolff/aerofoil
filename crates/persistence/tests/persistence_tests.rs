//! Unit and integration tests for `aerofoil-persistence`.

use std::{
    io::Cursor,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::Duration,
};

use aerofoil_common::TransponderSource;
use aerofoil_persistence::{
    HexError, JsonlRecordSink, RecordSink, RecordedFrame, ReplayError, ReplayReader, RfBand,
};

#[derive(Clone, Default)]
struct SharedBuffer(Arc<Mutex<Vec<u8>>>);

impl std::io::Write for SharedBuffer {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let Ok(mut guard) = self.0.lock() else {
            return Err(std::io::Error::other("poisoned"));
        };
        guard.write(buf)
    }

    fn flush(&mut self) -> std::io::Result<()> {
        let Ok(mut guard) = self.0.lock() else {
            return Err(std::io::Error::other("poisoned"));
        };
        guard.flush()
    }
}

#[test]
fn test_frame_hex_encoding_and_decoding() {
    let payload = [0x8D, 0x48, 0x40, 0xD6, 0x20, 0x2C, 0xC3];
    let frame = RecordedFrame::new(RfBand::Band1090, "dongle-0", 1_700_000_000, &payload);

    assert_eq!(frame.payload_hex, "8D4840D6202CC3");
    assert_eq!(frame.transponder_source(), TransponderSource::ModeS1090);

    let decoded = frame.decode_payload();
    assert_eq!(decoded.as_deref(), Ok(&payload[..]));

    let odd_frame = RecordedFrame {
        band: RfBand::Band978,
        source: "s".into(),
        timestamp_ms: 0,
        payload_hex: "ABC".into(),
    };
    assert_eq!(odd_frame.decode_payload(), Err(HexError::OddLength));

    let invalid_frame = RecordedFrame {
        band: RfBand::Band1090,
        source: "s".into(),
        timestamp_ms: 0,
        payload_hex: "ABCG".into(),
    };
    assert_eq!(
        invalid_frame.decode_payload(),
        Err(HexError::InvalidChar('G'))
    );
}

#[test]
fn test_frame_serde_roundtrip() {
    let frame = RecordedFrame::new(TransponderSource::Uat978, "ant-1", 1_234_567, &[0xAA, 0x55]);
    let Ok(json) = serde_json::to_string(&frame) else {
        panic!("serialization failed");
    };
    let Ok(parsed) = serde_json::from_str::<RecordedFrame>(&json) else {
        panic!("deserialization failed");
    };
    assert_eq!(frame, parsed);
}

#[test]
fn test_jsonl_sink_and_replay_roundtrip() {
    let buf = SharedBuffer::default();
    let sink = JsonlRecordSink::new(buf.clone());

    let f1 = RecordedFrame::new(RfBand::Band1090, "d0", 100, &[0x11, 0x22]);
    let f2 = RecordedFrame::new(RfBand::Band978, "d1", 200, &[0x33, 0x44]);

    assert!(sink.record(f1.clone()).is_ok());
    assert!(sink.record(f2.clone()).is_ok());
    assert!(sink.flush().is_ok());

    assert_eq!(sink.recorded(), 2);
    assert_eq!(sink.drops(), 0);

    let Ok(guard) = buf.0.lock() else {
        panic!("lock failed");
    };
    let reader = Cursor::new(guard.clone());
    let mut replay = ReplayReader::new(reader);

    assert_eq!(replay.next().and_then(Result::ok), Some(f1));
    assert_eq!(replay.next().and_then(Result::ok), Some(f2));
    assert!(replay.next().is_none());
}

#[test]
fn test_drop_oldest_under_queue_saturation() {
    // A writer that can be intentionally blocked to force queue saturation
    #[derive(Clone)]
    struct BlockableWriter {
        data: Arc<Mutex<Vec<u8>>>,
        blocked: Arc<AtomicBool>,
    }
    impl std::io::Write for BlockableWriter {
        fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
            while self.blocked.load(Ordering::Relaxed) {
                thread::sleep(Duration::from_millis(5));
            }
            let Ok(mut g) = self.data.lock() else {
                return Err(std::io::Error::other("poisoned"));
            };
            g.write(buf)
        }
        fn flush(&mut self) -> std::io::Result<()> {
            let Ok(mut g) = self.data.lock() else {
                return Err(std::io::Error::other("poisoned"));
            };
            g.flush()
        }
    }

    let shared_data = Arc::new(Mutex::new(Vec::new()));
    let blocked_flag = Arc::new(AtomicBool::new(true));
    let writer = BlockableWriter {
        data: Arc::clone(&shared_data),
        blocked: Arc::clone(&blocked_flag),
    };

    // Capacity 3
    let sink = JsonlRecordSink::with_capacity(writer, 3);

    for i in 1..=8 {
        let f = RecordedFrame::new(RfBand::Band1090, "d", i, &[i as u8]);
        assert!(sink.record(f).is_ok());
    }

    // Unblock writer and flush
    blocked_flag.store(false, Ordering::Relaxed);
    assert!(sink.flush().is_ok());

    let drops = sink.drops();
    let rec = sink.recorded();
    assert_eq!(drops + rec, 8);
    assert!(drops >= 4);

    let Ok(guard) = shared_data.lock() else {
        panic!("lock failed");
    };
    let reader = Cursor::new(guard.clone());
    let items: Vec<RecordedFrame> = ReplayReader::new(reader).filter_map(Result::ok).collect();
    assert_eq!(items.len(), rec as usize);
    // The last frame recorded must always be the newest frame 8
    assert_eq!(items.last().map(|f| f.timestamp_ms), Some(8));
}

#[test]
fn test_replay_malformed_json_error() {
    let bad_data = "{\"band\":\"1090\"}\nnot valid json\n{\"band\":\"978\"}\n";
    let reader = Cursor::new(bad_data);
    let mut replay = ReplayReader::new(reader);

    // Line 1 fails missing fields
    match replay.next() {
        Some(Err(ReplayError::Json { line, .. })) => assert_eq!(line, 1),
        _ => panic!("expected Json error on line 1"),
    }

    // Line 2 fails syntax
    match replay.next() {
        Some(Err(ReplayError::Json { line, .. })) => assert_eq!(line, 2),
        _ => panic!("expected Json error on line 2"),
    }
}
