use super::{API, Result, access, http};
use eventsource_stream::{Event, Eventsource};
use futures_util::{Stream, StreamExt};
use serde::Serialize;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{LazyLock, Mutex},
    time::Duration,
};
use tauri::AppHandle;
use tokio::sync::watch;
use uuid::Uuid;

type Tickets = HashMap<String, watch::Sender<bool>>;
static TICKETS: LazyLock<Mutex<Tickets>> = LazyLock::new(|| Mutex::new(HashMap::new()));

#[tauri::command]
pub fn chatgpt_prepare() -> Result<String> {
    let id = Uuid::new_v4().to_string();
    let mut tickets = TICKETS.lock().map_err(|_| "other")?;
    tickets.insert(id.clone(), watch::channel(false).0);
    Ok(id)
}
#[tauri::command]
pub fn chatgpt_cancel(id: String) {
    if let Some(signal) = TICKETS.lock().unwrap().remove(&id) {
        signal.send_replace(true);
    }
}
pub(super) fn cancel_all() {
    for (_, signal) in TICKETS.lock().unwrap().drain() {
        signal.send_replace(true);
    }
}

fn service_error(err: &Value, status: u16) -> String {
    let code = match err["code"].as_str().unwrap_or("") {
        "subscription_sharing_usage_limit_exceeded" => "limit",
        "subscription_sharing_usage_unavailable" | "subscription_sharing_user_unavailable" => {
            "unavailable"
        }
        "subscription_sharing_user_not_eligible" => "ineligible",
        _ => match status {
            401 => "auth",
            429 => "limit",
            400 => "model",
            _ => "other",
        },
    };
    let detail: String = err["message"]
        .as_str()
        .unwrap_or("")
        .chars()
        .take(300)
        .collect();
    format!("{code}|{detail}")
}
async fn checked(response: reqwest::Response) -> Result<reqwest::Response> {
    record_usage(&response);
    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }
    let body: Value = response.json().await.unwrap_or_default();
    let error = if body["error"].is_object() {
        &body["error"]
    } else {
        &json!({"message": body["detail"].as_str().unwrap_or_default()})
    };
    Err(service_error(error, status.as_u16()))
}
fn valid_effort(level: &str) -> bool {
    matches!(
        level,
        "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "ultra"
    )
}

#[derive(Clone, Serialize)]
pub struct UsageWindow {
    percent: f64,
    reset: Option<u64>,
}
static USAGE: Mutex<Vec<UsageWindow>> = Mutex::new(Vec::new());
pub(super) fn clear_usage() {
    USAGE.lock().unwrap().clear();
}
#[tauri::command]
pub fn chatgpt_usage() -> Vec<UsageWindow> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    USAGE
        .lock()
        .unwrap()
        .iter()
        .filter(|w| w.reset.is_none_or(|reset| reset > now))
        .cloned()
        .collect()
}
fn record_usage(response: &reqwest::Response) {
    let headers = response.headers();
    let mut windows = Vec::new();
    for window in ["primary", "secondary"] {
        let header = |field| {
            headers
                .get(format!("x-codex-{window}-{field}"))?
                .to_str()
                .ok()
        };
        if let Some(percent) = header("used-percent")
            .and_then(|s| s.parse::<f64>().ok())
            .filter(|n| (0.0..=100.0).contains(n))
        {
            windows.push(UsageWindow {
                percent,
                reset: header("reset-at").and_then(|s| s.parse().ok()),
            });
        }
    }
    if !windows.is_empty() {
        *USAGE.lock().unwrap() = windows;
    }
}
#[derive(Serialize)]
pub struct Model {
    slug: String,
    label: String,
    efforts: Vec<String>,
}
#[tauri::command]
pub async fn chatgpt_models(app: AppHandle) -> Result<Vec<Model>> {
    let token = access(&app).await?;
    let response = http()?
        .get(format!("{API}/models"))
        .bearer_auth(token)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|_| "network")?;
    let body: Value = checked(response).await?.json().await.map_err(|_| "model")?;
    Ok(body["models"]
        .as_array()
        .ok_or("model")?
        .iter()
        .filter(|m| m["visibility"] == "list")
        .filter_map(|m| {
            let slug = m["slug"].as_str()?;
            Some(Model {
                efforts: m["supported_reasoning_levels"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(|level| level["effort"].as_str().or_else(|| level.as_str()))
                    .filter(|level| valid_effort(level))
                    .map(str::to_owned)
                    .collect(),
                slug: slug.into(),
                label: m["display_name"].as_str().unwrap_or(slug).into(),
            })
        })
        .collect())
}
fn event(data: &str, output: &mut String) -> Result<bool> {
    let v: Value = serde_json::from_str(data).map_err(|_| "interrupted")?;
    match v["type"].as_str() {
        Some("response.output_text.delta") => {
            output.push_str(v["delta"].as_str().ok_or("interrupted")?)
        }
        Some("response.completed") => return Ok(true),
        Some("response.failed") => return Err(service_error(&v["response"]["error"], 0)),
        Some("error") => return Err(service_error(&v, 0)),
        Some("response.incomplete") => return Err("length".into()),
        _ => {}
    }
    Ok(false)
}
async fn collect_response<E>(
    mut stream: impl Stream<Item = std::result::Result<Event, E>> + Unpin,
) -> Result<String> {
    let mut output = String::new();
    while let Some(next) = stream.next().await {
        if event(&next.map_err(|_| "interrupted")?.data, &mut output)? {
            if output.trim().is_empty() {
                return Err("empty".into());
            }
            return Ok(output);
        }
    }
    Err("interrupted".into())
}
#[tauri::command]
pub async fn chatgpt_complete(
    app: AppHandle,
    id: String,
    model: String,
    system: String,
    user: String,
    timeout_ms: u64,
    effort: Option<String>,
) -> Result<String> {
    let mut cancellation = TICKETS
        .lock()
        .map_err(|_| "other")?
        .get(&id)
        .ok_or("cancelled")?
        .subscribe();
    let run = async {
        let token = access(&app).await?;
        let mut body = json!({"model":model,"instructions":system,"input":[{"role":"user","content":user}],"stream":true,"store":false});
        if let Some(level) = effort {
            if !valid_effort(&level) {
                return Err("model".into());
            }
            body["reasoning"] = json!({"effort":level});
        }
        let response = http()?
            .post(format!("{API}/responses"))
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
            .map_err(|_| "network")?;
        collect_response(checked(response).await?.bytes_stream().eventsource()).await
    };
    let result = tokio::select! {
        biased;
        _ = cancellation.changed() => Err("cancelled".into()),
        result = tokio::time::timeout(Duration::from_millis(timeout_ms),run) => result.unwrap_or_else(|_| Err("timeout".into()))
    };
    chatgpt_cancel(id);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn partial_text_requires_a_completed_event() {
        let mut text = String::new();
        assert!(
            !event(
                r#"{"type":"response.output_text.delta","delta":"draft"}"#,
                &mut text
            )
            .unwrap()
        );
        assert_eq!(text, "draft");
        assert!(event(r#"{"type":"response.incomplete"}"#, &mut text).is_err());
        assert!(event(r#"{"type":"response.failed","response":{"error":{"code":"subscription_sharing_usage_limit_exceeded","message":"Retry later"}}}"#,&mut text).unwrap_err().starts_with("limit|Retry later"));
        assert!(event(r#"{"type":"response.completed"}"#, &mut text).unwrap());
    }
    #[tokio::test]
    async fn eof_discards_text_even_if_a_delta_was_received() {
        let bytes = b"data: {\"type\":\"response.output_text.delta\",\"delta\":\"unfinished\"}\n\n";
        let stream = futures_util::stream::iter([std::io::Result::Ok(bytes.as_slice())]);
        assert_eq!(
            collect_response(stream.eventsource()).await.unwrap_err(),
            "interrupted"
        );
    }
    #[test]
    fn cancellation_works_before_and_during_requests() {
        let id = chatgpt_prepare().unwrap();
        let mut receiver = TICKETS.lock().unwrap()[&id].subscribe();
        chatgpt_cancel(id.clone());
        assert!(*receiver.borrow_and_update());
        assert!(!TICKETS.lock().unwrap().contains_key(&id));
    }
}
