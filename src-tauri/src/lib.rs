use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

pub fn run() {
    // Les migrations s'appliquent une seule fois, dans l'ordre. Pour changer la base :
    // on ajoute un nouveau fichier de migration, on ne modifie jamais un ancien.
    let migrations = vec![Migration {
        version: 1,
        description: "objets_et_reglages",
        sql: include_str!("../migrations/001_objets_et_reglages.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            SqlBuilder::default()
                .add_migrations("sqlite:form.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("erreur au lancement de Form");
}
