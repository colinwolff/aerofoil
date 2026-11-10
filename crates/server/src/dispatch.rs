//! Frame dispatching and target state updates for 1090 MHz and 978 MHz streams.

use aerofoil_978::{downlink::parse_state_vector, frame::UatDownlinkFrame};
use aerofoil_1090::{
    ModeSFrame,
    df::es::{EsPayload, velocity::VelocityPayload},
    parse_frame_filtered,
};
use aerofoil_common::{AddressType, Heading, ReceptionSource, TransponderSource};
use aerofoil_tracker::{TargetUpdate, Tracker};

use crate::metrics::IngestMetrics;

/// Dispatches a raw Mode S 1090 MHz frame into the shared tracker.
pub fn dispatch_1090(raw: &[u8], tracker: &Tracker, metrics: &IngestMetrics) {
    metrics.inc_frames(true);
    metrics.add_bytes(true, raw.len() as u64);

    let Ok((frame, _)) = parse_frame_filtered(raw, tracker) else {
        metrics.inc_errors();
        return;
    };

    let update = match frame {
        ModeSFrame::ExtendedSquitter(es) => {
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
                    let speed = vel.payload.ground_speed_knots();
                    let hdg = match vel.payload {
                        VelocityPayload::Airspeed { heading, .. } => heading,
                        VelocityPayload::GroundSpeed { .. } => None,
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
                1_000_000,
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
                1_000_000,
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
        1_000_000,
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
