//! Direct Beast TCP stream ingest loop and frame decoding.

use std::{
    io::{self, Read},
    net::TcpStream,
    sync::atomic::{AtomicBool, Ordering},
    thread,
    time::Duration,
};

use aerofoil_978::{downlink::parse_state_vector, frame::UatDownlinkFrame};
use aerofoil_1090::{
    ModeSFrame,
    df::es::{EsPayload, velocity::VelocityPayload},
    parse_frame_filtered,
};
use aerofoil_common::{AddressType, ReceptionSource, TransponderSource};
use aerofoil_tracker::{TargetUpdate, Tracker};

pub fn run_beast_loop(
    host: &str,
    port: u16,
    tracker: &Tracker,
    shutdown: &AtomicBool,
    is_1090: bool,
) {
    while !shutdown.load(Ordering::Relaxed) {
        if let Ok(mut stream) = TcpStream::connect((host, port)) {
            let _ = stream.set_read_timeout(Some(Duration::from_millis(200)));
            let mut buf = [0u8; 1024];
            while !shutdown.load(Ordering::Relaxed) {
                match stream.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => process_raw_beast(&buf[..n], tracker, is_1090),
                    Err(ref e)
                        if e.kind() == io::ErrorKind::WouldBlock
                            || e.kind() == io::ErrorKind::TimedOut =>
                    {
                        continue;
                    }
                    Err(_) => break,
                }
            }
        }
        thread::sleep(Duration::from_millis(500));
    }
}

pub fn process_raw_beast(bytes: &[u8], tracker: &Tracker, is_1090: bool) {
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] != 0x1A {
            i += 1;
            continue;
        }
        if i + 1 >= bytes.len() {
            break;
        }
        let msg_type = bytes[i + 1];
        let payload_len = match msg_type {
            0x32 => 7,
            0x33 => 14,
            0x34 => 48,
            _ => {
                i += 2;
                continue;
            }
        };
        let mut unescaped = Vec::with_capacity(7 + payload_len);
        let mut idx = i + 2;
        while idx < bytes.len() && unescaped.len() < 7 + payload_len {
            let b = bytes[idx];
            idx += 1;
            if b == 0x1A && idx < bytes.len() && bytes[idx] == 0x1A {
                idx += 1;
            }
            unescaped.push(b);
        }
        if unescaped.len() == 7 + payload_len {
            let payload = &unescaped[7..];
            if is_1090 && payload.len() == 14 {
                if let Ok((ModeSFrame::ExtendedSquitter(es), _)) =
                    parse_frame_filtered(payload, tracker)
                {
                    dispatch_es(es, tracker);
                }
            } else if !is_1090 && payload.len() == 48 {
                let mut b = [0u8; 48];
                b.copy_from_slice(payload);
                if let Ok(frame) = UatDownlinkFrame::decode_long(&b) {
                    dispatch_uat(&frame, tracker);
                }
            }
        }
        i = idx;
    }
}

fn dispatch_es(es: aerofoil_1090::df::ExtendedSquitter, tracker: &Tracker) {
    let mut u = TargetUpdate::new(
        AddressType::Icao,
        es.icao_address,
        TransponderSource::ModeS1090,
        ReceptionSource::Direct,
        1_000_000,
    );
    match es.payload {
        EsPayload::AirbornePosition(pos) => {
            if let Some(alt) = pos.altitude {
                u = u.with_altitude(alt);
            }
        }
        EsPayload::Identification(id) => {
            u = u.with_callsign(id.callsign);
        }
        EsPayload::AirborneVelocity(vel) => {
            let spd = vel.payload.ground_speed_knots();
            let hdg = match vel.payload {
                VelocityPayload::Airspeed { heading, .. } => heading,
                VelocityPayload::GroundSpeed { .. } => None,
            };
            u = u.with_velocity(spd, hdg, vel.vertical_rate_fpm);
        }
        _ => {}
    }
    tracker.update(&u);
}

fn dispatch_uat(frame: &UatDownlinkFrame, tracker: &Tracker) {
    let addr = frame.address();
    let payload = frame.payload();
    let sv = parse_state_vector(payload);
    let mut u = TargetUpdate::new(
        AddressType::Icao,
        addr,
        TransponderSource::Uat978,
        ReceptionSource::Direct,
        1_000_000,
    );
    if let Some(pos) = sv.position {
        u = u.with_position(pos);
    }
    if let Some(alt) = sv.altitude {
        u = u.with_altitude(alt);
    }
    tracker.update(&u);
}
