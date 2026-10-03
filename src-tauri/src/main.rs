// Empêche l'ouverture d'une fenêtre console noire sous Windows en version finale.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    form_lib::run()
}
