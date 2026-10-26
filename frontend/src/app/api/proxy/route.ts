import { NextRequest, NextResponse } from 'next/server';
import { ApiError, checkOrigin, readJson, READ_ACTIONS, WRITE_ACTIONS } from '@/lib/server';
import { requireSession, rpc, type UserSession } from '@/lib/supabase';
import { clearSession, writeSession } from '@/lib/auth-cookies';
import { commitCustomerEntry } from '@/lib/customer-entry-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: NextRequest) {
  let session: UserSession | undefined;
  try {
    checkOrigin(request, request.method === 'POST');
    session = await requireSession(request);
    let data;
    if (request.method === 'GET') {
      const params = request.nextUrl.searchParams;
      if ([...params.keys()].some(k => !['action', 'customerUuid'].includes(k)) || [...params.keys()].some(k => params.getAll(k).length !== 1)) throw new ApiError('Invalid query.');
      const action = params.get('action') || 'dashboard';
      if (!READ_ACTIONS.has(action)) throw new ApiError('Unknown read action.');
      const customerUuid = params.get('customerUuid');
      if (action === 'customer_ledger' && (!customerUuid || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(customerUuid))) throw new ApiError('Invalid customer identifier.');
      if (customerUuid && action !== 'customer_ledger') throw new ApiError('Unexpected customer identifier.');
      data = await rpc(session.client, 'retail_read', { p_action: action, p_customer_uuid: customerUuid });
    } else {
      const payload = await readJson(request);
      if (typeof payload.action !== 'string' || !WRITE_ACTIONS.has(payload.action)) throw new ApiError('Unknown or immutable action.');
      const client = session.client;
      data = payload.action === 'record_customer_payment'
        ? await commitCustomerEntry(payload, (name, parameters) => rpc(client, name, parameters))
        : await rpc(client, 'retail_mutate', { p_payload: payload });
    }
    const response = NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
    return session.refreshed ? writeSession(response, session) : response;
  } catch (error) {
    const safe = error instanceof ApiError ? error : new ApiError('The database is temporarily unavailable. Retry the same operation.', 503, 'DATABASE_UNAVAILABLE');
    const response = NextResponse.json({ success: false, message: safe.message, code: safe.code, ...(safe.rolledBack ? { operationState: 'rolled_back' } : {}) }, { status: safe.status, headers: { 'Cache-Control': 'no-store' } });
    if (safe.status === 401 || safe.status === 403) return clearSession(response);
    return session?.refreshed ? writeSession(response, session) : response;
  }
}

export const GET = handle;
export const POST = handle;
