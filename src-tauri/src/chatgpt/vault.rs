//! The head entry commits a complete generation of chunks. Windows Credential
//! Manager limits each credential blob to 2560 bytes.
use super::{Account, Result};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::fs::{File, OpenOptions};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

#[derive(Serialize, Deserialize)]
struct Head {
    generation: String,
    chunks: usize,
}

fn entry(name: &str) -> Result<Entry> {
    Entry::new("app.cosmos.ecriture.chatgpt", name).map_err(|_| "vault".into())
}
fn head() -> Result<Option<Head>> {
    match entry("head")?.get_password() {
        Ok(value) => serde_json::from_str(&value)
            .map(Some)
            .map_err(|_| "vault".into()),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("vault".into()),
    }
}
fn chunk(head: &Head, index: usize) -> Result<Entry> {
    entry(&format!("{}-{index}", head.generation))
}
fn remove(head: &Head) {
    for index in 0..head.chunks {
        if let Ok(entry) = chunk(head, index) {
            let _ = entry.delete_credential();
        }
    }
}
pub async fn lock(app: &AppHandle) -> Result<File> {
    let dir = app.path().app_local_data_dir().map_err(|_| "vault")?;
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::create_dir_all(&dir).map_err(|_| "vault")?;
        let file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(dir.join("chatgpt.lock"))
            .map_err(|_| "vault")?;
        file.lock().map_err(|_| "vault")?;
        Ok(file)
    })
    .await
    .map_err(|_| "vault")?
}
pub async fn load() -> Result<Option<Account>> {
    tauri::async_runtime::spawn_blocking(|| {
        let Some(head) = head()? else { return Ok(None) };
        let mut bytes = Vec::new();
        for i in 0..head.chunks {
            bytes.extend(chunk(&head, i)?.get_secret().map_err(|_| "vault")?);
        }
        serde_json::from_slice(&bytes)
            .map(Some)
            .map_err(|_| "vault".into())
    })
    .await
    .map_err(|_| "vault")?
}
pub async fn save(account: &Account) -> Result<()> {
    let bytes = serde_json::to_vec(account).map_err(|_| "vault")?;
    tauri::async_runtime::spawn_blocking(move || {
        let old = head()?;
        let parts = bytes.chunks(2000);
        let next = Head {
            generation: Uuid::new_v4().to_string(),
            chunks: parts.len(),
        };
        let commit = || -> Result<()> {
            for (i, part) in parts.enumerate() {
                chunk(&next, i)?.set_secret(part).map_err(|_| "vault")?;
            }
            entry("head")?
                .set_password(&serde_json::to_string(&next).map_err(|_| "vault")?)
                .map_err(|_| "vault".into())
        };
        if let Err(error) = commit() {
            remove(&next);
            return Err(error);
        }
        if let Some(old) = old {
            remove(&old);
        }
        Ok(())
    })
    .await
    .map_err(|_| "vault")?
}
