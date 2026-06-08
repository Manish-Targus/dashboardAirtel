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

import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import * as XLSX from 'xlsx';

function exportIdealViewExcel() {
  const wb = XLSX.utils.book_new();

  // ── Summary sheet ──
  const summaryData: Record<string, string | number>[] = [];
  for (const bngName of ALL_BNG_CITY_NAMES) {
    let origCities = 0, idealCities = 0;
    let origDist = 0, idealDist = 0;
    let origSubs = 0, idealSubs = 0;
    for (const [cName, cData] of Object.entries(data as Record<string, CircleData>)) {
      for (const city of cData.cities) {
        const key = `${cName}-${city.name}-${city.bngCity}`;
        const shorter = IDEAL_SHORTER_BNG_MAP.get(key);
        const idealBng = shorter ? shorter.name : city.bngCity;
        if (city.bngCity === bngName) {
          origCities++; origDist += city.distanceKm;
          idealDist += shorter ? shorter.distKm : city.distanceKm;
          origSubs += city.totalCount;
        }
        if (idealBng === bngName) { idealCities++; idealSubs += city.totalCount; }
      }
    }
    summaryData.push({
      'BNG Hub': bngName,
      'Original Cities': origCities,
      'Ideal Cities': idealCities,
      'Original Total Distance (km)': Math.round(origDist),
      'Ideal Total Distance (km)': Math.round(idealDist),
      'Distance Saved (km)': Math.round(origDist - idealDist),
      'Original Subscribers': origSubs,
      'Ideal Subscribers': idealSubs,
    });
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Summary');

  // ── One sheet per BNG hub ──
  for (const bngName of ALL_BNG_CITY_NAMES) {
    // Collect original cities (currently assigned to this hub)
    const origRows: Record<string, string | number>[] = [];
    for (const [cName, cData] of Object.entries(data as Record<string, CircleData>)) {
      for (const city of cData.cities) {
        if (city.bngCity !== bngName) continue;
        origRows.push({
          'OLT City': city.name,
          'Circle': cName,
          'Subscribers': city.totalCount,
          'Distance to Hub (km)': city.distanceKm,
          'BRAS Count': city.brasCount,
        });
      }
    }
    origRows.sort((a, b) => (b['Subscribers'] as number) - (a['Subscribers'] as number));

    // Collect ideal cities (reassigned to this hub in ideal topology)
    const idealRows: Record<string, string | number>[] = [];
    for (const [cName, cData] of Object.entries(data as Record<string, CircleData>)) {
      for (const city of cData.cities) {
        const key = `${cName}-${city.name}-${city.bngCity}`;
        const shorter = IDEAL_SHORTER_BNG_MAP.get(key);
        const idealBng = shorter ? shorter.name : city.bngCity;
        if (idealBng !== bngName) continue;
        const idealDist = shorter ? shorter.distKm : city.distanceKm;
        idealRows.push({
          'OLT City': city.name,
          'Circle': cName,
          'Subscribers': city.totalCount,
          'Distance to Hub (km)': idealDist,
          'Original BNG Hub': city.bngCity ?? '',
          'Original Distance (km)': city.distanceKm,
          'Distance Saved (km)': city.distanceKm - idealDist,
          'Rerouted': shorter ? 'Yes' : 'No',
        });
      }
    }
    idealRows.sort((a, b) => (b['Subscribers'] as number) - (a['Subscribers'] as number));

    // Build worksheet: Original block then Ideal block stacked
    const origHeader = [['=== ORIGINAL NETWORK ===', '', '', '', '']];
    const origCols = [['OLT City', 'Circle', 'Subscribers', 'Distance to Hub (km)', 'BRAS Count']];
    const origDataRows = origRows.map(r => [r['OLT City'], r['Circle'], r['Subscribers'], r['Distance to Hub (km)'], r['BRAS Count']]);

    const gap = [['', '', '', '', '', '', '', '']];
    const idealHeader = [['=== IDEAL TOPOLOGY ===', '', '', '', '', '', '', '']];
    const idealCols = [['OLT City', 'Circle', 'Subscribers', 'Distance to Hub (km)', 'Original BNG Hub', 'Original Distance (km)', 'Distance Saved (km)', 'Rerouted']];
    const idealDataRows = idealRows.map(r => [r['OLT City'], r['Circle'], r['Subscribers'], r['Distance to Hub (km)'], r['Original BNG Hub'], r['Original Distance (km)'], r['Distance Saved (km)'], r['Rerouted']]);

    const aoaData = [
      ...origHeader,
      ...origCols,
      ...origDataRows,
      ...gap,
      ...idealHeader,
      ...idealCols,
      ...idealDataRows,
    ];

    const ws = XLSX.utils.aoa_to_sheet(aoaData);
    // Sheet name max 31 chars
    const sheetName = bngName.length > 31 ? bngName.substring(0, 31) : bngName;
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  XLSX.writeFile(wb, 'BNG_Ideal_View.xlsx');
}

/* ── Circle code mapping from FINAL.xlsx ── */
const CIRCLE_CODE_MAP: Record<string, string> = {
  'Andaman And Nicobar Islands': 'KO',
  'Andhra Pradesh': 'AP',
  'Arunachal Pradesh': 'AS',
  'Assam': 'AS',
  'Bihar': 'BH',
  'Chhattisgarh': 'MP',
  'Dadra And Nagar Haveli': 'GJ',
  'Goa': 'MH',
  'Gujarat': 'GJ',
  'Haryana': 'UN',
  'Himachal Pradesh': 'UN',
  'Jammu And Kashmir': 'JK',
  'Jharkhand': 'BH',
  'Karnataka': 'KK',
  'Kerala': 'TN',
  'Ladakh': 'JK',
  'Madhya Pradesh': 'MP',
  'Maharashtra': 'MH',
  'Manipur': 'AS',
  'Meghalaya': 'AS',
  'Mizoram': 'AS',
  'NCR': 'DL',
  'Nagaland': 'AS',
  'Orissa': 'OD',
  'Pondicherry': 'TN',
  'Punjab': 'UN',
  'Rajasthan': 'RJ',
  'Sikkim': 'AS',
  'Tamil Nadu': 'TN',
  'Telangana': 'AP',
  'Tripura': 'AS',
  'Uttar Pradesh East': 'UE',
  'Uttar Pradesh West': 'UW',
  'Uttarakhand': 'UN',
  'West Bengal': 'KO',
};

const CIRCLES_BY_CODE: Record<string, string[]> = {};
for (const [circleName, code] of Object.entries(CIRCLE_CODE_MAP)) {
  if (!CIRCLES_BY_CODE[code]) CIRCLES_BY_CODE[code] = [];
  CIRCLES_BY_CODE[code].push(circleName);
}
const UNIQUE_CIRCLE_CODES = Object.keys(CIRCLES_BY_CODE).sort();

const CIRCLE_CODE_COLORS: Record<string, string> = {};
UNIQUE_CIRCLE_CODES.forEach((code, i) => {
  const hue = Math.round((i * 137.508) % 360);
  const light = i % 2 === 0 ? 60 : 68;
  CIRCLE_CODE_COLORS[code] = `hsl(${hue}, 82%, ${light}%)`;
});

/* ── BNG hub → its PRIMARY circle code (the code with the most OLT connections) ──
   Using the dominant code (not every code it ever serves) prevents a hub like Okhla
   (which incidentally serves a handful of UPE cities) from being treated as a UPE hub
   when computing the ideal topology. */
const _bngCircleCount = new Map<string, Map<string, number>>();
for (const [circleName, circleData] of Object.entries(data)) {
  const code = CIRCLE_CODE_MAP[circleName] ?? '';
  for (const city of circleData.cities) {
    if (!city.bngCity) continue;
    if (!_bngCircleCount.has(city.bngCity)) _bngCircleCount.set(city.bngCity, new Map());
    const cnt = _bngCircleCount.get(city.bngCity)!;
    cnt.set(code, (cnt.get(code) ?? 0) + 1);
  }
}
const BNG_PRIMARY_CODE = new Map<string, string>();
for (const [bng, counts] of Array.from(_bngCircleCount.entries())) {
  let primary = '', max = 0;
  for (const [code, n] of Array.from(counts.entries())) { if (n > max) { primary = code; max = n; } }
  BNG_PRIMARY_CODE.set(bng, primary);
}

/* ── Ideal-mode: enforce within-circle connections ──
   For each OLT city we find the nearest BNG hub whose PRIMARY circle code matches
   the OLT city's circle code.
   - If the current hub is already in-circle: only reroute when a closer option exists.
   - If the current hub is out-of-circle (e.g. Okhla for a UPE city): force-reroute
     to the nearest in-circle hub regardless of distance. */
const IDEAL_SHORTER_BNG_MAP = new Map<string, { name: string; distKm: number }>();
for (const [circleName, circleData] of Object.entries(data)) {
  const myCode = CIRCLE_CODE_MAP[circleName] ?? '';
  for (const city of circleData.cities) {
    if (city.bngCityLat == null || city.bngCityLng == null || city.distanceKm <= 0) continue;
    const currentHubInCircle = BNG_PRIMARY_CODE.get(city.bngCity!) === myCode;
    let nearest: { name: string; distKm: number } | null = null;
    for (const [bngName, bngPos] of ALL_BNG_ENTRIES) {
      if (bngName === city.bngCity) continue;
      if (BNG_PRIMARY_CODE.get(bngName) !== myCode) continue; // only same-primary-circle hubs
      const d = Math.round(haversineKm(city.lat, city.lng, bngPos.lat, bngPos.lng));
      // Force reroute when out-of-circle; optimise when already in-circle
      if ((!currentHubInCircle || d < city.distanceKm) && (!nearest || d < nearest.distKm)) {
        nearest = { name: bngName, distKm: d };
      }
    }
    if (nearest) IDEAL_SHORTER_BNG_MAP.set(`${circleName}-${city.name}-${city.bngCity}`, nearest);
  }
}

/* ── Ideal BNG panel ── */
function IdealBngPanel({ bngName, data, onClose }: { bngName: string, data: Record<string, CircleData>, onClose: () => void }) {

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
      const shorter = IDEAL_SHORTER_BNG_MAP.get(key);
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

  const originalNames = new Set(originalCitiesList.map(e => e.city.name));
  const idealNames = new Set(idealCitiesList.map(e => e.city.name));

  type MergedEntry = { city: CityData; distance: number; hub: string; status: 'added' | 'removed' | 'same' };
  const mergedList: MergedEntry[] = [];

  for (const entry of originalCitiesList) {
    mergedList.push({ ...entry, status: idealNames.has(entry.city.name) ? 'same' : 'removed' });
  }
  for (const entry of idealCitiesList) {
    if (!originalNames.has(entry.city.name)) {
      mergedList.push({ ...entry, status: 'added' });
    }
  }

  mergedList.sort((a, b) => {
    const order = { removed: 0, same: 1, added: 2 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return b.city.totalCount - a.city.totalCount;
  });

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
          Cities highlighted in green will be added in the ideal topology; cities in red will be removed.
        </div>
      </div>

      <div className="flex flex-col flex-1 overflow-hidden p-6 bg-bg/50">
        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-shrink-0 mb-4">
          <div className="bg-panel rounded-xl border border-border p-4 shadow-sm">
            <h3 className="text-[13px] font-bold text-txt mb-2">Subscribers (Before vs Ideal)</h3>
            <div className="h-[90px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subsData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={70} tick={{ fontSize: 12, fill: '#8b949e' }} />
                  <RechartsTooltip
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    contentStyle={{ backgroundColor: '#0d1117', borderColor: '#30363d', fontSize: '12px', borderRadius: '6px' }}
                  />
                  <Bar dataKey="Subs" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-panel rounded-xl border border-border p-4 shadow-sm">
            <h3 className="text-[13px] font-bold text-txt mb-2">Connected Cities (Before vs Ideal)</h3>
            <div className="h-[90px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={citiesData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={70} tick={{ fontSize: 12, fill: '#8b949e' }} />
                  <RechartsTooltip
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    contentStyle={{ backgroundColor: '#0d1117', borderColor: '#30363d', fontSize: '12px', borderRadius: '6px' }}
                  />
                  <Bar dataKey="Cities" fill="#10b981" radius={[0, 4, 4, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-panel rounded-xl border border-border p-4 shadow-sm">
            <h3 className="text-[13px] font-bold text-txt mb-2">Total Distance (km)</h3>
            <div className="h-[90px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distanceData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={70} tick={{ fontSize: 12, fill: '#8b949e' }} />
                  <RechartsTooltip
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    contentStyle={{ backgroundColor: '#0d1117', borderColor: '#30363d', fontSize: '12px', borderRadius: '6px' }}
                  />
                  <Bar dataKey="Distance" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* List Section */}
        <div className="flex-1 flex flex-col bg-panel rounded-xl border border-border overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-panel/80">
            <h2 className="text-[16px] font-bold text-txt">
              Connected OLT Cities — Ideal View ({mergedList.length})
            </h2>
            <div className="flex items-center gap-4 text-[12px]">
              <span className="flex items-center gap-1.5 text-green-400 font-semibold">
                <span className="text-[15px] font-bold">+</span> Added ({mergedList.filter(e => e.status === 'added').length})
              </span>
              <span className="flex items-center gap-1.5 text-red-400 font-semibold">
                <span className="text-[15px] font-bold">−</span> Removed ({mergedList.filter(e => e.status === 'removed').length})
              </span>
              <span className="flex items-center gap-1.5 text-muted font-semibold">
                Unchanged ({mergedList.filter(e => e.status === 'same').length})
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left text-[13px] border-collapse">
              <thead className="sticky top-0 bg-border/50 text-muted font-semibold z-10 backdrop-blur-md">
                <tr>
                  <th className="py-3 px-4 whitespace-nowrap w-8"></th>
                  <th className="py-3 px-6 whitespace-nowrap">City Name</th>
                  <th className="py-3 px-6 whitespace-nowrap">BNG Hub</th>
                  <th className="py-3 px-6 text-right whitespace-nowrap">Subscribers</th>
                  <th className="py-3 px-6 text-right whitespace-nowrap">Distance to Hub</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {mergedList.map(({ city, distance, hub, status }, idx) => {
                  const isAdded = status === 'added';
                  const isRemoved = status === 'removed';
                  return (
                    <tr
                      key={idx}
                      className={`transition-colors ${isRemoved ? 'bg-red-500/5 hover:bg-red-500/10' : isAdded ? 'bg-green-500/5 hover:bg-green-500/10' : 'hover:bg-border/20'}`}
                    >
                      <td className="py-3 px-4 text-center">
                        {isAdded && <span className="text-green-400 font-bold text-[16px]">+</span>}
                        {isRemoved && <span className="text-red-400 font-bold text-[16px]">−</span>}
                      </td>
                      <td className={`py-3 px-6 font-bold ${isRemoved ? 'text-red-400' : isAdded ? 'text-green-400' : 'text-txt'}`}>{city.name}</td>
                      <td className="py-3 px-6">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: BNG_CITY_COLORS[hub] ?? '#94a3b8' }}></span>
                          <span style={{ color: BNG_CITY_COLORS[hub] ?? '#94a3b8', fontWeight: 600 }}>{hub}</span>
                        </div>
                      </td>
                      <td className={`py-3 px-6 text-right font-mono ${isRemoved ? 'text-red-400/80' : isAdded ? 'text-green-400/80' : 'text-txt'}`}>{city.totalCount.toLocaleString()}</td>
                      <td className="py-3 px-6 text-right font-mono text-muted">{Math.round(distance)} km</td>
                    </tr>
                  );
                })}
                {mergedList.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-muted">
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

/* ── Circle panel ── */
function CirclePanel({ circleCode, onClose, onSelectBng, mode = 'network' }: {
  circleCode: string;
  onClose: () => void;
  onSelectBng: (bng: string) => void;
  mode?: 'network' | 'complaints' | 'ideal';
}) {
  const [activeTab, setActiveTab] = useState<'hubs' | 'msans'>('hubs');
  const [msanSearch, setMsanSearch] = useState('');
  const circleNames = (CIRCLES_BY_CODE[circleCode] ?? []).filter(c => CIRCLE_NAMES.includes(c));
  const color = CIRCLE_CODE_COLORS[circleCode] ?? '#ffffff';

  type HubStat = { name: string; cities: number; subscribers: number; totalDist: number; msans: number };
  type MsanDetail = { msan: string; vlan: string; count: number; bras: string; city: string; hub: string };

  const hubMap = new Map<string, HubStat>();
  const msanList: MsanDetail[] = [];

  for (const circleName of circleNames) {
    for (const city of data[circleName].cities) {
      if (!city.bngCity) continue;

      let bngHub = city.bngCity;
      let distance = city.distanceKm;

      if (mode === 'ideal') {
        const key = `${circleName}-${city.name}-${city.bngCity}`;
        const shorter = IDEAL_SHORTER_BNG_MAP.get(key);
        if (shorter) {
          bngHub = shorter.name;
          distance = shorter.distKm;
        }
      }

      if (!hubMap.has(bngHub)) hubMap.set(bngHub, { name: bngHub, cities: 0, subscribers: 0, totalDist: 0, msans: 0 });
      const h = hubMap.get(bngHub)!;
      h.cities++;
      h.subscribers += city.totalCount;
      h.totalDist += distance;

      for (const b of city.bras) {
        h.msans += b.msans.length;
        for (const m of b.msans) {
          msanList.push({ msan: m.msan, vlan: m.vlan, count: m.count, bras: b.bras, city: city.name, hub: bngHub });
        }
      }
    }
  }

  const hubs = Array.from(hubMap.values()).sort((a, b) => b.subscribers - a.subscribers);
  const totalSubs = hubs.reduce((s, h) => s + h.subscribers, 0);
  const totalCities = hubs.reduce((s, h) => s + h.cities, 0);
  const totalMsans = msanList.length;

  msanList.sort((a, b) => b.count - a.count);

  const filteredMsans = msanSearch.trim()
    ? msanList.filter(m =>
        m.msan.toLowerCase().includes(msanSearch.toLowerCase()) ||
        m.bras.toLowerCase().includes(msanSearch.toLowerCase()) ||
        m.city.toLowerCase().includes(msanSearch.toLowerCase()) ||
        m.hub.toLowerCase().includes(msanSearch.toLowerCase()) ||
        m.vlan.toLowerCase().includes(msanSearch.toLowerCase())
      )
    : msanList;

  const pieData = hubs.slice(0, 9).map(h => ({ name: h.name, value: h.subscribers }));
  if (hubs.length > 9) pieData.push({ name: 'Others', value: hubs.slice(9).reduce((s, h) => s + h.subscribers, 0) });

  return (
    <div className="fixed inset-4 z-[3000] flex flex-col bg-panel border border-border shadow-2xl rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-panel/50 backdrop-blur-md flex-shrink-0">
        <div>
          <div className="text-[22px] font-bold" style={{ color }}>{circleCode} — Circle Analytics</div>
          <div className="text-[13px] text-muted mt-1">
            {circleNames.join(' · ')}
            {mode === 'ideal' && <span className="ml-2 font-semibold text-amber-400">(Ideal View)</span>}
          </div>
        </div>
        <button onClick={onClose} className="text-muted hover:text-txt text-3xl leading-none transition-colors">×</button>
      </div>

      {/* KPI bar */}
      <div className="bg-border/30 px-6 py-3 flex-shrink-0 border-b border-border flex gap-10 items-center">
        <div>
          <div className="text-[28px] font-bold text-txt">{totalSubs.toLocaleString()}</div>
          <div className="text-[12px] text-muted">Total Subscribers</div>
        </div>
        <div>
          <div className="text-[28px] font-bold text-txt">{hubs.length}</div>
          <div className="text-[12px] text-muted">BNG Hubs</div>
        </div>
        <div>
          <div className="text-[28px] font-bold text-txt">{totalCities}</div>
          <div className="text-[12px] text-muted">OLT Cities</div>
        </div>
        <div>
          <div className="text-[28px] font-bold text-txt">{totalMsans.toLocaleString()}</div>
          <div className="text-[12px] text-muted">MSANs</div>
        </div>
        <div>
          <div className="text-[28px] font-bold text-txt">{circleNames.length}</div>
          <div className="text-[12px] text-muted">States / UTs</div>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden gap-4 p-5">
        {/* Left: charts stacked */}
        <div className="flex flex-col gap-4 w-[420px] flex-shrink-0">
          {/* Bar chart — subscribers per hub */}
          <div className="bg-panel rounded-xl border border-border p-4 shadow-sm flex-1 overflow-hidden flex flex-col">
            <h3 className="text-[13px] font-bold text-txt mb-2 flex-shrink-0">Subscribers per Hub</h3>
            <div className="flex-1 overflow-y-auto">
              <div style={{ height: Math.max(180, hubs.length * 26) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hubs} layout="vertical" margin={{ top: 2, right: 55, left: 8, bottom: 2 }}>
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#8b949e' }} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                    <YAxis dataKey="name" type="category" width={82} tick={{ fontSize: 10, fill: '#8b949e' }} />
                    <RechartsTooltip
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                      contentStyle={{ backgroundColor: '#0d1117', borderColor: '#30363d', fontSize: 12, borderRadius: 6 }}
                      formatter={(val: number) => [val.toLocaleString(), 'Subscribers']}
                    />
                    <Bar dataKey="subscribers" radius={[0, 4, 4, 0]} barSize={14}>
                      {hubs.map((h) => (
                        <Cell key={h.name} fill={BNG_CITY_COLORS[h.name] ?? '#3b82f6'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Pie chart — share */}
          <div className="bg-panel rounded-xl border border-border p-4 shadow-sm flex-shrink-0">
            <h3 className="text-[13px] font-bold text-txt mb-2">Subscriber Share (top hubs)</h3>
            <div className="flex gap-3 items-center">
              <div style={{ width: 150, height: 150, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={38} outerRadius={68} paddingAngle={2}>
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.name === 'Others' ? '#374151' : (BNG_CITY_COLORS[entry.name] ?? '#3b82f6')} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: '#0d1117', borderColor: '#30363d', fontSize: 11, borderRadius: 6 }}
                      formatter={(val: number) => [val.toLocaleString(), 'Subscribers']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-1 overflow-y-auto max-h-[140px]">
                {pieData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-1.5 text-[10px] text-muted whitespace-nowrap">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: entry.name === 'Others' ? '#374151' : (BNG_CITY_COLORS[entry.name] ?? '#3b82f6') }} />
                    <span className="truncate max-w-[90px]">{entry.name}</span>
                    <span className="ml-auto font-mono text-txt">{((entry.value / totalSubs) * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right: tabbed panel */}
        <div className="flex-1 flex flex-col bg-panel rounded-xl border border-border overflow-hidden shadow-sm">
          {/* Tab bar */}
          <div className="flex border-b border-border bg-panel/80 flex-shrink-0">
            <button
              className={`px-5 py-3 text-[13px] font-semibold transition-colors border-b-2 ${activeTab === 'hubs' ? 'border-current text-txt' : 'border-transparent text-muted hover:text-txt'}`}
              style={activeTab === 'hubs' ? { borderColor: color } : {}}
              onClick={() => setActiveTab('hubs')}
            >
              Hub Breakdown ({hubs.length})
            </button>
            <button
              className={`px-5 py-3 text-[13px] font-semibold transition-colors border-b-2 ${activeTab === 'msans' ? 'border-current text-txt' : 'border-transparent text-muted hover:text-txt'}`}
              style={activeTab === 'msans' ? { borderColor: color } : {}}
              onClick={() => setActiveTab('msans')}
            >
              MSAN Details ({totalMsans.toLocaleString()})
            </button>
          </div>

          {/* Hub Breakdown tab */}
          {activeTab === 'hubs' && (
            <>
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left text-[13px] border-collapse">
                  <thead className="sticky top-0 bg-border/50 text-muted font-semibold z-10 backdrop-blur-md">
                    <tr>
                      <th className="py-2.5 px-4 whitespace-nowrap">#</th>
                      <th className="py-2.5 px-4 whitespace-nowrap">BNG Hub</th>
                      <th className="py-2.5 px-4 text-right whitespace-nowrap">OLT Cities</th>
                      <th className="py-2.5 px-4 text-right whitespace-nowrap">MSANs</th>
                      <th className="py-2.5 px-4 text-right whitespace-nowrap">Subscribers</th>
                      <th className="py-2.5 px-4 text-right whitespace-nowrap">% Share</th>
                      <th className="py-2.5 px-4 text-right whitespace-nowrap">Avg Distance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {hubs.map((h, idx) => {
                      const share = totalSubs > 0 ? (h.subscribers / totalSubs) * 100 : 0;
                      const avgDist = h.cities > 0 ? Math.round(h.totalDist / h.cities) : 0;
                      return (
                        <tr
                          key={h.name}
                          className="hover:bg-border/20 transition-colors cursor-pointer"
                          onClick={() => { onSelectBng(h.name); onClose(); }}
                        >
                          <td className="py-2.5 px-4 text-muted text-[11px]">{idx + 1}</td>
                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: BNG_CITY_COLORS[h.name] ?? '#94a3b8' }} />
                              <span className="font-bold" style={{ color: BNG_CITY_COLORS[h.name] ?? '#94a3b8' }}>{h.name}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-muted">{h.cities}</td>
                          <td className="py-2.5 px-4 text-right font-mono text-muted">{h.msans.toLocaleString()}</td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-txt">{h.subscribers.toLocaleString()}</td>
                          <td className="py-2.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 rounded-full bg-border overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${share}%`, background: BNG_CITY_COLORS[h.name] ?? '#3b82f6' }} />
                              </div>
                              <span className="font-mono text-muted text-[11px] w-10 text-right">{share.toFixed(1)}%</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-muted">{avgDist} km</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-2 border-t border-border text-[10px] text-muted flex-shrink-0">
                Click a hub row to open its detail panel
              </div>
            </>
          )}

          {/* MSAN Details tab */}
          {activeTab === 'msans' && (
            <>
              <div className="px-4 py-2.5 border-b border-border flex-shrink-0">
                <input
                  type="text"
                  placeholder="Search MSAN, BRAS, city, hub, VLAN…"
                  value={msanSearch}
                  onChange={e => setMsanSearch(e.target.value)}
                  className="w-full bg-card border border-border rounded-md px-3 py-1.5 text-[12px] text-txt placeholder:text-muted outline-none focus:border-slate-500"
                />
              </div>
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left text-[12px] border-collapse">
                  <thead className="sticky top-0 bg-border/50 text-muted font-semibold z-10 backdrop-blur-md">
                    <tr>
                      <th className="py-2.5 px-4 whitespace-nowrap">#</th>
                      <th className="py-2.5 px-4 whitespace-nowrap">MSAN</th>
                      <th className="py-2.5 px-4 whitespace-nowrap">VLAN</th>
                      <th className="py-2.5 px-4 whitespace-nowrap">BRAS</th>
                      <th className="py-2.5 px-4 whitespace-nowrap">City</th>
                      <th className="py-2.5 px-4 whitespace-nowrap">BNG Hub</th>
                      <th className="py-2.5 px-4 text-right whitespace-nowrap">Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {filteredMsans.map((m, idx) => (
                      <tr key={idx} className="hover:bg-border/20 transition-colors">
                        <td className="py-2 px-4 text-muted text-[11px]">{idx + 1}</td>
                        <td className="py-2 px-4 font-mono font-semibold text-txt">{m.msan}</td>
                        <td className="py-2 px-4 font-mono text-muted">{m.vlan}</td>
                        <td className="py-2 px-4 text-muted text-[11px]">{m.bras || '—'}</td>
                        <td className="py-2 px-4 text-txt text-[11px]">{m.city}</td>
                        <td className="py-2 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: BNG_CITY_COLORS[m.hub] ?? '#94a3b8' }} />
                            <span className="text-[11px] font-semibold" style={{ color: BNG_CITY_COLORS[m.hub] ?? '#94a3b8' }}>{m.hub}</span>
                          </div>
                        </td>
                        <td className="py-2 px-4 text-right font-mono text-txt">{m.count.toLocaleString()}</td>
                      </tr>
                    ))}
                    {filteredMsans.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-muted text-[12px]">No MSANs match your search.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-2 border-t border-border text-[10px] text-muted flex-shrink-0 flex justify-between">
                <span>Showing {filteredMsans.length} of {totalMsans} MSANs</span>
                {mode === 'ideal' && <span className="text-amber-400">BNG Hub reflects ideal topology</span>}
              </div>
            </>
          )}
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

/* ── Main component ── */
export default function AirtelNetworkMap({ mode = 'network' }: { mode?: 'network' | 'complaints' | 'ideal' }) {
  const [activeCircleCodes, setActiveCircleCodes] = useState<Set<string>>(new Set(['MH', 'UW', 'UE', 'TN']));
  const [selected, setSelected] = useState<{ city: CityData; circleName: string } | null>(null);
  const [selectedBng, setSelectedBng] = useState<string | null>(null);
  const [selectedCircleCode, setSelectedCircleCode] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(true);

  function handleSelectCity(city: CityData, circleName: string) {
    setSelected({ city, circleName });
    setSelectedBng(null);
    setSelectedCircleCode(null);
  }

  function handleSelectBng(bngName: string) {
    setSelectedBng(bngName);
    setSelected(null);
    setSelectedCircleCode(null);
  }

  function handleSelectCircleCode(code: string) {
    setSelectedCircleCode(code);
    setSelected(null);
    setSelectedBng(null);
  }

  function toggleCircleCode(code: string) {
    setActiveCircleCodes(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
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
      if (!activeCircleCodes.has(CIRCLE_CODE_MAP[circleName] ?? '')) return [];
      return data[circleName].cities
        .filter(c => c.bngCityLat != null && c.bngCityLng != null && c.distanceKm > 0)
        .filter(c => mode === 'complaints' ? (c.complaints && c.complaints > 0) : true)
        .map(city => {
          const key = `${circleName}-${city.name}-${city.bngCity}`;
          const shorter = (mode === 'ideal' ? IDEAL_SHORTER_BNG_MAP : SHORTER_BNG_MAP).get(key) ?? null;

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
    [activeCircleCodes, selected, mode]
  );

  /* Unique BNG hub markers */
  const bngMarkers = useMemo(() => {
    const map = new Map<string, { lat: number; lng: number }>();

    if (mode === 'ideal') {
      // In ideal mode derive hub markers from the already-rerouted lines so that
      // out-of-circle hubs (e.g. Okhla for UPE) are not shown when every city
      // that connected to them has been remapped to a within-circle hub.
      for (const line of lines) {
        const idealName = line.shorter ? line.shorter.name : line.city.bngCity!;
        if (!idealName || map.has(idealName)) continue;
        const pos = ALL_BNG_POSITIONS.get(idealName);
        if (pos) map.set(idealName, pos);
      }
    } else {
      for (const circleName of CIRCLE_NAMES) {
        if (!activeCircleCodes.has(CIRCLE_CODE_MAP[circleName] ?? '')) continue;
        for (const city of data[circleName].cities) {
          if (city.bngCity && city.bngCityLat != null && city.bngCityLng != null && city.distanceKm > 0
            && !map.has(city.bngCity)) {
            map.set(city.bngCity, { lat: city.bngCityLat, lng: city.bngCityLng });
          }
        }
      }
    }

    return Array.from(map.entries()).map(([name, pos]) => ({
      name, ...pos,
      color: BNG_CITY_COLORS[name] ?? '#ffffff',
    }));
  }, [activeCircleCodes, mode, lines]);

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
        {CIRCLE_NAMES.filter(circleName => activeCircleCodes.has(CIRCLE_CODE_MAP[circleName] ?? '')).map(circleName => {
          const circle = data[circleName];
          return circle.cities
            .filter(city => mode === 'complaints' ? (city.complaints && city.complaints > 0) : true)
            .map(city => {
              const isSelected = selected?.city === city && selected?.circleName === circleName;
              const key = `${circleName}-${city.name}-${city.bngCity}`;
              const shorter = (mode === 'ideal' ? IDEAL_SHORTER_BNG_MAP : SHORTER_BNG_MAP).get(key);
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

      {/* Circle code selection sidebar */}
      <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-1 max-h-[calc(100vh-24px)] overflow-y-auto pr-1">
        {/* Select / Deselect all */}
        <div className="flex gap-1 mb-1 flex-shrink-0">
          <button
            onClick={() => setActiveCircleCodes(new Set(UNIQUE_CIRCLE_CODES))}
            className="flex-1 px-2 py-1 rounded text-[10px] font-semibold border border-slate-600 bg-slate-800/90 text-slate-300 hover:bg-slate-700/90 hover:text-white backdrop-blur-sm transition-colors"
          >
            Select all
          </button>
          <button
            onClick={() => setActiveCircleCodes(new Set())}
            className="flex-1 px-2 py-1 rounded text-[10px] font-semibold border border-slate-600 bg-slate-800/90 text-slate-300 hover:bg-slate-700/90 hover:text-white backdrop-blur-sm transition-colors"
          >
            Deselect all
          </button>
        </div>
        {UNIQUE_CIRCLE_CODES.map(code => {
          const active = activeCircleCodes.has(code);
          const color = CIRCLE_CODE_COLORS[code] || '#ffffff';
          const circleNames = CIRCLES_BY_CODE[code] || [];
          const cityCount = circleNames
            .filter(c => CIRCLE_NAMES.includes(c))
            .reduce((sum, c) => sum + data[c].cities.length, 0);
          const isSelected = selectedCircleCode === code;

          return (
            <div
              key={code}
              className="flex items-center gap-1.5 rounded-md text-[11px] font-semibold border backdrop-blur-sm transition-all flex-shrink-0 whitespace-nowrap overflow-hidden"
              style={{
                background: isSelected ? `${color}33` : active ? `${color}18` : 'rgba(22,27,34,0.85)',
                borderColor: isSelected ? color : active ? `${color}88` : '#30363d',
              }}
            >
              {/* Toggle dot — clicking only toggles map visibility */}
              <button
                onClick={() => toggleCircleCode(code)}
                className="px-1.5 py-1.5 flex items-center flex-shrink-0 hover:opacity-70 transition-opacity"
                title="Toggle on map"
              >
                <span className="w-2 h-2 rounded-full" style={{ background: active ? color : '#30363d' }} />
              </button>

              {/* Label — clicking opens the CirclePanel */}
              <button
                onClick={() => handleSelectCircleCode(code)}
                className="flex items-center gap-1.5 py-1.5 pr-2.5 flex-1 text-left hover:opacity-80 transition-opacity"
              >
                <span className="font-bold tracking-wide" style={{ color: active ? color : '#8b949e' }}>{code}</span>
                <span style={{ color: '#8b949e', fontWeight: 400, fontSize: 10 }}>
                  {circleNames.filter(c => CIRCLE_NAMES.includes(c)).join(', ').substring(0, 18) || code}
                </span>
                <span style={{ color: '#8b949e', fontWeight: 400 }}>({cityCount})</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Stats */}
      <div className="absolute top-3 right-3 z-[1000] bg-panel/90 border border-border rounded-md px-2.5 py-1.5 backdrop-blur-sm text-right">
        <div className="text-[11px] text-muted">
          <span className="font-bold text-txt">
            {CIRCLE_NAMES.filter(c => activeCircleCodes.has(CIRCLE_CODE_MAP[c] ?? '')).flatMap(c => data[c].cities).length}
          </span> OLT Cities
        </div>
        <div className="text-[11px] text-muted">
          <span className="font-bold text-txt">{bngMarkers.length}</span> BNG Hubs
        </div>
        <div className="text-[11px] text-muted">
          <span className="font-bold text-txt">{activeCircleCodes.size}</span> Circles active
        </div>
      </div>

      {/* Export Excel — only shown in ideal mode */}
      {mode === 'ideal' && (
        <button
          onClick={exportIdealViewExcel}
          className="absolute top-[106px] right-3 z-[1000] flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-600/30 hover:border-emerald-400 backdrop-blur-sm transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export Excel
        </button>
      )}

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
      {selectedCircleCode && !selected && !selectedBng && (
        <CirclePanel
          circleCode={selectedCircleCode}
          mode={mode}
          onClose={() => setSelectedCircleCode(null)}
          onSelectBng={handleSelectBng}
        />
      )}
    </div>
  );
}
