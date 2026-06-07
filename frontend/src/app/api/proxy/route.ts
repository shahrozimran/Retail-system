import { NextRequest, NextResponse } from 'next/server';

const APPS_SCRIPT_URL = process.env.NEXT_PUBLIC_API_URL || '';

export async function GET(request: NextRequest) {
  if (!APPS_SCRIPT_URL) {
    return NextResponse.json({ error: 'API URL not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const targetUrl = `${APPS_SCRIPT_URL}?${searchParams.toString()}`;

  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("API Proxy GET Error:", err);
    return NextResponse.json(
      { error: 'Failed to reach Google Apps Script', details: String(err) },
      { status: 502 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!APPS_SCRIPT_URL) {
    return NextResponse.json({ error: 'API URL not configured' }, { status: 500 });
  }

  try {
    const body = await request.text();
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("API Proxy POST Error:", err);
    return NextResponse.json(
      { error: 'Failed to reach Google Apps Script', details: String(err) },
      { status: 502 }
    );
  }
}
