mod backup;
mod biblio;
mod gemini;
mod secrets;
mod vector;

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
    },
    Migration {
        version: 4,
        description: "factures",
        sql: include_str!("../migrations/004_factures.sql"),
        kind: MigrationKind::Up,
    },
    Migration {
        version: 5,
        description: "paiements",
        sql: include_str!("../migrations/005_paiements.sql"),
        kind: MigrationKind::Up,
    },
    Migration {
        version: 6,
        description: "moodboard",
        sql: include_str!("../migrations/006_moodboard.sql"),
        kind: MigrationKind::Up,
    },
    Migration {
        version: 7,
        description: "biblio_bibliotheque",
        sql: include_str!("../migrations/007_biblio_bibliotheque.sql"),
        kind: MigrationKind::Up,
    },
    Migration {
        version: 8,
        description: "biblio_tags",
        sql: include_str!("../migrations/008_biblio_tags.sql"),
        kind: MigrationKind::Up,
    },
    Migration {
        version: 9,
        description: "biblio_types",
        sql: include_str!("../migrations/009_biblio_types.sql"),
        kind: MigrationKind::Up,
    },
    Migration {
        version: 10,
        description: "biblio_embeddings",
        sql: include_str!("../migrations/010_biblio_embeddings.sql"),
        kind: MigrationKind::Up,
    },
    Migration {
        version: 11,
        description: "biblio_text_embeddings",
        sql: include_str!("../migrations/011_biblio_text_embeddings.sql"),
        kind: MigrationKind::Up,
    },
    Migration {
        version: 12,
        description: "biblio_colors",
        sql: include_str!("../migrations/012_biblio_colors.sql"),
        kind: MigrationKind::Up,
    },
    Migration {
        version: 13,
        description: "biblio_sub_collections",
        sql: include_str!("../migrations/013_biblio_sub_collections.sql"),
        kind: MigrationKind::Up,
    },
    Migration {
        version: 14,
        description: "biblio_collection_order",
        sql: include_str!("../migrations/014_biblio_collection_order.sql"),
        kind: MigrationKind::Up,
    },
    Migration {
        version: 15,
        description: "biblio_moodboards",
        sql: include_str!("../migrations/015_biblio_moodboards.sql"),
        kind: MigrationKind::Up,
    },
    Migration {
        version: 16,
        description: "biblio_collection_settings",
        sql: include_str!("../migrations/016_biblio_collection_settings.sql"),
        kind: MigrationKind::Up,
    },
    Migration {
        version: 17,
        description: "biblio_trash",
        sql: include_str!("../migrations/017_biblio_trash.sql"),
        kind: MigrationKind::Up,
    },
    Migration {
        version: 18,
        description: "biblio_map",
        sql: include_str!("../migrations/018_biblio_map.sql"),
        kind: MigrationKind::Up,
    },
    Migration {
        version: 19,
        description: "biblio_heic_retry",
        sql: include_str!("../migrations/019_biblio_heic_retry.sql"),
        kind: MigrationKind::Up,
    },
    Migration {
        version: 20,
        description: "biblio_ocr",
        sql: include_str!("../migrations/020_biblio_ocr.sql"),
        kind: MigrationKind::Up,
    },
    Migration {
        version: 21,
        description: "biblio_recipes",
        sql: include_str!("../migrations/021_biblio_recipes.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(vector::VectorState::default())
        .setup(|app| {
            // Une restauration de sauvegarde demandée avant la fermeture s'applique ici, avant l'ouverture de la base.
            backup::apply_pending_restore(app.handle());
            Ok(())
        })
        .plugin(
            SqlBuilder::default()
                .add_migrations("sqlite:form.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            secrets::secret_set,
            secrets::secret_exists,
            secrets::secret_delete,
            backup::stage_restore,
            backup::restart_app,
            backup::prune_backups,
            backup::default_backup_dir,
            vector::vc_load,
            vector::vc_tool,
            vector::vc_pointer,
            vector::vc_key,
            vector::vc_close,
            gemini::gemini_generate,
            gemini::gemini_generate_video,
            gemini::gemini_models,
            gemini::gemini_image,
            biblio::scan::scan_folder,
            biblio::saver::saver_start,
            biblio::saver::saver_stop,
            biblio::saver::link_fetch,
            biblio::saver::link_cleanup,
            biblio::saver::saver_defaults,
            biblio::saver::saver_file_age_days,
            biblio::thumbs::start_thumbs,
            biblio::thumbs::thumbs_dir,
            biblio::ai::ai_status,
            biblio::ai::ai_download_model,
            biblio::ai::ai_start_embeddings,
            biblio::ai_text::ai_text_status,
            biblio::ai_text::ai_download_text,
            biblio::ai_text::ai_encode_texts,
            biblio::colors::colors_start,
            biblio::dupes::dupes_scan,
            biblio::ocr::ocr_start,
            biblio::trash::trash_files
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de Form");
}
