'use client';
import { useState, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, GeoJSON, Tooltip, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import indiaStates from '@/data/india_states_simple.json';
import rawHubMapping from '@/data/districtHubMapping.json';
import rawHubVolume from '@/data/hubVolumeData.json';
import rawVolume from '@/data/mobileVolumeData.json';

/* ── Types ── */
interface Hub { name: string; circle: string; lat: number; lng: number; throughput: number; }
interface DistrictMapping {
  lat: number; lng: number;
  distCircle: string; hubCircle: string;
  hubName: string; hubLat: number; hubLng: number;
  distKm: number;
}
interface HubVolEntry {
  hubCircle: string; hubName: string; hubLat: number; hubLng: number;
  vals4g: number[]; vals5g: number[]; districts: number;
}
interface HubVolumeData { dates: string[]; hubs: HubVolEntry[]; }

const districtHubMapping = rawHubMapping as Record<string, DistrictMapping>;
const hubVolumeData = rawHubVolume as unknown as HubVolumeData;
const DATES = hubVolumeData.dates;

interface VolEntry { circle: string; district: string; values: (number | null)[]; }
interface RawVol { '4g': { dates: string[]; entries: VolEntry[] }; '5g': { dates: string[]; entries: VolEntry[] }; }
const volData = rawVolume as unknown as RawVol;

/* ── District volume lookup: "circle|DISTRICT" → values ── */
const distVol4g = new Map<string, (number | null)[]>();
const distVol5g = new Map<string, (number | null)[]>();
for (const e of volData['4g'].entries) distVol4g.set(`${e.circle}|${e.district}`, e.values);
for (const e of volData['5g'].entries) distVol5g.set(`${e.circle}|${e.district}`, e.values);

type GenMode = '4g' | '5g' | 'both';

/* ── Hub data (from mobilehubs.xlsx) ── */
const HUBS: Hub[] = [
  // AP – Andhra Pradesh
  { name: 'Hyderabad',   circle: 'AP',   lat: 17.385, lng: 78.487, throughput: 87   },
  { name: 'Uppal',       circle: 'AP',   lat: 17.406, lng: 78.559, throughput: 2823 },
  { name: 'Vijayawada',  circle: 'AP',   lat: 16.506, lng: 80.648, throughput: 2212 },
  // BR – Bihar (+ Jharkhand)
  { name: 'Bhagalpur',   circle: 'BR',   lat: 25.259, lng: 86.994, throughput: 1386 },
  { name: 'Patliputra',  circle: 'BR',   lat: 25.614, lng: 85.076, throughput: 3581 },
  { name: 'Ranchi',      circle: 'BR',   lat: 23.344, lng: 85.310, throughput: 1434 },
  // DL – Delhi NCR
  { name: 'Manesar',     circle: 'DL',   lat: 28.367, lng: 76.932, throughput: 1322 },
  { name: 'Noida',       circle: 'DL',   lat: 28.535, lng: 77.391, throughput: 284  },
  { name: 'Noida81',     circle: 'DL',   lat: 28.527, lng: 77.411, throughput: 1315 },
  // GJ – Gujarat
  { name: 'Ahmedabad',   circle: 'GJ',   lat: 23.023, lng: 72.571, throughput: 1942 },
  { name: 'Rajkot',      circle: 'GJ',   lat: 22.304, lng: 70.802, throughput: 1171 },
  { name: 'Surat',       circle: 'GJ',   lat: 21.170, lng: 72.831, throughput: 299  },
  // JK – J&K
  { name: 'Jammu',       circle: 'JK',   lat: 32.727, lng: 74.857, throughput: 407  },
  { name: 'Ludhiana',    circle: 'JK',   lat: 30.901, lng: 75.857, throughput: 1    },
  { name: 'Mohali',      circle: 'JK',   lat: 30.705, lng: 76.718, throughput: 553  },
  { name: 'Srinagar',    circle: 'JK',   lat: 34.084, lng: 74.797, throughput: 372  },
  // KK – Karnataka
  { name: 'Divyashree',  circle: 'KK',   lat: 12.987, lng: 77.597, throughput: 101  },
  { name: 'Hosur Road',  circle: 'KK',   lat: 12.840, lng: 77.677, throughput: 2324 },
  { name: 'Mangalore',   circle: 'KK',   lat: 12.914, lng: 74.856, throughput: 2111 },
  { name: 'Whitefield',  circle: 'KK',   lat: 12.970, lng: 77.750, throughput: 1023 },
  // KL – Kerala
  { name: 'Calicut',     circle: 'KL',   lat: 11.259, lng: 75.780, throughput: 688  },
  { name: 'Pollachi',    circle: 'KL',   lat: 10.660, lng: 77.008, throughput: 885  },
  // KN – Chennai
  { name: 'Pollachi',    circle: 'KN',   lat: 10.660, lng: 77.008, throughput: 116  },
  { name: 'Santhome',    circle: 'KN',   lat: 13.034, lng: 80.279, throughput: 177  },
  { name: 'Siruseri',    circle: 'KN',   lat: 12.801, lng: 80.222, throughput: 418  },
  // KO – Kolkata
  { name: 'Infinity2',   circle: 'KO',   lat: 22.556, lng: 88.402, throughput: 639  },
  { name: 'Kharagpur',   circle: 'KO',   lat: 22.346, lng: 87.325, throughput: 104  },
  // MH – Maharashtra
  { name: 'E-Space',     circle: 'MH',   lat: 18.566, lng: 73.915, throughput: 467  },
  { name: 'Nagpur',      circle: 'MH',   lat: 21.146, lng: 79.088, throughput: 929  },
  { name: 'Pune',        circle: 'MH',   lat: 18.520, lng: 73.857, throughput: 3686 },
  // MP – Madhya Pradesh
  { name: 'Bhopal',      circle: 'MP',   lat: 23.260, lng: 77.413, throughput: 1097 },
  { name: 'Jabalpur',    circle: 'MP',   lat: 23.182, lng: 79.986, throughput: 1695 },
  { name: 'Raipur',      circle: 'MP',   lat: 21.251, lng: 81.630, throughput: 421  },
  // MU – Mumbai
  { name: '4D',          circle: 'MU',   lat: 19.076, lng: 72.878, throughput: 0    },
  { name: 'Chandiwali',  circle: 'MU',   lat: 19.114, lng: 72.908, throughput: 585  },
  { name: 'Spectrum',    circle: 'MU',   lat: 19.100, lng: 72.920, throughput: 807  },
  // NE – North East + Assam
  { name: 'Guwahati',    circle: 'NE',   lat: 26.145, lng: 91.736, throughput: 1616 },
  { name: 'Jorhat',      circle: 'NE',   lat: 26.747, lng: 94.203, throughput: 1563 },
  // OR – Odisha
  { name: 'Bhubaneswar', circle: 'OR',   lat: 20.296, lng: 85.825, throughput: 1746 },
  // RJ – Rajasthan
  { name: 'Jaipur',      circle: 'RJ',   lat: 26.912, lng: 75.787, throughput: 1777 },
  { name: 'Jodhpur',     circle: 'RJ',   lat: 26.239, lng: 73.024, throughput: 1441 },
  { name: 'Udaipur',     circle: 'RJ',   lat: 24.585, lng: 73.713, throughput: 1193 },
  // TN – Tamil Nadu
  { name: 'Pollachi',    circle: 'TN',   lat: 10.660, lng: 77.008, throughput: 1715 },
  { name: 'Santhome',    circle: 'TN',   lat: 13.034, lng: 80.279, throughput: 507  },
  { name: 'Siruseri',    circle: 'TN',   lat: 12.801, lng: 80.222, throughput: 2431 },
  // UN – Punjab + Haryana
  { name: 'Ambala',      circle: 'UN',   lat: 30.375, lng: 76.782, throughput: 213  },
  { name: 'Ludhiana',    circle: 'UN',   lat: 30.901, lng: 75.857, throughput: 1346 },
  { name: 'Manesar',     circle: 'UN',   lat: 28.367, lng: 76.932, throughput: 91   },
  { name: 'Mohali',      circle: 'UN',   lat: 30.705, lng: 76.718, throughput: 2575 },
  // UE – UP East
  { name: 'Gangaganj',   circle: 'UE',   lat: 26.870, lng: 80.920, throughput: 3054 },
  { name: 'Gomtinagar',  circle: 'UE',   lat: 26.847, lng: 80.996, throughput: 734  },
  { name: 'Noida',       circle: 'UE',   lat: 28.535, lng: 77.391, throughput: 121  },
  { name: 'Varanasi',    circle: 'UE',   lat: 25.318, lng: 82.974, throughput: 1343 },
  // UW – UP West
  { name: 'Moradabad',   circle: 'UW',   lat: 28.839, lng: 78.773, throughput: 1703 },
  { name: 'Noida',       circle: 'UW',   lat: 28.535, lng: 77.391, throughput: 544  },
  { name: 'Meerut',      circle: 'UW',   lat: 28.985, lng: 77.706, throughput: 1615 },
  // WB – West Bengal
  { name: 'Kharagpur',   circle: 'WB',   lat: 22.346, lng: 87.325, throughput: 1752 },
  { name: 'Siliguri',    circle: 'WB',   lat: 26.727, lng: 88.395, throughput: 1291 },
  // AN – Andaman & Nicobar (source: mobilehubs.xlsx "Andman" circle)
  { name: 'Andaman',     circle: 'AN',   lat: 11.674, lng: 92.726, throughput: 17   },
];

/* ── Circle labels ── */
const HUB_CIRCLE_LABELS: Record<string, string> = {
  AP: 'Andhra Pradesh', BR: 'Bihar + JH',   DL: 'Delhi NCR',
  GJ: 'Gujarat',        JK: 'J&K',          KK: 'Karnataka',
  KL: 'Kerala',         KN: 'Chennai',       KO: 'Kolkata',
  MH: 'Maharashtra',    MP: 'Madhya Pradesh',MU: 'Mumbai',
  NE: 'NE + Assam',     OR: 'Odisha',        RJ: 'Rajasthan',
  TN: 'Tamil Nadu',     UN: 'Punjab + HR',   UE: 'UP East',
  UW: 'UP West',        WB: 'West Bengal',   AN: 'Andaman & Nicobar',
};

/* ── Colors (golden-angle hue spread) ── */
const HUB_CIRCLE_CODES = Object.keys(HUB_CIRCLE_LABELS).sort();
const HUB_CIRCLE_COLORS: Record<string, string> = {};
HUB_CIRCLE_CODES.forEach((c, i) => {
  const hue = Math.round((i * 137.508) % 360);
  HUB_CIRCLE_COLORS[c] = `hsl(${hue}, 85%, ${i % 2 === 0 ? 62 : 70}%)`;
});

/* ── Districts that had wrong coordinates (same-name duplicates across states) ── */
const FIXED_DISTRICTS = new Set([
  'HAORA','HUGLI','NADIA',
  'UDALGURI','DARANG','SONITPUR','BISHNUPUR','LAKHIMPUR','WOKHA','BILASPUR',
  'SHAHADARA',
  'CHAMOLI',
  'AURANGABAD','KAIMUR','SARAN','PALAMU',
  'BHANDARA','RAIGARH',
  'PRATAPGARH',
  'JASHPUR','PANNA','MANDLA','DINDORI','NARMADAPURAM','SHAJAPUR','BIJAPUR','UMARIA',
  'NUAPARHA',
  'KARAIKAL',
  'FATEHPUR','HAMIRPUR','KHERI',
]);

/* ── Pre-index hubs by (circle, name) for O(1) lookup ── */
const hubIndex: Record<string, Hub> = {};
for (const h of HUBS) hubIndex[`${h.circle}::${h.name}`] = h;

/* ── Load precomputed district → nearest-hub connections ── */
interface Connection {
  district: string;
  distCircle: string;
  hubCircle: string;
  distLat: number;
  distLng: number;
  hub: Hub;
}

const ALL_CONNECTIONS: Connection[] = Object.entries(districtHubMapping).flatMap(
  ([district, info]) => {
    const hub = hubIndex[`${info.hubCircle}::${info.hubName}`];
    if (!hub) return [];
    return [{
      district,
      distCircle: info.distCircle,
      hubCircle:  info.hubCircle,
      distLat:    info.lat,
      distLng:    info.lng,
      hub,
    }];
  },
);

/* ── Hub volume index: (circle::name) → HubVolEntry ── */
const hubVolIndex: Record<string, HubVolEntry> = {};
for (const h of hubVolumeData.hubs) hubVolIndex[`${h.hubCircle}::${h.hubName}`] = h;

function hubVol(entry: HubVolEntry | undefined, dateIdx: number, gen: GenMode): number {
  if (!entry) return 0;
  const v4 = entry.vals4g[dateIdx] ?? 0;
  const v5 = entry.vals5g[dateIdx] ?? 0;
  return gen === '4g' ? v4 : gen === '5g' ? v5 : v4 + v5;
}

function hubVolAll(entry: HubVolEntry | undefined, gen: GenMode): number[] {
  if (!entry) return DATES.map(() => 0);
  return DATES.map((_, i) => hubVol(entry, i, gen));
}

function markerRadius(vol: number, max: number): number {
  return 5 + Math.pow(Math.max(vol, 0) / Math.max(max, 1), 0.45) * 16;
}

/* ── Sparkline ── */
function Sparkline({ vals, color, width = 220, height = 36 }: {
  vals: number[]; color: string; width?: number; height?: number;
}) {
  const mx = Math.max(...vals, 1);
  const mn = Math.min(...vals.filter(v => v > 0), 0);
  const range = mx - mn || 1;
  const pts = vals.map((v, i) =>
    `${(i / (vals.length - 1)) * width},${height - ((v - mn) / range) * (height - 2) - 1}`
  ).join(' ');
  return (
    <svg width={width} height={height}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5}
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ── Tooltip style ── */
const TT: React.CSSProperties = {
  background: '#0d1117', border: '1px solid #30363d',
  borderRadius: 4, padding: '4px 8px', fontSize: 11, lineHeight: 1.6,
};

/* ── Circle analytics panel ── */
function HubCirclePanel({ circleCode, dateIdx, gen, onClose, onSelectHub }: {
  circleCode: string;
  dateIdx: number;
  gen: GenMode;
  onClose: () => void;
  onSelectHub: (hub: Hub) => void;
}) {
  const color = HUB_CIRCLE_COLORS[circleCode];
  const hubs = HUBS.filter(h => h.circle === circleCode);
  const districts = ALL_CONNECTIONS.filter(c => c.hubCircle === circleCode);

  const hubStats = hubs.map(h => {
    const entry = hubVolIndex[`${h.circle}::${h.name}`];
    const v4 = entry?.vals4g[dateIdx] ?? 0;
    const v5 = entry?.vals5g[dateIdx] ?? 0;
    const total = gen === '4g' ? v4 : gen === '5g' ? v5 : v4 + v5;
    const distCount = ALL_CONNECTIONS.filter(c => c.hub.name === h.name && c.hub.circle === h.circle).length;
    return { hub: h, entry, v4, v5, total, distCount };
  }).sort((a, b) => b.total - a.total);

  const totalV4 = hubStats.reduce((s, h) => s + h.v4, 0);
  const totalV5 = hubStats.reduce((s, h) => s + h.v5, 0);
  const totalVol = gen === '4g' ? totalV4 : gen === '5g' ? totalV5 : totalV4 + totalV5;
  const totalBackhaul = hubs.reduce((s, h) => s + h.throughput, 0);

  const tb2pb = (tb: number) => parseFloat((tb / 1000).toFixed(3));

  const barData = hubStats.map(h => ({ name: h.hub.name, vol: tb2pb(h.total), v4: tb2pb(h.v4), v5: tb2pb(h.v5) }));

  const pieData = hubStats.slice(0, 8).map(h => ({ name: h.hub.name, value: tb2pb(h.total) }));
  if (hubStats.length > 8) pieData.push({ name: 'Others', value: tb2pb(hubStats.slice(8).reduce((s, h) => s + h.total, 0)) });

  const genLabel = gen === '4g' ? '4G' : gen === '5g' ? '5G' : '4G+5G';

  return (
    <div className="fixed inset-4 z-[3000] flex flex-col bg-panel border border-border shadow-2xl rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-panel/50 backdrop-blur-md flex-shrink-0">
        <div>
          <div className="text-[22px] font-bold" style={{ color }}>{circleCode} — {HUB_CIRCLE_LABELS[circleCode]}</div>
          <div className="text-[13px] text-muted mt-1">Hub Analytics · {genLabel} · {DATES[dateIdx]}</div>
        </div>
        <button onClick={onClose} className="text-muted hover:text-txt text-3xl leading-none transition-colors">×</button>
      </div>

      {/* KPI bar */}
      <div className="bg-border/30 px-6 py-3 flex-shrink-0 border-b border-border flex gap-10 items-center">
        <div>
          <div className="text-[28px] font-bold text-blue-400">{(totalV4 / 1000).toFixed(3)} PB</div>
          <div className="text-[12px] text-muted">Total 4G Volume</div>
        </div>
        <div>
          <div className="text-[28px] font-bold text-purple-400">{(totalV5 / 1000).toFixed(3)} PB</div>
          <div className="text-[12px] text-muted">Total 5G Volume</div>
        </div>
        <div>
          <div className="text-[28px] font-bold text-txt">{hubs.length}</div>
          <div className="text-[12px] text-muted">Hubs</div>
        </div>
        <div>
          <div className="text-[28px] font-bold text-txt">{districts.length}</div>
          <div className="text-[12px] text-muted">Districts</div>
        </div>
        <div>
          <div className="text-[28px] font-bold text-cyan-400">{totalBackhaul.toLocaleString()} Gbps</div>
          <div className="text-[12px] text-muted">Backhaul Capacity</div>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden gap-4 p-5">
        {/* Left: charts */}
        <div className="flex flex-col gap-4 w-[420px] flex-shrink-0">
          {/* Bar chart */}
          <div className="bg-panel rounded-xl border border-border p-4 shadow-sm flex-1 overflow-hidden flex flex-col">
            <h3 className="text-[13px] font-bold text-txt mb-2 flex-shrink-0">{genLabel} Volume per Hub (PB)</h3>
            <div className="flex-1 overflow-y-auto">
              <div style={{ height: Math.max(180, hubStats.length * 30) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} layout="vertical" margin={{ top: 2, right: 55, left: 8, bottom: 2 }}>
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#8b949e' }} tickFormatter={(v: number) => `${v}PB`} />
                    <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 10, fill: '#8b949e' }} />
                    <RTooltip
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                      contentStyle={{ backgroundColor: '#0d1117', borderColor: '#30363d', fontSize: 11, borderRadius: 6 }}
                      formatter={(val: number, name: string) => [`${val} PB`, name === 'vol' ? genLabel : name === 'v4' ? '4G' : '5G']}
                    />
                    {gen === 'both' ? (
                      <>
                        <Bar dataKey="v4" stackId="a" barSize={14} fill="#3b82f6" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="v5" stackId="a" barSize={14} fill="#a855f7" radius={[0, 4, 4, 0]} />
                      </>
                    ) : (
                      <Bar dataKey="vol" radius={[0, 4, 4, 0]} barSize={14}>
                        {barData.map((_, i) => (
                          <Cell key={i} fill={gen === '4g' ? '#3b82f6' : '#a855f7'} />
                        ))}
                      </Bar>
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Pie chart */}
          <div className="bg-panel rounded-xl border border-border p-4 shadow-sm flex-shrink-0">
            <h3 className="text-[13px] font-bold text-txt mb-2">Volume Share — {genLabel}</h3>
            <div className="flex gap-3 items-center">
              <div style={{ width: 150, height: 150, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={38} outerRadius={68} paddingAngle={2}>
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.name === 'Others' ? '#374151' : color} opacity={entry.name === 'Others' ? 1 : 0.7 + (pieData.indexOf(entry) === 0 ? 0.3 : 0)} />
                      ))}
                    </Pie>
                    <RTooltip
                      contentStyle={{ backgroundColor: '#0d1117', borderColor: '#30363d', fontSize: 11, borderRadius: 6 }}
                      formatter={(val: number) => [`${val} PB`, genLabel]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-1 overflow-y-auto max-h-[140px]">
                {pieData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-1.5 text-[10px] text-muted whitespace-nowrap">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: entry.name === 'Others' ? '#374151' : color }} />
                    <span className="truncate max-w-[90px]">{entry.name}</span>
                    <span className="ml-auto font-mono text-txt">
                      {totalVol > 0 ? ((entry.value / totalVol) * 100).toFixed(1) : '0.0'}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right: hub table */}
        <div className="flex-1 flex flex-col bg-panel rounded-xl border border-border overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-border bg-panel/80 flex-shrink-0">
            <h2 className="text-[15px] font-bold text-txt">Hub Breakdown ({hubs.length})</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left text-[13px] border-collapse">
              <thead className="sticky top-0 bg-border/50 text-muted font-semibold z-10 backdrop-blur-md">
                <tr>
                  <th className="py-2.5 px-4">#</th>
                  <th className="py-2.5 px-4">Hub</th>
                  <th className="py-2.5 px-4 text-right text-blue-400">4G PB</th>
                  <th className="py-2.5 px-4 text-right text-purple-400">5G PB</th>
                  <th className="py-2.5 px-4 text-right">% Share</th>
                  <th className="py-2.5 px-4 text-right">Districts</th>
                  <th className="py-2.5 px-4 text-right text-cyan-400">Backhaul</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {hubStats.map(({ hub, v4, v5, total, distCount }, idx) => {
                  const share = totalVol > 0 ? (total / totalVol) * 100 : 0;
                  return (
                    <tr
                      key={`${hub.circle}-${hub.name}`}
                      className="hover:bg-border/20 transition-colors cursor-pointer"
                      onClick={() => { onSelectHub(hub); onClose(); }}
                    >
                      <td className="py-2.5 px-4 text-muted text-[11px]">{idx + 1}</td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                          <span className="font-bold text-txt">{hub.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-blue-400">{(v4 / 1000).toFixed(3)}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-purple-400">{(v5 / 1000).toFixed(3)}</td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-14 h-1.5 rounded-full bg-border overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${share}%`, background: color }} />
                          </div>
                          <span className="font-mono text-muted text-[11px] w-9 text-right">{share.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-muted">{distCount}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-cyan-400 text-[11px]">
                        {hub.throughput > 0 ? `${hub.throughput.toLocaleString()}G` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-2 border-t border-border text-[10px] text-muted flex-shrink-0">
            Click a hub row to focus it on the map
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main component ── */
export default function MobileHubsMap() {
  const [activeCircles, setActiveCircles]     = useState<Set<string>>(new Set(HUB_CIRCLE_CODES));
  const [selectedHub, setSelectedHub]         = useState<Hub | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<Connection | null>(null);
  const [selectedCircle, setSelectedCircle]   = useState<string | null>(null);
  const [showLines, setShowLines]             = useState(true);
  const [showFixed, setShowFixed]             = useState(false);
  const [dateIdx, setDateIdx]                 = useState(DATES.length - 1);
  const [gen, setGen]                         = useState<GenMode>('both');

  const maxVol = useMemo(() => {
    const activeHubs = HUBS.filter(h => activeCircles.has(h.circle));
    return Math.max(
      ...activeHubs.map(h => {
        const entry = hubVolIndex[`${h.circle}::${h.name}`];
        return hubVol(entry, dateIdx, gen);
      }), 1
    );
  }, [activeCircles, dateIdx, gen]);

  const toggleCircle = useCallback((code: string) => {
    setActiveCircles(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }, []);

  const visibleConnections = useMemo(
    () => ALL_CONNECTIONS.filter(c => activeCircles.has(c.hubCircle)),
    [activeCircles],
  );

  const visibleHubs = useMemo(
    () => HUBS.filter(h => activeCircles.has(h.circle)),
    [activeCircles],
  );

  const connectedDistricts = useMemo(
    () => selectedHub
      ? ALL_CONNECTIONS.filter(c => c.hub.name === selectedHub.name && c.hub.circle === selectedHub.circle)
      : [],
    [selectedHub],
  );

  const circleStats = useMemo(() =>
    HUB_CIRCLE_CODES.map(code => ({
      code,
      hubCount: HUBS.filter(h => h.circle === code).length,
      distCount: ALL_CONNECTIONS.filter(c => c.hubCircle === code).length,
      throughput: HUBS.filter(h => h.circle === code).reduce((s, h) => s + h.throughput, 0),
    })),
  []);

  const totalThpt = useMemo(
    () => visibleHubs.reduce((s, h) => s + h.throughput, 0),
    [visibleHubs],
  );

  const stateStyle = useCallback(() => ({
    fillColor: '#1e293b', fillOpacity: 0.35,
    color: '#334155', weight: 0.6, opacity: 0.7,
  }), []);

  return (
    <div className="w-full h-full relative">

      {/* ── Map ── */}
      <MapContainer center={[22.5, 80.0]} zoom={5}
        style={{ width: '100%', height: '100%' }} zoomControl attributionControl>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution="&copy; OpenStreetMap contributors &copy; CARTO"
          maxZoom={19} subdomains="abcd"
        />
        <GeoJSON data={indiaStates as any} style={stateStyle} />

        {/* 1 – Connection lines */}
        {showLines && visibleConnections.map(c => {
          const isHubSel = selectedHub
            && selectedHub.name === c.hub.name
            && selectedHub.circle === c.hub.circle;
          const dim = !!selectedHub && !isHubSel;
          return (
            <Polyline
              key={`ln-${c.hubCircle}-${c.district}`}
              positions={[[c.distLat, c.distLng], [c.hub.lat, c.hub.lng]]}
              pathOptions={{
                color: HUB_CIRCLE_COLORS[c.hubCircle],
                weight: isHubSel ? 2.0 : dim ? 0.6 : 1.2,
                opacity: dim ? 0.08 : isHubSel ? 0.85 : 0.55,
              }}
            />
          );
        })}

        {/* 2 – District dots */}
        {visibleConnections.map(c => {
          const isHubSel = selectedHub
            && selectedHub.name === c.hub.name
            && selectedHub.circle === c.hub.circle;
          const isDistSel = selectedDistrict?.district === c.district
            && selectedDistrict?.hubCircle === c.hubCircle;
          const dim = (!!selectedHub && !isHubSel) || (!!selectedDistrict && !isDistSel);
          const color = HUB_CIRCLE_COLORS[c.hubCircle];
          return (
            <CircleMarker
              key={`dist-${c.hubCircle}-${c.district}`}
              center={[c.distLat, c.distLng]}
              radius={isDistSel ? 7 : 4}
              pathOptions={{
                color: isDistSel ? '#fff' : color,
                fillColor: color,
                fillOpacity: dim ? 0.12 : isDistSel ? 1 : 0.80,
                weight: isDistSel ? 2 : 0.6,
                opacity: dim ? 0.2 : 1,
              }}
              eventHandlers={{
                click: () => {
                  setSelectedHub(null);
                  setSelectedDistrict(isDistSel ? null : c);
                }
              }}
            >
              <Tooltip direction="top" offset={[0, -3]}>
                <div style={TT}>
                  <div style={{ fontWeight: 700, color: '#fff' }}>{c.district}</div>
                  <div style={{ color, fontSize: 10 }}>
                    {c.hubCircle} · {HUB_CIRCLE_LABELS[c.hubCircle]}
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: 10 }}>
                    Hub: <strong style={{ color: '#e2e8f0' }}>{c.hub.name}</strong>
                    {' '}· {districtHubMapping[c.district]?.distKm ?? '—'} km
                  </div>
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}

        {/* 2b – Fixed-district highlight rings */}
        {showFixed && visibleConnections
          .filter(c => FIXED_DISTRICTS.has(c.district))
          .map(c => (
            <CircleMarker
              key={`fix-${c.district}`}
              center={[c.distLat, c.distLng]}
              radius={8}
              pathOptions={{
                color: '#f97316', fillColor: '#f97316',
                fillOpacity: 0.25, weight: 2, opacity: 0.9,
              }}
            >
              <Tooltip direction="top" offset={[0, -8]} permanent={false}>
                <div style={TT}>
                  <div style={{ fontWeight: 700, color: '#f97316' }}>⚠ Coord fixed</div>
                  <div style={{ color: '#fff', fontSize: 11 }}>{c.district}</div>
                  <div style={{ color: '#94a3b8', fontSize: 10 }}>
                    Wrong coords corrected → {c.hub.name}
                  </div>
                </div>
              </Tooltip>
            </CircleMarker>
          ))
        }

        {/* 3 – Hub datacenter markers */}
        {visibleHubs.map(h => {
          const isSel  = selectedHub?.name === h.name && selectedHub?.circle === h.circle;
          const dim    = !!selectedHub && !isSel;
          const color  = HUB_CIRCLE_COLORS[h.circle];
          const entry  = hubVolIndex[`${h.circle}::${h.name}`];
          const vol    = hubVol(entry, dateIdx, gen);
          const radius = isSel ? markerRadius(vol, maxVol) + 4 : markerRadius(vol, maxVol);
          const v4     = entry?.vals4g[dateIdx] ?? 0;
          const v5     = entry?.vals5g[dateIdx] ?? 0;
          return (
            <CircleMarker
              key={`hub-${h.circle}-${h.name}`}
              center={[h.lat, h.lng]}
              radius={radius}
              pathOptions={{
                color: isSel ? '#fff' : color,
                fillColor: color,
                fillOpacity: dim ? 0.25 : 0.92,
                weight: isSel ? 2.5 : 1.8,
                opacity: dim ? 0.3 : 1,
              }}
              eventHandlers={{ click: () => { setSelectedDistrict(null); setSelectedHub(isSel ? null : h); } }}
            >
              <Tooltip direction="top" offset={[0, -8]}>
                <div style={TT}>
                  <div style={{ fontWeight: 700, color: '#fff', marginBottom: 2 }}>
                    {h.name}
                    <span style={{ color, marginLeft: 6, fontSize: 10 }}>[{h.circle}]</span>
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: 10 }}>{HUB_CIRCLE_LABELS[h.circle]}</div>
                  <div style={{ color: '#22d3ee', fontSize: 11, fontWeight: 700, marginTop: 3 }}>
                    {v4.toFixed(1)} TB 4G · {v5.toFixed(1)} TB 5G
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: 10 }}>
                    {DATES[dateIdx]} · {h.throughput.toLocaleString()} Gbps backhaul
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: 10 }}>Click to focus</div>
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* ── Top-centre controls ── */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[2000] flex flex-col items-center gap-2">

        {/* Row 1 – mode toggles */}
        <div className="flex bg-panel border border-border rounded-md shadow-lg text-[12px] font-semibold overflow-hidden">
          {(['both','4g','5g'] as GenMode[]).map(m => (
            <button key={m} onClick={() => setGen(m)}
              className={`px-4 py-1.5 transition-colors border-r last:border-r-0 border-border uppercase tracking-wide
                ${gen === m
                  ? m === '4g' ? 'bg-blue-600 text-white'
                  : m === '5g' ? 'bg-purple-600 text-white'
                  : 'bg-accent2 text-bg'
                  : 'text-muted hover:text-txt'}`}
            >{m === 'both' ? '4G + 5G' : m}</button>
          ))}
          <button
            onClick={() => setShowLines(l => !l)}
            className={`px-4 py-1.5 transition-colors border-l border-border ${showLines ? 'text-accent2' : 'text-muted hover:text-txt'}`}
          >Lines</button>
          <button
            onClick={() => setShowFixed(f => !f)}
            className={`px-4 py-1.5 transition-colors border-l border-border ${showFixed ? 'text-orange-400' : 'text-muted hover:text-txt'}`}
          >Fixed ({FIXED_DISTRICTS.size})</button>
          {selectedHub && (
            <button onClick={() => setSelectedHub(null)}
              className="px-4 py-1.5 text-muted hover:text-txt transition-colors border-l border-border">
              Clear
            </button>
          )}
        </div>

        {/* Row 2 – date slider */}
        <div className="flex items-center gap-3 bg-panel/90 border border-border rounded-md px-4 py-2 shadow-lg backdrop-blur-sm">
          <span className="text-[10px] text-muted font-mono">{DATES[0].slice(5)}</span>
          <input
            type="range" min={0} max={DATES.length - 1} value={dateIdx}
            onChange={e => setDateIdx(Number(e.target.value))}
            className="w-48 accent-accent2 cursor-pointer"
          />
          <span className="text-[10px] text-muted font-mono">{DATES[DATES.length-1].slice(5)}</span>
          <span className="text-[11px] font-bold text-txt ml-1 font-mono">{DATES[dateIdx]}</span>
        </div>
      </div>

      {/* ── Circle filter sidebar (left) ── */}
      <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-1 max-h-[calc(100vh-24px)] overflow-y-auto pr-1">
        <div className="flex gap-1 mb-1 flex-shrink-0">
          <button
            onClick={() => setActiveCircles(new Set(HUB_CIRCLE_CODES))}
            className="flex-1 px-2 py-1 rounded text-[10px] font-semibold border border-slate-600 bg-slate-800/90 text-slate-300 hover:bg-slate-700 backdrop-blur-sm transition-colors"
          >All</button>
          <button
            onClick={() => setActiveCircles(new Set())}
            className="flex-1 px-2 py-1 rounded text-[10px] font-semibold border border-slate-600 bg-slate-800/90 text-slate-300 hover:bg-slate-700 backdrop-blur-sm transition-colors"
          >None</button>
        </div>
        {circleStats.map(({ code, hubCount, distCount, throughput }) => {
          const active  = activeCircles.has(code);
          const isSelCircle = selectedCircle === code;
          const color   = HUB_CIRCLE_COLORS[code];
          return (
            <div
              key={code}
              className="flex items-center rounded-md text-[11px] font-semibold border backdrop-blur-sm transition-all whitespace-nowrap flex-shrink-0 overflow-hidden"
              style={{
                background:  isSelCircle ? `${color}30` : active ? `${color}18` : 'rgba(22,27,34,0.85)',
                borderColor: isSelCircle ? color : active ? `${color}88` : '#30363d',
              }}
            >
              {/* Dot — toggles map visibility only */}
              <button
                onClick={() => toggleCircle(code)}
                className="px-1.5 py-1.5 flex items-center flex-shrink-0 hover:opacity-70 transition-opacity"
                title="Toggle on map"
              >
                <span className="w-2 h-2 rounded-full" style={{ background: active ? color : '#30363d' }} />
              </button>

              {/* Label — opens the circle analytics panel */}
              <button
                onClick={() => setSelectedCircle(isSelCircle ? null : code)}
                className="flex items-center gap-1.5 py-1.5 pr-2 flex-1 text-left hover:opacity-80 transition-opacity"
              >
                <span className="font-black tracking-wide" style={{ color: active ? color : '#8b949e', minWidth: 30 }}>{code}</span>
                <span style={{ color: '#8b949e', fontWeight: 400, fontSize: 10 }}>
                  {HUB_CIRCLE_LABELS[code]?.split(/[+\s]/)[0]}
                </span>
                <span className="ml-auto text-[9px] font-mono" style={{ color: '#8b949e' }}>
                  {throughput.toLocaleString()}G
                </span>
                <span style={{ color: '#6b7280', fontSize: 9 }}>
                  {hubCount}h/{distCount}d
                </span>
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Stats (top-right, hidden when hub panel open) ── */}
      {!selectedHub && (() => {
        const tot4g = visibleHubs.reduce((s, h) => s + (hubVolIndex[`${h.circle}::${h.name}`]?.vals4g[dateIdx] ?? 0), 0);
        const tot5g = visibleHubs.reduce((s, h) => s + (hubVolIndex[`${h.circle}::${h.name}`]?.vals5g[dateIdx] ?? 0), 0);
        return (
          <div className="absolute top-24 right-3 z-[1000] bg-panel/90 border border-border rounded-md px-3 py-2 backdrop-blur-sm text-right flex flex-col gap-1">
            <div className="text-[11px] text-muted">
              <span className="font-bold text-txt">{visibleHubs.length}</span> hubs ·{' '}
              <span className="font-bold text-txt">{visibleConnections.length}</span> districts
            </div>
            <div className="text-[11px] text-blue-400 font-bold">{tot4g.toFixed(0)} TB 4G</div>
            <div className="text-[11px] text-purple-400 font-bold">{tot5g.toFixed(0)} TB 5G</div>
            <div className="text-[11px] text-cyan-400 border-t border-border pt-1">
              <span className="font-bold">{totalThpt.toLocaleString()}</span> Gbps backhaul
            </div>
            <div className="text-[9px] text-muted">{DATES[dateIdx]}</div>
          </div>
        );
      })()}

      {/* ── Legend ── */}
      {!selectedHub && (
        <div className="absolute bottom-6 right-3 z-[1000] bg-panel/90 border border-border rounded-md px-3 py-2 backdrop-blur-sm text-[10px] text-muted flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <svg width="16" height="16">
              <circle cx="8" cy="8" r="7" fill="none" stroke="#94a3b8" strokeWidth="2" />
              <circle cx="8" cy="8" r="3" fill="#94a3b8" />
            </svg>
            <span>Hub datacenter</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="16" height="16"><circle cx="8" cy="8" r="3" fill="#94a3b8" /></svg>
            <span>District (→ nearest hub)</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 2" /></svg>
            <span>Connection line</span>
          </div>
          {showFixed && (
            <div className="flex items-center gap-2 border-t border-border pt-1.5 mt-0.5">
              <svg width="16" height="16">
                <circle cx="8" cy="8" r="7" fill="rgba(249,115,22,0.25)" stroke="#f97316" strokeWidth="2" />
              </svg>
              <span style={{ color: '#f97316' }}>Coord-fixed district</span>
            </div>
          )}
        </div>
      )}

      {/* ── Hub detail panel (right slide-in) ── */}
      {selectedHub && (
        <div
          className="absolute top-0 right-0 h-full z-[2000] flex flex-col bg-panel border-l border-border shadow-2xl overflow-hidden"
          style={{ width: 300 }}
        >
          {/* Header */}
          <div className="flex items-start justify-between px-4 py-3 border-b border-border flex-shrink-0">
            <div>
              <div className="text-[15px] font-black text-txt">{selectedHub.name}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: HUB_CIRCLE_COLORS[selectedHub.circle] }}
                />
                <span className="text-[11px] text-muted">
                  {selectedHub.circle} · {HUB_CIRCLE_LABELS[selectedHub.circle]}
                </span>
              </div>
            </div>
            <button
              onClick={() => setSelectedHub(null)}
              className="text-muted hover:text-txt text-xl leading-none mt-0.5"
            >×</button>
          </div>

          {/* KPI strip */}
          {(() => {
            const entry = hubVolIndex[`${selectedHub.circle}::${selectedHub.name}`];
            const v4 = entry?.vals4g[dateIdx] ?? 0;
            const v5 = entry?.vals5g[dateIdx] ?? 0;
            const color = HUB_CIRCLE_COLORS[selectedHub.circle];
            return (
              <>
                <div className="grid grid-cols-3 gap-px bg-border flex-shrink-0">
                  <div className="bg-panel px-2 py-2.5 text-center">
                    <div className="text-[16px] font-black text-blue-400">{v4.toFixed(1)}</div>
                    <div className="text-[9px] text-muted">4G TB</div>
                  </div>
                  <div className="bg-panel px-2 py-2.5 text-center">
                    <div className="text-[16px] font-black text-purple-400">{v5.toFixed(1)}</div>
                    <div className="text-[9px] text-muted">5G TB</div>
                  </div>
                  <div className="bg-panel px-2 py-2.5 text-center">
                    <div className="text-[16px] font-black" style={{ color }}>{connectedDistricts.length}</div>
                    <div className="text-[9px] text-muted">Districts</div>
                  </div>
                </div>

                {/* Sparklines */}
                {entry && (
                  <div className="px-3 pt-2 pb-1 border-b border-border flex-shrink-0">
                    <div className="text-[9px] text-muted mb-1">4G (TB/day)</div>
                    <Sparkline vals={entry.vals4g} color="#3b82f6" />
                    <div className="text-[9px] text-muted mt-1 mb-1">5G (TB/day)</div>
                    <Sparkline vals={entry.vals5g} color="#a855f7" />
                  </div>
                )}

                {/* Backhaul + coords */}
                <div className="px-4 py-1.5 border-b border-border flex-shrink-0 text-[10px] text-muted font-mono">
                  {selectedHub.throughput > 0 ? `${selectedHub.throughput.toLocaleString()} Gbps backhaul · ` : ''}
                  {selectedHub.lat.toFixed(4)}, {selectedHub.lng.toFixed(4)}
                </div>
              </>
            );
          })()}

          {/* District list */}
          <div className="flex-1 overflow-y-auto p-3">
            <div className="text-[10px] text-muted font-semibold uppercase tracking-wider mb-2">
              Connected districts
            </div>
            {connectedDistricts.length === 0 ? (
              <div className="text-[11px] text-muted italic">No districts assigned</div>
            ) : (
              <div className="flex flex-col gap-px">
                {connectedDistricts
                  .sort((a, b) => a.district.localeCompare(b.district))
                  .map(c => (
                    <div
                      key={c.district}
                      className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-card/40 transition-colors"
                    >
                      <span className="text-[11px] text-txt capitalize">
                        {c.district.toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                      </span>
                      <span
                        className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                        style={{
                          background: `${HUB_CIRCLE_COLORS[c.hubCircle]}18`,
                          color: HUB_CIRCLE_COLORS[c.hubCircle],
                        }}
                      >
                        {c.distCircle}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Circle analytics panel ── */}
      {selectedCircle && !selectedHub && !selectedDistrict && (
        <HubCirclePanel
          circleCode={selectedCircle}
          dateIdx={dateIdx}
          gen={gen}
          onClose={() => setSelectedCircle(null)}
          onSelectHub={(hub) => { setSelectedHub(hub); setSelectedCircle(null); }}
        />
      )}

      {/* ── District detail panel ── */}
      {selectedDistrict && (() => {
        const c    = selectedDistrict;
        const color = HUB_CIRCLE_COLORS[c.hubCircle];
        const info  = districtHubMapping[c.district];
        const label = c.district.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());

        // Look up volume data using distCircle (original circle in vol data)
        const v4vals = distVol4g.get(`${c.distCircle}|${c.district}`) ?? [];
        const v5vals = distVol5g.get(`${c.distCircle}|${c.district}`) ?? [];
        const v4today = (v4vals[dateIdx] ?? 0) as number;
        const v5today = (v5vals[dateIdx] ?? 0) as number;
        const combined = v4today + v5today;
        const share5g  = combined > 0 ? (v5today / combined) * 100 : 0;
        const v4clean  = v4vals.map(v => (v ?? 0) as number);
        const v5clean  = v5vals.map(v => (v ?? 0) as number);

        return (
          <div className="absolute top-0 right-0 h-full z-[2000] flex flex-col bg-panel border-l border-border shadow-2xl overflow-hidden"
            style={{ width: 320 }}>

            {/* Header */}
            <div className="flex items-start justify-between px-4 py-3 border-b border-border flex-shrink-0">
              <div>
                <div className="text-[15px] font-black text-txt">{label}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                  <span className="text-[11px] text-muted">
                    {c.hubCircle} · {HUB_CIRCLE_LABELS[c.hubCircle]}
                  </span>
                </div>
              </div>
              <button onClick={() => setSelectedDistrict(null)}
                className="text-muted hover:text-txt text-xl leading-none mt-0.5">×</button>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-3 gap-px bg-border flex-shrink-0">
              <div className="bg-panel px-2 py-2.5 text-center">
                <div className="text-[15px] font-black text-blue-400">{v4today.toFixed(1)}</div>
                <div className="text-[9px] text-muted">4G TB</div>
              </div>
              <div className="bg-panel px-2 py-2.5 text-center">
                <div className="text-[15px] font-black text-purple-400">{v5today.toFixed(1)}</div>
                <div className="text-[9px] text-muted">5G TB</div>
              </div>
              <div className="bg-panel px-2 py-2.5 text-center">
                <div className="text-[15px] font-black text-cyan-400">{share5g.toFixed(1)}%</div>
                <div className="text-[9px] text-muted">5G Share</div>
              </div>
            </div>

            {/* Sparklines */}
            {(v4clean.length > 0 || v5clean.length > 0) && (
              <div className="px-3 pt-2 pb-1 border-b border-border flex-shrink-0">
                {v4clean.length > 0 && <>
                  <div className="text-[9px] text-muted mb-1">4G (TB/day)</div>
                  <Sparkline vals={v4clean} color="#3b82f6" />
                </>}
                {v5clean.length > 0 && <>
                  <div className="text-[9px] text-muted mt-1 mb-1">5G (TB/day)</div>
                  <Sparkline vals={v5clean} color="#a855f7" />
                </>}
              </div>
            )}

            {/* Hub assignment */}
            <div className="px-4 py-2.5 border-b border-border flex-shrink-0">
              <div className="text-[10px] text-muted font-semibold uppercase tracking-wider mb-1.5">Assigned Hub</div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                <span className="text-[13px] font-bold text-txt">{c.hub.name}</span>
                <span className="text-[10px] text-muted ml-auto">{info?.distKm ?? '—'} km away</span>
              </div>
              <div className="text-[10px] text-muted mt-1 font-mono">
                {c.distLat.toFixed(4)}, {c.distLng.toFixed(4)}
              </div>
            </div>

            {/* Date table */}
            <div className="flex-1 overflow-y-auto px-3 py-2">
              <div className="text-[10px] text-muted font-semibold uppercase tracking-wider mb-1.5">All Dates</div>
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
                  {DATES.map((dt, i) => {
                    const a = (v4vals[i] ?? null) as number | null;
                    const b = (v5vals[i] ?? null) as number | null;
                    const tot = (a ?? 0) + (b ?? 0);
                    const isCur = i === dateIdx;
                    return (
                      <tr key={dt}
                        className={`border-b border-border/30 cursor-pointer ${isCur ? 'bg-accent2/10' : 'hover:bg-card/40'}`}
                        onClick={() => setDateIdx(i)}>
                        <td className="py-1" style={{ color: isCur ? color : '#94a3b8' }}>{dt.slice(5)}</td>
                        <td className="py-1 text-right font-mono text-blue-300">{a !== null ? a.toFixed(2) : '—'}</td>
                        <td className="py-1 text-right font-mono text-purple-300">{b !== null ? b.toFixed(2) : '—'}</td>
                        <td className="py-1 text-right font-mono text-txt">{tot > 0 ? tot.toFixed(2) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
