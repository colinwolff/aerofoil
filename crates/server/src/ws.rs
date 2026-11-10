//! WebSocket egress streaming handler (`docs/SPEC.md` §5).

use std::{
    io,
    net::TcpStream,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::Duration,
};

use aerofoil_tracker::Tracker;
use tungstenite::{Message, accept};

use crate::json::TargetWireJson;

/// Upgrades an established TCP stream to WebSocket and streams target states.
pub fn handle_ws_client(
    stream: TcpStream,
    tracker: Arc<Tracker>,
    shutdown: Arc<AtomicBool>,
) -> io::Result<()> {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let _ = stream.set_nonblocking(false);
    let Ok(mut ws) = accept(stream) else {
        return Ok(());
    };

    let mut min_alt: Option<i32> = None;
    let _ = ws
        .get_mut()
        .set_read_timeout(Some(Duration::from_millis(50)));

    while !shutdown.load(Ordering::Relaxed) {
        match ws.read() {
            Ok(Message::Text(txt)) => {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&txt)
                    && let Some(alt) = val.get("min_alt").and_then(|v| v.as_i64())
                {
                    min_alt = Some(alt as i32);
                }
            }
            Ok(Message::Ping(data)) => {
                if ws.send(Message::Pong(data)).is_err() {
                    return Ok(());
                }
            }
            Ok(Message::Close(_)) => return Ok(()),
            Err(tungstenite::Error::Io(ref e))
                if e.kind() == io::ErrorKind::WouldBlock || e.kind() == io::ErrorKind::TimedOut =>
            {
                // Normal read timeout, continue to broadcast
            }
            Err(_) => return Ok(()),
            _ => {}
        }

        let targets = tracker.snapshot();
        for target in &targets {
            if let Some(min) = min_alt {
                if let Some(a) = target.altitude {
                    if a.feet() < min {
                        continue;
                    }
                } else {
                    continue;
                }
            }

            let wire = TargetWireJson::from_target(target);
            let Ok(json) = serde_json::to_string(&wire) else {
                continue;
            };

            if ws.send(Message::Text(json.into())).is_err() {
                return Ok(());
            }
        }

        thread::sleep(Duration::from_millis(100));
    }

    Ok(())
}
