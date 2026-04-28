'use client';
import { useState, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import airtelData from '@/data/airtelNetworkData.json';

type MsanRecord = { msan: string; vlan: string; count: number };
type BrasEntry  = { bras: string; msans: MsanRecord[] };
type CityData   = {
  name: string; lat: number; lng: number;
  distanceKm: number; totalCount: number; brasCount: number;
  bras: BrasEntry[];
};
type CircleData = { hub: string; lat: number; lng: number; color: string; cities: CityData[] };

const data = airtelData as Record<string, CircleData>;
const CIRCLE_NAMES = Object.keys(data);

/* ── side panel ── */
function CityPanel({ city, circleName, onClose }: { city: CityData; circleName: string; onClose: () => void }) {
  const [openBras, setOpenBras] = useState<string | null>(null);
  const circle = data[circleName];

  return (
    <div
      className="absolute top-0 right-0 h-full z-[2000] flex flex-col bg-panel border-l border-border shadow-2xl"
      style={{ width: 360 }}
    >
      {/* header */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div>
          <div className="text-[13px] font-bold text-txt">{city.name}</div>
          <div className="text-[11px] text-muted mt-0.5">
            {circleName} · Hub: <span style={{ color: circle.color }}>{circle.hub}</span>
          </div>
        </div>
        <button onClick={onClose} className="text-muted hover:text-txt text-lg leading-none mt-0.5">×</button>
      </div>

      {/* stats row */}
      <div className="grid grid-cols-3 gap-px bg-border flex-shrink-0">
        {[
          { label: 'Distance', value: `${city.distanceKm} km` },
          { label: 'BRAS nodes', value: city.brasCount },
          { label: 'Total count', value: city.totalCount.toLocaleString() },
        ].map(({ label, value }) => (
          <div key={label} className="bg-panel px-3 py-2 text-center">
            <div className="text-[15px] font-bold text-txt">{value}</div>
            <div className="text-[10px] text-muted mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* BRAS list */}
      <div className="flex-1 overflow-y-auto">
        {city.bras.map((b) => {
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
                  <div className="text-[10px] text-muted mt-0.5">
                    {b.msans.length} MSANs · {brasTotal.toLocaleString()} connections
                  </div>
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

      {/* coords footer */}
      <div className="px-4 py-2 border-t border-border flex-shrink-0 text-[10px] text-muted">
        {city.lat.toFixed(4)}, {city.lng.toFixed(4)}
      </div>
    </div>
  );
}

/* ── fly-to helper ── */
function FlyTo({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useMemo(() => { map.flyTo([lat, lng], 8, { duration: 1 }); }, [lat, lng, map]);
  return null;
}

/* ── main component ── */
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

  const lines = useMemo(() =>
    CIRCLE_NAMES.flatMap(circleName => {
      if (!activeCircles.has(circleName)) return [];
      const circle = data[circleName];
      return circle.cities.map(city => ({
        key: `${circleName}-${city.name}`,
        positions: [[city.lat, city.lng], [circle.lat, circle.lng]] as [[number,number],[number,number]],
        color: circle.color,
        isSelected: selected?.city.name === city.name && selected?.circleName === circleName,
      }));
    }),
    [activeCircles, selected]
  );

  return (
    <div className="w-full h-full relative">
      <MapContainer
        center={[20.5, 79.0]}
        zoom={5}
        style={{ width: '100%', height: '100%' }}
        zoomControl
        attributionControl
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; OpenStreetMap contributors &copy; CARTO'
          maxZoom={19}
          subdomains="abcd"
        />

        {selected && <FlyTo lat={selected.city.lat} lng={selected.city.lng} />}

        {/* lines */}
        {lines.map(line => (
          <Polyline
            key={line.key}
            positions={line.positions}
            pathOptions={{
              color: line.color,
              weight: line.isSelected ? 2.5 : 0.8,
              opacity: line.isSelected ? 1 : 0.22,
              dashArray: line.isSelected ? undefined : undefined,
            }}
          />
        ))}

        {/* OLT city dots */}
        {CIRCLE_NAMES.map(circleName => {
          if (!activeCircles.has(circleName)) return null;
          const circle = data[circleName];
          return circle.cities.map(city => {
            const isSelected = selected?.city.name === city.name && selected?.circleName === circleName;
            return (
              <CircleMarker
                key={`city-${circleName}-${city.name}`}
                center={[city.lat, city.lng]}
                radius={isSelected ? 7 : 4}
                pathOptions={{
                  color: circle.color,
                  fillColor: circle.color,
                  fillOpacity: isSelected ? 1 : 0.8,
                  weight: isSelected ? 2 : 1,
                }}
                eventHandlers={{
                  click: () => setSelected({ city, circleName }),
                }}
              >
                <Tooltip direction="top" offset={[0, -4]}>
                  <span style={{ fontSize: 11 }}>
                    <strong>{city.name}</strong> · {city.distanceKm} km from {circle.hub}
                    <br />
                    <span style={{ color: '#8b949e' }}>{city.brasCount} BRAS · {city.totalCount.toLocaleString()} connections</span>
                  </span>
                </Tooltip>
              </CircleMarker>
            );
          });
        })}

        {/* hub rings */}
        {CIRCLE_NAMES.map(circleName => {
          if (!activeCircles.has(circleName)) return null;
          const circle = data[circleName];
          const totalCount = circle.cities.reduce((s, c) => s + c.totalCount, 0);
          return (
            <CircleMarker
              key={`hub-${circleName}`}
              center={[circle.lat, circle.lng]}
              radius={18}
              pathOptions={{
                color: circle.color,
                fillColor: circle.color,
                fillOpacity: 0.18,
                weight: 2.5,
              }}
            >
              <Tooltip direction="top" offset={[0, -16]} permanent>
                <span style={{ fontSize: 10, fontWeight: 700 }}>{circle.hub}</span>
              </Tooltip>
              <Tooltip direction="bottom" offset={[0, 16]}>
                <span style={{ fontSize: 11 }}>
                  <strong>{circleName}</strong><br />
                  <span style={{ color: '#8b949e' }}>{circle.cities.length} OLT cities · {totalCount.toLocaleString()} total</span>
                </span>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* circle toggles */}
      <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-1.5">
        {CIRCLE_NAMES.map(circleName => {
          const circle = data[circleName];
          const active = activeCircles.has(circleName);
          return (
            <button
              key={circleName}
              onClick={() => toggleCircle(circleName)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] font-semibold border backdrop-blur-sm transition-all"
              style={{
                background: active ? `${circle.color}22` : 'rgba(22,27,34,0.85)',
                borderColor: active ? circle.color : '#30363d',
                color: active ? circle.color : '#8b949e',
              }}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: active ? circle.color : '#30363d' }} />
              {circleName}
              <span style={{ color: '#8b949e', fontWeight: 400 }}>({circle.cities.length})</span>
            </button>
          );
        })}
      </div>

      {/* stats */}
      <div className="absolute top-3 right-3 z-[1000] bg-panel/90 border border-border rounded-md px-2.5 py-1.5 backdrop-blur-sm text-right">
        <div className="text-[11px] text-muted">
          <span className="font-bold text-txt">
            {CIRCLE_NAMES.filter(c => activeCircles.has(c)).reduce((s, c) => s + data[c].cities.length, 0)}
          </span> OLT Cities
        </div>
        <div className="text-[11px] text-muted">
          <span className="font-bold text-txt">{CIRCLE_NAMES.filter(c => activeCircles.has(c)).length}</span> Circles
        </div>
      </div>

      {/* hint */}
      {!selected && (
        <div className="absolute bottom-6 left-3 z-[1000] bg-panel/90 border border-border rounded-md px-3 py-2 backdrop-blur-sm">
          <div className="text-[11px] text-muted">Click any city dot to see BRAS & MSAN details</div>
        </div>
      )}

      {/* side panel */}
      {selected && (
        <CityPanel
          city={selected.city}
          circleName={selected.circleName}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
