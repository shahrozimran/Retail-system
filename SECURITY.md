# Security model

The application uses Supabase Auth and PostgreSQL through a server-hosted Next.js API. A private bootstrap SQL file configures one email/password account. Account credentials and the bootstrap verifier are absent from tracked source. Business tables start empty; the schema creates only internal zero-balance configuration, and the account bootstrap creates only Auth/access configuration.

## Authentication and access

- The server uses the Supabase publishable key and the current user's access JWT. Service-role keys and database passwords are not used by the application. Configuration explicitly rejects secret/service-role keys in the public-key setting.
- Every API call validates the user with Supabase Auth and checks `retail_session`. Database policies and functions independently require the single active admin's user ID, matching current account email, an unbanned account and a live, unexpired `auth.sessions` row matching the JWT session claim.
- Public signup must be disabled in the project's Auth settings. There is no signup route in the application. Valid credentials belonging to another Auth account do not grant retail access.
- Browser access and refresh tokens use HttpOnly, SameSite=Strict cookies, with Secure required in production. Access cookies last at most one hour; refresh cookies last seven days and Supabase controls token validity and rotation. Server refresh only rewrites cookies when tokens change, avoiding stale-cookie overwrites from ordinary parallel requests.
- Android keeps access and refresh tokens only in memory and signs in again after app restart. Native requests send bearer/header tokens and cannot fall back to browser cookies. New native tokens are delivered through protected API response headers. No credential is embedded in the APK.
- Logout terminates the current Supabase session, then clears local tokens/cookies. The SQL check rejects the old access JWT after its Auth session row is removed. Disabling the app-admin record or changing its account email also removes database access.
- Supabase Auth supplies sign-in rate limits. Configure them and Vercel's edge rate limiting appropriately for the single-admin application. Do not expose passwords, bearer/refresh tokens, SQL bootstrap files, connection strings or request bodies in logs.

## Database permissions and consistency

All business and access tables have RLS enabled. Anonymous roles have no table access. Authenticated callers can select only when the admin/session policy passes; they have no direct table insert/update/delete privileges. Business writes run through an allowlisted `retail_mutate` function with an empty search path, fully qualified application objects and independent payload validation. Private helpers live in a separate, unexposed `retail_private` schema. Only the explicitly permitted public functions can be executed.

The mutation RPC runs in one PostgreSQL transaction. A transaction-scoped advisory lock serializes complex inventory/ledger changes and duplicate operation IDs. Constraint errors, insufficient stock, unknown references or later write failures roll back the whole request, including its operation and audit records. Database foreign keys, unique SKUs/recipe keys, finite bounded numeric checks, positive quantities/ratios, monetary precision and text/array bounds apply independently of UI controls.

A completed operation is stored under `(authenticated user ID, request ID)` with a canonical payload hash and result in the same transaction as its business changes. Retrying a committed operation returns that result; reusing its ID for different data is rejected. On an uncertain network response the client retains the receipt, including across reloads in the same tab. It clears the receipt on known SQL rollback or success. A deliberate new submission on another tab/device is a new operation; the app cannot infer every duplicated human intent. Retain operation IDs/results and audit records according to the business retention policy.

Products and customer ledgers have explicit stable foreign keys. Posted sale/purchase entries cannot be edited or deleted through the API. Customers with balances or history and products/materials with references cannot be deleted. Production composition is normalized into unique material rows, and raw-material deductions, finished stock and production history commit atomically. Invoice balances are shown separately and never added a second time to selected sales. Selecting a known customer filters invoice selection to explicitly linked transactions.

PostgreSQL stores submitted names/descriptions as text; there is no spreadsheet formula interpreter. React renders them as text and invoices use PDF text/table APIs. There are no SQL string-interpolation queries using request fields: requests pass bound JSON/UUID parameters to fixed functions.

## Browser and platform protections

The Windows Tauri application bundles local assets and exposes a bounded Rust API bridge, PDF save/preview commands and signature-verified updates to the main local window only. It shares the existing bearer-only native authentication contract and keeps tokens in Rust process memory across document navigations, without exposing them to frontend JavaScript. Logout clears this native state. CSP permits local routing assets and IPC. External window navigation and arbitrary filesystem, shell and network calls are denied to the frontend. See `desktop/README.md` for installer signing and update-key handling.

Mutation requests require the application marker header and an exact configured browser origin. The native transport has a separate allowed origin list but still requires valid user credentials/tokens. There is no cross-origin browser CORS grant. Responses carrying sessions or business data are private/no-store.

Production web scripts use a fresh CSP nonce per response; the Android export hashes its generated inline scripts. Arbitrary inline scripts, object content and unapproved external connections are denied. Existing inline styles remain permitted. Web headers include frame denial, nosniff, no-referrer, Permissions-Policy, COOP and HSTS. Android backups and cleartext networking are disabled; FileProvider is limited to the invoice cache directory.

## Configuration and rollout

Run the public schema migration, then the separate ignored admin bootstrap. Review the bootstrap privately: it sets the requested account password verifier and revokes that account's prior sessions. Do not commit it. Disable public signup in Supabase, configure the Vercel environment, redeploy the Next application and rebuild Android. Remote project settings and a local build are separate: the application remains unavailable until the migrations/account setup are applied.

The old Google backend files and runtime settings have been removed. Deactivate any obsolete public backend deployments when retiring the old system; the application no longer calls them. No old records are imported or deleted by this migration.

Use distinct Supabase projects for staging/production if testing with business entries. The included test suite uses disposable in-memory PostgreSQL and dummy Auth fixtures; it never creates hosted business records. A successful local test does not replace verification of the project's actual Auth settings, applied migrations, admin account and Vercel environment. MFA and multiple staff roles are not implemented.
