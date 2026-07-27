'use client';
import dynamic from 'next/dynamic';
import { useRef, useState, useEffect, useCallback } from 'react';
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

interface UploadMeta {
  date: string;
  filename: string;
  uploadedAt: number;
  cityCount: number;
  brasCount: number;
  circleCount: number;
  geocodedCount: number;
}

type UploadStatus = 'idle' | 'uploading' | 'error';

export default function MapView() {
  const { mapMode, setMapMode } = useDashboard();
  const [mapKey, setMapKey] = useState(0);
  const [uploadList, setUploadList] = useState<UploadMeta[]>([]);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDate = useCallback(async (date: string) => {
    try {
      const res = await fetch(`/api/bras/load?date=${encodeURIComponent(date)}`);
      if (!res.ok) return;
      const newData = await res.json();
      // Import the named export — safe because AirtelNetworkMap is ssr:false (browser only)
      const mod = await import('./AirtelNetworkMap') as { updateBrasData?: (d: Record<string, unknown>) => void };
      mod.updateBrasData?.(newData);
      setActiveDate(date);
      setMapKey(k => k + 1);
    } catch { /* silently skip */ }
  }, []);

  // On mount: check for existing uploads and auto-load latest
  useEffect(() => {
    async function init() {
      try {
        const res = await fetch('/api/bras/list');
        if (!res.ok) return;
        const list: UploadMeta[] = await res.json();
        if (list.length > 0) {
          setUploadList(list);
          await loadDate(list[0].date);
        }
      } catch { /* no uploads yet */ }
    }
    init();
  }, [loadDate]);

  async function handleFile(file: File) {
    setUploadStatus('uploading');
    setUploadErrors([]);
    setShowDropdown(false);

    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch('/api/bras/upload', { method: 'POST', body: form });
      const json = await res.json();

      if (!res.ok) {
        setUploadStatus('error');
        setUploadErrors(json.details ?? [json.error ?? 'Upload failed.']);
        return;
      }

      // Refresh list and activate new data
      const listRes = await fetch('/api/bras/list');
      const list: UploadMeta[] = await listRes.json();
      setUploadList(list);
      await loadDate(json.date);
      setUploadStatus('idle');
    } catch (err) {
      setUploadStatus('error');
      setUploadErrors([String(err)]);
    }
  }

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

      {/* ── Upload BRAS Data (below stats box) ── */}
      <div className="absolute top-[80px] right-3 z-[2000] flex flex-col items-end gap-1.5">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />

        {/* Active data badge */}
        <div className={`text-[10px] px-2 py-0.5 rounded border font-mono ${
          activeDate
            ? 'bg-emerald-900/30 border-emerald-600/40 text-emerald-400'
            : 'bg-panel/80 border-border text-muted'
        }`}>
          {activeDate ? `BRAS data: ${activeDate}` : 'Built-in data'}
        </div>

        {/* Button row */}
        <div className="flex gap-1">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadStatus === 'uploading'}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold bg-panel/90 border border-border text-muted hover:text-txt hover:border-accent2 backdrop-blur-sm transition-colors disabled:opacity-50"
            title="Upload BRAS DATA .xlsx"
          >
            {uploadStatus === 'uploading' ? (
              <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            )}
            {uploadStatus === 'uploading' ? 'Uploading…' : 'Upload BRAS'}
          </button>

          {uploadList.length > 0 && (
            <button
              onClick={() => setShowDropdown(d => !d)}
              className="px-2 py-1.5 rounded-md text-[11px] bg-panel/90 border border-border text-muted hover:text-txt backdrop-blur-sm transition-colors"
              title="Previous uploads"
            >
              {showDropdown ? '▲' : '▼'}
            </button>
          )}
        </div>

        {/* Validation errors */}
        {uploadStatus === 'error' && (
          <div className="bg-red-950/60 border border-red-500/40 rounded-md p-2.5 max-w-[260px]">
            <div className="text-[11px] font-semibold text-red-400 mb-1.5">Upload failed</div>
            {uploadErrors.map((e, i) => (
              <div key={i} className="text-[10px] text-red-300 leading-snug mb-0.5">{e}</div>
            ))}
            <button
              onClick={() => setUploadStatus('idle')}
              className="mt-1.5 text-[10px] text-red-400 underline hover:text-red-300"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Previous uploads dropdown */}
        {showDropdown && uploadList.length > 0 && (
          <div className="bg-panel border border-border rounded-md shadow-xl max-h-48 overflow-y-auto min-w-[200px]">
            <div className="px-3 py-1.5 text-[10px] font-semibold text-muted uppercase tracking-wider border-b border-border">
              Previous uploads
            </div>
            {uploadList.map(entry => (
              <button
                key={entry.date}
                onClick={() => { loadDate(entry.date); setShowDropdown(false); }}
                className={`w-full text-left px-3 py-2 border-b border-border/40 hover:bg-card/60 transition-colors ${
                  entry.date === activeDate ? 'bg-accent2/10' : ''
                }`}
              >
                <div className={`text-[12px] font-semibold ${entry.date === activeDate ? 'text-accent2' : 'text-txt'}`}>
                  {entry.date}
                  {entry.date === activeDate && <span className="ml-1.5 text-[10px] font-normal opacity-70">active</span>}
                </div>
                <div className="text-[10px] text-muted mt-0.5">
                  {entry.cityCount.toLocaleString()} cities · {entry.brasCount} BNGs · {entry.circleCount} circles
                  {entry.geocodedCount > 0 && ` · ${entry.geocodedCount} geocoded`}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <AirtelNetworkMap key={mapKey} mode={mapMode} />
    </div>
  );
}
