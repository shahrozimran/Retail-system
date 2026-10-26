# Supabase setup — empty business database

## Run these files in order

1. `migrations/202610260001_retail.sql`: schema, constraints, RLS, transactional business RPCs and a version-only health function. Run once in this project's SQL Editor as `postgres`. It creates only the zero-valued internal finance account; all business tables are empty. A second manual run is intentionally rejected rather than dropping existing tables.
2. `private/admin-bootstrap.sql`: generated locally for the requested account. This separate file is ignored by Git and contains an email plus a salted bcrypt verifier. It creates/updates that Auth account and email identity, confirms its email, revokes that account's prior sessions and assigns the single application-admin slot. It does not insert products, materials, customers, sales or ledger history. Never publish this file. It is not included in automatic public migrations.
3. `migrations/202610260002_transaction_corrections.sql`: enables admin transaction edits/deletions, stale-edit protection and an audit archive. It preserves existing entries during installation and can be rerun safely. Existing installations need only this upgrade, not the original migration or account bootstrap. See `TRANSACTION_CORRECTIONS.md`.

No old database export, import script or sample seed is included. `config.toml` disables local seed execution and local public signup. Hosted Auth settings must also be configured in the dashboard; changing this local file alone does not update the hosted project.

## Hosted Supabase settings

Enable the email/password provider and disable **Allow new users to sign up** in Authentication. Set Site URL to `https://retail-system-chi.vercel.app`. Keep the normal one-hour access-token expiry and refresh-token rotation/reuse protection enabled. Apply suitable Auth rate limits. Only the account in `retail_admin` can read or write application data, irrespective of any unrelated Auth accounts.

The application needs only the project URL and a publishable key. It sends each authenticated user's JWT to the Data API; it does not use a service-role key or a direct database connection/password. Keep the `retail_private` schema out of the exposed Data API schemas. The default public schema is sufficient.

## Vercel environment

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | Project URL from the supplied Supabase project; local value is already in ignored `frontend/.env.local`. |
| `SUPABASE_PUBLISHABLE_KEY` | Enabled publishable project key; local value is already configured. |
| `APP_ORIGIN` | `https://retail-system-chi.vercel.app` |
| `NEXT_PUBLIC_API_ORIGIN` | Same hosted origin, required for Android builds. |
| `NATIVE_ORIGINS` | Optional override; defaults to `https://localhost,capacitor://localhost`. |

Use server environment variables for the two Supabase settings; never store the account password in Vercel or tracked source. Remove the former backend and custom admin-password variables. After changing environment variables, redeploy the Next application. Keep the server API routes; a static website export omits them.

## Check readiness

`npm run check:supabase` verifies the configured key, reads public Auth settings, and calls the version-only health function. It does not authenticate, query business data or write records. Exit status 2 means the schema migration is not ready; status 1 means the connection/configuration check failed. An available health function does not by itself prove the admin account bootstrap has been applied.

After running both SQL files, sign in to the application. Use the SQL Editor to confirm the initial empty business tables:

```sql
select 'products' as name,count(*) from public.products
union all select 'raw_materials',count(*) from public.raw_materials
union all select 'customers',count(*) from public.customers
union all select 'sales_batches',count(*) from public.sales_batches
union all select 'transactions',count(*) from public.transactions
union all select 'finances',count(*) from public.finances
union all select 'customer_ledger',count(*) from public.customer_ledger
union all select 'productions',count(*) from public.productions;
```

Every count should be zero before you add business entries. The internal `finance_account` row is zero balance; `retail_admin` and Auth contain account configuration. The application test suite inserts dummy records only in an isolated in-memory PostgreSQL process, never in the hosted database.

## Recreating the private bootstrap later

`scripts/create-admin-bootstrap.mjs` accepts one JSON object with `email` and `password` through piped standard input. It generates a cost-12 bcrypt hash and writes only the private SQL file. Use a private terminal/environment or password manager to supply the input; do not put credentials into a tracked script or paste them into shell history. Re-running the resulting SQL resets that account to the generated password verifier and revokes its prior sessions. Keep the file private or delete it after a verified setup.

## Transaction and access rules

`retail_mutate` accepts the current API actions and validates every field again in PostgreSQL. It posts stock, sale/purchase rows, finances, customer balances/ledgers, audit and operation records in one transaction. Production likewise consumes materials and records finished goods/history atomically. A failed statement rolls all changes back. Completed operation IDs return their saved result on retries. Authenticated clients cannot directly mutate tables or self-assign admin access. The correction upgrade permits the existing admin to edit/delete transactions through revision-checked, audited RPC actions that reconcile linked stock and balances atomically.

`retail_read` returns the existing frontend response shapes for dashboard, products, raw materials, transactions, reports, productions, customers and customer ledgers. It checks the single admin, live Auth session, account email, ban state and session deadline. Direct table reads are also protected by RLS.
