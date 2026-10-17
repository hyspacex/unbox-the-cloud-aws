#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::{
    LogicalPosition, LogicalSize, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
use tauri_plugin_deep_link::DeepLinkExt;

mod connection;

const WIDTH: f64 = 236.0;
const EDGE_WIDTH: f64 = 8.0;

#[derive(Default)]
struct Presentation {
    engaged: bool,
    edge_enabled: bool,
    hidden: bool,
}

fn require_widget(window: &WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("This action is only available to the local widget.".into());
    }
    Ok(())
}

fn clamp_position(
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    area: (f64, f64, f64, f64),
) -> (f64, f64) {
    let (left, top, available_width, available_height) = area;
    (
        x.clamp(left, left + (available_width - width).max(0.0)),
        y.clamp(top, top + (available_height - height).max(0.0)),
    )
}

fn monitor_area(window: &WebviewWindow) -> Result<(f64, f64, f64, f64), String> {
    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .ok_or("No monitor available.")?;
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    Ok((
        area.position.x as f64 / scale,
        area.position.y as f64 / scale,
        area.size.width as f64 / scale,
        area.size.height as f64 / scale,
    ))
}

#[tauri::command]
fn present_widget(
    window: WebviewWindow,
    state: State<Mutex<Presentation>>,
    height: f64,
    engaged: bool,
) -> Result<(), String> {
    require_widget(&window)?;
    if !height.is_finite() || !(64.0..=800.0).contains(&height) {
        return Err("Invalid widget height.".into());
    }
    let mut presentation = state.lock().map_err(|error| error.to_string())?;
    let area = monitor_area(&window)?;
    let scale = window.scale_factor().map_err(|error| error.to_string())?;
    let position = window
        .outer_position()
        .map_err(|error| error.to_string())?
        .to_logical::<f64>(scale);
    let height = height.min(area.3);
    let (x, y) = clamp_position(position.x, position.y, WIDTH, height, area);
    window
        .set_size(LogicalSize::new(WIDTH, height))
        .map_err(|error| error.to_string())?;
    window
        .set_position(LogicalPosition::new(x, y))
        .map_err(|error| error.to_string())?;
    presentation.engaged = engaged;
    presentation.hidden = false;
    window.show().map_err(|error| error.to_string())
}

#[tauri::command]
fn set_preferences(
    window: WebviewWindow,
    state: State<Mutex<Presentation>>,
    always_on_top: bool,
    edge_auto_hide: bool,
) -> Result<(), String> {
    require_widget(&window)?;
    window
        .set_always_on_top(always_on_top)
        .map_err(|error| error.to_string())?;
    state
        .lock()
        .map_err(|error| error.to_string())?
        .edge_enabled = edge_auto_hide;
    Ok(())
}

#[tauri::command]
fn dock_widget(window: WebviewWindow, state: State<Mutex<Presentation>>) -> Result<bool, String> {
    require_widget(&window)?;
    let mut presentation = state.lock().map_err(|error| error.to_string())?;
    if !presentation.edge_enabled || presentation.engaged {
        return Ok(false);
    }
    let area = monitor_area(&window)?;
    let scale = window.scale_factor().map_err(|error| error.to_string())?;
    let position = window
        .outer_position()
        .map_err(|error| error.to_string())?
        .to_logical::<f64>(scale);
    let (x, y) = clamp_position(
        area.0 + area.2 - EDGE_WIDTH,
        position.y,
        EDGE_WIDTH,
        64.0,
        area,
    );
    window
        .set_size(LogicalSize::new(EDGE_WIDTH, 64.0))
        .map_err(|error| error.to_string())?;
    window
        .set_position(LogicalPosition::new(x, y))
        .map_err(|error| error.to_string())?;
    presentation.hidden = true;
    Ok(true)
}

#[tauri::command]
fn drag_widget(window: WebviewWindow) -> Result<(), String> {
    require_widget(&window)?;
    window.start_dragging().map_err(|error| error.to_string())
}

fn validate_link(
    event_key: &str,
    filter: &str,
    control_id: &str,
    web_url: &str,
) -> Result<(), String> {
    if !["changed", "reviewed"].contains(&event_key)
        || !["all", "verified", "review"].contains(&filter)
    {
        return Err("Unknown preview event or filter.".into());
    }
    if !control_id.is_empty()
        && ![
            "SEC-ARCH-01",
            "SEC-ARCH-02",
            "SEC-ARCH-04",
            "SEC-ARCH-05",
            "SEC-ARCH-07",
            "SEC-ARCH-17",
            "SEC-ARCH-20",
            "SEC-ARCH-22",
        ]
        .contains(&control_id)
    {
        return Err("Unknown control.".into());
    }
    if !web_url.is_empty() {
        let url = tauri::Url::parse(web_url).map_err(|_| "Invalid details URL.")?;
        if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
            return Err("The details URL must use HTTPS without credentials.".into());
        }
    }
    Ok(())
}

#[tauri::command]
fn open_details(
    window: WebviewWindow,
    event_key: String,
    filter: String,
    control_id: String,
    web_url: String,
) -> Result<(), String> {
    require_widget(&window)?;
    validate_link(&event_key, &filter, &control_id, &web_url)?;
    let external = !web_url.is_empty();
    let mut url = if external {
        tauri::Url::parse(&web_url).map_err(|error| error.to_string())?
    } else {
        let mut url = window.url().map_err(|error| error.to_string())?;
        url.set_path("/widget.html");
        url.set_query(None);
        url
    };
    url.query_pairs_mut()
        .append_pair("view", "details")
        .append_pair("event", &event_key)
        .append_pair("snapshot", "S4")
        .append_pair("filter", &filter);
    url.set_fragment(if control_id.is_empty() {
        None
    } else {
        Some(&control_id)
    });
    if external {
        return open::that(url.as_str()).map_err(|error| error.to_string());
    }
    let app = window.app_handle();
    if let Some(details) = app.get_webview_window("details") {
        details.navigate(url).map_err(|error| error.to_string())?;
        details.show().map_err(|error| error.to_string())?;
        return details.set_focus().map_err(|error| error.to_string());
    }
    WebviewWindowBuilder::new(app, "details", WebviewUrl::External(url))
        .title("Keel - evidence preview (demo)")
        .inner_size(780.0, 700.0)
        .build()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn quit_widget(window: WebviewWindow) -> Result<(), String> {
    require_widget(&window)?;
    window.app_handle().exit(0);
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                if let Err(error) = window.show().and_then(|_| window.set_focus()) {
                    eprintln!("Could not focus Keel: {error}");
                }
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .manage(Mutex::new(Presentation::default()))
        .manage(Mutex::new(connection::Connections::default()))
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) =
                    event
                {
                    connection::record_drop(window.app_handle(), paths.clone());
                }
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    if let Err(error) = connection::receive_link(&handle, url.as_str()) {
                        connection::record_link_error(&handle, error);
                    }
                }
            });
            if let Some(urls) = app.deep_link().get_current()? {
                for url in urls {
                    if let Err(error) = connection::receive_link(app.handle(), url.as_str()) {
                        connection::record_link_error(app.handle(), error);
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            present_widget,
            set_preferences,
            dock_widget,
            drag_widget,
            open_details,
            quit_widget,
            connection::pending_project,
            connection::connected_project,
            connection::connect_project,
            connection::project_state,
            connection::disconnect_project,
            connection::decline_project,
            connection::open_project_details,
            connection::open_source,
            connection::take_link_error,
            connection::upload_dropped_files
        ])
        .run(tauri::generate_context!())
        .expect("Keel could not start. Check the system WebView and desktop runtime.");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expanded_panel_stays_inside_monitor() {
        assert_eq!(
            clamp_position(1900.0, 1000.0, WIDTH, 400.0, (0.0, 0.0, 1920.0, 1040.0)),
            (1684.0, 640.0)
        );
    }

    #[test]
    fn supports_negative_monitor_origins() {
        assert_eq!(
            clamp_position(
                -1950.0,
                -20.0,
                WIDTH,
                120.0,
                (-1920.0, 30.0, 1920.0, 1050.0)
            ),
            (-1920.0, 30.0)
        );
    }

    #[test]
    fn validates_all_detail_link_fields() {
        assert!(validate_link("changed", "review", "SEC-ARCH-07", "").is_ok());
        assert!(validate_link("reviewed", "verified", "", "https://example.com/keel").is_ok());
        assert!(validate_link("bad", "review", "", "").is_err());
        assert!(validate_link("changed", "other", "", "").is_err());
        assert!(validate_link("changed", "review", "../private", "").is_err());
        for bad in [
            "file:///secret",
            "javascript:alert(1)",
            "http://example.com",
            "https://user:pass@example.com",
        ] {
            assert!(validate_link("changed", "all", "", bad).is_err());
        }
    }
}
