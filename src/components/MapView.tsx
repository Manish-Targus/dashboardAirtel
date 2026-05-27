'use client';
import dynamic from 'next/dynamic';
import { useDashboard } from '@/context/DashboardContext';

const AirtelNetworkMap = dynamic(() => import('./AirtelNetworkMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-accent2 border-t-transparent rounded-full animate-spin" />
        <span className="text-muted text-sm">Loading map…</span>
      </div>
    </div>
  ),
});

export default function MapView() {
  const { mapMode, setMapMode } = useDashboard();

  return (
    <div className="flex-1 relative overflow-hidden">
      {/* Top Map Toggle */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[2000] flex bg-panel border border-border rounded-md shadow-lg text-[12px] font-semibold overflow-hidden">
        <button
          onClick={() => setMapMode('network')}
          className={`px-3 py-1.5 transition-colors ${mapMode === 'network' ? 'bg-accent2 text-bg' : 'text-muted hover:text-txt border-r border-border'}`}
        >
          OLT Network
        </button>
        <button
          onClick={() => setMapMode('complaints')}
          className={`px-3 py-1.5 transition-colors ${mapMode === 'complaints' ? 'bg-red-600 text-white' : 'text-muted hover:text-txt border-r border-border'}`}
        >
          Complaint Map
        </button>
        <button
          onClick={() => setMapMode('ideal')}
          className={`px-3 py-1.5 transition-colors rounded-r-md ${mapMode === 'ideal' ? 'bg-amber-600 text-white' : 'text-muted hover:text-txt'}`}
        >
          Ideal View
        </button>
      </div>

      <AirtelNetworkMap mode={mapMode} />
    </div>
  );
}
