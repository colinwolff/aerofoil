//! Canvas-based Plan Position Indicator (PPI) radar display.

use aerofoil_common::AircraftTarget;
use ratatui::{
    Frame,
    layout::Rect,
    style::{Color, Modifier, Style},
    text::Span,
    widgets::{
        Block, Borders,
        canvas::{Canvas, Circle, Line},
    },
};

use crate::app::{App, is_emergency_squawk};

/// Draws the PPI radar display onto the canvas.
pub fn draw_radar(frame: &mut Frame<'_>, area: Rect, app: &App, targets: &[AircraftTarget]) {
    let range = app.radar_range_nm;
    let selected_idx = app.selected_index;

    let canvas = Canvas::default()
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(format!(" PPI Radar (Range: {range:.0} NM) "))
                .style(Style::default().fg(Color::Cyan)),
        )
        .x_bounds([-range, range])
        .y_bounds([-range, range])
        .paint(move |ctx| {
            // Draw crosshairs
            let grid_style = Style::default().fg(Color::DarkGray);
            ctx.draw(&Line {
                x1: -range,
                y1: 0.0,
                x2: range,
                y2: 0.0,
                color: Color::DarkGray,
            });
            ctx.draw(&Line {
                x1: 0.0,
                y1: -range,
                x2: 0.0,
                y2: range,
                color: Color::DarkGray,
            });

            // Draw concentric range rings (4 rings: 25%, 50%, 75%, 100%)
            for i in 1..=4 {
                let ring_radius = range * (i as f64) * 0.25;
                ctx.draw(&Circle {
                    x: 0.0,
                    y: 0.0,
                    radius: ring_radius,
                    color: Color::DarkGray,
                });
                ctx.print(
                    1.0,
                    ring_radius,
                    Span::styled(format!("{ring_radius:.0} NM"), grid_style),
                );
            }

            // Draw targets
            for (idx, target) in targets.iter().enumerate() {
                let Some(pos) = target.position else {
                    continue;
                };
                let (lat, lon) = pos.to_f64();
                let dlat = (lat - app.center_lat) * 60.0;
                let avg_lat_rad = (app.center_lat.to_radians()).cos();
                let dlon = (lon - app.center_lon) * 60.0 * avg_lat_rad;

                let is_emergency = is_emergency_squawk(target.squawk);
                let is_selected = idx == selected_idx;

                let color = if is_emergency {
                    Color::Red
                } else if is_selected {
                    Color::Yellow
                } else {
                    Color::Green
                };

                // Target blip circle
                ctx.draw(&Circle {
                    x: dlon,
                    y: dlat,
                    radius: range * 0.015,
                    color,
                });

                // Velocity vector line
                if let Some(heading) = target.velocity.heading {
                    let h_deg = heading.whole_degrees() as f64 + (heading.tenths() as f64 * 0.1);
                    let h_rad = h_deg.to_radians();
                    let speed = target.velocity.ground_speed_knots.unwrap_or(150) as f64;
                    let vec_len = (speed * 0.015 + 1.0).min(range * 0.2);
                    let dx = vec_len * h_rad.sin();
                    let dy = vec_len * h_rad.cos();
                    ctx.draw(&Line {
                        x1: dlon,
                        y1: dlat,
                        x2: dlon + dx,
                        y2: dlat + dy,
                        color,
                    });
                }

                // Label
                let mut label_text = String::new();
                if let Some(cs) = target.callsign
                    && let Ok(s) = core::str::from_utf8(&cs)
                {
                    label_text.push_str(s.trim());
                }
                if label_text.is_empty() {
                    label_text = format!("{:06X}", target.address);
                }
                if let Some(alt) = target.altitude {
                    label_text.push_str(&format!("/{:03}", alt.feet() / 100));
                }

                let label_style = if is_emergency {
                    Style::default().fg(Color::Red).add_modifier(Modifier::BOLD)
                } else if is_selected {
                    Style::default()
                        .fg(Color::Yellow)
                        .add_modifier(Modifier::BOLD)
                } else {
                    Style::default().fg(Color::White)
                };

                ctx.print(
                    dlon + (range * 0.02),
                    dlat,
                    Span::styled(label_text, label_style),
                );
            }
        });

    frame.render_widget(canvas, area);
}
