#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{collections::HashMap, fs, time::Duration};
use serde::{Deserialize, Serialize};
use tauri::{Manager, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_updater::UpdaterExt;
use url::Url;

const API_ORIGIN: &str = include_str!("../api-origin.txt");
const UPDATE_ENDPOINT: &str = "https://github.com/shahrozimran/Retail-system/releases/latest/download/latest.json";
const MAX_PDF: usize = 16 * 1024 * 1024;
struct HttpClient(reqwest::Client);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RetailRequest {
    url: String,
    method: String,
    body: Option<String>,
    access_token: Option<String>,
    refresh_token: Option<String>,
}

#[derive(Serialize)]
struct RetailResponse { status: u16, body: String, headers: HashMap<String, String> }

fn local_url(url: &Url) -> bool {
    (url.scheme() == "tauri" && url.host_str() == Some("localhost")) ||
    (["http", "https"].contains(&url.scheme()) && url.host_str() == Some("tauri.localhost"))
}

fn main_window(window: &WebviewWindow) -> Result<(), String> {
    if window.label() != "main" || !local_url(&window.url().map_err(|_| "Window unavailable")?) {
        return Err("This action is available only inside the desktop application.".into());
    }
    Ok(())
}

fn request_url(raw: &str, method: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|_| "Invalid API destination.")?;
    if url.origin().ascii_serialization() != API_ORIGIN.trim() || !url.username().is_empty() || url.password().is_some() || url.fragment().is_some() || !["GET", "POST"].contains(&method) {
        return Err("Invalid API destination or method.".into());
    }
    if !["/api/auth/", "/api/proxy/"].contains(&url.path()) {
        return Err("Invalid API endpoint.".into());
    }
    if method == "POST" || url.path() == "/api/auth/" {
        if url.query().is_some() { return Err("Unexpected API parameters.".into()); }
    } else {
        let pairs: Vec<_> = url.query_pairs().collect();
        if pairs.len() > 2 || pairs.iter().any(|(key, _)| key != "action" && key != "customerUuid") {
            return Err("Invalid API parameters.".into());
        }
        for key in ["action", "customerUuid"] {
            if pairs.iter().filter(|(k, _)| k == key).count() > 1 { return Err("Duplicate API parameter.".into()); }
        }
        let action = pairs.iter().find(|(k, _)| k == "action").map(|(_, v)| v.as_ref()).unwrap_or("dashboard");
        if !["dashboard", "products", "raw_materials", "customers", "customer_ledger", "transactions", "productions", "reports"].contains(&action) {
            return Err("Unknown read action.".into());
        }
        let customer = pairs.iter().find(|(k, _)| k == "customerUuid");
        if action == "customer_ledger" {
            if customer.is_none() || uuid::Uuid::parse_str(customer.unwrap().1.as_ref()).is_err() { return Err("Invalid customer identifier.".into()); }
        } else if customer.is_some() { return Err("Unexpected customer identifier.".into()); }
    }
    Ok(url)
}

fn token(value: &str, max: usize) -> Result<reqwest::header::HeaderValue, String> {
    if value.is_empty() || value.len() > max || !value.bytes().all(|b| b.is_ascii_alphanumeric() || b"._~-".contains(&b)) {
        return Err("Invalid session token.".into());
    }
    value.parse().map_err(|_| "Invalid session token.".into())
}

#[tauri::command]
async fn retail_request(window: WebviewWindow, client: tauri::State<'_, HttpClient>, request: RetailRequest) -> Result<RetailResponse, String> {
    main_window(&window)?;
    let url = request_url(&request.url, &request.method)?;
    let mut builder = client.0.request(if request.method == "POST" { reqwest::Method::POST } else { reqwest::Method::GET }, url.clone())
        .header("X-Retail-Client", "native").header("X-Retail-Request", "1")
        // Use the existing native origin and bearer-only server policy.
        .header("Origin", "https://localhost").header("Accept", "application/json");
    if let Some(access) = request.access_token {
        token(&access, 8192)?;
        builder = builder.header("Authorization", format!("Bearer {access}"));
    }
    if let Some(refresh) = request.refresh_token { builder = builder.header("X-Retail-Refresh-Token", token(&refresh, 1024)?); }
    if request.method == "POST" {
        let body = request.body.ok_or("A request body is required.")?;
        let limit = if url.path() == "/api/auth/" { 4096 } else { 65536 };
        if body.len() > limit { return Err("Request is too large.".into()); }
        let value: serde_json::Value = serde_json::from_str(&body).map_err(|_| "Invalid JSON body.")?;
        if !value.is_object() { return Err("A JSON object is required.".into()); }
        builder = builder.header("Content-Type", "application/json").body(body);
    } else if request.body.is_some() { return Err("Unexpected request body.".into()); }

    let mut response = builder.send().await.map_err(|_| "Could not reach the retail server. Check your internet connection and retry the same operation.")?;
    if response.status().is_redirection() { return Err("The server returned an unexpected redirect.".into()); }
    let status = response.status().as_u16();
    let mut headers = HashMap::new();
    for name in ["content-type", "x-retail-access-token", "x-retail-refresh-token"] {
        if let Some(value) = response.headers().get(name).and_then(|v| v.to_str().ok()) { headers.insert(name.to_string(), value.to_string()); }
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "The server response was interrupted. Retry the same operation.")? {
        if bytes.len() + chunk.len() > 32 * 1024 * 1024 { return Err("The server response is too large.".into()); }
        bytes.extend_from_slice(&chunk);
    }
    let body = String::from_utf8(bytes).map_err(|_| "Invalid server response.")?;
    Ok(RetailResponse { status, body, headers })
}

fn pdf(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() > MAX_PDF || !bytes.starts_with(b"%PDF-") { return Err("A valid PDF invoice up to 16 MB is required.".into()); }
    Ok(())
}

fn invoice_filename(filename: &str) -> String {
    let basename = filename.strip_suffix(".pdf").unwrap_or(filename);
    let clean: String = basename.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' }).take(80).collect();
    let stem = clean.trim_matches('_');
    if stem.is_empty() || ["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "LPT1", "LPT2", "LPT3"].contains(&stem.to_ascii_uppercase().as_str()) {
        return "Invoice.pdf".into();
    }
    format!("{stem}.pdf")
}

#[tauri::command]
async fn save_invoice(window: WebviewWindow, app: tauri::AppHandle, bytes: Vec<u8>, filename: String) -> Result<bool, String> {
    main_window(&window)?; pdf(&bytes)?;
    let name = invoice_filename(&filename);
    tauri::async_runtime::spawn_blocking(move || {
        let chosen = app.dialog().file().add_filter("PDF invoice", &["pdf"]).set_file_name(&name).blocking_save_file();
        let Some(chosen) = chosen else { return Ok(false); };
        let path = chosen.into_path().map_err(|_| "Choose a local PDF file.")?;
        fs::write(path, bytes).map_err(|_| "The invoice could not be saved. Choose a writable location.")?;
        Ok(true)
    }).await.map_err(|_| "The save dialog could not be opened.".to_string())?
}

#[tauri::command]
async fn print_invoice(window: WebviewWindow, app: tauri::AppHandle, bytes: Vec<u8>, filename: String) -> Result<bool, String> {
    main_window(&window)?; pdf(&bytes)?;
    let folder = app.path().app_cache_dir().map_err(|_| "Invoice cache is unavailable.")?.join("invoice-previews");
    // Only this generated PDF is opened; no caller-supplied path or shell command is accepted.
    let path = folder.join(format!("{}-{}", uuid::Uuid::new_v4(), invoice_filename(&filename)));
    fs::create_dir_all(&folder).map_err(|_| "Invoice preview is unavailable.")?;
    fs::write(&path, bytes).map_err(|_| "The invoice preview could not be saved.")?;
    open::that_detached(path).map_err(|_| "Install or select a default PDF reader to preview and print invoices.")?;
    Ok(true)
}

#[derive(Serialize)]
struct UpdateInfo { status: &'static str, version: Option<String>, notes: Option<String> }

#[tauri::command]
async fn check_updates(window: WebviewWindow, app: tauri::AppHandle) -> Result<UpdateInfo, String> {
    main_window(&window)?;
    let response = reqwest::Client::builder().timeout(Duration::from_secs(15)).build().map_err(|_| "Update client unavailable.")?
        .get(UPDATE_ENDPOINT).send().await.map_err(|_| "Update server unavailable.")?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(UpdateInfo { status: "unpublished", version: None, notes: None });
    }
    if !response.status().is_success() { return Err("Update server unavailable.".into()); }
    let update = app.updater().map_err(|_| "Updater unavailable.")?.check().await.map_err(|_| "Could not check desktop updates.")?;
    Ok(match update {
        Some(update) => UpdateInfo { status: "available", version: Some(update.version), notes: update.body },
        None => UpdateInfo { status: "current", version: None, notes: None },
    })
}

#[tauri::command]
async fn install_update(window: WebviewWindow, app: tauri::AppHandle) -> Result<(), String> {
    main_window(&window)?;
    let update = app.updater().map_err(|_| "Updater unavailable.")?.check().await.map_err(|_| "Could not check desktop updates.")?.ok_or("No desktop update is available.")?;
    update.download_and_install(|_, _| {}, || {}).await.map_err(|_| "The update could not be verified or installed.")?;
    app.restart();
}

fn main() {
    let client = reqwest::Client::builder().timeout(Duration::from_secs(25))
        .redirect(reqwest::redirect::Policy::none()).user_agent(concat!("GlobalAutoPartsDesktop/", env!("CARGO_PKG_VERSION")))
        .build().expect("HTTP client initialization failed");
    tauri::Builder::default()
        .manage(HttpClient(client))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![retail_request, save_invoice, print_invoice, check_updates, install_update])
        .setup(|app| {
            tauri::WebviewWindowBuilder::from_config(app.handle(), &app.config().app.windows[0])?
                .on_navigation(local_url)
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Desktop application failed to start");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bridge_rejects_foreign_hosts_routes_methods_and_query_smuggling() {
        for (raw, method) in [
            ("https://evil.example/api/proxy/", "GET"),
            ("http://retail-system-chi.vercel.app/api/proxy/", "GET"),
            ("https://retail-system-chi.vercel.app/api/proxy/?action=products&action=reports", "GET"),
            ("https://retail-system-chi.vercel.app/api/proxy/?action=delete_product", "GET"),
            ("https://retail-system-chi.vercel.app/api/auth/?password=bad", "POST"),
            ("https://retail-system-chi.vercel.app/", "GET"),
            ("https://retail-system-chi.vercel.app/api/proxy/", "DELETE"),
        ] { assert!(request_url(raw, method).is_err(), "{raw}"); }
        assert!(request_url("https://retail-system-chi.vercel.app/api/proxy/?action=dashboard", "GET").is_ok());
        assert!(request_url("https://retail-system-chi.vercel.app/api/auth/", "POST").is_ok());
    }
    #[test]
    fn session_headers_and_invoice_files_are_bounded() {
        assert!(token("bad\r\nInjected: yes", 8192).is_err());
        assert!(token(&"a".repeat(1025), 1024).is_err());
        assert!(pdf(b"<script>invalid</script>").is_err());
        assert!(pdf(b"%PDF-1.7\nexample").is_ok());
        assert!(!invoice_filename("../../bad.exe.pdf").contains('/'));
        assert_eq!(invoice_filename("CON.pdf"), "Invoice.pdf");
        assert_eq!(invoice_filename("INV-001.pdf"), "INV-001.pdf");
    }

    #[test]
    #[ignore = "Read-only check against the hosted API"]
    fn hosted_api_requires_authentication() {
        tauri::async_runtime::block_on(async {
            let response = reqwest::Client::builder().timeout(Duration::from_secs(20)).build().unwrap()
                .get(format!("{}/api/auth/", API_ORIGIN.trim()))
                .header("Origin", "https://localhost").header("X-Retail-Client", "native").header("X-Retail-Request", "1")
                .send().await.unwrap();
            assert_eq!(response.status(), reqwest::StatusCode::UNAUTHORIZED);
            assert!(response.headers().get("x-retail-access-token").is_none());
            assert!(response.text().await.unwrap().contains("UNAUTHORIZED"));
        });
    }
}
