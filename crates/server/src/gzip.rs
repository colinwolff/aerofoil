//! HTTP gzip content negotiation and fast static payload compression.

use std::{
    borrow::Cow,
    io::{self, Write},
    net::TcpStream,
};

use flate2::{Compression, write::GzEncoder};

/// Minimum uncompressed byte length before gzip compression is applied.
pub const MIN_GZIP_BYTES: usize = 1024;

/// Returns true when `accept_encoding` permits `gzip` without `q=0`.
#[must_use]
pub fn accepts_gzip(accept_encoding: &str) -> bool {
    accept_encoding.split(',').any(|entry| {
        let mut parts = entry.split(';');
        let coding = parts.next().unwrap_or("").trim();
        if !coding.eq_ignore_ascii_case("gzip") {
            return false;
        }
        !parts.any(|param| {
            let p = param.trim().to_ascii_lowercase();
            p == "q=0" || p == "q=0.0" || p == "q=0.00" || p == "q=0.000"
        })
    })
}

/// Returns true for MIME types that benefit from lossless HTTP compression.
#[must_use]
pub fn is_compressible_mime(mime: &str) -> bool {
    mime.starts_with("text/")
        || mime.starts_with("application/javascript")
        || mime.starts_with("application/json")
        || mime.starts_with("image/svg+xml")
}

/// Compresses `bytes` with fast gzip when eligible and smaller than the input.
#[must_use]
pub fn encode_if_gzip<'a>(bytes: &'a [u8], mime: &str, accept_gzip: bool) -> (Cow<'a, [u8]>, bool) {
    if !accept_gzip || bytes.len() < MIN_GZIP_BYTES || !is_compressible_mime(mime) {
        return (Cow::Borrowed(bytes), false);
    }
    let mut encoder = GzEncoder::new(Vec::with_capacity(bytes.len() / 2), Compression::fast());
    if encoder.write_all(bytes).is_ok()
        && let Ok(compressed) = encoder.finish()
        && compressed.len() < bytes.len()
    {
        return (Cow::Owned(compressed), true);
    }
    (Cow::Borrowed(bytes), false)
}

/// Writes an HTTP 200 static asset response, compressing compressible payloads when accepted.
pub fn write_static_response(
    stream: &mut TcpStream,
    mime: &str,
    cache_ctrl: &str,
    bytes: &[u8],
    accept_gzip: bool,
) -> io::Result<()> {
    let (body, is_gzip) = encode_if_gzip(bytes, mime, accept_gzip);
    let encoding_hdr = if is_gzip {
        "Content-Encoding: gzip\r\n"
    } else {
        ""
    };
    let vary_hdr = if is_compressible_mime(mime) {
        "Vary: Accept-Encoding\r\n"
    } else {
        ""
    };
    let header = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: {mime}\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: {cache_ctrl}\r\n{encoding_hdr}{vary_hdr}Content-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(header.as_bytes())?;
    stream.write_all(&body)?;
    stream.flush()
}
