# Global Auto Parts retail system

Inventory, raw materials, production, sales, invoices and customer ledgers using Next.js, Supabase Auth / PostgreSQL, and Capacitor Android. The browser and Android app use the same Vercel API. There is no Google database backend or fallback.

## Fresh setup

The database migration creates the schema and a zero-valued internal finance account. It includes no products, materials, customers, transactions, ledger entries, production records or sample data. The admin setup creates only the configured Auth account and its app-access record. Nothing is imported from the former backend.

1. In the intended Supabase project's SQL Editor, run `supabase/migrations/202610260001_retail.sql` once as the project `postgres` role.
2. Run the separately generated **private** `supabase/private/admin-bootstrap.sql`. It contains the configured account and salted bcrypt verifier, is ignored by Git, and is deliberately outside the public migration folder. Keep it private. It creates/updates the requested email/password account, confirms its email, creates its email identity, revokes its previous sessions and assigns the application's single admin slot. It inserts no business records. Do not add it to version control.
3. In Supabase Authentication settings, disable public user signup. Set Site URL to `https://retail-system-chi.vercel.app`. Email/password login must be enabled. Configure Auth rate limits for the project. Only the active account in `retail_admin` can use the retail API, including when other Auth users already exist.
4. In Vercel, set the server variables `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` to the project's connection values, and `APP_ORIGIN=https://retail-system-chi.vercel.app`. The local ignored `frontend/.env.local` is already configured with the supplied project. No password or service-role key belongs in Vercel settings or public code.
5. Keep Vercel's Next.js framework and server output. With Root Directory `frontend`, use build command `npm run build` and the normal `.next` output. Do not deploy the Android `out` directory as the website.
6. Redeploy the application, then sign in with the configured email/password. The initial business dashboard should be empty with zero balances. Add the business records yourself through the application.

See [supabase/README.md](supabase/README.md) for migration order, validation queries and connection checks, and [SECURITY.md](SECURITY.md) for the enforced access and transaction rules.

## Local development

Use Node.js 22.18 or newer. Install from the repository root with `npm ci`; the root npm workspace lockfile is authoritative. In `frontend/.env.local`, set `APP_ORIGIN=http://localhost:3000` for local browser development, preserving the configured Supabase settings. Run `npm run dev` and open http://localhost:3000.

The local project needs the Supabase schema and private account setup to be applied before login works. You can check readiness with `npm run check:supabase`. This check does not create records or sign in.

## Web and Android

- `npm run build` builds the hosted Next server, including `/api/auth/` and `/api/proxy/`.
- `npm start` runs the production server. Production expects the configured HTTPS browser origin.
- `npm run build:android` creates the static Android bundle with script-hash CSP. Set `NEXT_PUBLIC_API_ORIGIN=https://retail-system-chi.vercel.app` before building.
- From `frontend`, run `npx cap sync android`, then build/release the Android app. Native tokens stay in memory; web session tokens use HttpOnly cookies. Both refresh through the Vercel API.

The public Supabase key grants no business access without the allowed admin's active session. The service-role key and database password are not needed by the running application.

## Windows desktop

The Tauri desktop application uses the same interface, authorized account and hosted API. Run `npm run build:desktop` to create the Windows x64 installer and signed update artifacts under `desktop/artifacts/`. Initial signing setup is `npm run desktop:signing`; keep the generated ignored private files for subsequent releases. See [desktop/README.md](desktop/README.md) for installation, native PDF saving/printing, prerequisites and release publishing. Internet access is required for business data.

## Checks

Run `npm test`, `npm run typecheck`, `npm run lint`, `npm audit --audit-level=low`, and both build commands. The suite runs migrations and business operations against an isolated PostgreSQL instance via PGlite, plus mocked Supabase Auth integration and client retry tests. Test records exist only in that isolated process and are not sent to the hosted project.

Financial transactions remain immutable. Corrections require separate records; customers/materials/products referenced by business history cannot be deleted. Preserve the audit and operation tables when maintaining the database.
