import { useEffect, useState } from 'react';

interface Ping {
  id: string;
  message: string;
  response: string | null;
  status: string;
  created_at: string;
  responded_at: string | null;
}

export function App() {
  const [pings, setPings] = useState<Ping[]>([]);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await fetch('/pings');
    if (res.ok) setPings(await res.json());
  }

  async function sendPing() {
    setBusy(true);
    try {
      await fetch('/pings', { method: 'POST' });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <h1>Hello World — Ping/Pong</h1>
      <button onClick={sendPing} disabled={busy} style={{ padding: '8px 16px', fontSize: 16 }}>
        {busy ? 'Sending…' : 'Send Ping'}
      </button>
      <ul style={{ marginTop: 24, listStyle: 'none', padding: 0 }}>
        {pings.map((p) => (
          <li key={p.id} style={{ borderBottom: '1px solid #eee', padding: '8px 0', fontFamily: 'monospace' }}>
            <strong>{p.status}</strong> — {p.message} → {p.response ?? '…'}{' '}
            <span style={{ color: '#888' }}>({p.id.slice(0, 8)})</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
