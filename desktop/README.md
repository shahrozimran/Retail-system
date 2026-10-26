# Global Auto Parts for Windows

This Tauri 2 application bundles the existing interface and connects to the same Vercel API and Supabase account as the website and Android application. Business data remains in Supabase. Internet access is required for login, reads and writes. It does not create a local business database or import any records.

## Install and use

The release installer is copied to `artifacts/` by `npm run build:desktop`. Run the `Global.Auto.Parts_1.0.1_x64-setup.exe` installer. It installs for the current Windows user and provides a Start menu entry and desktop shortcut option. Windows 10/11 x64 with Microsoft Edge WebView2 is required; the installer can download WebView2 if it is missing.

Sign in using the existing authorized account. Access and refresh tokens remain in the Rust process's memory, survive page navigation/reloads and disappear when the app closes. They are not returned to frontend JavaScript. The native request bridge uses the existing native/bearer-only API contract, so Vercel needs no new database secret or desktop-specific CORS grant. Local routing asset requests are permitted by CSP; external frontend network destinations remain restricted.

In the invoice window, **Export PDF** opens a native Windows save dialog. **Print PDF** opens a generated copy in the default PDF reader for preview and printing. You choose the printer in that reader; opening the preview does not send a physical print job. Preview files are stored under this application's cache directory. Delete those generated previews when no longer needed.

## Build from source

Install Node.js 22.18+, Rust stable for `x86_64-pc-windows-msvc`, Visual Studio C++ build tools and the Windows SDK. The initial build on this computer installed Rust without changing the system PATH; the provided build script includes `%USERPROFILE%/.cargo/bin` for its child processes.

From the repository root:

```text
npm ci
npm run desktop:signing
npm run build:desktop
```

Signing is already configured on this computer. Run `desktop:signing` only for the initial setup of a new application identity. Existing signing and verification keys are intentionally never replaced automatically. The command generates an encrypted updater key and password under ignored `desktop/private/` and places only the public verification key in `tauri.conf.json`. Keep a secure backup of both private files to produce future compatible updates. On another build machine restore those files, or supply the matching `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` through the build environment. Neither the installer nor Git includes those private files, the account password, the Supabase key or local environment files.

`npm run desktop:dev` exports the frontend and starts a debug desktop application. To rebuild only the Rust installer after an unchanged frontend export, use `node desktop/scripts/build.mjs --native-only`.

Desktop API origin must match `src-tauri/api-origin.txt` and `NEXT_PUBLIC_API_ORIGIN` in the ignored frontend environment. The build refuses a mismatch. Keep the website deployed as a Next server; the desktop bundle contains no API server or database credentials.

## Updates and release signing

**Check for updates** reads the project's GitHub Releases `latest.json` endpoint. It handles an unpublished channel explicitly. Published updates are installed only after the user presses **Install verified update**, and Tauri verifies each installer with the embedded public signing key.

The release endpoint must be accessible without GitHub sign-in. A private release repository returns 404 to the native updater, even when the owner can download files in a signed-in browser. In that case install the generated signed installer manually until a publicly reachable artifact channel is configured; keep the source repository private if desired. No GitHub access token is embedded in the application.

For the next release, update both `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` versions, build with the original private signing files, and publish the installer, its `.sig` and generated `artifacts/latest.json` in a GitHub Release tagged `desktop-vVERSION`. The manifest uses the new version and an entry under `platforms.windows-x86_64` with the installer HTTPS `url` and the contents of its `.sig` as `signature`. `SHA256SUMS.txt` records the exact generated artifacts. Publishing releases and setting up CI signing are separate from building a local installer. No release is published automatically.

Updater package signatures are separate from Windows Authenticode publisher certificates. This local build has signed updater artifacts, but no purchased Windows publisher certificate was supplied, so the installer is not Authenticode-signed. Windows may show an unknown-publisher warning.

## Native security boundary

The window loads bundled assets and denies external navigation/new windows. CSP permits the local Tauri IPC transport; bundled inline script hashes are added by Tauri. Capabilities expose only five narrow application commands to the main local window. There is no generic filesystem, shell, arbitrary HTTP or remote-content permission available to frontend JavaScript.

The request bridge accepts only the production API's two fixed endpoints, GET/POST, allowlisted read parameters and bounded JSON bodies. It rejects redirects, header injection and oversized responses. Cookies are never forwarded. PostgreSQL RLS, admin session verification and transactional validation remain enforced on every request.

Invoice commands accept bounded PDF bytes and sanitize suggested filenames. Saving uses a user-selected native dialog; printing opens only a generated PDF path in the application cache. Update installation verifies the embedded signing key. The tests cover bridge destination restrictions, token boundaries, invoice validation and desktop authentication/retry integration.
