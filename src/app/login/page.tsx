'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('demo@example.com');
  const [password, setPassword] = useState('demo1234');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    if (res.ok) router.push('/');
    else setError((await res.json()).error ?? 'Login failed');
  }

  return (
    <div className="card" style={{ maxWidth: 420, margin: '4rem auto' }}>
      <h1>Sign in to Prospect</h1>
      <form onSubmit={submit}>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="error">{error}</p>}
        <button type="submit">Sign in</button>
      </form>
      <p className="muted">No account? <Link href="/signup">Sign up</Link>. Seed user: demo@example.com / demo1234</p>
    </div>
  );
}
