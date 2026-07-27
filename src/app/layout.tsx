import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PRISM — Network Intelligence Dashboard',
  description: 'Performance & Real-time Intelligence for Service Management',
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
