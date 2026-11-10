//! Tool invocation handler executing tool calls against the aircraft tracker.

use aerofoil_common::TransponderSource;
use aerofoil_tracker::Tracker;
use serde_json::{Value, json};

use crate::geo::{format_target, haversine_nm};

/// Dispatches a tool invocation by name with provided arguments.
///
/// # Errors
/// Returns an error string if arguments are invalid or tool is unknown.
pub fn execute_tool(tracker: &Tracker, name: &str, args: &Value) -> Result<Value, String> {
    match name {
        "get_airspace_summary" => handle_airspace_summary(tracker, args),
        "get_track" => handle_get_track(tracker, args),
        "find_closest" => handle_find_closest(tracker, args),
        unknown => Err(format!("Unknown tool '{unknown}'")),
    }
}

fn handle_airspace_summary(tracker: &Tracker, args: &Value) -> Result<Value, String> {
    let min_alt = args
        .get("min_altitude")
        .and_then(|v| v.as_i64())
        .map(|a| a as i32);
    let max_alt = args
        .get("max_altitude")
        .and_then(|v| v.as_i64())
        .map(|a| a as i32);

    let targets = tracker.snapshot();
    let mut count_1090 = 0;
    let mut count_978 = 0;
    let mut emergencies = 0;
    let mut filtered_targets = Vec::new();

    for t in &targets {
        if let Some(min) = min_alt
            && let Some(alt) = t.altitude
            && alt.feet() < min
        {
            continue;
        }
        if let Some(max) = max_alt
            && let Some(alt) = t.altitude
            && alt.feet() > max
        {
            continue;
        }

        match t.source {
            TransponderSource::ModeS1090 => count_1090 += 1,
            TransponderSource::Uat978 => count_978 += 1,
        }

        if let Some(sq) = t.squawk {
            let code = sq.code();
            if code == 0o7500 || code == 0o7600 || code == 0o7700 {
                emergencies += 1;
            }
        }

        filtered_targets.push(format_target(t));
    }

    Ok(json!({
        "total_tracks": targets.len(),
        "filtered_tracks": filtered_targets.len(),
        "source_1090es": count_1090,
        "source_uat978": count_978,
        "emergencies": emergencies,
        "tracks": filtered_targets,
    }))
}

fn handle_get_track(tracker: &Tracker, args: &Value) -> Result<Value, String> {
    let targets = tracker.snapshot();

    // Check address argument first
    if let Some(addr_val) = args.get("address") {
        let target_addr = if let Some(n) = addr_val.as_u64() {
            Some(n as u32)
        } else if let Some(s) = addr_val.as_str() {
            let clean = s.trim();
            if clean.starts_with("0x") || clean.starts_with("0X") {
                u32::from_str_radix(&clean[2..], 16).ok()
            } else if clean.chars().all(|c| c.is_ascii_hexdigit()) && clean.len() <= 6 {
                u32::from_str_radix(clean, 16).ok()
            } else {
                clean.parse::<u32>().ok()
            }
        } else {
            None
        };

        if let Some(addr) = target_addr {
            if let Some(target) = targets.iter().find(|t| t.address == addr) {
                return Ok(format_target(target));
            }
            return Err(format!("Track with address 0x{addr:06X} not found"));
        }
    }

    // Check callsign argument
    if let Some(cs) = args.get("callsign").and_then(|v| v.as_str()) {
        let needle = cs.trim().to_ascii_uppercase();
        for t in &targets {
            if let Some(c) = t.callsign
                && let Ok(s) = core::str::from_utf8(&c)
                && s.trim().eq_ignore_ascii_case(&needle)
            {
                return Ok(format_target(t));
            }
        }
        return Err(format!("Track with callsign '{needle}' not found"));
    }

    Err("Either 'address' or 'callsign' must be provided".to_string())
}

fn handle_find_closest(tracker: &Tracker, args: &Value) -> Result<Value, String> {
    let lat = args
        .get("latitude")
        .and_then(|v| v.as_f64())
        .ok_or_else(|| "Missing required parameter 'latitude'".to_string())?;
    let lon = args
        .get("longitude")
        .and_then(|v| v.as_f64())
        .ok_or_else(|| "Missing required parameter 'longitude'".to_string())?;
    let limit = args
        .get("limit")
        .and_then(|v| v.as_u64())
        .map_or(5, |l| l as usize);

    let targets = tracker.snapshot();
    let mut scored: Vec<(f64, Value)> = Vec::new();

    for t in &targets {
        if let Some(pos) = t.position {
            let (t_lat, t_lon) = pos.to_f64();
            let dist = haversine_nm(lat, lon, t_lat, t_lon);
            let mut formatted = format_target(t);
            if let Some(obj) = formatted.as_object_mut() {
                obj.insert(
                    "distance_nm".to_string(),
                    json!((dist * 10.0).round() / 10.0),
                );
            }
            scored.push((dist, formatted));
        }
    }

    scored.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(core::cmp::Ordering::Equal));
    let results: Vec<Value> = scored.into_iter().take(limit).map(|(_, v)| v).collect();

    Ok(json!({
        "reference_latitude": lat,
        "reference_longitude": lon,
        "count": results.len(),
        "closest_tracks": results,
    }))
}
