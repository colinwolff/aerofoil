//! Frame dispatching and target state updates for 1090 MHz and 978 MHz streams.

use aerofoil_978::{downlink::parse_state_vector, frame::UatDownlinkFrame};
use aerofoil_1090::{
    ModeSFrame,
    df::es::{EsPayload, velocity::VelocityPayload},
    parse_frame_filtered,
};
use aerofoil_common::{AddressType, Heading, ReceptionSource, TransponderSource};
use aerofoil_tracker::{TargetUpdate, Tracker};

use crate::{cpr::CprResolver, metrics::IngestMetrics};

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(1_000_000)
}

/// Dispatches a raw Mode S 1090 MHz frame into the shared tracker.
pub fn dispatch_1090(raw: &[u8], tracker: &Tracker, metrics: &IngestMetrics, cpr: &CprResolver) {
    metrics.inc_frames(true);
    metrics.add_bytes(true, raw.len() as u64);

    let Ok((frame, _)) = parse_frame_filtered(raw, tracker) else {
        metrics.inc_errors();
        return;
    };

    let ts_ms = now_ms();
    let update = match frame {
        ModeSFrame::ExtendedSquitter(es) => {
            let mut u = TargetUpdate::new(
                AddressType::Icao,
                es.icao_address,
                TransponderSource::ModeS1090,
                ReceptionSource::Direct,
                ts_ms,
            );
            match es.payload {
                EsPayload::AirbornePosition(pos) => {
                    if let Some(alt) = pos.altitude {
                        u = u.with_altitude(alt);
                    }
                    if let Some(position) = cpr.resolve(
                        es.icao_address,
                        pos.cpr_odd,
                        pos.lat_cpr,
                        pos.lon_cpr,
                        ts_ms,
                    ) {
                        u = u.with_position(position);
                    }
                }
                EsPayload::Identification(id) => {
                    u = u.with_callsign(id.callsign);
                }
                EsPayload::AirborneVelocity(vel) => {
                    let speed = vel.payload.ground_speed_knots();
                    let hdg = match vel.payload {
                        VelocityPayload::Airspeed { heading, .. } => heading,
                        VelocityPayload::GroundSpeed {
                            ew_velocity_knots: Some(ew),
                            ns_velocity_knots: Some(ns),
                            ..
                        } => {
                            let deg = (ew as f64).atan2(ns as f64).to_degrees().rem_euclid(360.0);
                            let raw = ((deg * 128.0).round() as u16) % Heading::UNITS_PER_TURN;
                            Heading::from_raw_128ths(raw)
                        }
                        _ => None,
                    };
                    u = u.with_velocity(speed, hdg, vel.vertical_rate_fpm);
                }
                _ => {}
            }
            Some(u)
        }
        ModeSFrame::AltitudeReply(df4) => {
            let mut u = TargetUpdate::new(
                AddressType::Icao,
                df4.ap,
                TransponderSource::ModeS1090,
                ReceptionSource::Direct,
                ts_ms,
            );
            if let Some(alt) = df4.altitude {
                u = u.with_altitude(alt);
            }
            Some(u)
        }
        ModeSFrame::IdentityReply(df5) => {
            let mut u = TargetUpdate::new(
                AddressType::Icao,
                df5.ap,
                TransponderSource::ModeS1090,
                ReceptionSource::Direct,
                ts_ms,
            );
            if let Some(sq) = df5.squawk {
                u = u.with_squawk(sq);
            }
            Some(u)
        }
        _ => None,
    };

    if let Some(u) = update {
        tracker.update(&u);
    }
}

/// Dispatches a raw UAT 978 MHz frame into the shared tracker.
pub fn dispatch_978(raw: &[u8], tracker: &Tracker, metrics: &IngestMetrics) {
    metrics.inc_frames(false);
    metrics.add_bytes(false, raw.len() as u64);

    if raw.len() != 48 {
        metrics.inc_errors();
        return;
    }
    let mut block = [0u8; 48];
    block.copy_from_slice(raw);

    let Ok(frame) = UatDownlinkFrame::decode_long(&block) else {
        metrics.inc_errors();
        return;
    };

    let payload = frame.payload();
    let sv = parse_state_vector(payload);

    let qualifier = payload[0] & 0x07;
    let address = ((payload[1] as u32) << 16) | ((payload[2] as u32) << 8) | (payload[3] as u32);

    let addr_type = match qualifier {
        0 => AddressType::Icao,
        _ => AddressType::Anonymous,
    };

    let mut u = TargetUpdate::new(
        addr_type,
        address,
        TransponderSource::Uat978,
        ReceptionSource::Direct,
        now_ms(),
    );

    if let Some(pos) = sv.position {
        u = u.with_position(pos);
    }
    if let Some(alt) = sv.altitude {
        u = u.with_altitude(alt);
    }
    if let (Some(spd), Some(track_deg)) = (sv.horizontal_velocity, sv.track_degrees)
        && let Some(hdg) = Heading::from_raw_128ths(track_deg * 128)
    {
        u = u.with_velocity(Some(spd), Some(hdg), None);
    }

    tracker.update(&u);
}
