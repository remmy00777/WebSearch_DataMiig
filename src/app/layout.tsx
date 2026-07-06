import './globals.css';
import Link from 'next/link';
import { ReactNode } from 'react';

export const metadata = { title: 'Prospect — Web Research & Data Mining Agent', description: 'Evidence-backed research reports from natural language questions.' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <span className="brand">⛏ Prospect</span>
          <Link href="/">Dashboard</Link>
          <Link href="/runs">Run History</Link>
          <Link href="/schedules">Schedules</Link>
          <Link href="/settings">Settings</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
