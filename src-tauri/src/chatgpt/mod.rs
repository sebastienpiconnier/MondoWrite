//! Connexion à ChatGPT sur ordinateur. Les jetons restent dans le trousseau.
mod vault;
pub mod writing;
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header, jwk::JwkSet};
use reqwest::{Client, Url};
use ring::{
    digest,
    rand::{SecureRandom, SystemRandom},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::AppHandle;
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    net::TcpListener,
    time::timeout,
};
use uuid::Uuid;

type Result<T> = std::result::Result<T, String>;
const AUTH: &str = "https://auth.openai.com";
const TOKEN: &str = "https://auth.openai.com/api/accounts/oauth/token";
const API: &str = "https://api.openai.com/v1";
const PLAN: &str = "chatgpt.tokens.use.direct";
fn http() -> Result<Client> {
    Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(|_| "network".into())
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn random() -> Result<String> {
    let mut b = [0; 32];
    SystemRandom::new().fill(&mut b).map_err(|_| "auth")?;
    Ok(URL_SAFE_NO_PAD.encode(b))
}

#[derive(Default, Serialize, Deserialize)]
struct Account {
    #[serde(default)]
    session: String,
    host: String,
    client: String,
    subject: String,
    email: String,
    access: String,
    refresh: String,
    id_token: String,
    scope: String,
    expires: u64,
}
impl Account {
    fn clear(&mut self) {
        self.session = Uuid::new_v4().to_string();
        self.access.clear();
        self.refresh.clear();
        self.id_token.clear();
        self.scope.clear();
        self.expires = 0;
    }
    fn granted(&self) -> bool {
        self.scope.split_ascii_whitespace().any(|v| v == PLAN)
    }
}
#[derive(Serialize)]
pub struct Status {
    account: Option<String>,
    plan: bool,
    known: bool,
}
fn status(a: Option<Account>) -> Status {
    let known = a.as_ref().is_some_and(|a| !a.client.is_empty());
    match a.filter(|a| !a.access.is_empty()) {
        Some(a) => Status {
            known,
            plan: a.granted(),
            account: Some(if a.email.is_empty() {
                a.subject
            } else {
                a.email
            }),
        },
        None => Status {
            account: None,
            known,
            plan: false,
        },
    }
}
#[tauri::command]
pub async fn chatgpt_status(app: AppHandle) -> Result<Status> {
    let _lock = vault::lock(&app).await?;
    Ok(status(vault::load().await?))
}

#[derive(Deserialize)]
struct Tokens {
    access_token: String,
    expires_in: u64,
    refresh_token: Option<String>,
    id_token: Option<String>,
    scope: Option<String>,
    token_type: String,
}
impl Tokens {
    fn apply(self, a: &mut Account) -> Result<()> {
        if self.access_token.is_empty() || !self.token_type.eq_ignore_ascii_case("bearer") {
            return Err("auth".into());
        }
        a.access = self.access_token;
        a.expires = now().saturating_add(self.expires_in);
        if let Some(v) = self.refresh_token {
            a.refresh = v;
        }
        if let Some(v) = self.scope {
            a.scope = v;
        }
        Ok(())
    }
}
fn expired_grant(err: &serde_json::Value) -> bool {
    let code = err["error"]["code"]
        .as_str()
        .or_else(|| err["error"].as_str());
    matches!(
        code,
        Some(
            "invalid_grant"
                | "invalid_refresh_token"
                | "token_expired"
                | "refresh_token_expired"
                | "refresh_token_invalidated"
                | "refresh_token_reused"
        )
    )
}
pub(super) async fn access(app: &AppHandle) -> Result<String> {
    // Le renouvellement du jeton doit aboutir même si la requête est annulée.
    let app = app.clone();
    tauri::async_runtime::spawn(async move { renew(&app).await })
        .await
        .map_err(|_| "auth")?
}
async fn renew(app: &AppHandle) -> Result<String> {
    let _lock = vault::lock(app).await?;
    let mut a = vault::load().await?.ok_or("auth")?;
    if a.access.is_empty() || !a.granted() {
        return Err("auth".into());
    }
    if a.expires <= now() + 60 {
        if a.refresh.is_empty() {
            a.clear();
            vault::save(&a).await?;
            return Err("auth".into());
        }
        let reply = http()?
            .post(TOKEN)
            .timeout(Duration::from_secs(25))
            .form(&[
                ("grant_type", "refresh_token"),
                ("client_id", &a.client),
                ("refresh_token", &a.refresh),
                ("resource", API),
            ])
            .send()
            .await
            .map_err(|_| "network")?;
        if !reply.status().is_success() {
            let err: serde_json::Value = reply.json().await.unwrap_or_default();
            if expired_grant(&err) {
                a.clear();
                vault::save(&a).await?;
                return Err("auth".into());
            }
            return Err("network".into());
        }
        reply
            .json::<Tokens>()
            .await
            .map_err(|_| "auth")?
            .apply(&mut a)?;
        vault::save(&a).await?;
        if !a.granted() {
            return Err("auth".into());
        }
    }
    Ok(a.access)
}

#[derive(Deserialize)]
struct Discovery {
    issuer: String,
    jwks_uri: String,
    revocation_endpoint: String,
}
async fn discovery(client: &Client) -> Result<Discovery> {
    let data: Discovery = client
        .get(format!("{AUTH}/.well-known/openid-configuration"))
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|_| "network")?
        .error_for_status()
        .map_err(|_| "network")?
        .json()
        .await
        .map_err(|_| "auth")?;
    if data.issuer != AUTH
        || ![&data.jwks_uri, &data.revocation_endpoint]
            .iter()
            .all(|u| u.starts_with("https://auth.openai.com/"))
    {
        return Err("auth".into());
    }
    Ok(data)
}
#[derive(Deserialize)]
struct Identity {
    sub: String,
    nonce: String,
    email: Option<String>,
}
async fn identity(http: &Client, jwt: &str, client: &str, nonce: &str) -> Result<Identity> {
    let metadata = discovery(http).await?;
    let keys: JwkSet = http
        .get(metadata.jwks_uri)
        .send()
        .await
        .map_err(|_| "network")?
        .error_for_status()
        .map_err(|_| "network")?
        .json()
        .await
        .map_err(|_| "auth")?;
    let header = decode_header(jwt).map_err(|_| "auth")?;
    let jwk = keys.find(&header.kid.ok_or("auth")?).ok_or("auth")?;
    let key = DecodingKey::from_jwk(jwk).map_err(|_| "auth")?;
    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_issuer(&[AUTH]);
    validation.set_audience(&[client]);
    validation.set_required_spec_claims(&["iss", "sub", "aud", "exp"]);
    let claims = decode::<Identity>(jwt, &key, &validation)
        .map_err(|_| "auth")?
        .claims;
    if claims.nonce != nonce || claims.sub.is_empty() {
        return Err("auth".into());
    }
    Ok(claims)
}

fn callback(target: &str, state: &str, known_client: &str) -> Result<(String, String)> {
    if !target.starts_with("/auth/callback?") {
        return Err("callback".into());
    }
    let url = Url::parse(&format!("http://127.0.0.1{target}")).map_err(|_| "callback")?;
    let mut params = HashMap::new();
    for (key, value) in url.query_pairs() {
        if params.insert(key, value).is_some() {
            return Err("callback".into());
        }
    }
    if params.get("state").map(|s| s.as_ref()) != Some(state) {
        return Err("callback".into());
    }
    if params.contains_key("error") {
        return Err("denied".into());
    }
    let code = params
        .get("code")
        .filter(|v| !v.is_empty())
        .ok_or("callback")?;
    let client = params
        .get("client_id")
        .map(|v| v.as_ref())
        .unwrap_or(known_client);
    if client.is_empty()
        || client == "dynamic_agent_client"
        || (!known_client.is_empty() && known_client != client)
    {
        return Err("callback".into());
    }
    Ok((code.to_string(), client.into()))
}
async fn receive(
    listener: TcpListener,
    state: &str,
    client: &str,
    body: &str,
) -> Result<(String, String)> {
    loop {
        let (mut socket, _) = listener.accept().await.map_err(|_| "callback")?;
        let mut line = Vec::new();
        let read = async {
            // Lire tous les en-têtes évite que macOS coupe la connexion avant la réponse.
            let mut reader = BufReader::new((&mut socket).take(32 * 1024));
            reader.read_until(b'\n', &mut line).await?;
            let mut header = Vec::new();
            loop {
                header.clear();
                if reader.read_until(b'\n', &mut header).await? == 0 {
                    return std::io::Result::Ok(false);
                }
                if header == b"\r\n" || header == b"\n" {
                    return Ok(true);
                }
            }
        };
        if !matches!(timeout(Duration::from_secs(3), read).await, Ok(Ok(true))) {
            continue;
        }
        let request = String::from_utf8_lossy(&line);
        let mut parts = request.split_whitespace();
        let method = parts.next();
        let path = parts.next().unwrap_or("");
        if method != Some("GET") || !path.starts_with("/auth/callback?") {
            continue;
        }
        let result = callback(path, state, client);
        let msg = if result.is_ok() {
            "200 OK"
        } else {
            "400 Bad Request"
        };
        let length = body.len();
        let response = format!(
            "HTTP/1.1 {msg}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {length}\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n{body}"
        );
        let _ = socket.write_all(response.as_bytes()).await;
        let _ = socket.shutdown().await;
        return result;
    }
}

// Remplacer ou retirer l’émetteur réveille la tentative précédente.
static LOGIN: std::sync::Mutex<Option<tokio::sync::watch::Sender<()>>> =
    std::sync::Mutex::new(None);

fn begin_login() -> tokio::sync::watch::Receiver<()> {
    let (sender, receiver) = tokio::sync::watch::channel(());
    *LOGIN.lock().unwrap() = Some(sender);
    receiver
}

#[tauri::command]
pub fn chatgpt_cancel_connect() {
    LOGIN.lock().unwrap().take();
}

#[tauri::command]
pub async fn chatgpt_connect(
    app: AppHandle,
    different: bool,
    return_message: String,
) -> Result<Status> {
    let mut cancelled = begin_login();
    let a = {
        let _lock = vault::lock(&app).await?;
        let mut a = vault::load().await?.unwrap_or_default();
        if a.host.is_empty() {
            a.host = format!("urn:uuid:{}", Uuid::new_v4());
            vault::save(&a).await?;
        }
        a
    };
    let session = a.session.clone();
    let a = tokio::select! {
        _ = cancelled.changed() => return Err("cancelled".into()),
        result = timeout(Duration::from_secs(900), connect(app.clone(), a, different, &return_message)) =>
            result.map_err(|_| "timeout")??,
    };
    let _lock = vault::lock(&app).await?;
    // Une autre instance peut avoir changé de compte pendant le passage dans le navigateur.
    let current = vault::load().await?;
    if current.is_none_or(|current| current.session != session) || cancelled.has_changed().is_err()
    {
        return Err("cancelled".into());
    }
    vault::save(&a).await?;
    writing::clear_usage();
    Ok(status(Some(a)))
}

async fn connect(
    app: AppHandle,
    mut a: Account,
    different: bool,
    return_message: &str,
) -> Result<Account> {
    if different {
        if !a.access.is_empty() {
            return Err("auth".into());
        }
        a = Account {
            host: a.host,
            ..Account::default()
        };
    }
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .await
        .map_err(|_| "callback")?;
    let redirect = format!(
        "http://{}/auth/callback",
        listener.local_addr().map_err(|_| "callback")?
    );
    let (state, nonce, verifier) = (random()?, random()?, random()?);
    let challenge = URL_SAFE_NO_PAD.encode(digest::digest(&digest::SHA256, verifier.as_bytes()));
    let mut url = Url::parse(&format!("{AUTH}/api/accounts/authorize")).unwrap();
    {
        let mut q = url.query_pairs_mut();
        q.extend_pairs([
            ("ext_agent_host_id", a.host.as_str()),
            ("response_type", "code"),
            ("resource", API),
            ("redirect_uri", &redirect),
            ("state", &state),
            ("nonce", &nonce),
            ("code_challenge_method", "S256"),
            ("code_challenge", &challenge),
            (
                "scope",
                "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
            ),
        ]);
        if a.client.is_empty() {
            q.append_pair("client_id", "dynamic_agent_client")
                .append_pair("agent_name_hint", "MondoWrite");
        } else {
            q.append_pair("client_id", &a.client);
            if !a.id_token.is_empty() {
                q.append_pair("id_token_hint", &a.id_token);
            }
            if !a.granted() && !a.access.is_empty() {
                q.append_pair("prompt", "consent");
            }
        }
    }
    super::open_web_url(app, url.to_string())
        .await
        .map_err(|_| "browser")?;
    let (code, client) = receive(listener, &state, &a.client, return_message).await?;
    let http = http()?;
    let tokens: Tokens = http
        .post(TOKEN)
        .form(&[
            ("grant_type", "authorization_code"),
            ("client_id", &client),
            ("code", &code),
            ("code_verifier", &verifier),
            ("redirect_uri", &redirect),
            ("resource", API),
        ])
        .send()
        .await
        .map_err(|_| "network")?
        .error_for_status()
        .map_err(|_| "auth")?
        .json()
        .await
        .map_err(|_| "auth")?;
    let jwt = tokens.id_token.as_deref().ok_or("auth")?;
    let who = identity(&http, jwt, &client, &nonce).await?;
    if !a.subject.is_empty() && who.sub != a.subject {
        return Err("auth".into());
    }
    a.clear();
    a.subject = who.sub;
    a.email = who.email.unwrap_or_default();
    a.id_token = jwt.into();
    a.client = client;
    tokens.apply(&mut a)?;
    Ok(a)
}

#[tauri::command]
pub async fn chatgpt_disconnect(app: AppHandle) -> Result<bool> {
    let _lock = vault::lock(&app).await?;
    chatgpt_cancel_connect();
    writing::cancel_all();
    writing::clear_usage();
    let Some(mut a) = vault::load().await? else {
        return Ok(true);
    };
    let mut confirmed = a.refresh.is_empty();
    if !confirmed {
        let revoke = async {
            let client = http()?;
            let endpoint = discovery(&client).await?.revocation_endpoint;
            for attempt in 0..2 {
                let result = client
                    .post(&endpoint)
                    .form(&[
                        ("token", a.refresh.as_str()),
                        ("token_type_hint", "refresh_token"),
                        ("client_id", &a.client),
                    ])
                    .send()
                    .await;
                if let Ok(response) = result {
                    if response.status().is_success() {
                        return Ok(true);
                    }
                    if !response.status().is_server_error() {
                        break;
                    }
                }
                if attempt == 0 {
                    tokio::time::sleep(Duration::from_millis(300)).await;
                }
            }
            Result::Ok(false)
        };
        confirmed = matches!(timeout(Duration::from_secs(12), revoke).await, Ok(Ok(true)));
    }
    a.clear();
    vault::save(&a).await?;
    Ok(confirmed)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn replacing_or_cancelling_login_wakes_pending_attempt() {
        let mut first = begin_login();
        let mut second = begin_login();
        assert!(first.changed().await.is_err());
        assert!(!second.has_changed().unwrap());
        chatgpt_cancel_connect();
        assert!(second.changed().await.is_err());
    }
    #[test]
    fn callback_binds_state_code_and_registration() {
        let first = "/auth/callback?state=abc&code=one&client_id=issued";
        assert!(callback(first, "abc", "").is_ok());
        assert!(callback(first, "xyz", "").is_err());
        assert!(callback(first, "abc", "different").is_err());
        assert!(callback("/auth/callback?state=abc&code=x", "abc", "").is_err());
        assert!(callback("/auth/callback?state=abc&code=x", "abc", "issued").is_ok());
        assert!(callback("/auth/callback?state=abc&state=abc&code=x", "abc", "issued").is_err());
        assert_eq!(
            callback("/auth/callback?state=abc&error=access_denied", "abc", "").unwrap_err(),
            "denied"
        );
    }
    #[tokio::test]
    async fn browser_can_return_through_the_bound_loopback_port() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let address = listener.local_addr().unwrap();
        let callback_task = tokio::spawn(receive(
            listener,
            "attempt",
            "",
            "Tu peux revenir dans MondoWrite.",
        ));
        let reply = reqwest::Client::builder()
            .no_proxy()
            .build()
            .unwrap()
            .get(format!(
                "http://{address}/auth/callback?state=attempt&client_id=test-client&code=test-code"
            ))
            .send()
            .await
            .unwrap();
        assert!(reply.status().is_success());
        assert_eq!(
            reply.text().await.unwrap(),
            "Tu peux revenir dans MondoWrite."
        );
        assert_eq!(
            callback_task.await.unwrap().unwrap(),
            ("test-code".into(), "test-client".into())
        );
    }
    #[test]
    fn identity_alone_does_not_enable_plan() {
        let mut a = Account {
            access: "access".into(),
            client: "registered".into(),
            subject: "person".into(),
            scope: "openid profile email".into(),
            ..Account::default()
        };
        assert!(!a.granted());
        a.scope.push_str(" chatgpt.tokens.use.direct");
        assert!(a.granted());
        a.clear();
        let state = status(Some(a));
        assert!(!state.plan && state.account.is_none() && state.known);
    }
    #[test]
    fn refresh_replaces_rotated_tokens_and_retains_omitted_scope() {
        let mut a = Account {
            scope: PLAN.into(),
            refresh: "old".into(),
            expires: 0,
            ..Account::default()
        };
        assert!(a.expires <= now());
        let tokens: Tokens = serde_json::from_value(serde_json::json!({
            "access_token":"new","refresh_token":"replacement","expires_in":3600,"token_type":"Bearer"
        })).unwrap();
        tokens.apply(&mut a).unwrap();
        assert!(a.expires > now() && a.granted() && a.refresh == "replacement");
        assert!(expired_grant(
            &serde_json::json!({"error":{"code":"refresh_token_reused"}})
        ));
        assert!(expired_grant(&serde_json::json!({"error":"invalid_grant"})));
        assert!(!expired_grant(
            &serde_json::json!({"error":"temporarily_unavailable"})
        ));
    }
}
