# Transaction correction migration

Open `migrations/202610260002_transaction_corrections.sql`, copy the entire file into this project's Supabase SQL Editor, and run it as `postgres`. The original `202610260001_retail.sql` migration must already be installed. Do not rerun the original migration or the private account bootstrap.

Running this upgrade does not delete transactions, import records, reset balances, change credentials, or disable RLS. It adds correction functions, a batch revision column, and an admin-only audit archive. The upgrade can be rerun safely.

Verify installation with:

```sql
select public.retail_health();
```

The result includes `"schemaVersion": 2` and `"features": ["transaction_corrections"]`. `version: 1` is retained for compatibility with the existing API readiness check.

## Available database actions

The signed-in admin can submit these actions through `public.retail_mutate(jsonb)`. Each requires a UUID `requestId`, integer millisecond `requestedAt`, nonempty `reason` (up to 1,000 characters), and `expectedRevision` from the latest transaction read. Keep the original request ID and body when retrying an uncertain response.

| Action | Other fields |
| --- | --- |
| `update_transaction` | `transactionId`, `productUuid`, `type` (`In` or `Out`), `qtyChange`, `unitPrice` |
| `delete_transaction` | `transactionId` |
| `update_transaction_batch` | `batchId`, `items`, optional `customerUuid`, `buyerName`, `description` |
| `delete_transaction_batch` | `batchId` |

Batch edit items contain `productUuid`, `type`, `qtyChange`, and `unitPrice`. Include the existing transaction `id` to keep that line's identity; omit `id` only when adding a new line. Existing lines omitted from the array are removed. An edited batch must have 1–100 items. Delete the batch to remove its final item. Single-item deletion automatically removes an empty batch.

For batch edits, omitted/empty `customerUuid` unlinks the customer; omitted `buyerName`/`description` become empty. Supply all intended batch details. Single-item edits preserve the batch's existing customer and description.

Stock, finances, customer balances, ledger rows, running snapshots, audit records and retry receipts commit in the same database transaction. A failure rolls everything back. A purchase cannot be removed/reduced if doing so would make stock negative. Stale revisions are rejected. A successful retry returns its stored receipt without posting a correction twice.

Deleted records are removed from active transaction/finance/order-ledger tables. Their before/after states and correction reason remain in `public.transaction_changes`, which the authenticated admin can read. Audit rows cannot be changed or deleted by the application role.

The application's Transactions page provides Edit/Delete controls for orders and, when expanded, individual items. The website and desktop use the same controls and API actions. Deletion requires a reason and an explicit confirmation. Confirmation reads the persisted transactions, stock, financial reports and affected customer ledgers before updating the UI. Interrupted confirmations retain their original request reference across reloads for safe retry.

Deploy the updated application and install the new desktop release after running the migration. If transaction reads lack a revision, the UI explains that the migration is needed and prevents submission. The migration and correction flow are tested in an isolated PostgreSQL database; the coding agent does not edit/delete hosted business records for testing.
