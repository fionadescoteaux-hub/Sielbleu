// Netlify Function: /api/airtable
// Bridges the Siel Bleu Commercial Growth Engine to Airtable so saved work
// is stored durably in the cloud, not just in the user's browser.
//
// Reads three environment variables (set in Netlify → Site settings →
// Environment variables — the token is never exposed to the browser):
//   AIRTABLE_TOKEN    — personal access token with data.records:read + write on the base
//   AIRTABLE_BASE_ID  — the base id (starts with "app")
//   AIRTABLE_TABLE_ID — the table id (starts with "tbl")

const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_TABLE_ID;
const SLOT = 'live';

const api = `https://api.airtable.com/v0/${BASE}/${TABLE}`;
const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

async function findLiveRecord() {
  const url = `${api}?maxRecords=1&filterByFormula=${encodeURIComponent(`{Slot}='${SLOT}'`)}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Airtable list failed: ${res.status}`);
  const data = await res.json();
  return (data.records && data.records[0]) || null;
}

export default async (req) => {
  if (!TOKEN || !BASE || !TABLE) {
    return Response.json({ ok: false, error: 'Not configured' }, { status: 500 });
  }

  try {
    if (req.method === 'GET') {
      const rec = await findLiveRecord();
      return Response.json({ ok: true, state: rec ? (rec.fields.State || '') : '' });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const state = typeof body.state === 'string' ? body.state : '';
      if (!state) return Response.json({ ok: false, error: 'No state provided' }, { status: 400 });

      const fields = { Slot: SLOT, State: state, SavedAt: new Date().toISOString() };
      const rec = await findLiveRecord();

      const res = rec
        ? await fetch(`${api}/${rec.id}`, { method: 'PATCH', headers, body: JSON.stringify({ fields }) })
        : await fetch(api, { method: 'POST', headers, body: JSON.stringify({ fields }) });

      if (!res.ok) {
        const detail = await res.text();
        return Response.json({ ok: false, error: `Airtable save failed: ${res.status}`, detail }, { status: 502 });
      }
      return Response.json({ ok: true });
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 502 });
  }
};

export const config = { path: '/api/airtable' };
