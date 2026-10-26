use base64::Engine;
use std::{fs, path::PathBuf};

#[test]
#[ignore = "Run after producing the Windows release installer"]
fn release_installer_matches_embedded_update_key() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let config: serde_json::Value = serde_json::from_str(&fs::read_to_string(root.join("tauri.conf.json")).unwrap()).unwrap();
    let public = base64::engine::general_purpose::STANDARD.decode(config["plugins"]["updater"]["pubkey"].as_str().unwrap()).unwrap();
    let public_text = String::from_utf8(public).unwrap();
    let public_key = minisign_verify::PublicKey::decode(&public_text).unwrap();
    let installer = root.join(format!("target/release/bundle/nsis/{}_{}_x64-setup.exe", config["productName"].as_str().unwrap(), config["version"].as_str().unwrap()));
    let sig = fs::read_to_string(installer.with_extension("exe.sig")).unwrap();
    let signature = base64::engine::general_purpose::STANDARD.decode(sig.trim()).unwrap();
    let signature = minisign_verify::Signature::decode(std::str::from_utf8(&signature).unwrap()).unwrap();
    let bytes = fs::read(installer).unwrap();
    public_key.verify(&bytes, &signature, false).unwrap();
    let mut corrupted = bytes; corrupted[1024] ^= 1;
    assert!(public_key.verify(&corrupted, &signature, false).is_err());
}
