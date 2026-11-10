//! Integration tests for `aerofoil-mcp` JSON-RPC framing and lifecycle.

use std::{io::Cursor, sync::Arc};

use aerofoil_mcp::McpServer;
use aerofoil_tracker::Tracker;
use serde_json::Value;

fn parse_json(raw: &str) -> Value {
    let Ok(v) = serde_json::from_str(raw) else {
        panic!("failed to parse json");
    };
    v
}

#[test]
fn test_mcp_initialize_and_tools_list() {
    let tracker = Arc::new(Tracker::new());
    let server = McpServer::new(tracker);

    // Initialize request
    let init_req = r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#;
    let resp = server.dispatch_line(init_req);
    assert!(resp.is_some());
    let val = parse_json(&resp.unwrap_or_default());
    assert_eq!(val["id"], 1);
    assert_eq!(val["result"]["serverInfo"]["name"], "aerofoil-mcp");

    // tools/list request
    let list_req = r#"{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}"#;
    let resp = server.dispatch_line(list_req);
    assert!(resp.is_some());
    let val = parse_json(&resp.unwrap_or_default());
    assert_eq!(val["id"], 2);
    let Some(tools) = val["result"]["tools"].as_array() else {
        panic!("expected tools array");
    };
    assert_eq!(tools.len(), 3);
    let tool_names: Vec<&str> = tools.iter().filter_map(|t| t["name"].as_str()).collect();
    assert!(tool_names.contains(&"get_airspace_summary"));
    assert!(tool_names.contains(&"get_track"));
    assert!(tool_names.contains(&"find_closest"));
}

#[test]
fn test_mcp_run_stdio_stream() {
    let tracker = Arc::new(Tracker::new());
    let server = McpServer::new(tracker);

    let input = "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\",\"params\":{}}\n";
    let reader = Cursor::new(input.as_bytes());
    let mut writer = Vec::new();

    let res = server.run_stdio(reader, &mut writer);
    assert!(res.is_ok());

    let Ok(output) = String::from_utf8(writer) else {
        panic!("expected utf8 output");
    };
    assert!(output.contains("\"jsonrpc\":\"2.0\""));
    assert!(output.contains("\"id\":1"));
}
