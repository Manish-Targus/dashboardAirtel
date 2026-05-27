'use client';
import dynamic from 'next/dynamic';

const MobileHubsMap = dynamic(() => import('./MobileHubsMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-accent2 border-t-transparent rounded-full animate-spin" />
        <span className="text-muted text-sm">Loading hub map…</span>
      </div>
    </div>
  ),
});

export default function MobileHubsScreen() {
  return (
    <div className="flex-1 relative overflow-hidden">
      <MobileHubsMap />
    </div>
  );
}
