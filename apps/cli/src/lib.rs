//! Unix pipeline library for `aerofoil-cli` (`docs/SPEC.md` §5).

pub mod args;
pub mod avr;
pub mod beast;
pub mod capture;
pub mod json;

use std::io::{self, BufRead, BufReader, Read, Write};

use aerofoil_1090::df::ModeSFrame;
use aerofoil_1090::df::es::{EsPayload, VelocityPayload};
use aerofoil_1090::parse_frame_filtered;
use aerofoil_common::{
    AddressType, Position, ReceptionSource, TransponderSource,
    cpr::{RawCpr, decode_cpr_local},
};
use aerofoil_tracker::{TargetUpdate, Tracker};

pub use args::{CaptureArgs, CliArgs, CliCommand, InputFormat, OutputFormat};
pub use avr::{AvrMessage, AvrReader};
pub use beast::{BeastMessage, BeastReader};
pub use capture::{CaptureStats, capture_from_reader, run_capture};
pub use json::TargetJsonRecord;

/// Executes the core Unix pipeline from standard input to standard output.
pub fn run_pipeline(args: &CliArgs) -> io::Result<()> {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut out = stdout.lock();

    let tracker = Tracker::new();
    let mut reader = BufReader::new(stdin.lock());

    let format = match args.format {
        InputFormat::Auto => detect_format(&mut reader)?,
        f => f,
    };

    match format {
        InputFormat::Beast | InputFormat::Auto => {
            let mut beast = BeastReader::new(reader);
            while let Some(msg) = beast.next_message()? {
                process_frame(msg.payload_slice(), &tracker, args, &mut out)?;
            }
        }
        InputFormat::Avr => {
            let mut avr = AvrReader::new(reader);
            while let Some(msg) = avr.next_message()? {
                process_frame(msg.payload_slice(), &tracker, args, &mut out)?;
            }
        }
    }

    Ok(())
}

/// Peeks at the leading bytes of a stream to detect Beast (0x1A) or AVR ('*') format.
pub fn detect_format<R: Read>(reader: &mut BufReader<R>) -> io::Result<InputFormat> {
    let buffer = reader.fill_buf()?;
    for &b in buffer {
        if b == 0x1A {
            return Ok(InputFormat::Beast);
        }
        if b == b'*' {
            return Ok(InputFormat::Avr);
        }
    }
    Ok(InputFormat::Beast)
}

/// Dispatches a single raw Mode S frame into the tracker and emits matching JSON-lines.
pub fn process_frame(
    raw: &[u8],
    tracker: &Tracker,
    args: &CliArgs,
    out: &mut impl Write,
) -> io::Result<()> {
    let Ok((frame, _)) = parse_frame_filtered(raw, tracker) else {
        return Ok(());
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
                    if let Some(raw) = RawCpr::new(pos.cpr_odd, pos.lat_cpr, pos.lon_cpr, 1_000_000)
                        && let Some(ref_pos) = Position::from_microdegrees(52_367_600, 4_904_100)
                        && let Ok(position) = decode_cpr_local(&raw, ref_pos)
                    {
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
            if let Some(a) = df4.altitude {
                u = u.with_altitude(a);
            }
            Some(u)
        }
        ModeSFrame::CommBAltitude(df20) => {
            let mut u = TargetUpdate::new(
                AddressType::Icao,
                df20.dp,
                TransponderSource::ModeS1090,
                ReceptionSource::Direct,
                1_000_000,
            );
            if let Some(a) = df20.altitude {
                u = u.with_altitude(a);
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
            if let Some(s) = df5.squawk {
                u = u.with_squawk(s);
            }
            Some(u)
        }
        ModeSFrame::CommBIdentity(df21) => {
            let mut u = TargetUpdate::new(
                AddressType::Icao,
                df21.dp,
                TransponderSource::ModeS1090,
                ReceptionSource::Direct,
                1_000_000,
            );
            if let Some(s) = df21.squawk {
                u = u.with_squawk(s);
            }
            Some(u)
        }
        _ => None,
    };

    if let Some(u) = update {
        tracker.update(&u);
        if let Some(target) = tracker.get(u.address_type, u.address) {
            let alt_feet = target.altitude.map(|a| a.feet());
            let sq_code = target.squawk.map(|s| s.code());
            if args.matches_altitude(alt_feet) && args.matches_squawk(sq_code) {
                let rec = TargetJsonRecord::from_target(&target);
                let json_line = serde_json::to_string(&rec)
                    .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
                writeln!(out, "{json_line}")?;
            }
        }
    }

    Ok(())
}
