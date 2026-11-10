//! MCP tool registry schemas and definitions.

use serde_json::{Value, json};

/// Generates the list of available MCP tools and their JSON schemas.
#[must_use]
pub fn tool_definitions() -> Value {
    json!([
        {
            "name": "get_airspace_summary",
            "description": "Retrieve high-level statistics and active targets across the monitored airspace.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "min_altitude": {
                        "type": "integer",
                        "description": "Optional minimum altitude in feet"
                    },
                    "max_altitude": {
                        "type": "integer",
                        "description": "Optional maximum altitude in feet"
                    }
                }
            }
        },
        {
            "name": "get_track",
            "description": "Inspect detailed telemetry and flight state for a specific aircraft by 24-bit ICAO address (hex or decimal) or flight callsign.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "address": {
                        "type": "string",
                        "description": "24-bit target address in hex (e.g. '0x4840D6' or '4840D6') or decimal string"
                    },
                    "callsign": {
                        "type": "string",
                        "description": "Flight identification callsign (e.g. 'KLM1023')"
                    }
                }
            }
        },
        {
            "name": "find_closest",
            "description": "Find aircraft targets geographically closest to a given reference point.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "latitude": {
                        "type": "number",
                        "description": "Reference latitude in degrees (-90.0 to 90.0)"
                    },
                    "longitude": {
                        "type": "number",
                        "description": "Reference longitude in degrees (-180.0 to 180.0)"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of aircraft to return (default 5)"
                    }
                },
                "required": ["latitude", "longitude"]
            }
        }
    ])
}
