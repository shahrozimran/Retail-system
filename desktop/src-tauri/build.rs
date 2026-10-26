fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                "retail_request", "save_invoice", "print_invoice", "check_updates", "install_update",
            ]),
        ),
    ).expect("Desktop build configuration failed");
}
