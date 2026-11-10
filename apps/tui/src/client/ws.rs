//! WebSocket client ingest loop and target deserialization.

use std::{
    io,
    sync::atomic::{AtomicBool, Ordering},
    thread,
    time::Duration,
};

use aerofoil_common::{
    AddressType, Altitude, AltitudeKind, Heading, Position, ReceptionSource, Squawk,
    TransponderSource,
};
use aerofoil_tracker::{TargetUpdate, Tracker};
use serde::Deserialize;
use tungstenite::{Message, connect, stream::MaybeTlsStream};

/// Wire schema for deserializing target updates over WebSocket egress.
#[derive(Debug, Deserialize)]
pub struct WsTargetUpdate {
    pub address: String,
    pub callsign: Option<String>,
    pub altitude: Option<i32>,
    pub ground_speed: Option<u16>,
    pub heading: Option<f64>,
    pub squawk: Option<String>,
    pub lat: Option<f64>,
    pub lon: Option<f64>,
}

pub fn run_ws_loop(url: &str, tracker: &Tracker, shutdown: &AtomicBool) {
    while !shutdown.load(Ordering::Relaxed) {
        if let Ok((mut socket, _)) = connect(url) {
            if let MaybeTlsStream::Plain(s) = socket.get_ref() {
                let _ = s.set_read_timeout(Some(Duration::from_millis(200)));
            }
            while !shutdown.load(Ordering::Relaxed) {
                match socket.read() {
                    Ok(Message::Text(txt)) => {
                        if let Ok(w) = serde_json::from_str::<WsTargetUpdate>(&txt) {
                            apply_ws_update(w, tracker);
                        }
                    }
                    Ok(Message::Ping(data)) => {
                        let _ = socket.send(Message::Pong(data));
                    }
                    Ok(Message::Close(_)) => break,
                    Err(tungstenite::Error::Io(ref e))
                        if e.kind() == io::ErrorKind::WouldBlock
                            || e.kind() == io::ErrorKind::TimedOut =>
                    {
                        continue;
                    }
                    Err(_) => break,
                    _ => {}
                }
            }
        }
        thread::sleep(Duration::from_millis(500));
    }
}

pub fn apply_ws_update(w: WsTargetUpdate, tracker: &Tracker) {
    let Ok(addr) = u32::from_str_radix(&w.address, 16) else {
        return;
    };
    let mut u = TargetUpdate::new(
        AddressType::Icao,
        addr,
        TransponderSource::ModeS1090,
        ReceptionSource::Direct,
        1_000_000,
    );
    if let Some(cs) = w.callsign {
        let mut b = [b' '; 8];
        let bytes = cs.as_bytes();
        b[..bytes.len().min(8)].copy_from_slice(&bytes[..bytes.len().min(8)]);
        u = u.with_callsign(b);
    }
    if let Some(alt) = w
        .altitude
        .and_then(|a| Altitude::new(a, AltitudeKind::Barometric))
    {
        u = u.with_altitude(alt);
    }
    if let (Some(lat), Some(lon)) = (w.lat, w.lon)
        && let Some(pos) =
            Position::from_microdegrees((lat * 1_000_000.0) as i32, (lon * 1_000_000.0) as i32)
    {
        u = u.with_position(pos);
    }
    if let Some(sq) = w.squawk
        && let Ok(v) = u16::from_str_radix(&sq, 8)
        && let Some(s) = Squawk::new(v)
    {
        u = u.with_squawk(s);
    }
    let hdg = w
        .heading
        .and_then(|deg| Heading::from_raw_128ths((deg * 128.0) as u16));
    u = u.with_velocity(w.ground_speed, hdg, None);
    tracker.update(&u);
}
