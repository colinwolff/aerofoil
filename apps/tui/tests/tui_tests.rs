//! Unit and integration tests for `aerofoil-tui`.

use std::sync::Arc;

use aerofoil_common::{
    AddressType, AircraftTarget, Altitude, AltitudeKind, Heading, Position, ReceptionSource,
    Squawk, TransponderSource, Velocity,
};
use aerofoil_tracker::Tracker;
use aerofoil_tui::{
    app::{App, SortColumn, is_emergency_squawk},
    draw_ui, handle_key_event,
};
use crossterm::event::{KeyCode, KeyEvent};
use ratatui::{Terminal, backend::TestBackend};

fn make_target(addr: u32, lat: f64, lon: f64, alt: i32, spd: u16, squawk: u16) -> AircraftTarget {
    let mut t = AircraftTarget::new(
        AddressType::Icao,
        addr,
        TransponderSource::ModeS1090,
        ReceptionSource::Direct,
        1_000,
    );
    t.position =
        Position::from_microdegrees((lat * 1_000_000.0) as i32, (lon * 1_000_000.0) as i32);
    t.altitude = Altitude::new(alt, AltitudeKind::Barometric);
    t.velocity = Velocity::new(Some(spd), Heading::from_raw_128ths(0), Some(0));
    t.squawk = Squawk::new(squawk);
    t
}

#[test]
fn test_app_zoom_and_sort() {
    let tracker = Arc::new(Tracker::new());
    let mut app = App::new(tracker);

    assert_eq!(app.radar_range_nm, 40.0);
    app.zoom_in();
    assert_eq!(app.radar_range_nm, 20.0);
    app.zoom_out();
    assert_eq!(app.radar_range_nm, 40.0);

    assert_eq!(app.sort_column, SortColumn::Distance);
    app.cycle_sort();
    assert_eq!(app.sort_column, SortColumn::Address);

    assert!(app.sort_ascending);
    app.toggle_sort_direction();
    assert!(!app.sort_ascending);
}

#[test]
fn test_app_selection_nav() {
    let tracker = Arc::new(Tracker::new());
    let mut app = App::new(tracker);

    app.select_next(5);
    assert_eq!(app.selected_index, 1);
    app.select_prev(5);
    assert_eq!(app.selected_index, 0);
    app.select_prev(5);
    assert_eq!(app.selected_index, 4);
    app.select_next(5);
    assert_eq!(app.selected_index, 0);
}

#[test]
fn test_emergency_squawks() {
    assert!(is_emergency_squawk(Squawk::new(0o7500)));
    assert!(is_emergency_squawk(Squawk::new(0o7600)));
    assert!(is_emergency_squawk(Squawk::new(0o7700)));
    assert!(!is_emergency_squawk(Squawk::new(0o1200)));
    assert!(!is_emergency_squawk(None));
}

#[test]
fn test_target_filtering_and_sorting() {
    let tracker = Arc::new(Tracker::new());
    let t1 = make_target(0x400001, 51.5074, -0.1278, 10_000, 250, 0o1200);
    let t2 = make_target(0x400002, 51.6000, -0.1278, 20_000, 300, 0o7700);
    tracker.insert(t1);
    tracker.insert(t2);

    let mut app = App::new(tracker);
    let all = app.filtered_targets();
    assert_eq!(all.len(), 2);

    app.toggle_emergency_filter();
    let emerg = app.filtered_targets();
    assert_eq!(emerg.len(), 1);
    assert_eq!(emerg[0].address, 0x400002);

    app.toggle_emergency_filter();
    app.sort_column = SortColumn::Altitude;
    app.sort_ascending = false;
    let sorted_alt = app.filtered_targets();
    assert_eq!(sorted_alt[0].address, 0x400002);
}

#[test]
fn test_key_events() {
    let tracker = Arc::new(Tracker::new());
    let mut app = App::new(tracker);

    handle_key_event(&mut app, KeyEvent::from(KeyCode::Char('+')), 10);
    assert_eq!(app.radar_range_nm, 20.0);

    handle_key_event(&mut app, KeyEvent::from(KeyCode::Char('s')), 10);
    assert_eq!(app.sort_column, SortColumn::Address);

    handle_key_event(&mut app, KeyEvent::from(KeyCode::Char('q')), 10);
    assert!(app.should_quit);
}

#[test]
fn test_headless_rendering() {
    let tracker = Arc::new(Tracker::new());
    let t1 = make_target(0x400001, 51.5074, -0.1278, 10_000, 250, 0o7700);
    tracker.insert(t1);

    let app = App::new(tracker);
    let backend = TestBackend::new(120, 35);
    let Ok(mut terminal) = Terminal::new(backend);

    let res = terminal.draw(|f| {
        draw_ui(f, &app);
    });
    assert!(res.is_ok());

    let buffer = terminal.backend().buffer();
    assert_eq!(buffer.area.width, 120);
    assert_eq!(buffer.area.height, 35);
}
