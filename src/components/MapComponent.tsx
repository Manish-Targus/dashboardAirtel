'use client';
import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useDashboard } from '@/context/DashboardContext';
import { formatNumber, statusColor, bandwidthColor, signalToLabel, clamp } from '@/lib/utils';
import type { FlatTower } from '@/lib/types';

function MapFlyTo({ center }: { center: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.flyTo(center, 7, { duration: 1.2, easeLinearity: 0.3 });
    } else {
      map.flyTo([22.5, 82.5], 5, { duration: 1.2 });
    }
  }, [center, map]);
  return null;
}

function TowerPopup({ t }: { t: FlatTower }) {
  const sc = statusColor(t.status);
  const bc = bandwidthColor(t.bandwidth);
  return (
    <div style={{ padding: '12px 14px', minWidth: 220, fontFamily: 'inherit' }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: '#e6edf3', marginBottom: 10 }}>{t.name}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 11 }}>
        {[
          ['Tower ID', t.id],
          ['Location', `${t.districtName}, ${t.stateName}`],
        ].map(([k, v]) => (
          <><span style={{ color: '#8b949e' }}>{k}</span><span style={{ color: '#e6edf3', fontFamily: 'monospace', fontSize: 10 }}>{v}</span></>
        ))}
        <span style={{ color: '#8b949e' }}>Status</span>
        <span style={{ color: sc, fontWeight: 600, textTransform: 'capitalize' }}>{t.status}</span>
        <span style={{ color: '#8b949e' }}>Bandwidth</span>
        <span style={{ color: bc, fontWeight: 600 }}>{t.bandwidth}</span>
        {[
          ['Subscribers', formatNumber(t.subscribers)],
          ['Active Conn.', formatNumber(t.activeConnections)],
          ['Signal', `${t.signalStrength} dBm (${signalToLabel(t.signalStrength)})`],
          ['Uptime', `${t.uptime}%`],
          ['Handoff Rate', `${t.handoffRate}%`],
          ['Data Usage', `${formatNumber(t.dataUsageGB)} GB`],
        ].map(([k, v]) => (
          <><span style={{ color: '#8b949e' }}>{k}</span><span style={{ color: '#e6edf3' }}>{v}</span></>
        ))}
      </div>
    </div>
  );
}

export default function MapComponent() {
  const { data, selectedState, selectedDistrict, mapTowers, setSelectedTower, setActiveTab } = useDashboard();

  const stateCenter = useMemo<[number, number] | null>(() => {
    if (!selectedState) return null;
    const districts = Object.values(data.states[selectedState].districts);
    return [
      districts.reduce((a, d) => a + d.lat, 0) / districts.length,
      districts.reduce((a, d) => a + d.lng, 0) / districts.length,
    ];
  }, [selectedState, data]);

  const districts = useMemo(() => {
    const result: Array<{ key: string; lat: number; lng: number; name: string; state: string; subscribers: number; towers: number }> = [];
    for (const [sName, state] of Object.entries(data.states)) {
      if (selectedState && sName !== selectedState) continue;
      for (const [dName, dist] of Object.entries(state.districts)) {
        if (selectedDistrict && dName !== selectedDistrict) continue;
        result.push({
          key: `${sName}|${dName}`,
          lat: dist.lat,
          lng: dist.lng,
          name: dName,
          state: sName,
          subscribers: dist.subscribers,
          towers: dist.towers.length,
        });
      }
    }
    return result;
  }, [data, selectedState, selectedDistrict]);

  return (
    <MapContainer
      center={[22.5, 82.5]}
      zoom={5}
      style={{ width: '100%', height: '100%' }}
      zoomControl
      attributionControl
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        maxZoom={19}
        subdomains="abcd"
      />

      <MapFlyTo center={stateCenter} />

      {/* District halos */}
      {districts.map(d => (
        <CircleMarker
          key={d.key}
          center={[d.lat, d.lng]}
          radius={clamp(12 + d.subscribers / 600_000, 14, 40)}
          pathOptions={{ color: '#1f6feb', fillColor: '#1f6feb', fillOpacity: 0.06, weight: 1, opacity: 0.3 }}
        >
          <Tooltip direction="top" sticky>
            <span style={{ fontWeight: 600 }}>{d.name}</span><br />
            <span style={{ color: '#8b949e' }}>{formatNumber(d.subscribers)} subs · {d.towers} towers</span>
          </Tooltip>
        </CircleMarker>
      ))}

      {/* Tower markers */}
      {mapTowers.map(t => {
        const radius = clamp(5 + t.activeConnections / 4_000, 5, 14);
        const fill = t.status === 'active' ? bandwidthColor(t.bandwidth) : statusColor(t.status);
        const stroke = statusColor(t.status);
        return (
          <CircleMarker
            key={t.id}
            center={[t.lat, t.lng]}
            radius={radius}
            pathOptions={{ color: stroke, fillColor: fill, fillOpacity: 0.88, weight: 2 }}
            eventHandlers={{
              click: () => { setSelectedTower(t); setActiveTab('towers'); },
            }}
          >
            <Popup>
              <TowerPopup t={t} />
            </Popup>
            <Tooltip direction="top" offset={[0, -6]}>
              <span style={{ fontWeight: 600 }}>{t.name}</span>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
