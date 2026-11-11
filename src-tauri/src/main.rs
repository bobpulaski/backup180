//! Application entry point for the Backup180 binary.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    backup180_lib::run()
}
