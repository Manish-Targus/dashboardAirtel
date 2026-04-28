import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NetPulse — India Network Dashboard',
  description: 'Real-time telecom network monitoring across India',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg text-txt h-screen overflow-hidden antialiased">
        {children}
      </body>
    </html>
  );
}
