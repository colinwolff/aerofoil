//! Main entry point for `aerofoil-tui`.

use std::{
    io::{Result, Stdout, stdout},
    sync::Arc,
    time::Duration,
};

use aerofoil_tracker::Tracker;
use aerofoil_tui::{App, draw_ui, handle_key_event};
use crossterm::{
    event::{self, Event},
    execute,
    terminal::{EnterAlternateScreen, LeaveAlternateScreen, disable_raw_mode, enable_raw_mode},
};
use ratatui::{Terminal, backend::CrosstermBackend};

fn main() -> Result<()> {
    enable_raw_mode()?;
    let mut out = stdout();
    execute!(out, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(out);
    let mut terminal = Terminal::new(backend)?;

    let tracker = Arc::new(Tracker::new());
    let mut app = App::new(tracker);

    let res = run_loop(&mut terminal, &mut app);

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;

    res
}

fn run_loop(terminal: &mut Terminal<CrosstermBackend<Stdout>>, app: &mut App) -> Result<()> {
    while !app.should_quit {
        terminal.draw(|f| draw_ui(f, app))?;

        if event::poll(Duration::from_millis(50))?
            && let Event::Key(key) = event::read()?
        {
            let count = app.filtered_targets().len();
            handle_key_event(app, key, count);
        }
    }
    Ok(())
}
