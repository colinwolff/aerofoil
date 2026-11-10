//! Sortable telemetry table with visual alerts for emergency codes.

use aerofoil_common::AircraftTarget;
use ratatui::{
    Frame,
    layout::{Constraint, Rect},
    style::{Color, Modifier, Style},
    widgets::{Block, Borders, Cell, Row, Table},
};

use crate::app::{App, distance_nm, is_emergency_squawk};

/// Draws the aircraft telemetry table onto the provided frame area.
pub fn draw_table(frame: &mut Frame<'_>, area: Rect, app: &App, targets: &[AircraftTarget]) {
    let sort_dir = if app.sort_ascending { "▲" } else { "▼" };
    let title = format!(
        " Target Telemetry [Sort: {:?} {}] ",
        app.sort_column, sort_dir
    );

    let header_cells = [
        "ICAO",
        "Callsign",
        "Alt (ft)",
        "Spd (kt)",
        "Hdg",
        "Squawk",
        "Dist (NM)",
        "Source",
    ]
    .into_iter()
    .map(|h| {
        Cell::from(h).style(
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
        )
    });
    let header = Row::new(header_cells).height(1).bottom_margin(1);

    let rows: Vec<Row> = targets
        .iter()
        .enumerate()
        .map(|(idx, target)| {
            let is_emergency = is_emergency_squawk(target.squawk);
            let is_selected = idx == app.selected_index;

            let icao = format!("{:06X}", target.address);
            let callsign = target
                .callsign
                .and_then(|cs| core::str::from_utf8(&cs).ok().map(|s| s.trim().to_string()))
                .unwrap_or_else(|| "--------".to_string());
            let alt = target
                .altitude
                .map_or_else(|| "---".to_string(), |a| format!("{}", a.feet()));
            let speed = target
                .velocity
                .ground_speed_knots
                .map_or_else(|| "---".to_string(), |s| format!("{s}"));
            let heading = target
                .velocity
                .heading
                .map_or_else(|| "---".to_string(), |h| format!("{h}"));
            let squawk = target
                .squawk
                .map_or_else(|| "----".to_string(), |s| format!("{s}"));

            let dist = target.position.map_or_else(
                || "---".to_string(),
                |p| {
                    let (lat, lon) = p.to_f64();
                    let d = distance_nm(app.center_lat, app.center_lon, lat, lon);
                    format!("{d:.1}")
                },
            );

            let source = format!("{:?}", target.source);

            let mut style = Style::default();
            if is_emergency {
                style = style.fg(Color::Red).add_modifier(Modifier::BOLD);
            } else if is_selected {
                style = style.fg(Color::Yellow).add_modifier(Modifier::BOLD);
            } else {
                style = style.fg(Color::White);
            }

            if is_selected {
                style = style.bg(Color::DarkGray);
            }

            Row::new(vec![
                Cell::from(icao),
                Cell::from(callsign),
                Cell::from(alt),
                Cell::from(speed),
                Cell::from(heading),
                Cell::from(squawk),
                Cell::from(dist),
                Cell::from(source),
            ])
            .style(style)
        })
        .collect();

    let widths = [
        Constraint::Length(8),
        Constraint::Length(10),
        Constraint::Length(10),
        Constraint::Length(10),
        Constraint::Length(8),
        Constraint::Length(8),
        Constraint::Length(11),
        Constraint::Length(12),
    ];

    let table = Table::new(rows, widths)
        .header(header)
        .block(Block::default().borders(Borders::ALL).title(title));

    frame.render_widget(table, area);
}
