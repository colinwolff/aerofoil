//! Model Context Protocol (MCP) server for aerofoil (`docs/SPEC.md` §5).
//!
//! Exposes JSON-RPC 2.0 tools over stdio for autonomous AI agents:
//! - `get_airspace_summary`: aggregate airspace statistics and active track list
//! - `get_track`: detailed telemetry state by ICAO address or callsign
//! - `find_closest`: nearest aircraft search by coordinates

pub mod geo;
pub mod handler;
pub mod rpc;
pub mod server;
pub mod tools;

pub use geo::{format_target, haversine_nm};
pub use handler::execute_tool;
pub use rpc::{JsonRpcError, JsonRpcRequest, JsonRpcResponse};
pub use server::McpServer;
pub use tools::tool_definitions;
