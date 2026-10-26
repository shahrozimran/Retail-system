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

The **Desktop release** GitHub Actions workflow automatically builds and publishes a signed Windows update when desktop code, shared interface code or build dependencies change on `main`. Backend-only API/database changes deploy through Vercel and do not require a new desktop installer. Documentation-only changes do not trigger a desktop release.

One-time setup: in the repository's **Settings → Secrets and variables → Actions**, add `TAURI_SIGNING_PRIVATE_KEY` (the complete contents of the existing `desktop/private/updater.key`) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (the password value from `desktop/private/signing.json`). Use the original matching key; do not generate another one. These belong in GitHub Actions secrets, not Vercel or repository files. The workflow uses GitHub's automatic token for release uploads; no personal access token is needed.

After pushing a change, open **Actions → Desktop release** to follow progress. The workflow chooses the next patch version from existing stable desktop releases and stamps the Tauri config, Cargo manifest and Cargo lockfile in its temporary build workspace. There is no version commit to make manually. A higher version deliberately set in source is respected. Every release is tagged `desktop-vVERSION` at the exact source commit. Re-running a completed commit skips publication; re-running a failed upload can resume its draft. Older source commits cannot supersede a newer automated release.

Application checks, native tests and installer signature verification must pass before publication. The workflow uploads only the current installer, `.sig`, `latest.json` and `SHA256SUMS.txt` to a draft, then publishes that complete release as latest. A failed build/upload leaves the previous public update available. In **Actions**, use **Re-run failed jobs** after correcting a failed run's secrets or other external setup. To release the current `main` manually, use **Desktop release → Run workflow → main → Run workflow**.

Once the workflow succeeds, installed apps find the new version using **Check for updates**, then **Install verified update**. Publishing is automatic; users still choose when to install. The public verification key and update URL stay unchanged. The website keeps using Vercel's existing deployment pipeline.

For a manual local release, update `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and the app entry in `src-tauri/Cargo.lock` to a version higher than the latest published release, then build with the original signing files. Publish exactly the four generated files under the matching `desktop-vVERSION` release tag. Run `npm run test:release` to check version planning, retry behavior and publication safeguards without accessing GitHub or business data.

Updater package signatures are separate from Windows Authenticode publisher certificates. This local build has signed updater artifacts, but no purchased Windows publisher certificate was supplied, so the installer is not Authenticode-signed. Windows may show an unknown-publisher warning.

## Native security boundary

The window loads bundled assets and denies external navigation/new windows. CSP permits the local Tauri IPC transport; bundled inline script hashes are added by Tauri. Capabilities expose only five narrow application commands to the main local window. There is no generic filesystem, shell, arbitrary HTTP or remote-content permission available to frontend JavaScript.

The request bridge accepts only the production API's two fixed endpoints, GET/POST, allowlisted read parameters and bounded JSON bodies. It rejects redirects, header injection and oversized responses. Cookies are never forwarded. PostgreSQL RLS, admin session verification and transactional validation remain enforced on every request.

Invoice commands accept bounded PDF bytes and sanitize suggested filenames. Saving uses a user-selected native dialog; printing opens only a generated PDF path in the application cache. Update installation verifies the embedded signing key. The tests cover bridge destination restrictions, token boundaries, invoice validation and desktop authentication/retry integration.
