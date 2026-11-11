//! Entry point for `aerofoil-cli`.

use std::io;
use std::process::ExitCode;

use aerofoil_cli::{CliArgs, CliCommand, run_capture, run_pipeline};
use clap::Parser;

fn main() -> ExitCode {
    let args = CliArgs::parse();

    if let Some(CliCommand::Capture(ref cap)) = args.command {
        match run_capture(cap) {
            Ok(stats) => {
                eprintln!(
                    "aerofoil-cli: captured {} bytes ({} frames) in {:.2}s",
                    stats.bytes_captured,
                    stats.frames_captured,
                    stats.elapsed.as_secs_f64()
                );
                return ExitCode::SUCCESS;
            }
            Err(e) => {
                eprintln!("aerofoil-cli: capture error: {e}");
                return ExitCode::FAILURE;
            }
        }
    }

    if let Err(e) = run_pipeline(&args) {
        if e.kind() == io::ErrorKind::BrokenPipe {
            return ExitCode::SUCCESS;
        }
        eprintln!("aerofoil-cli: error: {e}");
        return ExitCode::FAILURE;
    }
    ExitCode::SUCCESS
}
