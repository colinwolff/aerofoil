//! Static web asset serving for aerofoil-server.
//! Provides unified single-binary hosting for apps/web and /health probes.

use std::{
    fs,
    io::{self, Write},
    net::TcpStream,
    path::{Path, PathBuf},
};

use aerofoil_tracker::Tracker;

/// Resolves the MIME type for an HTTP static asset by file extension.
#[must_use]
pub fn mime_type_for_path(path: &str) -> &'static str {
    if path.ends_with(".html") || path.ends_with('/') || path.is_empty() {
        "text/html; charset=utf-8"
    } else if path.ends_with(".js") || path.ends_with(".mjs") {
        "application/javascript; charset=utf-8"
    } else if path.ends_with(".css") {
        "text/css; charset=utf-8"
    } else if path.ends_with(".json") || path.ends_with(".topojson") {
        "application/json; charset=utf-8"
    } else if path.ends_with(".svg") {
        "image/svg+xml"
    } else if path.ends_with(".png") {
        "image/png"
    } else if path.ends_with(".ico") {
        "image/x-icon"
    } else {
        "application/octet-stream"
    }
}

/// Locates the production web root directory across development and container layouts.
#[must_use]
pub fn find_web_root(custom_dir: Option<&str>) -> Option<PathBuf> {
    if let Some(dir) = custom_dir {
        let p = PathBuf::from(dir);
        if p.is_dir() {
            return Some(p);
        }
    }

    if let Ok(env_dir) = std::env::var("AEROFOIL_WEB_DIR") {
        let p = PathBuf::from(env_dir);
        if p.is_dir() {
            return Some(p);
        }
    }

    let candidates = [
        "apps/web/dist",
        "dist",
        "/app/web",
        "../../apps/web/dist",
        "apps/web",
    ];

    for candidate in candidates {
        let p = PathBuf::from(candidate);
        if p.is_dir() && (p.join("index.html").exists() || p.join("src").exists()) {
            return Some(p);
        }
    }

    None
}

/// Attempts to serve a static asset file from the web root directory.
#[must_use]
pub fn read_static_file(web_root: &Path, request_path: &str) -> Option<(Vec<u8>, &'static str)> {
    let clean_path = request_path.trim_start_matches('/');
    let target = if clean_path.is_empty() {
        web_root.join("index.html")
    } else {
        web_root.join(clean_path)
    };

    if target.is_file() {
        let mime = mime_type_for_path(target.to_str().unwrap_or(""));
        let bytes = fs::read(&target).ok()?;
        return Some((bytes, mime));
    }

    None
}

/// Handles HTTP GET requests for static assets, /health probes, and SPA fallbacks.
pub fn serve_http_response(
    mut stream: TcpStream,
    tracker: &Tracker,
    request_line: &str,
) -> io::Result<()> {
    if request_line.starts_with("OPTIONS ") {
        let resp = b"HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nConnection: close\r\n\r\n";
        stream.write_all(resp)?;
        return stream.flush();
    }

    if request_line.starts_with("GET /health") {
        let count = tracker.len();
        let body = format!("{{\"status\":\"ok\",\"tracks\":{count}}}\n");
        let resp = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-store\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        stream.write_all(resp.as_bytes())?;
        return stream.flush();
    }

    if request_line.starts_with("GET /api/config") {
        let body = crate::config::ServerWebConfig::from_env().to_json();
        let resp = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-store\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        stream.write_all(resp.as_bytes())?;
        return stream.flush();
    }

    if request_line.starts_with("GET ") {
        let req_path = request_line
            .split_whitespace()
            .nth(1)
            .unwrap_or("/")
            .split('?')
            .next()
            .unwrap_or("/");

        if let Some(web_root) = find_web_root(None)
            && let Some((bytes, mime)) = read_static_file(&web_root, req_path)
        {
            let cache_ctrl = if req_path.starts_with("/assets/") {
                "public, max-age=31536000, immutable"
            } else if req_path.ends_with(".topojson") || req_path.ends_with(".json") {
                "public, max-age=86400"
            } else {
                "no-cache"
            };
            let header = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: {mime}\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: {cache_ctrl}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                bytes.len()
            );
            stream.write_all(header.as_bytes())?;
            stream.write_all(&bytes)?;
            return stream.flush();
        }

        if req_path == "/" || req_path == "/index.html" {
            let body = embedded_fallback_html(tracker.len());
            let header = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(header.as_bytes())?;
            return stream.flush();
        }
    }

    let resp = b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
    stream.write_all(resp)?;
    stream.flush()
}

/// Embedded fallback single-page dashboard when no disk web assets are found.
#[must_use]
pub fn embedded_fallback_html(track_count: usize) -> String {
    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>aerofoil surveillance daemon</title>
  <style>
    body {{ background: #0a0e14; color: #e2e8f0; font-family: monospace; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }}
    .card {{ background: #111822; border: 1px solid #1e293b; padding: 2rem; border-radius: 8px; text-align: center; max-width: 480px; }}
    h1 {{ color: #38bdf8; font-size: 1.25rem; margin-top: 0; }}
    .badge {{ background: #0369a1; color: #fff; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; }}
    a {{ color: #0ea5e9; text-decoration: none; }}
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">AEROFOIL SERVER</span>
    <h1>Live Surveillance Streaming Daemon</h1>
    <p>Active Tracks: <b>{track_count}</b></p>
    <p>Streaming Endpoints:<br/>
      <code>GET /ws</code> — WebSocket Wire Protocol<br/>
      <code>GET /events</code> — Server-Sent Events (SSE)<br/>
      <code>GET /health</code> — Liveness & Readiness JSON
    </p>
  </div>
</body>
</html>"#
    )
}
