//! JSON-RPC 2.0 protocol structures for Model Context Protocol (MCP).

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Standard JSON-RPC 2.0 request frame.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    /// Must be exactly `"2.0"`.
    #[serde(default = "default_jsonrpc")]
    pub jsonrpc: String,
    /// Request identifier (null for notifications).
    pub id: Option<Value>,
    /// Remote procedure name.
    pub method: String,
    /// Method parameters.
    pub params: Option<Value>,
}

fn default_jsonrpc() -> String {
    "2.0".to_string()
}

/// Standard JSON-RPC 2.0 response frame.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcResponse {
    /// Must be exactly `"2.0"`.
    pub jsonrpc: String,
    /// Request identifier matching client frame.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<Value>,
    /// Successful invocation payload.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    /// Error description if invocation failed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
}

impl JsonRpcResponse {
    /// Creates a successful response.
    #[must_use]
    pub fn success(id: Option<Value>, result: Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            result: Some(result),
            error: None,
        }
    }

    /// Creates an error response.
    #[must_use]
    pub fn error(id: Option<Value>, error: JsonRpcError) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            result: None,
            error: Some(error),
        }
    }
}

/// JSON-RPC 2.0 error descriptor.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcError {
    /// Standard or application error code.
    pub code: i32,
    /// Human-readable error description.
    pub message: String,
    /// Structured diagnostic data.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

impl JsonRpcError {
    /// Creates a method not found error (-32601).
    #[must_use]
    pub fn method_not_found(method: &str) -> Self {
        Self {
            code: -32601,
            message: format!("Method '{method}' not found"),
            data: None,
        }
    }

    /// Creates an invalid params error (-32602).
    #[must_use]
    pub fn invalid_params(msg: impl Into<String>) -> Self {
        Self {
            code: -32602,
            message: msg.into(),
            data: None,
        }
    }

    /// Creates an internal server error (-32603).
    #[must_use]
    pub fn internal(msg: impl Into<String>) -> Self {
        Self {
            code: -32603,
            message: msg.into(),
            data: None,
        }
    }
}
