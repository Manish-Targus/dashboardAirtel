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
function CityPanel({ city, circleName, color, onClose }: {
  city: CityData; circleName: string; color: string; onClose: () => void;
}) {
  const [openBras, setOpenBras] = useState<string | null>(null);
  return (
    <div className="absolute top-0 right-0 h-full z-[2000] flex flex-col bg-panel border-l border-border shadow-2xl" style={{ width: 360 }}>
      <div className="flex items-start justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div>
          <div className="text-[13px] font-bold text-txt">{city.name}</div>
          <div className="text-[11px] text-muted mt-0.5">
            {circleName} · BNG: <span style={{ color }}>{city.bngCity}</span>
          </div>
        </div>
        <button onClick={onClose} className="text-muted hover:text-txt text-lg leading-none mt-0.5">×</button>
      </div>

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

  /* Lines: one per (OLT city, BNG city) connection — skip zero-distance fallbacks */
  const lines = useMemo(() =>
    CIRCLE_NAMES.flatMap(circleName => {
      if (!activeCircles.has(circleName)) return [];
      return data[circleName].cities
        .filter(c => c.bngCityLat != null && c.bngCityLng != null && c.distanceKm > 0)
        .map(city => ({
          key: `${circleName}-${city.name}-${city.bngCity}`,
          from: [city.lat, city.lng] as [number, number],
          to:   [city.bngCityLat!, city.bngCityLng!] as [number, number],
          color: data[circleName].color,
          isSelected: selected?.city === city && selected?.circleName === circleName,
        }));
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
    return Array.from(map.entries()).map(([name, pos]) => ({ name, ...pos }));
  }, [activeCircles]);

  return (
    <div className="w-full h-full relative">
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

        {/* Lines: OLT city → BNG city */}
        {lines.map(line => (
          <Polyline
            key={line.key}
            positions={[line.from, line.to]}
            pathOptions={{
              color: line.color,
              weight: line.isSelected ? 2.5 : 0.7,
              opacity: line.isSelected ? 1 : 0.22,
            }}
          />
        ))}

        {/* OLT city dots — one per (city, BNG city) connection */}
        {CIRCLE_NAMES.map(circleName => {
          if (!activeCircles.has(circleName)) return null;
          const circle = data[circleName];
          return circle.cities.map(city => {
            const isSelected = selected?.city === city && selected?.circleName === circleName;
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
                }}
                eventHandlers={{ click: () => setSelected({ city, circleName }) }}
              >
                <Tooltip direction="top" offset={[0, -4]}>
                  <span style={{ fontSize: 11 }}>
                    <strong>{city.name}</strong> → {city.bngCity}<br />
                    <span style={{ color: '#8b949e' }}>{city.brasCount} BRAS · {city.totalCount.toLocaleString()} connections · {city.distanceKm} km</span>
                  </span>
                </Tooltip>
              </CircleMarker>
            );
          });
        })}

        {/* BNG city hub markers */}
        {bngMarkers.map(bng => (
          <CircleMarker
            key={`bng-${bng.name}`}
            center={[bng.lat, bng.lng]}
            radius={10}
            pathOptions={{ color: '#ffffff', fillColor: '#0f172a', fillOpacity: 0.92, weight: 2 }}
          >
            <Tooltip direction="top" offset={[0, -10]} permanent>
              <span style={{ fontSize: 10, fontWeight: 700 }}>{bng.name}</span>
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
        <div className="absolute bottom-6 left-3 z-[1000] bg-panel/90 border border-border rounded-md px-3 py-2 backdrop-blur-sm">
          <div className="text-[11px] text-muted">Click any city dot to see BRAS & MSAN details</div>
        </div>
      )}

      {selected && (
        <CityPanel
          city={selected.city}
          circleName={selected.circleName}
          color={data[selected.circleName].color}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
