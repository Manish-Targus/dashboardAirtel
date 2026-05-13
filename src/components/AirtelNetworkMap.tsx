'use client';
import { useState, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, GeoJSON, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import indiaStates from '@/data/india_states_simple.json';
import { processedAirtelData, CIRCLE_NAMES } from '@/lib/airtelDataHelper';

type MsanRecord = { msan: string; vlan: string; count: number };
type BrasEntry = { bras: string; msans: MsanRecord[] };
type CityData = {
  name: string; lat: number; lng: number;
  distanceKm: number; totalCount: number; brasCount: number;
  bngCity?: string; bngCityLat?: number; bngCityLng?: number;
  bras: BrasEntry[];
  complaints?: number;
};
type CircleData = { hub: string; lat: number; lng: number; color: string; cities: CityData[] };

const data = processedAirtelData as unknown as Record<string, CircleData>;

/* ── Haversine distance ── */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ── All unique BNG city positions (across every circle) ── */
const ALL_BNG_POSITIONS = (() => {
  const map = new Map<string, { lat: number; lng: number }>();
  for (const circle of Object.values(data)) {
    for (const city of circle.cities) {
      if (city.bngCity && city.bngCityLat != null && city.bngCityLng != null && !map.has(city.bngCity)) {
        map.set(city.bngCity, { lat: city.bngCityLat, lng: city.bngCityLng });
      }
    }
  }
  return map;
})();

/* ── Assign a distinct color to each BNG city using golden-angle hue spread ──
   137.508° golden angle maximises perceptual separation between adjacent entries,
   unlike even spacing which clusters hues at the ends of the visible spectrum.
   Alternating lightness (60 / 68) adds a second visual dimension so nearby hues
   look less alike at a glance. */
const ALL_BNG_CITY_NAMES = Array.from(ALL_BNG_POSITIONS.keys()).sort();
const BNG_CITY_COLORS: Record<string, string> = {};
ALL_BNG_CITY_NAMES.forEach((bng, i) => {
  const hue = Math.round((i * 137.508) % 360);
  const light = i % 2 === 0 ? 60 : 68;
  BNG_CITY_COLORS[bng] = `hsl(${hue}, 82%, ${light}%)`;
});

/* ── Pre-compute max totalCount for log-scale dot sizing ── */
const MAX_OLT_COUNT = (() => {
  let max = 1;
  for (const circle of Object.values(data)) {
    for (const city of circle.cities) {
      if (city.totalCount > max) max = city.totalCount;
    }
  }
  return max;
})();

const MAX_COMPLAINTS = (() => {
  let max = 1;
  for (const circle of Object.values(data)) {
    for (const city of circle.cities) {
      if ((city.complaints || 0) > max) max = city.complaints!;
    }
  }
  return max;
})();

/* ── Log10 radius: 2.5 px (1 connection) → 9 px (max connections) ── */
function oltRadius(count: number): number {
  const minR = 2.5, maxR = 9;
  if (count <= 0) return minR;
  return minR + (Math.log10(count + 1) / Math.log10(MAX_OLT_COUNT + 1)) * (maxR - minR);
}

function complaintRadius(count: number): number {
  const minR = 3.5, maxR = 12;
  if (count <= 0) return minR;
  return minR + (Math.log10(count + 1) / Math.log10(MAX_COMPLAINTS + 1)) * (maxR - minR);
}

/* ── Pre-compute the nearest alternative BNG city for each OLT connection ── */
const ALL_BNG_ENTRIES = Array.from(ALL_BNG_POSITIONS.entries());
const SHORTER_BNG_MAP = new Map<string, { name: string; distKm: number }>();
for (const [circleName, circleData] of Object.entries(data)) {
  for (const city of circleData.cities) {
    if (city.bngCityLat == null || city.bngCityLng == null || city.distanceKm <= 0) continue;
    let nearest: { name: string; distKm: number } | null = null;
    for (const [bngName, bngPos] of ALL_BNG_ENTRIES) {
      if (bngName === city.bngCity) continue;
      const d = Math.round(haversineKm(city.lat, city.lng, bngPos.lat, bngPos.lng));
      if (d < city.distanceKm && (!nearest || d < nearest.distKm)) {
        nearest = { name: bngName, distKm: d };
      }
    }
    if (nearest) {
      SHORTER_BNG_MAP.set(`${circleName}-${city.name}-${city.bngCity}`, nearest);
    }
  }
}
const SHORTER_BNG_SET = new Set(SHORTER_BNG_MAP.keys());

/* ── Side panel ── */
function CityPanel({ city, circleName, color, shorterBng, onClose, onSelectBng }: {
  city: CityData; circleName: string; color: string;
  shorterBng: { name: string; distKm: number } | null;
  onClose: () => void;
  onSelectBng: (bngName: string) => void;
}) {
  const [openBras, setOpenBras] = useState<string | null>(null);

  const allCityInstances = useMemo(() => {
    const instances: { circleName: string; city: CityData; color: string }[] = [];
    for (const [cName, cData] of Object.entries(data)) {
      const matchedCity = cData.cities.find(c => c.name === city.name && c.lat === city.lat && c.lng === city.lng);
      if (matchedCity) {
        instances.push({ circleName: cName, city: matchedCity, color: cData.color || '#30363d' });
      }
    }
    instances.sort((a, b) => a.circleName === circleName ? -1 : b.circleName === circleName ? 1 : 0);
    return instances;
  }, [city, circleName]);

  const totalDistanceKm = city.distanceKm;
  const totalBrasCount = allCityInstances.reduce((sum, inst) => sum + inst.city.brasCount, 0);
  const totalConnectionCount = allCityInstances.reduce((sum, inst) => sum + inst.city.totalCount, 0);

  return (
    <div className="absolute top-0 right-0 h-full z-[2000] flex flex-col bg-panel border-l border-border shadow-2xl" style={{ width: 360 }}>
      <div className="flex items-start justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div>
          <div className="text-[13px] font-bold text-txt">{city.name}</div>
          <div className="text-[11px] text-muted mt-0.5">
            BNG:{' '}
            <span
              style={{ color: BNG_CITY_COLORS[city.bngCity!] ?? color, fontWeight: 700, cursor: 'pointer' }}
              onClick={() => onSelectBng(city.bngCity!)}
            >
              {city.bngCity}
            </span>
          </div>
        </div>
        <button onClick={onClose} className="text-muted hover:text-txt text-lg leading-none mt-0.5">×</button>
      </div>

      {shorterBng && (
        <div className="mx-3 mt-2 mb-1 flex-shrink-0 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2">
          <div className="text-[11px] font-semibold text-amber-400 mb-0.5">⚡ Closer BNG hub available</div>
          <div className="flex items-center justify-between text-[11px]">
            <span>
              <span style={{ color: BNG_CITY_COLORS[shorterBng.name] ?? '#f59e0b', fontWeight: 700 }}>
                {shorterBng.name}
              </span>
              <span className="text-muted ml-2">({shorterBng.distKm} km)</span>
            </span>
            <span className="text-muted">vs current {city.distanceKm} km</span>
          </div>
          <div className="text-[10px] text-amber-300/70 mt-0.5">
            saves {city.distanceKm - shorterBng.distKm} km
          </div>
        </div>
      )}

      {/* Show Circles & Subscriber counts */}
      <div className="px-4 py-2 border-b border-border flex-shrink-0 bg-panel/50">
        <div className="text-[11px] font-semibold text-txt mb-1.5">Circles & Subscribers:</div>
        <div className="flex flex-col gap-1">
          {allCityInstances.map(inst => (
            <div key={inst.circleName} className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: inst.color }} />
                <span className={inst.circleName === circleName ? 'text-txt font-medium' : 'text-muted'}>
                  {inst.circleName}
                </span>
              </div>
              <span className="text-txt font-mono">{inst.city.totalCount.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-px bg-border flex-shrink-0">
        {[
          { label: 'Dist to BNG', value: `${totalDistanceKm} km` },
          { label: 'BRAS nodes', value: totalBrasCount },
          { label: 'Total count', value: totalConnectionCount.toLocaleString() },
        ].map(({ label, value }) => (
          <div key={label} className="bg-panel px-3 py-2 text-center">
            <div className="text-[15px] font-bold text-txt">{value}</div>
            <div className="text-[10px] text-muted mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {city.complaints && city.complaints > 0 ? (
        <div className="bg-panel border-b border-border px-3 py-2 text-center flex-shrink-0">
          <div className="flex justify-center items-end gap-2">
            <div className="text-[15px] font-bold text-red-500">{city.complaints.toLocaleString()}</div>
            <div className="text-[11px] font-semibold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded mb-0.5">
              {((city.complaints / city.totalCount) * 100).toFixed(2)}% ratio
            </div>
          </div>
          <div className="text-[10px] text-muted mt-0.5">Network Complaints</div>
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto">
        {allCityInstances.map(inst => (
          <div key={inst.circleName}>
            {allCityInstances.length > 1 && (
              <div className="px-3 py-1.5 bg-card/40 border-b border-border/60 text-[10px] font-bold text-muted uppercase tracking-wider">
                {inst.circleName}
              </div>
            )}
            {inst.city.bras.map(b => {
              const uniqueBrasKey = `${inst.circleName}-${b.bras}`;
              const isOpen = openBras === uniqueBrasKey;
              const brasTotal = b.msans.reduce((s, m) => s + m.count, 0);
              return (
                <div key={uniqueBrasKey} className="border-b border-border/60">
                  <button
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-card/60 transition-colors text-left"
                    onClick={() => setOpenBras(isOpen ? null : uniqueBrasKey)}
                  >
                    <div>
                      <div className="text-[12px] font-semibold text-txt">{b.bras || '(no BRAS)'}</div>
                      <div className="text-[10px] text-muted mt-0.5">{b.msans.length} MSANs · {brasTotal.toLocaleString()} connections</div>
                    </div>
                    <span className="text-muted text-[11px] ml-2">{isOpen ? '▲' : '▼'}</span>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-2">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="text-muted border-b border-border/40">
                            <th className="text-left pb-1 font-medium">MSAN</th>
                            <th className="text-left pb-1 font-medium">VLAN</th>
                            <th className="text-right pb-1 font-medium">Count</th>
                          </tr>
                        </thead>
                        <tbody>
                          {b.msans.map((m, i) => (
                            <tr key={i} className="border-b border-border/20 hover:bg-card/40">
                              <td className="py-1 font-mono text-txt">{m.msan}</td>
                              <td className="py-1 text-muted">{m.vlan}</td>
                              <td className="py-1 text-right text-txt">{m.count.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="px-4 py-2 border-t border-border flex-shrink-0 text-[10px] text-muted">
        {city.lat.toFixed(4)}, {city.lng.toFixed(4)}
      </div>
    </div>
  );
}

/* ── BNG panel ── */
function BngPanel({ bngName, data, onClose }: { bngName: string, data: Record<string, CircleData>, onClose: () => void }) {
  const connectedCities: { circleName: string; city: CityData }[] = [];
  for (const [cName, cData] of Object.entries(data)) {
    for (const city of cData.cities) {
      if (city.bngCity === bngName) {
        connectedCities.push({ circleName: cName, city });
      }
    }
  }

  const totalCities = connectedCities.length;
  let totalBrasCount = 0;
  let totalConnectionCount = 0;
  let totalMsanCount = 0;

  connectedCities.forEach(({ city }) => {
    totalBrasCount += city.brasCount;
    totalConnectionCount += city.totalCount;
    city.bras.forEach(b => {
      totalMsanCount += b.msans.length;
    });
  });

  const bngColor = BNG_CITY_COLORS[bngName] || '#ffffff';

  return (
    <div className="absolute top-0 right-0 h-full z-[2000] flex flex-col bg-panel border-l border-border shadow-2xl" style={{ width: 360 }}>
      <div className="flex items-start justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div>
          <div className="text-[13px] font-bold text-txt" style={{ color: bngColor }}>{bngName} BNG Hub</div>
          <div className="text-[11px] text-muted mt-0.5">Serves {totalCities} OLT Cities</div>
        </div>
        <button onClick={onClose} className="text-muted hover:text-txt text-lg leading-none mt-0.5">×</button>
      </div>

      <div className="grid grid-cols-2 gap-px bg-border flex-shrink-0">
        {[
          { label: 'OLT Cities', value: totalCities.toLocaleString() },
          { label: 'BRAS Nodes', value: totalBrasCount.toLocaleString() },
          { label: 'MSANs', value: totalMsanCount.toLocaleString() },
          { label: 'Total Connections', value: totalConnectionCount.toLocaleString() },
        ].map(({ label, value }) => (
          <div key={label} className="bg-panel px-3 py-2 text-center">
            <div className="text-[15px] font-bold text-txt">{value}</div>
            <div className="text-[10px] text-muted mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      <div className="px-4 py-2 border-b border-border text-[11px] font-semibold text-txt flex-shrink-0 bg-panel/50">
        Connected Cities ({totalCities})
      </div>

      <div className="flex-1 overflow-y-auto">
        {connectedCities.sort((a, b) => b.city.totalCount - a.city.totalCount).map(({ city, circleName }) => (
          <div key={`${circleName}-${city.name}`} className="px-4 py-2 border-b border-border/40 hover:bg-card/40 transition-colors flex justify-between items-center">
            <div>
              <div className="text-[12px] font-semibold text-txt">{city.name}</div>
              <div className="text-[10px] text-muted">{circleName} · {city.distanceKm} km</div>
            </div>
            <div className="text-right">
              <div className="text-[12px] font-mono text-txt">{city.totalCount.toLocaleString()}</div>
              <div className="text-[10px] text-muted">{city.brasCount} BRAS</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Complaint BNG panel ── */
function ComplaintBngPanel({ bngName, data, onClose }: { bngName: string, data: Record<string, CircleData>, onClose: () => void }) {
  const connectedCities: { circleName: string; city: CityData }[] = [];
  let totalComplaints = 0;

  for (const [cName, cData] of Object.entries(data)) {
    for (const city of cData.cities) {
      if (city.bngCity === bngName && city.complaints && city.complaints > 0) {
        connectedCities.push({ circleName: cName, city });
        totalComplaints += city.complaints;
      }
    }
  }

  const totalCities = connectedCities.length;

  return (
    <div className="absolute top-0 right-0 h-full z-[2000] flex flex-col bg-panel border-l border-border shadow-2xl" style={{ width: 360 }}>
      <div className="flex items-start justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div>
          <div className="text-[13px] font-bold text-red-500">{bngName} BNG Hub</div>
          <div className="text-[11px] text-muted mt-0.5">{totalCities} Cities with Complaints</div>
        </div>
        <button onClick={onClose} className="text-muted hover:text-txt text-lg leading-none mt-0.5">×</button>
      </div>

      <div className="grid grid-cols-2 gap-px bg-border flex-shrink-0">
        <div className="bg-panel px-3 py-2 text-center col-span-2">
          <div className="text-[20px] font-bold text-red-500">{totalComplaints.toLocaleString()}</div>
          <div className="text-[10px] text-muted mt-0.5">Total Complaints</div>
        </div>
      </div>

      <div className="px-4 py-2 border-b border-border text-[11px] font-semibold text-txt flex-shrink-0 bg-panel/50">
        Affected Cities ({totalCities})
      </div>

      <div className="flex-1 overflow-y-auto">
        {connectedCities.sort((a, b) => (b.city.complaints || 0) - (a.city.complaints || 0)).map(({ city, circleName }) => (
          <div key={`${circleName}-${city.name}`} className="px-4 py-2 border-b border-border/40 hover:bg-card/40 transition-colors flex justify-between items-center">
            <div>
              <div className="text-[12px] font-semibold text-txt">{city.name}</div>
              <div className="text-[10px] text-muted">{circleName}</div>
            </div>
            <div className="text-right">
              <div className="text-[12px] font-bold text-red-500">{city.complaints?.toLocaleString()}</div>
              <div className="text-[10px] text-muted">Complaints</div>
            </div>
          </div>
        ))}
        {totalCities === 0 && (
          <div className="px-4 py-6 text-center text-muted text-sm">
            No complaints currently reported for cities connected to this hub.
          </div>
        )}
      </div>
    </div>
  );
}

import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';

/* ── Ideal BNG panel ── */
function IdealBngPanel({ bngName, data, onClose }: { bngName: string, data: Record<string, CircleData>, onClose: () => void }) {
  const [activeList, setActiveList] = useState<'Original' | 'Ideal'>('Original');

  let beforeSubs = 0;
  let beforeCities = 0;
  let idealSubs = 0;
  let idealCities = 0;

  let originalDistance = 0;
  let idealDistance = 0;

  const originalCitiesList: { city: CityData, distance: number, hub: string }[] = [];
  const idealCitiesList: { city: CityData, distance: number, hub: string }[] = [];

  for (const [cName, cData] of Object.entries(data)) {
    for (const city of cData.cities) {
      const key = `${cName}-${city.name}-${city.bngCity}`;
      const shorter = SHORTER_BNG_MAP.get(key);
      const idealBng = shorter ? shorter.name : city.bngCity;

      if (city.bngCity === bngName) {
        beforeSubs += city.totalCount;
        beforeCities++;
        originalDistance += city.distanceKm;
        idealDistance += shorter ? shorter.distKm : city.distanceKm;
        originalCitiesList.push({ city, distance: city.distanceKm, hub: city.bngCity });
      }

      if (idealBng === bngName) {
        idealSubs += city.totalCount;
        idealCities++;
        idealCitiesList.push({ city, distance: shorter ? shorter.distKm : city.distanceKm, hub: bngName });
      }
    }
  }

  const distanceSaved = originalDistance - idealDistance;

  const subsData = [
    { name: 'Original', Subs: beforeSubs },
    { name: 'Ideal', Subs: idealSubs }
  ];

  const citiesData = [
    { name: 'Original', Cities: beforeCities },
    { name: 'Ideal', Cities: idealCities }
  ];

  const distanceData = [
    { name: 'Original', Distance: Math.round(originalDistance) },
    { name: 'Ideal', Distance: Math.round(idealDistance) }
  ];

  const currentList = activeList === 'Original' ? originalCitiesList : idealCitiesList;

  return (
    <div className="fixed inset-4 z-[3000] flex flex-col bg-panel border border-border shadow-2xl rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-panel/50 backdrop-blur-md flex-shrink-0">
        <div>
          <div className="text-[20px] font-bold text-amber-500">{bngName} BNG Hub (Ideal View)</div>
          <div className="text-[13px] text-muted mt-1">Optimized Network Topology Comparison</div>
        </div>
        <button onClick={onClose} className="text-muted hover:text-txt text-3xl leading-none transition-colors">×</button>
      </div>

      <div className="bg-border/30 px-6 py-4 flex-shrink-0 border-b border-border flex justify-between items-center">
        <div>
          <div className="text-[32px] font-bold text-green-400">{Math.round(distanceSaved).toLocaleString()} km</div>
          <div className="text-[14px] text-muted mt-1">Total Distance Saved (Original Connected Cities)</div>
        </div>
        <div className="text-[13px] text-muted max-w-sm text-right">
          Click on any bar chart below to inspect the exact OLT cities connected to this hub in either the Original or Ideal network topology.
        </div>
      </div>

      <div className="flex flex-col flex-1 overflow-hidden p-6 bg-bg/50">
        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-shrink-0 mb-4">
          <div className="bg-panel rounded-xl border border-border p-4 shadow-sm">
            <h3 className="text-[13px] font-bold text-txt mb-2">Subscribers (Before vs Ideal)</h3>
            <div className="h-[90px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subsData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }} onClick={(e) => { if (e && e.activePayload) setActiveList(e.activePayload[0].payload.name as any) }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={70} tick={{ fontSize: 12, fill: '#8b949e' }} />
                  <RechartsTooltip
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    contentStyle={{ backgroundColor: '#0d1117', borderColor: '#30363d', fontSize: '12px', borderRadius: '6px' }}
                  />
                  <Bar dataKey="Subs" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={28} className="cursor-pointer transition-opacity hover:opacity-80" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-panel rounded-xl border border-border p-4 shadow-sm">
            <h3 className="text-[13px] font-bold text-txt mb-2">Connected Cities (Before vs Ideal)</h3>
            <div className="h-[90px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={citiesData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }} onClick={(e) => { if (e && e.activePayload) setActiveList(e.activePayload[0].payload.name as any) }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={70} tick={{ fontSize: 12, fill: '#8b949e' }} />
                  <RechartsTooltip
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    contentStyle={{ backgroundColor: '#0d1117', borderColor: '#30363d', fontSize: '12px', borderRadius: '6px' }}
                  />
                  <Bar dataKey="Cities" fill="#10b981" radius={[0, 4, 4, 0]} barSize={28} className="cursor-pointer transition-opacity hover:opacity-80" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-panel rounded-xl border border-border p-4 shadow-sm">
            <h3 className="text-[13px] font-bold text-txt mb-2">Total Distance (km)</h3>
            <div className="h-[90px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distanceData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }} onClick={(e) => { if (e && e.activePayload) setActiveList(e.activePayload[0].payload.name as any) }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={70} tick={{ fontSize: 12, fill: '#8b949e' }} />
                  <RechartsTooltip
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    contentStyle={{ backgroundColor: '#0d1117', borderColor: '#30363d', fontSize: '12px', borderRadius: '6px' }}
                  />
                  <Bar dataKey="Distance" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={28} className="cursor-pointer transition-opacity hover:opacity-80" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* List Section */}
        <div className="flex-1 flex flex-col bg-panel rounded-xl border border-border overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-panel/80">
            <h2 className="text-[16px] font-bold text-txt flex items-center gap-2">
              <span className={`px-2 py-1 rounded text-[12px] ${activeList === 'Original' ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                {activeList}
              </span>
              Connected OLT Cities ({currentList.length})
            </h2>
            <div className="flex gap-2 bg-border/50 p-1 rounded-md">
              <button
                onClick={() => setActiveList('Original')}
                className={`px-4 py-1.5 text-[12px] font-semibold rounded transition-colors ${activeList === 'Original' ? 'bg-panel text-txt shadow' : 'text-muted hover:text-txt'}`}
              >Original Network</button>
              <button
                onClick={() => setActiveList('Ideal')}
                className={`px-4 py-1.5 text-[12px] font-semibold rounded transition-colors ${activeList === 'Ideal' ? 'bg-panel text-txt shadow' : 'text-muted hover:text-txt'}`}
              >Ideal Topology</button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left text-[13px] border-collapse">
              <thead className="sticky top-0 bg-border/50 text-muted font-semibold z-10 backdrop-blur-md">
                <tr>
                  <th className="py-3 px-6 whitespace-nowrap">City Name</th>
                  <th className="py-3 px-6 whitespace-nowrap">BNG Hub</th>
                  <th className="py-3 px-6 text-right whitespace-nowrap">Subscribers</th>
                  <th className="py-3 px-6 text-right whitespace-nowrap">Distance to Hub</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {currentList.sort((a, b) => b.city.totalCount - a.city.totalCount).map(({ city, distance, hub }, idx) => (
                  <tr key={idx} className="hover:bg-border/20 transition-colors">
                    <td className="py-3 px-6 font-bold text-txt">{city.name}</td>
                    <td className="py-3 px-6">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: BNG_CITY_COLORS[hub] ?? '#94a3b8' }}></span>
                        <span style={{ color: BNG_CITY_COLORS[hub] ?? '#94a3b8', fontWeight: 600 }}>{hub}</span>
                      </div>
                    </td>
                    <td className="py-3 px-6 text-right font-mono text-txt">{city.totalCount.toLocaleString()}</td>
                    <td className="py-3 px-6 text-right font-mono text-muted">{Math.round(distance)} km</td>
                  </tr>
                ))}
                {currentList.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-muted">
                      No cities found for this view.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Fly-to helper ── */
function FlyTo({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useMemo(() => { map.flyTo([lat, lng], 8, { duration: 1 }); }, [lat, lng, map]);
  return null;
}

const DEFAULT_CIRCLES = new Set(['Maharashtra', 'Uttar Pradesh West', 'Uttar Pradesh East', 'Tamil Nadu']);

/* ── Main component ── */
export default function AirtelNetworkMap({ mode = 'network' }: { mode?: 'network' | 'complaints' | 'ideal' }) {
  const DEFAULT_BNGS = new Set(CIRCLE_NAMES.filter(c => DEFAULT_CIRCLES.has(c)).flatMap(c => data[c].cities.map(city => city.bngCity!)));
  const [activeBngs, setActiveBngs] = useState<Set<string>>(new Set(DEFAULT_BNGS));
  const [selected, setSelected] = useState<{ city: CityData; circleName: string } | null>(null);
  const [selectedBng, setSelectedBng] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(true);

  function handleSelectCity(city: CityData, circleName: string) {
    setSelected({ city, circleName });
    setSelectedBng(null);
  }

  function handleSelectBng(bngName: string) {
    setSelectedBng(bngName);
    setSelected(null);
  }

  function toggleBng(name: string) {
    setActiveBngs(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  /* Uniform gray state fills — circle identity no longer drives state color */
  const stateStyle = useCallback(() => ({
    fillColor: '#1e293b',
    fillOpacity: 0.35,
    color: '#334155',
    weight: 0.6,
    opacity: 0.7,
  }), []);

  /* Lines: one per (OLT city → BNG city), colored by BNG city */
  const lines = useMemo(() =>
    CIRCLE_NAMES.flatMap(circleName => {
      return data[circleName].cities
        .filter(c => activeBngs.has(c.bngCity!))
        .filter(c => c.bngCityLat != null && c.bngCityLng != null && c.distanceKm > 0)
        .filter(c => mode === 'complaints' ? (c.complaints && c.complaints > 0) : true)
        .map(city => {
          const key = `${circleName}-${city.name}-${city.bngCity}`;
          const shorter = SHORTER_BNG_MAP.get(key) ?? null;

          let targetLat = city.bngCityLat!;
          let targetLng = city.bngCityLng!;
          let targetBngColor = BNG_CITY_COLORS[city.bngCity!] ?? '#94a3b8';

          if (mode === 'ideal' && shorter) {
            const idealPos = ALL_BNG_POSITIONS.get(shorter.name);
            if (idealPos) {
              targetLat = idealPos.lat;
              targetLng = idealPos.lng;
              targetBngColor = BNG_CITY_COLORS[shorter.name] ?? '#94a3b8';
            }
          }

          let color = targetBngColor;
          if (mode === 'complaints') color = '#f87171';
          else if (mode === 'ideal' && shorter) color = '#f59e0b'; // highlight re-routed lines in amber

          return {
            key,
            city,
            circleName,
            from: [city.lat, city.lng] as [number, number],
            to: [targetLat, targetLng] as [number, number],
            color,
            isSelected: selected?.city === city && selected?.circleName === circleName,
            shorter,
          };
        });
    }),
    [activeBngs, selected, mode]
  );

  /* Unique BNG hub markers */
  const bngMarkers = useMemo(() => {
    const map = new Map<string, { lat: number; lng: number }>();
    for (const circleName of CIRCLE_NAMES) {
      for (const city of data[circleName].cities) {
        if (!activeBngs.has(city.bngCity!)) continue;
        if (city.bngCity && city.bngCityLat != null && city.bngCityLng != null && city.distanceKm > 0
          && !map.has(city.bngCity)) {
          map.set(city.bngCity, { lat: city.bngCityLat, lng: city.bngCityLng });
        }
      }
    }
    return Array.from(map.entries()).map(([name, pos]) => ({
      name, ...pos,
      color: BNG_CITY_COLORS[name] ?? '#ffffff',
    }));
  }, [activeBngs]);

  return (
    <div className="w-full h-full relative">
      <style>{``}</style>
      <MapContainer center={[20.5, 79.0]} zoom={5} style={{ width: '100%', height: '100%' }} zoomControl attributionControl>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; OpenStreetMap contributors &copy; CARTO'
          maxZoom={19} subdomains="abcd"
        />

        {selected && <FlyTo lat={selected.city.lat} lng={selected.city.lng} />}

        {/* State boundary fills — uniform subtle gray, no circle coloring */}
        <GeoJSON data={indiaStates as any} style={stateStyle} />

        {/* Lines: OLT → BNG hub, colored by BNG city, kept dim so dots read first */}
        {lines.map(line => (
          <Polyline
            key={line.key}
            positions={[line.from, line.to]}
            pathOptions={{
              color: line.color,
              weight: line.isSelected ? 2.5 : 0.8,
              opacity: line.isSelected ? 0.9 : 0.18,
            }}
            eventHandlers={{
              mouseover: (e) => e.target.setStyle({ weight: 2.5, opacity: 0.75 }),
              mouseout: (e) => e.target.setStyle({
                weight: line.isSelected ? 2.5 : 0.8,
                opacity: line.isSelected ? 0.9 : 0.18,
              }),
              click: () => handleSelectCity(line.city, line.circleName),
            }}
          >
            <Tooltip direction="top" sticky>
              <span style={{ fontSize: 11 }}>
                <strong>{line.city.name}</strong>{' → '}
                <span style={{ color: BNG_CITY_COLORS[line.city.bngCity!] ?? '#8b949e', fontWeight: 700 }}>
                  {line.city.bngCity}
                </span>
                {line.shorter && (
                  <span style={{ color: '#f59e0b', marginLeft: 4 }}>⚡ shorter hub available</span>
                )}
                <br />
                <span style={{ color: '#8b949e' }}>
                  {line.city.brasCount} BRAS · {line.city.totalCount.toLocaleString()} connections · {line.city.distanceKm} km
                </span>
              </span>
            </Tooltip>
          </Polyline>
        ))}

        {/* OLT city dots — faded BNG hub color, sized by connection volume (log scale) */}
        {CIRCLE_NAMES.map(circleName => {
          const circle = data[circleName];
          return circle.cities.filter(city => activeBngs.has(city.bngCity!))
            .filter(city => mode === 'complaints' ? (city.complaints && city.complaints > 0) : true)
            .map(city => {
              const isSelected = selected?.city === city && selected?.circleName === circleName;
              const key = `${circleName}-${city.name}-${city.bngCity}`;
              const shorter = SHORTER_BNG_MAP.get(key);
              const radius = isSelected ? 10 : (mode === 'complaints' ? complaintRadius(city.complaints || 0) : oltRadius(city.totalCount));
              const bngColor = BNG_CITY_COLORS[city.bngCity!] ?? '#94a3b8';
              let baseColor = bngColor;

              if (mode === 'complaints') baseColor = '#ef4444';
              else if (mode === 'ideal' && shorter) baseColor = BNG_CITY_COLORS[shorter.name] ?? '#f59e0b';

              const hasShorter = !isSelected && !!shorter;
              return (
                <CircleMarker
                  key={`city-${circleName}-${city.name}-${city.bngCity}`}
                  center={[city.lat, city.lng]}
                  radius={radius}
                  pathOptions={{
                    color: isSelected ? '#f1f5f9' : (hasShorter && mode !== 'complaints' && mode !== 'ideal' ? '#ffffff' : baseColor),
                    fillColor: isSelected ? '#ffffff' : baseColor,
                    fillOpacity: isSelected ? 1 : (mode === 'complaints' ? 0.7 : 0.38),
                    weight: isSelected ? 1.5 : (hasShorter && mode !== 'complaints' && mode !== 'ideal' ? 2 : 0.5),
                    opacity: isSelected ? 1 : (hasShorter && mode !== 'complaints' && mode !== 'ideal' ? 0.9 : 0.55),
                  }}
                  eventHandlers={{ click: () => handleSelectCity(city, circleName) }}
                >
                  <Tooltip direction="top" offset={[0, -4]}>
                    <div style={{ padding: '2px 4px', background: '#0d1117', border: '1px solid #30363d', borderRadius: 4, color: '#c9d1d9', fontSize: 11 }}>
                      <div style={{ fontWeight: 600, color: '#fff', fontSize: 12 }}>{city.name}</div>
                      {mode === 'complaints' ? (
                        <div style={{ color: '#f87171', fontWeight: 600 }}>{city.complaints} Complaints</div>
                      ) : (
                        <>
                          <span style={{ color: '#8b949e' }}>→ </span>
                          <span style={{ color: BNG_CITY_COLORS[city.bngCity!] ?? '#8b949e', fontWeight: 700 }}>
                            {city.bngCity}
                          </span>
                          <div>{city.totalCount.toLocaleString()} connections</div>
                        </>
                      )}
                      {shorter && mode !== 'complaints' && (
                        <div style={{ color: '#f59e0b', marginTop: 2 }}>⚡ shorter hub available</div>
                      )}
                    </div>
                  </Tooltip>
                </CircleMarker>
              );
            });
        })}

        {/* BNG hub rings — each hub has its own color; ring stands out against neutral OLT dots */}
        {bngMarkers.map(bng => (
          <CircleMarker
            key={`bng-${bng.name}`}
            center={[bng.lat, bng.lng]}
            radius={11}
            pathOptions={{ color: bng.color, fillColor: '#0f172a', fillOpacity: 0.92, weight: 3 }}
            eventHandlers={{ click: () => handleSelectBng(bng.name) }}
          >
            <Tooltip direction="top" offset={[0, -11]} permanent>
              <span style={{ fontSize: 10, fontWeight: 700, color: bng.color }}>{bng.name}</span>
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* BNG toggle sidebar */}
      <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-1 max-h-[calc(100vh-24px)] overflow-y-auto pr-1">
        {/* Select / Deselect all */}
        <div className="flex gap-1 mb-1 flex-shrink-0">
          <button
            onClick={() => setActiveBngs(new Set(ALL_BNG_CITY_NAMES))}
            className="flex-1 px-2 py-1 rounded text-[10px] font-semibold border border-slate-600 bg-slate-800/90 text-slate-300 hover:bg-slate-700/90 hover:text-white backdrop-blur-sm transition-colors"
          >
            Select all
          </button>
          <button
            onClick={() => setActiveBngs(new Set())}
            className="flex-1 px-2 py-1 rounded text-[10px] font-semibold border border-slate-600 bg-slate-800/90 text-slate-300 hover:bg-slate-700/90 hover:text-white backdrop-blur-sm transition-colors"
          >
            Deselect all
          </button>
        </div>
        {ALL_BNG_CITY_NAMES.map(bngName => {
          const active = activeBngs.has(bngName);
          const color = BNG_CITY_COLORS[bngName] || '#ffffff';
          const connectedCitiesCount = CIRCLE_NAMES.flatMap(c => data[c].cities).filter(city => city.bngCity === bngName).length;

          return (
            <div
              key={bngName}
              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-[11px] font-semibold border backdrop-blur-sm transition-all flex-shrink-0 whitespace-nowrap"
              style={{
                background: active ? `${color}22` : 'rgba(22,27,34,0.85)',
                borderColor: active ? color : '#30363d',
                color: active ? color : '#8b949e',
              }}
            >
              <button
                onClick={() => handleSelectBng(bngName)}
                className="flex items-center gap-2 flex-1 text-left hover:text-white transition-colors"
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: active ? color : '#30363d' }} />
                {bngName}
                <span style={{ color: '#8b949e', fontWeight: 400 }}>({connectedCitiesCount})</span>
              </button>
              <button
                onClick={() => toggleBng(bngName)}
                className="ml-2 flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity"
                title={active ? "Hide BNG" : "Show BNG"}
              >
                {active ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Stats */}
      <div className="absolute top-3 right-3 z-[1000] bg-panel/90 border border-border rounded-md px-2.5 py-1.5 backdrop-blur-sm text-right">
        <div className="text-[11px] text-muted">
          <span className="font-bold text-txt">
            {CIRCLE_NAMES.flatMap(c => data[c].cities).filter(city => activeBngs.has(city.bngCity!)).length}
          </span> OLT Cities
        </div>
        <div className="text-[11px] text-muted">
          <span className="font-bold text-txt">{bngMarkers.length}</span> BNG Hubs
        </div>
        <div className="text-[11px] text-muted">
          <span className="font-bold text-txt">{activeBngs.size}</span> BNGs active
        </div>
      </div>

      {/* Legend — bottom-right, minimizable */}
      {!selected && !selectedBng && (
        <div className="absolute bottom-6 right-3 z-[1000] bg-panel/90 border border-border rounded-md backdrop-blur-sm">
          {/* Header — always visible */}
          <button
            onClick={() => setLegendOpen(o => !o)}
            className="flex items-center justify-between gap-6 px-3 py-2 w-full text-left hover:bg-white/5 transition-colors rounded-md"
          >
            <span className="text-[10px] text-muted font-semibold uppercase tracking-wide">Legend</span>
            <span className="text-[10px] text-muted leading-none">{legendOpen ? '▼' : '▲'}</span>
          </button>

          {/* Collapsible body */}
          {legendOpen && (
            <div className="flex flex-col gap-2 px-3 pb-2.5 border-t border-border/50">
              {/* OLT dot size scale */}
              <div className="flex flex-col gap-1 pt-2">
                <div className="text-[11px] text-txt font-medium">OLT city — dot size = connections</div>
                <div className="flex items-center gap-3">
                  {[
                    { label: 'Low', r: oltRadius(100) },
                    { label: 'Mid', r: oltRadius(5_000) },
                    { label: 'High', r: oltRadius(MAX_OLT_COUNT) },
                  ].map(({ label, r }) => (
                    <div key={label} className="flex flex-col items-center gap-1">
                      <svg width={20} height={20}>
                        <circle
                          cx={10} cy={10} r={r}
                          fill="#22d3ee" fillOpacity={0.38}
                          stroke="#22d3ee" strokeWidth={0.5} strokeOpacity={0.55}
                        />
                      </svg>
                      <span className="text-[9px] text-muted">{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* BNG hub + line */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-[11px] text-txt">
                  <svg width={14} height={14}>
                    <circle cx={7} cy={7} r={5.5} fill="#0f172a" stroke="#22d3ee" strokeWidth={2} />
                  </svg>
                  BNG hub — ring color = hub identity
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted">
                  <span className="inline-block w-8 h-0.5 rounded" style={{ background: '#22d3ee', opacity: 0.5 }} />
                  Line color = destination BNG hub
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-300">
                  <svg width={14} height={14}>
                    <circle cx={7} cy={7} r={4.5} fill="#22d3ee" fillOpacity={0.38} stroke="#ffffff" strokeWidth={2} strokeOpacity={0.9} />
                  </svg>
                  White ring = closer hub available
                </div>
              </div>

              <div className="text-[10px] text-muted pt-0.5 border-t border-border/40">
                Click any city dot to inspect BRAS &amp; MSAN details
              </div>
            </div>
          )}
        </div>
      )}

      {selected && (
        <CityPanel
          city={selected.city}
          circleName={selected.circleName}
          color={data[selected.circleName].color}
          shorterBng={SHORTER_BNG_MAP.get(`${selected.circleName}-${selected.city.name}-${selected.city.bngCity}`) ?? null}
          onClose={() => setSelected(null)}
          onSelectBng={handleSelectBng}
        />
      )}
      {selectedBng && !selected && (
        mode === 'ideal' ? (
          <IdealBngPanel
            bngName={selectedBng}
            data={data}
            onClose={() => setSelectedBng(null)}
          />
        ) : mode === 'complaints' ? (
          <ComplaintBngPanel
            bngName={selectedBng}
            data={data}
            onClose={() => setSelectedBng(null)}
          />
        ) : (
          <BngPanel
            bngName={selectedBng}
            data={data}
            onClose={() => setSelectedBng(null)}
          />
        )
      )}
    </div>
  );
}
