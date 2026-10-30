fn main() {
    tauri_build::build();

    if std::env::var("CARGO_CFG_WINDOWS").is_ok() {
        if let Ok(out_dir) = std::env::var("OUT_DIR") {
            println!("cargo:rustc-link-search=native={out_dir}");
        }
    }
}
