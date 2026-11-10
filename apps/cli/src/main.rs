//! Entry point for `aerofoil-cli`.

use aerofoil_cli::{CliArgs, run_pipeline};
use clap::Parser;
use std::io;
use std::process::ExitCode;

fn main() -> ExitCode {
    let args = CliArgs::parse();
    if let Err(e) = run_pipeline(&args) {
        if e.kind() == io::ErrorKind::BrokenPipe {
            return ExitCode::SUCCESS;
        }
        eprintln!("aerofoil-cli: error: {e}");
        return ExitCode::FAILURE;
    }
    ExitCode::SUCCESS
}
