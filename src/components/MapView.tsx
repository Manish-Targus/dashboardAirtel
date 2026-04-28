'use client';
import dynamic from 'next/dynamic';
import { useDashboard } from '@/context/DashboardContext';
import type { BandwidthFilter } from '@/lib/types';

const MapComponent = dynamic(() => import('./MapComponent'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-accent2 border-t-transparent rounded-full animate-spin" />
        <span className="text-muted text-sm">Initialising map…</span>
      </div>
    </div>
  ),
});

const AirtelNetworkMap = dynamic(() => import('./AirtelNetworkMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-accent2 border-t-transparent rounded-full animate-spin" />
        <span className="text-muted text-sm">Loading network map…</span>
      </div>
    </div>
  ),
});

const FILTERS: BandwidthFilter[] = ['All', '5G', '4G/5G', '4G', 'Maintenance'];

export default function MapView() {
  const { bandwidthFilter, setBandwidthFilter, mapTowers, filteredTowers, mapMode, setMapMode } = useDashboard();

  return (
    <div className="flex-1 relative overflow-hidden">
      {/* Map mode toggle — centered top */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex rounded-md overflow-hidden border border-border backdrop-blur-sm bg-panel/90 text-[11px] font-semibold">
        <button
          onClick={() => setMapMode('towers')}
          className={`px-3 py-1.5 transition-colors ${mapMode === 'towers' ? 'bg-accent2 text-white' : 'text-muted hover:text-txt'}`}
        >
          Tower Map
        </button>
        <button
          onClick={() => setMapMode('network')}
          className={`px-3 py-1.5 transition-colors ${mapMode === 'network' ? 'bg-accent2 text-white' : 'text-muted hover:text-txt'}`}
        >
          OLT Network
        </button>
      </div>

      {mapMode === 'network' ? (
        <AirtelNetworkMap />
      ) : (
        <>
          <MapComponent />

          {/* Filter bar */}
          <div className="absolute top-3 left-3 z-[1000] flex gap-1.5 flex-wrap">
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setBandwidthFilter(f)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all backdrop-blur-sm ${
                  bandwidthFilter === f
                    ? 'bg-accent2 border-accent2 text-white shadow-lg'
                    : 'bg-panel/90 border-border text-txt hover:bg-accent2/20 hover:border-accent2/50'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Tower count badge */}
          <div className="absolute top-3 right-3 z-[1000] bg-panel/90 border border-border rounded-md px-2.5 py-1 backdrop-blur-sm">
            <span className="text-[11px] text-muted">Showing </span>
            <span className="text-[11px] font-bold text-txt">{mapTowers.length}</span>
            <span className="text-[11px] text-muted"> / {filteredTowers.length} towers</span>
          </div>

          {/* Legend */}
          <div className="absolute bottom-6 left-3 z-[1000] bg-panel/92 backdrop-blur-sm border border-border rounded-lg p-3">
            <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">Status</div>
            {[
              { color: '#3fb950', label: 'Active' },
              { color: '#d29922', label: 'Maintenance' },
              { color: '#da3633', label: 'Offline' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5 mb-1">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                <span className="text-[11px] text-txt">{label}</span>
              </div>
            ))}

            <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mt-2.5 mb-1.5">Bandwidth</div>
            {[
              { color: '#58a6ff', label: '5G' },
              { color: '#a371f7', label: '4G/5G' },
              { color: '#f78166', label: '4G' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5 mb-1">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                <span className="text-[11px] text-txt">{label}</span>
              </div>
            ))}

            <div className="mt-2.5 pt-2 border-t border-border">
              <div className="text-[10px] text-muted">Circle size = active connections</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
