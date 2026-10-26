export const DESKTOP = process.env.NEXT_PUBLIC_APP_PLATFORM === 'desktop';

export async function desktopFetch(url: string, options: RequestInit): Promise<Response> {
  if (!DESKTOP) throw new Error('Desktop transport is unavailable.');
  const { invoke } = await import('@tauri-apps/api/core');
  const target = new URL(url);
  const result = await invoke<{ status: number; body: string; headers: Record<string, string> }>('retail_request', {
    request: {
      url: target.href,
      method: (options.method || 'GET').toUpperCase(),
      body: options.body ? String(options.body) : null,
    },
  }).catch((error: unknown) => {
    if (error instanceof Error) throw error;
    throw new Error(typeof error === 'string' ? error : 'The desktop connection could not be completed.');
  });
  return new Response(result.body, { status: result.status, headers: result.headers });
}

export async function saveDesktopInvoice(bytes: ArrayBuffer, filename: string, print = false) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<boolean>(print ? 'print_invoice' : 'save_invoice', { bytes: Array.from(new Uint8Array(bytes)), filename });
}
