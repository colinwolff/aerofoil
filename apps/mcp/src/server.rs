//! MCP JSON-RPC 2.0 server handling stdio request-response dispatch.

use std::{
    io::{BufRead, Write},
    sync::Arc,
};

use aerofoil_tracker::Tracker;
use serde_json::json;

use crate::{
    handler::execute_tool,
    rpc::{JsonRpcError, JsonRpcRequest, JsonRpcResponse},
    tools::tool_definitions,
};

/// MCP stdio server holding the shared airspace tracker.
#[derive(Debug)]
pub struct McpServer {
    tracker: Arc<Tracker>,
}

impl McpServer {
    /// Creates a new MCP server wrapping the shared tracker.
    #[must_use]
    pub fn new(tracker: Arc<Tracker>) -> Self {
        Self { tracker }
    }

    /// Dispatches an incoming JSON-RPC line and returns the response string if applicable.
    #[must_use]
    pub fn dispatch_line(&self, line: &str) -> Option<String> {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            return None;
        }

        let req: JsonRpcRequest = match serde_json::from_str(trimmed) {
            Ok(r) => r,
            Err(e) => {
                let err = JsonRpcResponse::error(
                    None,
                    JsonRpcError::invalid_params(format!("JSON parse error: {e}")),
                );
                return serde_json::to_string(&err).ok();
            }
        };

        // Notifications carry no ID and require no response
        if req.id.is_none() && req.method.starts_with("notifications/") {
            return None;
        }

        let resp = match req.method.as_str() {
            "initialize" => JsonRpcResponse::success(
                req.id,
                json!({
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "tools": {}
                    },
                    "serverInfo": {
                        "name": "aerofoil-mcp",
                        "version": "0.1.0"
                    }
                }),
            ),
            "ping" => JsonRpcResponse::success(req.id, json!({})),
            "tools/list" => JsonRpcResponse::success(
                req.id,
                json!({
                    "tools": tool_definitions()
                }),
            ),
            "tools/call" => {
                let params = req.params.unwrap_or_else(|| json!({}));
                let name = params.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let empty_args = json!({});
                let args = params.get("arguments").unwrap_or(&empty_args);

                match execute_tool(&self.tracker, name, args) {
                    Ok(val) => {
                        let text = serde_json::to_string_pretty(&val).unwrap_or_default();
                        JsonRpcResponse::success(
                            req.id,
                            json!({
                                "content": [
                                    {
                                        "type": "text",
                                        "text": text
                                    }
                                ],
                                "isError": false
                            }),
                        )
                    }
                    Err(err_msg) => JsonRpcResponse::success(
                        req.id,
                        json!({
                            "content": [
                                {
                                    "type": "text",
                                    "text": err_msg
                                }
                            ],
                            "isError": true
                        }),
                    ),
                }
            }
            unknown => JsonRpcResponse::error(req.id, JsonRpcError::method_not_found(unknown)),
        };

        serde_json::to_string(&resp).ok()
    }

    /// Runs the stdio message loop until EOF.
    ///
    /// # Errors
    /// Returns I/O error if reading stdin or writing stdout fails.
    pub fn run_stdio<R: BufRead, W: Write>(
        &self,
        mut reader: R,
        mut writer: W,
    ) -> std::io::Result<()> {
        let mut line = String::new();
        while reader.read_line(&mut line)? > 0 {
            if let Some(resp) = self.dispatch_line(&line) {
                writeln!(writer, "{resp}")?;
                writer.flush()?;
            }
            line.clear();
        }
        Ok(())
    }
}
