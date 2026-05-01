'use client';
import { useState, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, GeoJSON, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import airtelData from '@/data/airtelNetworkData.json';
import indiaStates from '@/data/india_states_simple.json';

type MsanRecord = { msan: string; vlan: string; count: number };
type BrasEntry  = { bras: string; msans: MsanRecord[] };
type CityData   = {
  name: string; lat: number; lng: number;
  distanceKm: number; totalCount: number; brasCount: number;
  bngCity?: string; bngCityLat?: number; bngCityLng?: number;
  bras: BrasEntry[];
};
type CircleData = { hub: string; lat: number; lng: number; color: string; cities: CityData[] };

const data = airtelData as Record<string, CircleData>;
const CIRCLE_NAMES = Object.keys(data);

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
  for (const circle of Object.values(airtelData as Record<string, CircleData>)) {
    for (const city of circle.cities) {
      if (city.bngCity && city.bngCityLat != null && city.bngCityLng != null && !map.has(city.bngCity)) {
        map.set(city.bngCity, { lat: city.bngCityLat, lng: city.bngCityLng });
      }
    }
  }
  return map;
})();

/* ── Assign a distinct color to each BNG city (golden-ratio HSL spread) ── */
const ALL_BNG_CITY_NAMES = Array.from(ALL_BNG_POSITIONS.keys()).sort();
const BNG_CITY_COLORS: Record<string, string> = {};
ALL_BNG_CITY_NAMES.forEach((bng, i) => {
  const hue = Math.round((i * 360 / ALL_BNG_CITY_NAMES.length + 10) % 360);
  BNG_CITY_COLORS[bng] = `hsl(${hue}, 88%, 62%)`;
});

/* ── Pre-compute the nearest alternative BNG city for each OLT connection ── */
const ALL_BNG_ENTRIES = Array.from(ALL_BNG_POSITIONS.entries());
// key → { name, distKm } of the closest BNG city that is nearer than the current one
const SHORTER_BNG_MAP = new Map<string, { name: string; distKm: number }>();
for (const [circleName, circleData] of Object.entries(airtelData as Record<string, CircleData>)) {
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

/* ── Circle → GeoJSON state name(s) ── */
const CIRCLE_TO_STATES: Record<string, string[]> = {
  'Andaman And Nicobar Islands': ['Andaman and Nicobar'],
  'Andhra Pradesh':              ['Andhra Pradesh'],
  'Arunachal Pradesh':           ['Arunachal Pradesh'],
  'Assam':                       ['Assam'],
  'Bihar':                       ['Bihar'],
  'Chhattisgarh':                ['Chhattisgarh'],
  'Dadra And Nagar Haveli':      ['Dadra and Nagar Haveli'],
  'Goa':                         ['Goa'],
  'Gujarat':                     ['Gujarat'],
  'Haryana':                     ['Haryana'],
  'Himachal Pradesh':            ['Himachal Pradesh'],
  'Jammu And Kashmir':           ['Jammu and Kashmir'],
  'Ladakh':                      ['Jammu and Kashmir'],   // carved from J&K after GeoJSON date
  'Jharkhand':                   ['Jharkhand'],
  'Karnataka':                   ['Karnataka'],
  'Kerala':                      ['Kerala'],
  'Madhya Pradesh':              ['Madhya Pradesh'],
  'Maharashtra':                 ['Maharashtra'],
  'Manipur':                     ['Manipur'],
  'Meghalaya':                   ['Meghalaya'],
  'Mizoram':                     ['Mizoram'],
  'NCR':                         ['Delhi'],
  'Nagaland':                    ['Nagaland'],
  'Orissa':                      ['Orissa'],
  'Pondicherry':                 ['Puducherry'],
  'Punjab':                      ['Punjab'],
  'Rajasthan':                   ['Rajasthan'],
  'Sikkim':                      ['Sikkim'],
  'Tamil Nadu':                  ['Tamil Nadu'],
  'Telangana':                   ['Andhra Pradesh'],      // carved from AP after GeoJSON date
  'Tripura':                     ['Tripura'],
  'Uttar Pradesh East':          ['Uttar Pradesh'],
  'Uttar Pradesh West':          ['Uttar Pradesh'],
  'Uttarakhand':                 ['Uttaranchal'],
  'West Bengal':                 ['West Bengal'],
};

/* ── Reverse map: GeoJSON state → circle names ── */
const STATE_TO_CIRCLES: Record<string, string[]> = {};
for (const [circle, states] of Object.entries(CIRCLE_TO_STATES)) {
  for (const s of states) {
    (STATE_TO_CIRCLES[s] ??= []).push(circle);
  }
}

/* ── Color helpers ── */
function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}
function blendColors(colors: string[]): string {
  if (!colors.length) return '#6b7280';
  const rgbs = colors.map(hexToRgb);
  const avg = [0, 1, 2].map(i => Math.round(rgbs.reduce((s, c) => s + c[i], 0) / rgbs.length));
  return '#' + avg.map(v => v.toString(16).padStart(2, '0')).join('');
}

/* ── Side panel ── */
function CityPanel({ city, circleName, color, shorterBng, onClose }: {
  city: CityData; circleName: string; color: string;
  shorterBng: { name: string; distKm: number } | null;
  onClose: () => void;
}) {
  const [openBras, setOpenBras] = useState<string | null>(null);
  return (
    <div className="absolute top-0 right-0 h-full z-[2000] flex flex-col bg-panel border-l border-border shadow-2xl" style={{ width: 360 }}>
      <div className="flex items-start justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div>
          <div className="text-[13px] font-bold text-txt">{city.name}</div>
          <div className="text-[11px] text-muted mt-0.5">
            {circleName} · BNG:{' '}
            <span style={{ color: BNG_CITY_COLORS[city.bngCity!] ?? color, fontWeight: 700 }}>{city.bngCity}</span>
          </div>
        </div>
        <button onClick={onClose} className="text-muted hover:text-txt text-lg leading-none mt-0.5">×</button>
      </div>

      {/* Closer hub callout */}
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

      <div className="grid grid-cols-3 gap-px bg-border flex-shrink-0">
        {[
          { label: 'Dist to BNG', value: `${city.distanceKm} km` },
          { label: 'BRAS nodes',  value: city.brasCount },
          { label: 'Total count', value: city.totalCount.toLocaleString() },
        ].map(({ label, value }) => (
          <div key={label} className="bg-panel px-3 py-2 text-center">
            <div className="text-[15px] font-bold text-txt">{value}</div>
            <div className="text-[10px] text-muted mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {city.bras.map(b => {
          const isOpen = openBras === b.bras;
          const brasTotal = b.msans.reduce((s, m) => s + m.count, 0);
          return (
            <div key={b.bras} className="border-b border-border/60">
              <button
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-card/60 transition-colors text-left"
                onClick={() => setOpenBras(isOpen ? null : b.bras)}
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

      <div className="px-4 py-2 border-t border-border flex-shrink-0 text-[10px] text-muted">
        {city.lat.toFixed(4)}, {city.lng.toFixed(4)}
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
export default function AirtelNetworkMap() {
  const [activeCircles, setActiveCircles] = useState<Set<string>>(new Set(CIRCLE_NAMES));
  const [selected, setSelected] = useState<{ city: CityData; circleName: string } | null>(null);

  function toggleCircle(name: string) {
    setActiveCircles(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  /* GeoJSON style: color by circle(s), dim if circle is toggled off */
  const geoJsonKey = useMemo(() => Array.from(activeCircles).sort().join(','), [activeCircles]);

  const stateStyle = useCallback((feature: any) => {
    const stateName: string = feature?.properties?.name ?? '';
    const circles = STATE_TO_CIRCLES[stateName] ?? [];
    const activeOnes = circles.filter(c => activeCircles.has(c));
    const anyActive = activeOnes.length > 0;
    const color = anyActive
      ? blendColors(activeOnes.map(c => data[c].color))
      : '#374151';
    return {
      fillColor: color,
      fillOpacity: anyActive ? 0.18 : 0.04,
      color: anyActive ? color : '#4b5563',
      weight: 1,
      opacity: anyActive ? 0.5 : 0.2,
    };
  }, [activeCircles]);

  /* Lines: one per (OLT city, BNG city) connection — colored by BNG city */
  const lines = useMemo(() =>
    CIRCLE_NAMES.flatMap(circleName => {
      if (!activeCircles.has(circleName)) return [];
      return data[circleName].cities
        .filter(c => c.bngCityLat != null && c.bngCityLng != null && c.distanceKm > 0)
        .map(city => {
          const key = `${circleName}-${city.name}-${city.bngCity}`;
          return {
            key,
            from: [city.lat, city.lng] as [number, number],
            to:   [city.bngCityLat!, city.bngCityLng!] as [number, number],
            color: BNG_CITY_COLORS[city.bngCity!] ?? data[circleName].color,
            isSelected: selected?.city === city && selected?.circleName === circleName,
            isShorterAvailable: SHORTER_BNG_SET.has(key),
          };
        });
    }),
    [activeCircles, selected]
  );

  /* Unique BNG city markers — only when at least one active circle sends real traffic to them */
  const bngMarkers = useMemo(() => {
    const map = new Map<string, { lat: number; lng: number }>();
    for (const circleName of CIRCLE_NAMES) {
      if (!activeCircles.has(circleName)) continue;
      for (const city of data[circleName].cities) {
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
  }, [activeCircles]);

  return (
    <div className="w-full h-full relative">
      <style>{`
        @keyframes cityBlink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.1; }
        }
        // .city-blink { animation: cityBlink 4s ease-in-out infinite; }
      `}</style>
      <MapContainer center={[20.5, 79.0]} zoom={5} style={{ width: '100%', height: '100%' }} zoomControl attributionControl>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; OpenStreetMap contributors &copy; CARTO'
          maxZoom={19} subdomains="abcd"
        />

        {selected && <FlyTo lat={selected.city.lat} lng={selected.city.lng} />}

        {/* State boundary shading */}
        <GeoJSON
          key={geoJsonKey}
          data={indiaStates as any}
          style={stateStyle}
        />

        {/* Lines: OLT city → BNG city, colored by BNG city */}
        {lines.map(line => (
          <Polyline
            key={line.key}
            positions={[line.from, line.to]}
            pathOptions={{
              color: line.color,
              weight: line.isSelected ? 2.5 : 0.9,
              opacity: line.isSelected ? 1 : 0.35,
            }}
          />
        ))}

        {/* OLT city dots — blink slowly when a closer BNG hub exists */}
        {CIRCLE_NAMES.map(circleName => {
          if (!activeCircles.has(circleName)) return null;
          const circle = data[circleName];
          return circle.cities.map(city => {
            const isSelected = selected?.city === city && selected?.circleName === circleName;
            const key = `${circleName}-${city.name}-${city.bngCity}`;
            const shorter = SHORTER_BNG_MAP.get(key);
            return (
              <CircleMarker
                key={`city-${circleName}-${city.name}-${city.bngCity}`}
                center={[city.lat, city.lng]}
                radius={isSelected ? 7 : 3}
                pathOptions={{
                  color: circle.color,
                  fillColor: circle.color,
                  fillOpacity: isSelected ? 1 : 0.8,
                  weight: isSelected ? 2 : 0.5,
                  className: (!isSelected && shorter) ? 'city-blink' : undefined,
                }}
                eventHandlers={{ click: () => setSelected({ city, circleName }) }}
              >
                <Tooltip direction="top" offset={[0, -4]}>
                  <span style={{ fontSize: 11 }}>
                    <strong>{city.name}</strong> →{' '}
                    <span style={{ color: BNG_CITY_COLORS[city.bngCity!] ?? '#8b949e', fontWeight: 700 }}>
                      {city.bngCity}
                    </span>
                    {shorter && (
                      <span style={{ color: '#f59e0b', marginLeft: 4 }}>⚡ shorter hub available</span>
                    )}
                    <br />
                    <span style={{ color: '#8b949e' }}>{city.brasCount} BRAS · {city.totalCount.toLocaleString()} connections · {city.distanceKm} km</span>
                  </span>
                </Tooltip>
              </CircleMarker>
            );
          });
        })}

        {/* BNG city hub markers — ring color matches the BNG city's line color */}
        {bngMarkers.map(bng => (
          <CircleMarker
            key={`bng-${bng.name}`}
            center={[bng.lat, bng.lng]}
            radius={10}
            pathOptions={{ color: bng.color, fillColor: '#0f172a', fillOpacity: 0.92, weight: 2.5 }}
          >
            <Tooltip direction="top" offset={[0, -10]} permanent>
              <span style={{ fontSize: 10, fontWeight: 700, color: bng.color }}>{bng.name}</span>
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* Circle toggle sidebar */}
      <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-1 max-h-[calc(100vh-24px)] overflow-y-auto pr-1">
        {CIRCLE_NAMES.map(circleName => {
          const circle = data[circleName];
          const active = activeCircles.has(circleName);
          return (
            <button
              key={circleName}
              onClick={() => toggleCircle(circleName)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] font-semibold border backdrop-blur-sm transition-all flex-shrink-0 whitespace-nowrap"
              style={{
                background:   active ? `${circle.color}22` : 'rgba(22,27,34,0.85)',
                borderColor:  active ? circle.color : '#30363d',
                color:        active ? circle.color : '#8b949e',
              }}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: active ? circle.color : '#30363d' }} />
              {circleName}
              <span style={{ color: '#8b949e', fontWeight: 400 }}>({circle.cities.length})</span>
            </button>
          );
        })}
      </div>

      {/* Stats */}
      <div className="absolute top-3 right-3 z-[1000] bg-panel/90 border border-border rounded-md px-2.5 py-1.5 backdrop-blur-sm text-right">
        <div className="text-[11px] text-muted">
          <span className="font-bold text-txt">
            {CIRCLE_NAMES.filter(c => activeCircles.has(c)).reduce((s, c) => s + data[c].cities.length, 0)}
          </span> OLT Cities
        </div>
        <div className="text-[11px] text-muted">
          <span className="font-bold text-txt">{bngMarkers.length}</span> BNG Hubs
        </div>
        <div className="text-[11px] text-muted">
          <span className="font-bold text-txt">{CIRCLE_NAMES.filter(c => activeCircles.has(c)).length}</span> Circles active
        </div>
      </div>

      {!selected && (
        <div className="absolute bottom-6 left-3 z-[1000] bg-panel/90 border border-border rounded-md px-3 py-2 backdrop-blur-sm flex flex-col gap-1.5">
          <div className="text-[11px] text-muted">Click any city dot to see BRAS &amp; MSAN details</div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="city-blink inline-block w-2.5 h-2.5 rounded-full bg-amber-400 flex-shrink-0" />
            <span className="text-amber-400">Slowly blinking = closer BNG hub exists</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <span className="inline-block w-8 h-0.5 rounded bg-gray-400 opacity-40" />
            Line color = BNG hub color
          </div>
        </div>
      )}

      {selected && (
        <CityPanel
          city={selected.city}
          circleName={selected.circleName}
          color={data[selected.circleName].color}
          shorterBng={SHORTER_BNG_MAP.get(`${selected.circleName}-${selected.city.name}-${selected.city.bngCity}`) ?? null}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
