type Receipt = { requestId: string; requestedAt: number };
const pending = new Map<string, Receipt>();

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

function storage() {
  try { return typeof window === 'undefined' ? undefined : window.sessionStorage; } catch { return undefined; }
}

export async function prepareOperation(payload: Record<string, unknown>) {
  const data = { ...payload };
  delete data.requestId; delete data.requestedAt;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(data))));
  const key = 'RETAIL_PENDING_' + Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
  // A recovered draft carries the exact operation identity that was submitted.
  // It takes precedence over an older same-body receipt in this tab's cache.
  let receipt: Receipt | undefined = typeof payload.requestId === 'string' && typeof payload.requestedAt === 'number'
    ? { requestId: payload.requestId, requestedAt: payload.requestedAt }
    : pending.get(key);
  if (!receipt) {
    try { receipt = JSON.parse(storage()?.getItem(key) || 'null') || undefined; } catch { /* Memory fallback when browser storage is disabled. */ }
  }
  if (!receipt) receipt = { requestId: crypto.randomUUID(), requestedAt: Date.now() };
  // PostgreSQL checks saved results before timestamp validation. Preserve old
  // receipts so a lost response can still resolve to its committed result.
  pending.set(key, receipt);
  try { storage()?.setItem(key, JSON.stringify(receipt)); } catch { /* Memory fallback. */ }
  return { key, payload: { ...payload, ...receipt } };
}

export function finishOperation(key: string) {
  pending.delete(key);
  try { storage()?.removeItem(key); } catch { /* Memory fallback. */ }
}
