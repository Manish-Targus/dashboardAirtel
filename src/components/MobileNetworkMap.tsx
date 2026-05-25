'use client';
import { useState, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, GeoJSON, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import indiaStates from '@/data/india_states_simple.json';
import rawVolume from '@/data/mobileVolumeData.json';
import rawCircleMap from '@/data/districtCircleMap.json';

/* ── Types ── */
interface Entry { circle: string; district: string; values: (number | null)[]; }
interface VolumeData { dates: string[]; entries: Entry[]; }
interface RawVolume { '4g': VolumeData; '5g': VolumeData; }
interface DistrictInfo { circle: string; lat: number; lng: number; }

const volumeData = rawVolume as unknown as RawVolume;
const districtCircleMap = rawCircleMap as unknown as Record<string, DistrictInfo>;

/* ── Circle labels ── */
const CIRCLE_LABELS: Record<string, string> = {
  AP: 'Andhra Pradesh', AS: 'Assam', BR: 'Bihar', CN: 'Chennai',
  DL: 'Delhi', GJ: 'Gujarat', HP: 'Himachal/PB/HR', HR: 'Haryana',
  JH: 'Jharkhand', JK: 'J&K', KK: 'Karnataka', KL: 'Kerala',
  KO: 'Kolkata', MH: 'Maharashtra', MP: 'Madhya Pradesh', MU: 'Mumbai',
  NE: 'North East', OR: 'Odisha', PB: 'Punjab', RJ: 'Rajasthan',
  TN: 'Tamil Nadu', UE: 'UP East', UW: 'UP West', WB: 'West Bengal',
};

/* ── Circle colors — golden-angle hue spread for max perceptual separation ── */
const CIRCLE_CODES = Object.keys(CIRCLE_LABELS).sort();
const CIRCLE_COLORS: Record<string, string> = {};
CIRCLE_CODES.forEach((code, i) => {
  const hue = Math.round((i * 137.508) % 360);
  const light = i % 2 === 0 ? 62 : 70;
  CIRCLE_COLORS[code] = `hsl(${hue}, 80%, ${light}%)`;
});

type GenMode = '4g' | '5g' | 'both';

/* ── Helpers ── */
function latestVal(vals: (number | null)[]): number {
  for (let i = vals.length - 1; i >= 0; i--) {
    if (vals[i] !== null) return vals[i] as number;
  }
  return 0;
}
function weekTrend(vals: (number | null)[]): number {
  const clean = vals.filter(v => v !== null) as number[];
  if (clean.length < 14) return 0;
  const r = clean.slice(-7).reduce((a, b) => a + b, 0) / 7;
  const p = clean.slice(-14, -7).reduce((a, b) => a + b, 0) / 7;
  return p === 0 ? 0 : ((r - p) / p) * 100;
}

/* ── Pre-compute per-district summaries ── */
interface DistrictSummary {
  circle: string; district: string;
  lat: number; lng: number;
  vol4g: number; vol5g: number;
  trend4g: number; trend5g: number;
  vals4g: (number | null)[]; vals5g: (number | null)[];
}

const map4g = new Map<string, Entry>();
const map5g = new Map<string, Entry>();
for (const e of volumeData['4g'].entries) map4g.set(`${e.circle}|${e.district}`, e);
for (const e of volumeData['5g'].entries) map5g.set(`${e.circle}|${e.district}`, e);

const DISTRICTS: DistrictSummary[] = [];
for (const [district, info] of Object.entries(districtCircleMap)) {
  const key = `${info.circle}|${district}`;
  const e4 = map4g.get(key);
  const e5 = map5g.get(key);
  if (!e4 && !e5) continue;
  DISTRICTS.push({
    circle: info.circle, district,
    lat: info.lat, lng: info.lng,
    vol4g:   e4 ? latestVal(e4.values) : 0,
    vol5g:   e5 ? latestVal(e5.values) : 0,
    trend4g: e4 ? weekTrend(e4.values) : 0,
    trend5g: e5 ? weekTrend(e5.values) : 0,
    vals4g:  e4?.values ?? [],
    vals5g:  e5?.values ?? [],
  });
}

const GLOBAL_MAX = Math.max(...DISTRICTS.map(d => d.vol4g + d.vol5g), 1);

function markerRadius(vol: number, max: number): number {
  return 3 + Math.pow(Math.max(vol, 0) / max, 0.45) * 11;
}

/* ── Fly-to helper ── */
function FlyTo({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useMemo(() => { map.flyTo([lat, lng], 9, { duration: 1.1 }); }, [lat, lng, map]);
  return null;
}

/* ── Sparkline ── */
function Sparkline({ vals, color, width = 200, height = 40 }: {
  vals: (number | null)[]; color: string; width?: number; height?: number;
}) {
  const clean = vals.map(v => v ?? 0);
  const mx = Math.max(...clean, 1);
  const mn = Math.min(...clean.filter(v => v > 0), 0);
  const range = mx - mn || 1;
  const pts = clean.map((v, i) =>
    `${(i / (clean.length - 1)) * width},${height - ((v - mn) / range) * (height - 2) - 1}`
  ).join(' ');
  return (
    <svg width={width} height={height}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5}
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ── District detail panel ── */
function DistrictPanel({ d, dates, onClose }: {
  d: DistrictSummary; dates: string[]; onClose: () => void;
}) {
  const circleColor = CIRCLE_COLORS[d.circle] ?? '#94a3b8';
  const combined = d.vol4g + d.vol5g;
  const share5g  = combined > 0 ? (d.vol5g / combined) * 100 : 0;

  function trendChip(pct: number) {
    const color = pct > 3 ? '#22c55e' : pct < -3 ? '#ef4444' : '#6b7280';
    return (
      <span style={{ color, fontSize: 10, fontWeight: 700 }}>
        {pct >= 0 ? '+' : ''}{pct.toFixed(1)}% 7d
      </span>
    );
  }

  const combinedVals = dates.map((_, i) => {
    const v4 = d.vals4g[i] ?? null;
    const v5 = d.vals5g[i] ?? null;
    if (v4 === null && v5 === null) return null;
    return (v4 ?? 0) + (v5 ?? 0);
  });

  return (
    <div className="absolute top-0 right-0 h-full z-[2000] flex flex-col bg-panel border-l border-border shadow-2xl overflow-hidden"
      style={{ width: 340 }}>

      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div>
          <div className="text-[14px] font-black text-txt">{d.district}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: circleColor }} />
            <span className="text-[11px] text-muted">{d.circle} · {CIRCLE_LABELS[d.circle] ?? d.circle}</span>
          </div>
        </div>
        <button onClick={onClose} className="text-muted hover:text-txt text-xl leading-none mt-0.5">×</button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-px bg-border flex-shrink-0">
        {[
          { label: '4G Volume', val: `${d.vol4g.toFixed(1)} TB`, color: '#3b82f6' },
          { label: '5G Volume', val: `${d.vol5g.toFixed(1)} TB`, color: '#a855f7' },
          { label: '5G Share',  val: `${share5g.toFixed(1)}%`,   color: '#22d3ee' },
        ].map(({ label, val, color }) => (
          <div key={label} className="bg-panel px-2 py-2.5 text-center">
            <div className="text-[15px] font-black" style={{ color }}>{val}</div>
            <div className="text-[9px] text-muted mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Trend row */}
      <div className="flex items-center justify-around px-4 py-2 border-b border-border bg-panel/50 flex-shrink-0">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[9px] text-blue-400 font-bold">4G Trend</span>
          {trendChip(d.trend4g)}
        </div>
        <div className="w-px h-6 bg-border" />
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[9px] text-purple-400 font-bold">5G Trend</span>
          {trendChip(d.trend5g)}
        </div>
        <div className="w-px h-6 bg-border" />
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[9px] text-muted font-bold">Combined</span>
          {trendChip((d.trend4g + d.trend5g) / 2)}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">

        {/* Combined sparkline */}
        <div>
          <div className="text-[10px] text-muted font-semibold mb-1.5 uppercase tracking-wider">
            Combined daily volume (TB)
          </div>
          <Sparkline vals={combinedVals} color={circleColor} />
          <div className="flex justify-between text-[9px] text-muted mt-1">
            <span>{dates[0]?.slice(5)}</span>
            <span>{dates[dates.length - 1]?.slice(5)}</span>
          </div>
        </div>

        {/* 4G sparkline */}
        {d.vals4g.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">4G Daily [TB]</span>
              <span className="text-[11px] font-black text-blue-400">{d.vol4g.toFixed(2)} TB</span>
            </div>
            <Sparkline vals={d.vals4g} color="#3b82f6" />
          </div>
        )}

        {/* 5G sparkline */}
        {d.vals5g.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">5G Daily [TB]</span>
              <span className="text-[11px] font-black text-purple-400">{d.vol5g.toFixed(2)} TB</span>
            </div>
            <Sparkline vals={d.vals5g} color="#a855f7" />
          </div>
        )}

        {/* Daily table */}
        <div>
          <div className="text-[10px] text-muted font-semibold mb-2 uppercase tracking-wider">Daily breakdown</div>
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="text-left pb-1 font-medium">Date</th>
                <th className="text-right pb-1 font-medium text-blue-400">4G TB</th>
                <th className="text-right pb-1 font-medium text-purple-400">5G TB</th>
                <th className="text-right pb-1 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {dates.map((dt, i) => {
                const v4 = d.vals4g[i] ?? null;
                const v5 = d.vals5g[i] ?? null;
                const tot = (v4 ?? 0) + (v5 ?? 0);
                return (
                  <tr key={dt} className="border-b border-border/30 hover:bg-card/40">
                    <td className="py-1 text-muted">{dt.slice(5)}</td>
                    <td className="py-1 text-right font-mono text-blue-300">{v4 !== null ? v4.toFixed(2) : '—'}</td>
                    <td className="py-1 text-right font-mono text-purple-300">{v5 !== null ? v5.toFixed(2) : '—'}</td>
                    <td className="py-1 text-right font-mono text-txt">{tot > 0 ? tot.toFixed(2) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      </div>

      <div className="px-4 py-1.5 border-t border-border flex-shrink-0 text-[9px] text-muted">
        {d.lat.toFixed(4)}, {d.lng.toFixed(4)} · Apr 22 – May 22 2026
      </div>
    </div>
  );
}

/* ── Main component ── */
export default function MobileNetworkMap() {
  const [gen, setGen]                       = useState<GenMode>('both');
  const [activeCircles, setActiveCircles]   = useState<Set<string>>(new Set(CIRCLE_CODES));
  const [selected, setSelected]             = useState<DistrictSummary | null>(null);
  const [legendOpen, setLegendOpen]         = useState(true);

  function toggleCircle(code: string) {
    setActiveCircles(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }

  const visibleDistricts = useMemo(() =>
    DISTRICTS.filter(d => activeCircles.has(d.circle)),
    [activeCircles]
  );

  const maxVol = useMemo(() =>
    Math.max(...visibleDistricts.map(d =>
      gen === '4g' ? d.vol4g : gen === '5g' ? d.vol5g : d.vol4g + d.vol5g
    ), 1),
    [visibleDistricts, gen]
  );

  const circleStats = useMemo(() => {
    return CIRCLE_CODES.map(code => {
      const ds = DISTRICTS.filter(d => d.circle === code);
      const vol4g = ds.reduce((s, d) => s + d.vol4g, 0);
      const vol5g = ds.reduce((s, d) => s + d.vol5g, 0);
      return { code, count: ds.length, vol4g, vol5g };
    });
  }, []);

  const totals = useMemo(() => {
    const t4g = visibleDistricts.reduce((s, d) => s + d.vol4g, 0);
    const t5g = visibleDistricts.reduce((s, d) => s + d.vol5g, 0);
    return { t4g, t5g };
  }, [visibleDistricts]);

  const stateStyle = useCallback(() => ({
    fillColor: '#1e293b', fillOpacity: 0.35,
    color: '#334155', weight: 0.6, opacity: 0.7,
  }), []);

  const dates = volumeData['4g'].dates;

  return (
    <div className="w-full h-full relative">
      <MapContainer center={[20.5, 79.0]} zoom={5}
        style={{ width: '100%', height: '100%' }} zoomControl attributionControl>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution="&copy; OpenStreetMap contributors &copy; CARTO"
          maxZoom={19} subdomains="abcd"
        />

        {selected && <FlyTo lat={selected.lat} lng={selected.lng} />}

        <GeoJSON data={indiaStates as any} style={stateStyle} />

        {visibleDistricts.map(d => {
          const vol = gen === '4g' ? d.vol4g : gen === '5g' ? d.vol5g : d.vol4g + d.vol5g;
          const color = CIRCLE_COLORS[d.circle] ?? '#94a3b8';
          const radius = markerRadius(vol, maxVol);
          const isSelected = selected?.district === d.district && selected?.circle === d.circle;
          return (
            <CircleMarker
              key={`${d.circle}|${d.district}`}
              center={[d.lat, d.lng]}
              radius={isSelected ? radius + 3 : radius}
              pathOptions={{
                color: isSelected ? '#f1f5f9' : color,
                fillColor: color,
                fillOpacity: isSelected ? 1 : 0.65,
                weight: isSelected ? 2 : 0.6,
                opacity: 1,
              }}
              eventHandlers={{ click: () => setSelected(isSelected ? null : d) }}
            >
              <Tooltip direction="top" offset={[0, -4]}>
                <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: 4, padding: '4px 8px', fontSize: 11 }}>
                  <div style={{ fontWeight: 700, color: '#fff', marginBottom: 2 }}>
                    {d.district}
                    <span style={{ color: color, fontWeight: 700, marginLeft: 6, fontSize: 10 }}> {d.circle}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <span style={{ color: '#3b82f6' }}>4G: {d.vol4g.toFixed(1)} TB</span>
                    <span style={{ color: '#a855f7' }}>5G: {d.vol5g.toFixed(1)} TB</span>
                  </div>
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* ── Gen toggle — top centre ── */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[2000] flex bg-panel border border-border rounded-md shadow-lg text-[12px] font-semibold overflow-hidden">
        {(['both', '4g', '5g'] as GenMode[]).map(g => (
          <button key={g} onClick={() => setGen(g)}
            className={`px-4 py-1.5 transition-colors border-r last:border-r-0 border-border ${
              gen === g
                ? g === '4g' ? 'bg-blue-600 text-white'
                : g === '5g' ? 'bg-purple-600 text-white'
                : 'bg-accent2 text-bg'
                : 'text-muted hover:text-txt'
            }`}
          >
            {g === 'both' ? '4G + 5G' : g.toUpperCase()}
          </button>
        ))}
      </div>

      {/* ── Circle filter — left sidebar ── */}
      <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-1 max-h-[calc(100vh-24px)] overflow-y-auto pr-1">
        <div className="flex gap-1 mb-1 flex-shrink-0">
          <button onClick={() => setActiveCircles(new Set(CIRCLE_CODES))}
            className="flex-1 px-2 py-1 rounded text-[10px] font-semibold border border-slate-600 bg-slate-800/90 text-slate-300 hover:bg-slate-700 backdrop-blur-sm transition-colors">
            All
          </button>
          <button onClick={() => setActiveCircles(new Set())}
            className="flex-1 px-2 py-1 rounded text-[10px] font-semibold border border-slate-600 bg-slate-800/90 text-slate-300 hover:bg-slate-700 backdrop-blur-sm transition-colors">
            None
          </button>
        </div>
        {circleStats.map(({ code, count, vol4g, vol5g }) => {
          const active = activeCircles.has(code);
          const color  = CIRCLE_COLORS[code];
          const vol    = gen === '4g' ? vol4g : gen === '5g' ? vol5g : vol4g + vol5g;
          return (
            <div key={code} onClick={() => toggleCircle(code)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] font-semibold border backdrop-blur-sm transition-all cursor-pointer whitespace-nowrap flex-shrink-0"
              style={{
                background: active ? `${color}18` : 'rgba(22,27,34,0.85)',
                borderColor: active ? color : '#30363d',
                color: active ? color : '#8b949e',
              }}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: active ? color : '#30363d' }} />
              <span className="font-black tracking-wide w-6">{code}</span>
              <span style={{ color: '#8b949e', fontWeight: 400, fontSize: 10 }}>
                {CIRCLE_LABELS[code]?.split(' ')[0]}
              </span>
              <span className="ml-auto text-[9px] text-muted font-mono">{vol.toFixed(0)} TB</span>
              <span style={{ color: '#8b949e', fontSize: 9 }}>({count})</span>
            </div>
          );
        })}
      </div>

      {/* ── Stats — top right ── */}
      <div className="absolute top-3 right-3 z-[1000] bg-panel/90 border border-border rounded-md px-3 py-2 backdrop-blur-sm text-right flex flex-col gap-1">
        <div className="text-[11px] text-muted">
          <span className="font-bold text-txt">{visibleDistricts.length}</span> districts
        </div>
        <div className="text-[11px] text-blue-400">
          4G <span className="font-bold">{(totals.t4g / 1000).toFixed(1)} PB</span>
        </div>
        <div className="text-[11px] text-purple-400">
          5G <span className="font-bold">{(totals.t5g / 1000).toFixed(1)} PB</span>
        </div>
        <div className="text-[11px] text-muted border-t border-border pt-1">
          <span className="font-bold text-txt">{((totals.t4g + totals.t5g) / 1000).toFixed(1)} PB</span> total
        </div>
      </div>

      {/* ── Legend — bottom right (hidden when panel open) ── */}
      {!selected && (
        <div className="absolute bottom-6 right-3 z-[1000] bg-panel/90 border border-border rounded-md backdrop-blur-sm">
          <button onClick={() => setLegendOpen(o => !o)}
            className="flex items-center justify-between gap-6 px-3 py-2 w-full text-left hover:bg-white/5 transition-colors rounded-md">
            <span className="text-[10px] text-muted font-semibold uppercase tracking-wide">Legend</span>
            <span className="text-[10px] text-muted">{legendOpen ? '▼' : '▲'}</span>
          </button>
          {legendOpen && (
            <div className="px-3 pb-3 border-t border-border/50 flex flex-col gap-2 pt-2">
              <div className="text-[11px] text-txt font-medium">Dot color = Circle · Size = Volume</div>
              <div className="flex items-end gap-3">
                {[0.05, 0.35, 1].map((t, i) => {
                  const r = markerRadius(GLOBAL_MAX * t, GLOBAL_MAX);
                  return (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <svg width={r * 2 + 4} height={r * 2 + 4}>
                        <circle cx={r + 2} cy={r + 2} r={r}
                          fill="#22d3ee" fillOpacity={0.65} stroke="#22d3ee" strokeWidth={0.6} />
                      </svg>
                      <span className="text-[9px] text-muted">{['Low', 'Mid', 'High'][i]}</span>
                    </div>
                  );
                })}
              </div>
              {/* circle color swatches */}
              <div className="flex flex-wrap gap-1 pt-1 border-t border-border/40 max-w-[180px]">
                {CIRCLE_CODES.map(code => (
                  <div key={code} title={CIRCLE_LABELS[code]}
                    className="flex items-center gap-1 text-[9px]"
                    style={{ color: CIRCLE_COLORS[code] }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: CIRCLE_COLORS[code] }} />
                    {code}
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-muted border-t border-border/40 pt-1">
                Click a district dot for details
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Detail panel ── */}
      {selected && (
        <DistrictPanel d={selected} dates={dates} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
