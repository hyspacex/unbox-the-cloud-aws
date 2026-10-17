use reqwest::{redirect::Policy, Client, Response};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager, State, Url, WebviewWindow};

#[derive(Clone)]
pub struct Invitation {
    pub project_id: String,
    pub origin: String,
    code: String,
}

pub enum Link {
    Demo,
    Project(Invitation),
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub project_id: String,
    pub origin: String,
}

#[derive(Clone)]
struct ActiveProject {
    info: ProjectInfo,
    token: String,
    expires_at: Instant,
}

#[derive(Default)]
pub struct Connections {
    pending: Option<Invitation>,
    active: Option<ActiveProject>,
    last_link: Option<String>,
    generation: u64,
    last_error: Option<String>,
}

pub fn record_link_error(app: &tauri::AppHandle, error: String) {
    match app.state::<Mutex<Connections>>().lock() {
        Ok(mut connections) => connections.last_error = Some(error.clone()),
        Err(lock_error) => eprintln!("Could not retain link error: {lock_error}"),
    }
    if let Err(delivery_error) = app.emit("project-link-error", error) {
        eprintln!("Could not show project-link error: {delivery_error}");
    }
}

#[tauri::command]
pub fn take_link_error(
    window: WebviewWindow,
    state: State<Mutex<Connections>>,
) -> Result<Option<String>, String> {
    super::require_widget(&window)?;
    Ok(state
        .lock()
        .map_err(|error| error.to_string())?
        .last_error
        .take())
}

fn valid_project(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

pub fn parse_link(raw: &str) -> Result<Link, String> {
    if raw.len() > 4096 {
        return Err("Project link is too long.".into());
    }
    let url = Url::parse(raw).map_err(|_| "Invalid Keel link.")?;
    if url.scheme() != "keel"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.fragment().is_some()
    {
        return Err("Invalid Keel link.".into());
    }
    if url.host_str() == Some("demo") && url.path() == "/lantern" && url.query().is_none() {
        return Ok(Link::Demo);
    }
    if url.host_str() != Some("connect") || !["", "/"].contains(&url.path()) {
        return Err("Use a project Connect link from your Keel web application.".into());
    }
    let mut keys = HashSet::new();
    let mut project = None;
    let mut server = None;
    let mut code = None;
    for (key, value) in url.query_pairs() {
        if !keys.insert(key.to_string()) {
            return Err("Duplicate project-link parameter.".into());
        }
        match key.as_ref() {
            "project" => project = Some(value.to_string()),
            "server" => server = Some(value.to_string()),
            "code" => code = Some(value.to_string()),
            _ => return Err("Unexpected project-link parameter.".into()),
        }
    }
    let project_id = project
        .filter(|value| valid_project(value))
        .ok_or("Invalid project identifier.")?;
    let server = Url::parse(&server.ok_or("Missing project server.")?)
        .map_err(|_| "Invalid project server.")?;
    if server.scheme() != "https"
        || server.host_str().is_none()
        || !server.username().is_empty()
        || server.password().is_some()
        || server.path() != "/"
        || server.query().is_some()
        || server.fragment().is_some()
    {
        return Err(
            "The project server must be an HTTPS origin without a path or credentials.".into(),
        );
    }
    let code = code
        .filter(|value| {
            (16..=2048).contains(&value.len())
                && value
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
        })
        .ok_or("This link needs a fresh one-time connection code from the project page.")?;
    Ok(Link::Project(Invitation {
        project_id,
        origin: server.origin().ascii_serialization(),
        code,
    }))
}

pub fn receive_link(app: &tauri::AppHandle, raw: &str) -> Result<(), String> {
    let link = parse_link(raw)?;
    let state = app.state::<Mutex<Connections>>();
    let mut connections = state.lock().map_err(|error| error.to_string())?;
    if connections.last_link.as_deref() == Some(raw) {
        return Ok(());
    }
    connections.last_link = Some(raw.to_string());
    connections.generation += 1;
    match link {
        Link::Demo => {
            connections.active = None;
            connections.pending = None;
            app.emit("project-demo", ())
                .map_err(|error| error.to_string())?;
        }
        Link::Project(invitation) => {
            let info = ProjectInfo {
                project_id: invitation.project_id.clone(),
                origin: invitation.origin.clone(),
            };
            connections.pending = Some(invitation);
            app.emit("project-invitation", info)
                .map_err(|error| error.to_string())?;
        }
    }
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn pending_project(
    window: WebviewWindow,
    state: State<Mutex<Connections>>,
) -> Result<Option<ProjectInfo>, String> {
    super::require_widget(&window)?;
    Ok(state
        .lock()
        .map_err(|error| error.to_string())?
        .pending
        .as_ref()
        .map(|invite| ProjectInfo {
            project_id: invite.project_id.clone(),
            origin: invite.origin.clone(),
        }))
}

#[tauri::command]
pub fn connected_project(
    window: WebviewWindow,
    state: State<Mutex<Connections>>,
) -> Result<Option<ProjectInfo>, String> {
    super::require_widget(&window)?;
    Ok(state
        .lock()
        .map_err(|error| error.to_string())?
        .active
        .as_ref()
        .map(|active| active.info.clone()))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ExchangeResponse {
    project_id: String,
    access_token: String,
    expires_in: u32,
}

async fn bounded_json<T: serde::de::DeserializeOwned>(
    mut response: Response,
    limit: usize,
) -> Result<T, String> {
    if response.status().as_u16() == 401 || response.status().as_u16() == 403 {
        return Err(
            "Connection denied or expired. Open a fresh Connect link from your project page."
                .into(),
        );
    }
    if !response.status().is_success() {
        return Err(format!(
            "Project service returned HTTP {}.",
            response.status().as_u16()
        ));
    }
    if response
        .content_length()
        .is_some_and(|length| length > limit as u64)
    {
        return Err("Project service response exceeded the size limit.".into());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Failed to read project response.")?
    {
        if body.len() + chunk.len() > limit {
            return Err("Project service response exceeded the size limit.".into());
        }
        body.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&body)
        .map_err(|_| "Project service returned an invalid response.".into())
}

fn client() -> Result<Client, String> {
    Client::builder()
        .https_only(true)
        .redirect(Policy::none())
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|_| "Could not create the HTTPS client.".into())
}

#[tauri::command]
pub async fn connect_project(
    window: WebviewWindow,
    state: State<'_, Mutex<Connections>>,
) -> Result<ProjectInfo, String> {
    super::require_widget(&window)?;
    let (invitation, generation) = {
        let mut connections = state.lock().map_err(|error| error.to_string())?;
        // A one-time code gets one attempt; do not replay it after ambiguous failure.
        (
            connections
                .pending
                .take()
                .ok_or("Open a fresh project Connect link.")?,
            connections.generation,
        )
    };
    let response = client()?
        .post(format!("{}/api/desktop/connect", invitation.origin))
        .json(&serde_json::json!({ "projectId": invitation.project_id, "code": invitation.code }))
        .send()
        .await
        .map_err(|_| "Cannot reach the project service. Get a fresh link before retrying.")?;
    let result: ExchangeResponse = bounded_json(response, 16384).await?;
    if result.project_id != invitation.project_id
        || result.access_token.is_empty()
        || result.access_token.len() > 8192
        || result.access_token.contains(['\r', '\n'])
        || result.expires_in == 0
        || result.expires_in > 86400
    {
        return Err("The connection response did not match the requested project.".into());
    }
    let info = ProjectInfo {
        project_id: invitation.project_id,
        origin: invitation.origin,
    };
    let mut connections = state.lock().map_err(|error| error.to_string())?;
    if connections.generation != generation {
        return Err("A newer project link replaced this request.".into());
    }
    connections.active = Some(ActiveProject {
        info: info.clone(),
        token: result.access_token,
        expires_at: Instant::now() + Duration::from_secs(result.expires_in.into()),
    });
    Ok(info)
}

#[tauri::command]
pub async fn project_state(
    window: WebviewWindow,
    state: State<'_, Mutex<Connections>>,
) -> Result<serde_json::Value, String> {
    super::require_widget(&window)?;
    let (active, generation) = {
        let connections = state.lock().map_err(|error| error.to_string())?;
        (
            connections
                .active
                .clone()
                .ok_or("No project is connected.")?,
            connections.generation,
        )
    };
    if Instant::now() >= active.expires_at {
        return Err(
            "Project session expired. Open a fresh Connect link from the project page.".into(),
        );
    }
    let response = client()?
        .get(format!(
            "{}/api/desktop/projects/{}/state",
            active.info.origin, active.info.project_id
        ))
        .bearer_auth(&active.token)
        .send()
        .await
        .map_err(|_| "The project could not be refreshed. Displayed data is stale.")?;
    let result: serde_json::Value = bounded_json(response, 262144).await?;
    if result.get("projectId").and_then(|value| value.as_str())
        != Some(active.info.project_id.as_str())
    {
        return Err("The service returned data for a different project.".into());
    }
    if state.lock().map_err(|error| error.to_string())?.generation != generation {
        return Err("The project changed during refresh.".into());
    }
    Ok(result)
}

#[tauri::command]
pub fn decline_project(
    window: WebviewWindow,
    state: State<Mutex<Connections>>,
) -> Result<(), String> {
    super::require_widget(&window)?;
    let mut connections = state.lock().map_err(|error| error.to_string())?;
    connections.pending = None;
    connections.generation += 1;
    Ok(())
}

#[tauri::command]
pub fn disconnect_project(
    window: WebviewWindow,
    state: State<Mutex<Connections>>,
) -> Result<(), String> {
    super::require_widget(&window)?;
    let mut connections = state.lock().map_err(|error| error.to_string())?;
    connections.active = None;
    connections.pending = None;
    connections.generation += 1;
    Ok(())
}

#[tauri::command]
pub fn open_project_details(
    window: WebviewWindow,
    state: State<Mutex<Connections>>,
    filter: String,
    control_id: String,
    snapshot_id: String,
) -> Result<(), String> {
    super::require_widget(&window)?;
    if !["all", "verified", "review"].contains(&filter.as_str())
        || control_id.len() > 128
        || snapshot_id.len() > 128
    {
        return Err("Invalid project detail context.".into());
    }
    let connections = state.lock().map_err(|error| error.to_string())?;
    let active = connections.active.as_ref().ok_or("No connected project.")?;
    let mut url = Url::parse(&format!(
        "{}/projects/{}",
        active.info.origin, active.info.project_id
    ))
    .map_err(|_| "Invalid project URL.")?;
    url.query_pairs_mut()
        .append_pair("filter", &filter)
        .append_pair("snapshot", &snapshot_id);
    if !control_id.is_empty() {
        url.set_fragment(Some(&control_id));
    }
    open::that(url.as_str()).map_err(|_| "Could not open the project page.".into())
}

#[tauri::command]
pub fn open_source(
    window: WebviewWindow,
    state: State<Mutex<Connections>>,
    url: String,
) -> Result<(), String> {
    super::require_widget(&window)?;
    let target = Url::parse(&url).map_err(|_| "Invalid evidence link.")?;
    let connections = state.lock().map_err(|error| error.to_string())?;
    let active = connections.active.as_ref().ok_or("No project connected.")?;
    let host = target.host_str().unwrap_or("");
    let allowed = host == "app.box.com"
        || host.ends_with(".app.box.com")
        || target.origin().ascii_serialization() == active.info.origin;
    if target.scheme() != "https"
        || !target.username().is_empty()
        || target.password().is_some()
        || !allowed
    {
        return Err("Open this source from the project web page; it is not an approved Box or project origin.".into());
    }
    open::that(target.as_str()).map_err(|_| "Could not open the evidence source.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        thread,
    };

    fn response_from_local_fixture(status: &str, body: &str) -> Response {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let reply = format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
        thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut request = [0u8; 4096];
            socket.read(&mut request).unwrap();
            socket.write_all(reply.as_bytes()).unwrap();
        });
        tauri::async_runtime::block_on(async {
            // HTTP exists only in this loopback test. Production uses https_only(true).
            Client::builder()
                .redirect(Policy::none())
                .build()
                .unwrap()
                .get(format!("http://{address}"))
                .send()
                .await
                .unwrap()
        })
    }

    #[test]
    fn bounded_transport_rejects_denied_oversized_or_malformed_data() {
        for (status, body, limit) in [
            ("401 Unauthorized", "{}", 100),
            ("200 OK", "not-json", 100),
            ("200 OK", "{\"x\":123}", 2),
        ] {
            let response = response_from_local_fixture(status, body);
            assert!(
                tauri::async_runtime::block_on(bounded_json::<serde_json::Value>(response, limit))
                    .is_err()
            );
        }
        let response = response_from_local_fixture("200 OK", "{\"projectId\":\"lantern\"}");
        let value: serde_json::Value =
            tauri::async_runtime::block_on(bounded_json(response, 100)).unwrap();
        assert_eq!(value["projectId"], "lantern");
    }

    #[test]
    fn project_link_is_exact_and_does_not_contain_a_long_lived_token() {
        let Link::Project(invite) = parse_link("keel://connect?project=lantern&server=https%3A%2F%2Fexample.com&code=one-time-demo-code").unwrap() else { panic!() };
        assert_eq!(invite.project_id, "lantern");
        assert_eq!(invite.origin, "https://example.com");
        assert!(matches!(
            parse_link("keel://demo/lantern").unwrap(),
            Link::Demo
        ));
    }

    #[test]
    fn rejects_unsafe_destinations_ambiguous_and_incomplete_links() {
        for bad in [
            "keel://connect?project=lantern&server=http://example.com&code=one-time-demo-code",
            "keel://connect?project=lantern&server=https://example.com/private&code=one-time-demo-code",
            "keel://connect?project=../../private&server=https://example.com&code=one-time-demo-code",
            "keel://connect?project=lantern&project=other&server=https://example.com&code=one-time-demo-code",
            "keel://connect?project=lantern&server=https://example.com",
            "keel://connect?project=lantern&server=https://user:pass@example.com&code=one-time-demo-code",
            "keel://connect?project=lantern&server=https://example.com&code=one-time-demo-code&token=secret",
            "file:///local-file",
        ] { assert!(parse_link(bad).is_err(), "An invalid link was accepted"); }
    }
}
