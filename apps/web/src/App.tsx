import { useEffect, useState } from 'react';

interface Message {
  id: string;
  message: string;
  response: string | null;
  status: string;
  created_at: string;
  responded_at: string | null;
}

export function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await fetch('/messages');
    if (res.ok) setMessages(await res.json());
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

  async function sendDing() {
    setBusy(true);
    try {
      await fetch('/dings', { method: 'POST' });
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
      <h1>Hello World — Ping/Pong & Ding/Dong</h1>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={sendPing} disabled={busy} style={{ padding: '8px 16px', fontSize: 16 }}>
          {busy ? 'Sending…' : 'Send Ping'}
        </button>
        <button onClick={sendDing} disabled={busy} style={{ padding: '8px 16px', fontSize: 16 }}>
          {busy ? 'Sending…' : 'Send Ding'}
        </button>
      </div>
      <ul style={{ marginTop: 24, listStyle: 'none', padding: 0 }}>
        {messages.map((m) => (
          <li key={m.id} style={{ borderBottom: '1px solid #eee', padding: '8px 0', fontFamily: 'monospace' }}>
            <strong>{m.status}</strong> — {m.message} → {m.response ?? '…'}{' '}
            <span style={{ color: '#888' }}>({m.id.slice(0, 8)})</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
