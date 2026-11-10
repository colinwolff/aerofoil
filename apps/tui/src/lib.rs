//! `aerofoil-tui` — Terminal UI dashboard for aerofoil.
//!
//! Provides a real-time Plan Position Indicator (PPI) radar display with concentric range rings,
//! directional aircraft heading vectors, sortable telemetry tables, and emergency squawk alerts.

pub mod app;
pub mod args;
pub mod client;
pub mod radar;
pub mod table;
pub mod types;
pub mod ui;

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

pub use app::App;
pub use args::TuiArgs;
pub use client::{StreamClient, apply_ws_update, process_raw_beast};
pub use radar::draw_radar;
pub use table::draw_table;
pub use ui::draw_ui;

/// Handles a key event, updating application state accordingly.
pub fn handle_key_event(app: &mut App, key: KeyEvent, total_targets: usize) {
    match key.code {
        KeyCode::Char('q') | KeyCode::Esc => {
            app.should_quit = true;
        }
        KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            app.should_quit = true;
        }
        KeyCode::Char('+') | KeyCode::Char('=') => {
            app.zoom_in();
        }
        KeyCode::Char('-') | KeyCode::Char('_') => {
            app.zoom_out();
        }
        KeyCode::Char('s') => {
            app.cycle_sort();
        }
        KeyCode::Char('d') => {
            app.toggle_sort_direction();
        }
        KeyCode::Char('e') => {
            app.toggle_emergency_filter();
        }
        KeyCode::Down | KeyCode::Char('j') => {
            app.select_next(total_targets);
        }
        KeyCode::Up | KeyCode::Char('k') => {
            app.select_prev(total_targets);
        }
        _ => {}
    }
}
