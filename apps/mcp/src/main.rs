//! MCP JSON-RPC 2.0 CLI binary communicating over stdio (`docs/SPEC.md` §5).

use std::{
    io::{self, BufReader},
    sync::Arc,
};

use aerofoil_mcp::McpServer;
use aerofoil_tracker::Tracker;

fn main() -> io::Result<()> {
    eprintln!("[aerofoil-mcp] starting Model Context Protocol stdio server v0.1.0...");

    let tracker = Arc::new(Tracker::new());
    let server = McpServer::new(tracker);

    let stdin = io::stdin();
    let stdout = io::stdout();
    let reader = BufReader::new(stdin.lock());
    let writer = stdout.lock();

    eprintln!("[aerofoil-mcp] listening for JSON-RPC requests on stdin...");
    server.run_stdio(reader, writer)?;
    eprintln!("[aerofoil-mcp] stdin closed, shutting down.");

    Ok(())
}
