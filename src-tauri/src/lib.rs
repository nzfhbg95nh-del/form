use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

pub fn run() {
    // Les migrations s'appliquent une seule fois, dans l'ordre. Pour changer la base :
    // on ajoute un nouveau fichier de migration, on ne modifie jamais un ancien.
    let migrations = vec![Migration {
        version: 1,
        description: "objets_et_reglages",
        sql: include_str!("../migrations/001_objets_et_reglages.sql"),
        kind: MigrationKind::Up,
    },
    Migration {
        version: 2,
        description: "clients_et_prestations",
        sql: include_str!("../migrations/002_clients_et_prestations.sql"),
        kind: MigrationKind::Up,
    },
    Migration {
        version: 3,
        description: "devis",
        sql: include_str!("../migrations/003_devis.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            // Capture rapide : Ctrl + Alt + N, même quand Form n'est pas au premier plan.
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        let _ = app.emit("quick-capture", ());
                    }
                })
                .build(),
        )
        .setup(|app| {
            // Si un autre programme utilise déjà ce raccourci, Form démarre quand même.
            let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyN);
            let _ = app.global_shortcut().register(shortcut);
            Ok(())
        })
        .plugin(
            SqlBuilder::default()
                .add_migrations("sqlite:form.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("erreur au lancement de Form");
}
