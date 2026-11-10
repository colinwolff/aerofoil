//! Terminal user interface layout and top-level rendering dispatcher.

use ratatui::{
    Frame,
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph},
};

use crate::{app::App, radar::draw_radar, table::draw_table};

/// Renders the complete dashboard interface onto the frame.
pub fn draw_ui(frame: &mut Frame<'_>, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3), // Header & status
            Constraint::Min(10),   // Main radar & table
            Constraint::Length(3), // Footer / keybindings
        ])
        .split(frame.area());

    let targets = app.filtered_targets();

    draw_header(frame, chunks[0], app, &targets);
    draw_main(frame, chunks[1], app, &targets);
    draw_footer(frame, chunks[2], app);
}

fn draw_header(
    frame: &mut Frame<'_>,
    area: Rect,
    app: &App,
    targets: &[aerofoil_common::AircraftTarget],
) {
    let total_tracks = app.tracker.len();
    let emergency_count = targets
        .iter()
        .filter(|t| crate::app::is_emergency_squawk(t.squawk))
        .count();

    let alert_span = if emergency_count > 0 {
        Span::styled(
            format!(" [EMERGENCY ALERTS: {emergency_count}] "),
            Style::default()
                .bg(Color::Red)
                .fg(Color::White)
                .add_modifier(Modifier::BOLD),
        )
    } else {
        Span::styled(" [ALL NOMINAL] ", Style::default().fg(Color::Green))
    };

    let title_line = Line::from(vec![
        Span::styled(
            "AEROFOIL RADAR ",
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
        ),
        Span::raw(format!(
            "| Center: {:.4}°, {:.4}° | Showing: {}/{} tracks | Range: {:.0} NM ",
            app.center_lat,
            app.center_lon,
            targets.len(),
            total_tracks,
            app.radar_range_nm
        )),
        alert_span,
    ]);

    let header_widget = Paragraph::new(title_line).block(
        Block::default()
            .borders(Borders::ALL)
            .title(" Surveillance Radar Dashboard "),
    );

    frame.render_widget(header_widget, area);
}

fn draw_main(
    frame: &mut Frame<'_>,
    area: Rect,
    app: &App,
    targets: &[aerofoil_common::AircraftTarget],
) {
    // Horizontal split for radar and telemetry table
    let main_chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage(50), // PPI Radar
            Constraint::Percentage(50), // Flight telemetry table
        ])
        .split(area);

    draw_radar(frame, main_chunks[0], app, targets);
    draw_table(frame, main_chunks[1], app, targets);
}

fn draw_footer(frame: &mut Frame<'_>, area: Rect, app: &App) {
    let filter_status = if app.filter_emergency {
        "EMERGENCY ONLY"
    } else {
        "ALL FLIGHTS"
    };

    let help_text = format!(
        " [q] Quit  [+/-] Zoom  [s] Sort: {:?}  [d] Dir: {}  [e] Filter: {}  [↑/↓] Select ",
        app.sort_column,
        if app.sort_ascending { "ASC" } else { "DESC" },
        filter_status,
    );

    let footer_widget = Paragraph::new(help_text)
        .style(Style::default().fg(Color::Yellow))
        .block(Block::default().borders(Borders::ALL).title(" Controls "));

    frame.render_widget(footer_widget, area);
}
