// TalkApp Ultra-Lightweight Desktop Client (~25 MB RAM)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{AppHandle, Manager, Emitter};

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Native Global Hotkeys for Mute and Deafen (No separate companion needed)
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
                let app_handle = app.handle().clone();

                // Ctrl+Shift+M -> Mikrofon Sustur / Aç
                if let Ok(shortcut_mute) = "ctrl+shift+m".parse::<Shortcut>() {
                    let _ = app.global_shortcut().on_shortcut(shortcut_mute, move |_app, _shortcut, _event| {
                        let _ = app_handle.emit("tauri-hotkey", "mute_toggle");
                    });
                }

                let app_handle_deafen = app.handle().clone();
                // Ctrl+Shift+D -> Kulaklık Sağırlaştır / Aç
                if let Ok(shortcut_deaf) = "ctrl+shift+d".parse::<Shortcut>() {
                    let _ = app.global_shortcut().on_shortcut(shortcut_deaf, move |_app, _shortcut, _event| {
                        let _ = app_handle_deafen.emit("tauri-hotkey", "deafen_toggle");
                    });
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running TalkApp application");
}
