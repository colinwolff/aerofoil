//! Server-Sent Events (SSE) egress handler (`docs/SPEC.md` §5).

use std::{
    collections::HashMap,
    io::{self, Write},
    net::TcpStream,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::Duration,
};

use aerofoil_tracker::Tracker;

use crate::json::TargetWireJson;

/// Streams target updates to an HTTP client using Server-Sent Events.
pub fn handle_sse_stream(
    mut stream: TcpStream,
    tracker: Arc<Tracker>,
    shutdown: Arc<AtomicBool>,
    mut event_id: u64,
) -> io::Result<()> {
    let _ = stream.set_write_timeout(Some(Duration::from_millis(500)));
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));

    let headers = b"HTTP/1.1 200 OK\r\n\
Content-Type: text/event-stream\r\n\
Cache-Control: no-cache\r\n\
Connection: keep-alive\r\n\
Access-Control-Allow-Origin: *\r\n\r\n";

    stream.write_all(headers)?;
    stream.flush()?;

    let mut keepalive_timer = 0;
    let mut last_sent: HashMap<u64, u64> = HashMap::new();

    while !shutdown.load(Ordering::Relaxed) {
        let targets = tracker.snapshot();
        let mut sent_any = false;

        for target in &targets {
            let key = ((target.address_type as u64) << 32) | (target.address as u64);
            if last_sent.get(&key).copied() == Some(target.last_seen_ms) {
                continue;
            }
            last_sent.insert(key, target.last_seen_ms);

            let wire = TargetWireJson::from_target(target);
            let Ok(json) = serde_json::to_string(&wire) else {
                continue;
            };

            event_id += 1;
            let payload = format!("id: {event_id}\nevent: target\ndata: {json}\n\n");
            if stream.write_all(payload.as_bytes()).is_err() {
                return Ok(());
            }
            sent_any = true;
        }

        if sent_any {
            if stream.flush().is_err() {
                return Ok(());
            }
            keepalive_timer = 0;
        } else {
            keepalive_timer += 1;
            // Send periodic keepalive comment every ~5 seconds (50 * 100ms)
            if keepalive_timer >= 50 {
                if stream.write_all(b": keepalive\n\n").is_err() || stream.flush().is_err() {
                    return Ok(());
                }
                keepalive_timer = 0;
            }
        }

        thread::sleep(Duration::from_millis(100));
    }

    Ok(())
}
