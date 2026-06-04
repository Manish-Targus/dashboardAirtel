'use client';
import { useState, useMemo } from 'react';
import rawCityCoords from '@/data/cityCoords.json';
import rawIdealFlow from '@/data/mobileIdealFlowData.json';
import rawActualFlow from '@/data/mobileNetFlowData.json';

const cityCoords = rawCityCoords as unknown as Record<string, [number, number]>;

type FlowLink = {
  source: string; target: string;
  sourceTier: string; targetTier: string;
  traffic: number; traffic95: number; isRerouted?: boolean;
};
const idealFlowData = rawIdealFlow as Record<string, FlowLink[]>;
const actualFlowData = rawActualFlow as Record<string, FlowLink[]>;

/* ── T1 datacenter nodes ── */
const T1_DCS = [
  { name: 'Manesar',          lat: 28.367, lng: 76.932 },
  { name: 'Noida',            lat: 28.535, lng: 77.391 },
  { name: 'Kolkata',          lat: 22.557, lng: 88.364 },
  { name: 'Mumbai-Spectrum',  lat: 19.100, lng: 72.920 },
  { name: 'Bhopal(GP)',       lat: 23.260, lng: 77.413 },
  { name: 'Hyderabad-Uppal',  lat: 17.406, lng: 78.559 },
  { name: 'Chennai-Siruseri', lat: 12.801, lng: 80.222 },
  { name: 'Kharagpur(NEW)',   lat: 22.346, lng: 87.232 },
];

/* ── Coordinate aliases for non-standard city names ── */
const NAME_ALIASES: Record<string, [number, number]> = {
  'NANDEDT2':              [19.094, 77.483],
  'Pune Epark':            [18.521, 73.855],
  'Pune_vega(Old)':        [18.521, 73.855],
  'Pune(Espace)':          [18.521, 73.855],
  'Gangaganj':             [26.870, 80.920],
  'Ahmedabad(Changodhar)': [23.023, 72.571],
  'Surat(Old)':            [21.209, 72.832],
  'SRINAGAR':              [34.084, 74.797],
  'Trichy(Old)':           [10.807, 78.688],
  'Bhuvaneswar':           [20.296, 85.825],
  'Prodattur':             [14.755, 78.551],
  'Vijaywada':             [16.506, 80.648],
  'Hubli':                 [15.352, 75.138],
  'Cochin':                [9.968,  76.244],
  'Calicut':               [11.259, 75.780],
  'Pollachi':              [10.659, 77.007],
  'TRICHY':                [10.807, 78.688],
  'Asansol':               [23.687, 86.975],
  'Behrampur-WB':          [21.493, 86.633],
  'Kharagpur (OLD)':       [22.346, 87.232],
  'Kharagpur (NEW)':       [22.346, 87.232],
  'Kharagpur(NEW)':        [22.346, 87.232],
  'Kolkata':               [22.557, 88.364],
  'Manesar':               [28.367, 76.932],
  'Noida':                 [28.535, 77.391],
  'Noida81':               [28.527, 77.411],
  'Mumbai-Spectrum':       [19.100, 72.920],
  'Bhopal(GP)':            [23.260, 77.413],
  'HYDERABAD UPPAL':       [17.406, 78.559],
  'Hyderabad-Uppal':       [17.406, 78.559],
  'Chennai Serisuri':      [12.801, 80.222],
  'Chennai-Siruseri':      [12.801, 80.222],
};

function getCoords(name: string): [number, number] | null {
  if (NAME_ALIASES[name]) return NAME_ALIASES[name];
  const upper = name.toUpperCase();
  if (cityCoords[upper]) return cityCoords[upper];
  const normalized = upper.replace(/[^A-Z0-9 ]/g, '').trim();
  if (cityCoords[normalized]) return cityCoords[normalized];
  return null;
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ── Build global T2 hub registry from ideal flow data ── */
type T2Hub = { name: string; lat: number; lng: number };
const allT2Hubs: T2Hub[] = [];
const t2HubMap = new Map<string, T2Hub>();

Object.values(idealFlowData).forEach(links => {
  links.forEach(link => {
    if (link.sourceTier === 'T2' && link.targetTier === 'T1') {
      if (!t2HubMap.has(link.source)) {
        const c = getCoords(link.source);
        if (c) {
          const h: T2Hub = { name: link.source, lat: c[0], lng: c[1] };
          t2HubMap.set(link.source, h);
          allT2Hubs.push(h);
        }
      }
    }
  });
});

const ALL_CIRCLES = Object.keys(idealFlowData);

const TIER_COLORS: Record<string, string> = {
  T3: '#3b82f6',
  T2: '#8b5cf6',
  T1: '#ec4899',
};

/* ── Props ── */
interface Props {
  initialCircle?: string;
  onCircleChange?: (circle: string) => void;
}

export default function IdealFlowView({ initialCircle, onCircleChange }: Props) {
  const [selectedCircle, setSelectedCircle] = useState(initialCircle || ALL_CIRCLES[0] || '');
  const [highlightNode, setHighlightNode] = useState<string | null>(null);

  function changeCircle(c: string) {
    setSelectedCircle(c);
    setHighlightNode(null);
    onCircleChange?.(c);
  }

  /* ── Compute ideal distance-based routing ── */
  const ideal = useMemo(() => {
    const circleLinks = idealFlowData[selectedCircle] || [];
    const actualLinks = actualFlowData[selectedCircle] || [];

    /* T3 cities */
    const t3Map = new Map<string, { name: string; lat: number; lng: number }>();
    circleLinks.forEach(l => {
      if (l.sourceTier === 'T3' && !t3Map.has(l.source)) {
        const c = getCoords(l.source);
        if (c) t3Map.set(l.source, { name: l.source, lat: c[0], lng: c[1] });
      }
    });
    const t3Cities = Array.from(t3Map.values()).sort((a, b) => b.lat - a.lat);

    /* T2 candidates for this circle */
    const circleT2Names = new Set<string>();
    circleLinks.forEach(l => {
      if (l.sourceTier === 'T3') circleT2Names.add(l.target);
      if (l.sourceTier === 'T2' && l.targetTier === 'T1') circleT2Names.add(l.source);
    });
    let candidateT2 = Array.from(circleT2Names)
      .map(n => t2HubMap.get(n)).filter(Boolean) as T2Hub[];
    if (candidateT2.length === 0) candidateT2 = allT2Hubs;

    /* Actual routing maps — primary link = highest traffic per source */
    const actualT3toT2 = new Map<string, string>();         // T3 city → primary T2 target
    const actualT3Traffic = new Map<string, number>();      // T3 city → primary traffic Gbps
    const actualT2toT1 = new Map<string, string>();         // T2 hub → primary T1 target
    const actualT2Traffic = new Map<string, number>();      // T2 hub → total T2→T1 traffic Gbps

    // Group T3→T2 links per source, pick primary (max traffic)
    const t3Groups = new Map<string, FlowLink[]>();
    actualLinks.forEach(l => {
      if (l.sourceTier === 'T3') {
        if (!t3Groups.has(l.source)) t3Groups.set(l.source, []);
        t3Groups.get(l.source)!.push(l);
      }
    });
    t3Groups.forEach((links, src) => {
      const primary = links.reduce((best, l) => l.traffic > best.traffic ? l : best, links[0]);
      actualT3toT2.set(src, primary.target);
      actualT3Traffic.set(src, primary.traffic);
    });

    // Group T2→T1 links per source, sum all traffic to get total throughput on that hub
    const t2Groups = new Map<string, FlowLink[]>();
    actualLinks.forEach(l => {
      if (l.sourceTier === 'T2' && l.targetTier === 'T1') {
        if (!t2Groups.has(l.source)) t2Groups.set(l.source, []);
        t2Groups.get(l.source)!.push(l);
      }
    });
    t2Groups.forEach((links, src) => {
      const primary = links.reduce((best, l) => l.traffic > best.traffic ? l : best, links[0]);
      actualT2toT1.set(src, primary.target);
      actualT2Traffic.set(src, links.reduce((s, l) => s + l.traffic, 0));
    });

    /* Ideal T3 → nearest T2 (haversine) */
    type T3Conn = {
      t3: string; t3Lat: number; t3Lng: number;
      idealT2: string; idealT2Lat: number; idealT2Lng: number;
      distKm: number; currentT2: string | null; optimal: boolean;
      actualTraffic: number;
    };
    const t3Conns: T3Conn[] = t3Cities.map(city => {
      let minD = Infinity, nearest = candidateT2[0];
      candidateT2.forEach(h => {
        const d = haversine(city.lat, city.lng, h.lat, h.lng);
        if (d < minD) { minD = d; nearest = h; }
      });
      const currentT2 = actualT3toT2.get(city.name) ?? null;
      const actualTraffic = actualT3Traffic.get(city.name) ?? 0;
      return {
        t3: city.name, t3Lat: city.lat, t3Lng: city.lng,
        idealT2: nearest.name, idealT2Lat: nearest.lat, idealT2Lng: nearest.lng,
        distKm: Math.round(minD), currentT2, optimal: currentT2 === nearest.name,
        actualTraffic,
      };
    });

    /* Active T2 hubs */
    const activeT2Names = new Set(t3Conns.map(c => c.idealT2));
    const activeT2 = candidateT2.filter(h => activeT2Names.has(h.name))
      .sort((a, b) => b.lat - a.lat);

    /* Ideal T2 → nearest T1 (haversine) */
    type T2Conn = {
      t2: string; t2Lat: number; t2Lng: number;
      idealT1: string; idealT1Lat: number; idealT1Lng: number;
      distKm: number; currentT1: string | null; optimal: boolean;
      t3Count: number; totalTraffic: number;
    };
    const t2Conns: T2Conn[] = activeT2.map(hub => {
      let minD = Infinity, nearest = T1_DCS[0];
      T1_DCS.forEach(dc => {
        const d = haversine(hub.lat, hub.lng, dc.lat, dc.lng);
        if (d < minD) { minD = d; nearest = dc; }
      });
      const currentT1 = actualT2toT1.get(hub.name) ?? null;
      const t3Count = t3Conns.filter(c => c.idealT2 === hub.name).length;
      // Use actual measured T2→T1 traffic; fall back to sum of T3 city traffic through this hub
      const measuredT2Traffic = actualT2Traffic.get(hub.name);
      const sumT3Traffic = t3Conns
        .filter(c => c.idealT2 === hub.name)
        .reduce((s, c) => s + c.actualTraffic, 0);
      const totalTraffic = measuredT2Traffic ?? sumT3Traffic;
      return {
        t2: hub.name, t2Lat: hub.lat, t2Lng: hub.lng,
        idealT1: nearest.name, idealT1Lat: nearest.lat, idealT1Lng: nearest.lng,
        distKm: Math.round(minD), currentT1, optimal: currentT1 === nearest.name,
        t3Count, totalTraffic,
      };
    });

    /* Active T1 nodes */
    const activeT1Names = new Set(t2Conns.map(c => c.idealT1));
    const activeT1 = T1_DCS.filter(d => activeT1Names.has(d.name))
      .sort((a, b) => b.lat - a.lat);

    /* Top-up recommendations — use real measured traffic */
    const topupT3 = t3Conns.filter(c => !c.optimal).map(c => ({
      type: 'T3→T2' as const,
      city: c.t3, currentTarget: c.currentT2 ?? '(none)', idealTarget: c.idealT2,
      distKm: c.distKm, trafficGbps: c.actualTraffic,
    }));
    const topupT2 = t2Conns.filter(c => !c.optimal).map(c => ({
      type: 'T2→T1' as const,
      city: c.t2, currentTarget: c.currentT1 ?? '(none)', idealTarget: c.idealT1,
      distKm: c.distKm, trafficGbps: c.totalTraffic,
    }));

    return {
      t3Cities, t3Conns, activeT2, t2Conns, activeT1,
      topup: [...topupT3, ...topupT2],
      optCount: t3Conns.filter(c => c.optimal).length,
      rerouteCount: t3Conns.filter(c => !c.optimal).length,
    };
  }, [selectedCircle]);

  /* ── SVG layout ── */
  const SPACING = 56;
  const COL = { T3: 180, T2: 560, T1: 940 };
  const maxRows = Math.max(ideal.t3Cities.length, ideal.activeT2.length, ideal.activeT1.length);
  const svgHeight = Math.max(500, maxRows * SPACING + 120);

  function colY(len: number, i: number) {
    const total = len * SPACING;
    const startY = (svgHeight - total) / 2;
    return startY + i * SPACING + SPACING / 2;
  }

  const t3Y = new Map(ideal.t3Cities.map((c, i) => [c.name, colY(ideal.t3Cities.length, i)]));
  const t2Y = new Map(ideal.activeT2.map((h, i) => [h.name, colY(ideal.activeT2.length, i)]));
  const t1Y = new Map(ideal.activeT1.map((d, i) => [d.name, colY(ideal.activeT1.length, i)]));

  const isActive = (id: string) => !highlightNode ||
    id === highlightNode ||
    ideal.t3Conns.some(c => (c.t3 === highlightNode && c.idealT2 === id) || (c.idealT2 === highlightNode && c.t3 === id)) ||
    ideal.t2Conns.some(c => (c.t2 === highlightNode && c.idealT1 === id) || (c.idealT1 === highlightNode && c.t2 === id));

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* SVG canvas */}
      <div className="flex-1 overflow-auto bg-bg">
        {/* Sub-header: legend + KPIs */}
        <div className="flex items-center gap-6 px-5 py-2 border-b border-border bg-panel/60 sticky top-0 z-10">
          {(['T3 Cities', 'T2 Hubs', 'T1 Datacenters'] as const).map((label, i) => (
            <div key={label} className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: ['#3b82f6','#8b5cf6','#ec4899'][i] }} />
              <span>{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 text-[11px] text-muted">
            <div className="w-5 h-0.5 bg-green-400 rounded" />
            <span>Optimal</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted">
            <div className="w-5 h-0.5 bg-orange-400 rounded" />
            <span>Reroute recommended</span>
          </div>
          <div className="ml-auto flex gap-5 text-right">
            <div>
              <span className="text-[18px] font-black text-green-400">{ideal.optCount}</span>
              <span className="text-[9px] text-muted ml-1">optimal</span>
            </div>
            <div>
              <span className="text-[18px] font-black text-orange-400">{ideal.rerouteCount}</span>
              <span className="text-[9px] text-muted ml-1">reroutes</span>
            </div>
          </div>
        </div>

        <svg width={1100} height={svgHeight} className="min-w-max min-h-max">
          <defs>
            <marker id="arr-ok"  markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
              <polygon points="0 0, 7 2.5, 0 5" fill="#4ade80" />
            </marker>
            <marker id="arr-bad" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
              <polygon points="0 0, 7 2.5, 0 5" fill="#fb923c" />
            </marker>
          </defs>

          {/* Column headers */}
          {['T3 Cities', 'T2 Hubs', 'T1 Datacenters'].map((label, i) => (
            <text key={label} x={[COL.T3, COL.T2, COL.T1][i]} y={28}
              textAnchor="middle" fill={['#3b82f6','#8b5cf6','#ec4899'][i]}
              fontSize={12} fontWeight="bold" opacity={0.9}>
              {label}
            </text>
          ))}

          {/* T3 → T2 lines */}
          {ideal.t3Conns.map(c => {
            const y1 = t3Y.get(c.t3), y2 = t2Y.get(c.idealT2);
            if (y1 === undefined || y2 === undefined) return null;
            const dim = !!(highlightNode && !isActive(c.t3) && !isActive(c.idealT2));
            const color = c.optimal ? '#4ade80' : '#fb923c';
            const midX = (COL.T3 + COL.T2) / 2;
            return (
              <g key={`t3-${c.t3}`}>
                <path d={`M ${COL.T3} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${COL.T2} ${y2}`}
                  fill="none" stroke={dim ? '#1f2937' : color}
                  strokeWidth={dim ? 0.8 : 1.8} opacity={dim ? 0.15 : 0.75}
                  markerEnd={dim ? undefined : `url(#${c.optimal ? 'arr-ok' : 'arr-bad'})`}
                />
                {!dim && (
                  <text x={midX} y={(y1 + y2) / 2 - 4} textAnchor="middle"
                    fill={color} fontSize={9} opacity={0.8}
                    stroke="#0f172a" strokeWidth={2} paintOrder="stroke fill">
                    {c.distKm}km
                  </text>
                )}
              </g>
            );
          })}

          {/* T2 → T1 lines */}
          {ideal.t2Conns.map(c => {
            const y1 = t2Y.get(c.t2), y2 = t1Y.get(c.idealT1);
            if (y1 === undefined || y2 === undefined) return null;
            const dim = !!(highlightNode && !isActive(c.t2) && !isActive(c.idealT1));
            const color = c.optimal ? '#4ade80' : '#fb923c';
            const midX = (COL.T2 + COL.T1) / 2;
            return (
              <g key={`t2-${c.t2}`}>
                <path d={`M ${COL.T2} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${COL.T1} ${y2}`}
                  fill="none" stroke={dim ? '#1f2937' : color}
                  strokeWidth={dim ? 0.8 : Math.max(2, Math.min(6, c.totalTraffic / 80))}
                  opacity={dim ? 0.15 : 0.75}
                  markerEnd={dim ? undefined : `url(#${c.optimal ? 'arr-ok' : 'arr-bad'})`}
                />
                {!dim && (
                  <text x={midX} y={(y1 + y2) / 2 - 4} textAnchor="middle"
                    fill={color} fontSize={9} opacity={0.8}
                    stroke="#0f172a" strokeWidth={2} paintOrder="stroke fill">
                    {c.totalTraffic > 0 ? `${c.totalTraffic}G` : '—'} · {c.distKm}km
                  </text>
                )}
              </g>
            );
          })}

          {/* T3 nodes */}
          {ideal.t3Cities.map(city => {
            const y = t3Y.get(city.name);
            if (y === undefined) return null;
            const dim = !!(highlightNode && !isActive(city.name));
            const conn = ideal.t3Conns.find(c => c.t3 === city.name);
            return (
              <g key={city.name} transform={`translate(${COL.T3}, ${y})`}
                style={{ cursor: 'pointer', opacity: dim ? 0.18 : 1 }}
                onClick={() => setHighlightNode(highlightNode === city.name ? null : city.name)}>
                <circle r={14} fill={TIER_COLORS.T3}
                  stroke={highlightNode === city.name ? '#fff' : '#1e293b'} strokeWidth={2} />
                {!conn?.optimal && (
                  <circle r={18} fill="none" stroke="#fb923c" strokeWidth={1.5} opacity={0.6} strokeDasharray="3 2" />
                )}
                <text y={4} textAnchor="middle" fill="#fff" fontSize={9} fontWeight="bold">T3</text>
                <text x={-22} y={4} textAnchor="end" fill="#e2e8f0" fontSize={11}
                  stroke="#0f172a" strokeWidth={3} paintOrder="stroke fill">
                  {city.name.length > 18 ? city.name.slice(0, 17) + '…' : city.name}
                </text>
              </g>
            );
          })}

          {/* T2 nodes */}
          {ideal.activeT2.map(hub => {
            const y = t2Y.get(hub.name);
            if (y === undefined) return null;
            const dim = !!(highlightNode && !isActive(hub.name));
            const conn = ideal.t2Conns.find(c => c.t2 === hub.name);
            return (
              <g key={hub.name} transform={`translate(${COL.T2}, ${y})`}
                style={{ cursor: 'pointer', opacity: dim ? 0.18 : 1 }}
                onClick={() => setHighlightNode(highlightNode === hub.name ? null : hub.name)}>
                <circle r={17} fill={TIER_COLORS.T2}
                  stroke={highlightNode === hub.name ? '#fff' : '#1e293b'} strokeWidth={2} />
                {!conn?.optimal && (
                  <circle r={21} fill="none" stroke="#fb923c" strokeWidth={1.5} opacity={0.6} strokeDasharray="3 2" />
                )}
                <text y={-3} textAnchor="middle" fill="#fff" fontSize={9} fontWeight="bold">T2</text>
                <text y={8} textAnchor="middle" fill="#c4b5fd" fontSize={8}>{conn?.t3Count ?? 0}×T3</text>
                <text x={25} y={4} textAnchor="start" fill="#e2e8f0" fontSize={11}
                  stroke="#0f172a" strokeWidth={3} paintOrder="stroke fill">
                  {hub.name.length > 15 ? hub.name.slice(0, 14) + '…' : hub.name}
                </text>
              </g>
            );
          })}

          {/* T1 nodes */}
          {ideal.activeT1.map(dc => {
            const y = t1Y.get(dc.name);
            if (y === undefined) return null;
            const dim = !!(highlightNode && !isActive(dc.name));
            const totalTraffic = ideal.t2Conns.filter(c => c.idealT1 === dc.name).reduce((s, c) => s + c.totalTraffic, 0);
            return (
              <g key={dc.name} transform={`translate(${COL.T1}, ${y})`}
                style={{ cursor: 'pointer', opacity: dim ? 0.18 : 1 }}
                onClick={() => setHighlightNode(highlightNode === dc.name ? null : dc.name)}>
                <circle r={20} fill={TIER_COLORS.T1}
                  stroke={highlightNode === dc.name ? '#fff' : '#1e293b'} strokeWidth={2} />
                <text y={-4} textAnchor="middle" fill="#fff" fontSize={9} fontWeight="bold">T1</text>
                <text y={8} textAnchor="middle" fill="#fbcfe8" fontSize={8}>{totalTraffic}G</text>
                <text x={28} y={4} textAnchor="start" fill="#e2e8f0" fontSize={11}
                  stroke="#0f172a" strokeWidth={3} paintOrder="stroke fill">
                  {dc.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* ── Top-up recommendations panel ── */}
      <div className="w-[360px] flex-shrink-0 border-l border-border flex flex-col overflow-hidden bg-card">
        <div className="px-4 py-3 border-b border-border flex-shrink-0">
          <div className="text-[13px] font-bold text-text">Capacity Top-up Needed</div>
          <div className="text-[10px] text-muted mt-0.5">
            {selectedCircle} · distance-optimal routing vs current
          </div>
        </div>

        {ideal.topup.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 text-center px-6 gap-3">
            <div className="text-green-400 text-5xl">✓</div>
            <div className="text-[14px] font-bold text-green-400">All routes are optimal</div>
            <div className="text-[11px] text-muted leading-relaxed">
              Every city in <strong>{selectedCircle}</strong> is already connected to its nearest T2 hub and T1 datacenter.
              No capacity top-up required.
            </div>
          </div>
        ) : (
          <>
            {/* Totals */}
            <div className="grid grid-cols-3 gap-px bg-border flex-shrink-0">
              <div className="bg-card px-3 py-2 text-center">
                <div className="text-[18px] font-black text-orange-400">{ideal.topup.filter(t => t.type === 'T3→T2').length}</div>
                <div className="text-[9px] text-muted">T3 reroutes</div>
              </div>
              <div className="bg-card px-3 py-2 text-center">
                <div className="text-[18px] font-black text-purple-400">{ideal.topup.filter(t => t.type === 'T2→T1').length}</div>
                <div className="text-[9px] text-muted">T2 reroutes</div>
              </div>
              <div className="bg-card px-3 py-2 text-center">
                <div className="text-[18px] font-black text-cyan-400">{ideal.topup.reduce((s, t) => s + t.trafficGbps, 0)}</div>
                <div className="text-[9px] text-muted">Gbps to add</div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">

              {/* T3→T2 changes */}
              {ideal.topup.filter(t => t.type === 'T3→T2').length > 0 && (
                <>
                  <div className="px-4 py-1.5 bg-border/30 text-[10px] font-bold text-blue-400 uppercase tracking-wider sticky top-0 z-10">
                    T3 City → T2 Hub — Add capacity
                  </div>
                  {ideal.topup.filter(t => t.type === 'T3→T2').map((item, i) => (
                    <div key={i}
                      className={`px-4 py-2.5 border-b border-border/40 cursor-pointer transition-colors hover:bg-border/10 ${highlightNode === item.city ? 'bg-orange-500/10' : ''}`}
                      onClick={() => setHighlightNode(highlightNode === item.city ? null : item.city)}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                          <span className="text-[12px] font-bold text-text truncate max-w-[150px]">{item.city}</span>
                        </div>
                        <span className="text-[11px] font-bold text-orange-400">+{item.trafficGbps} Gbps</span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] ml-3.5">
                        <span className="text-red-400 font-mono truncate max-w-[100px]">{item.currentTarget}</span>
                        <span className="text-muted">→</span>
                        <span className="text-green-400 font-mono font-bold">{item.idealTarget}</span>
                        <span className="ml-auto text-cyan-400 flex-shrink-0">{item.distKm} km</span>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* T2→T1 changes */}
              {ideal.topup.filter(t => t.type === 'T2→T1').length > 0 && (
                <>
                  <div className="px-4 py-1.5 bg-border/30 text-[10px] font-bold text-purple-400 uppercase tracking-wider sticky top-0 z-10">
                    T2 Hub → T1 DC — Add capacity
                  </div>
                  {ideal.topup.filter(t => t.type === 'T2→T1').map((item, i) => (
                    <div key={i}
                      className={`px-4 py-2.5 border-b border-border/40 cursor-pointer transition-colors hover:bg-border/10 ${highlightNode === item.city ? 'bg-orange-500/10' : ''}`}
                      onClick={() => setHighlightNode(highlightNode === item.city ? null : item.city)}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0" />
                          <span className="text-[12px] font-bold text-text truncate max-w-[150px]">{item.city}</span>
                        </div>
                        <span className="text-[11px] font-bold text-orange-400">+{item.trafficGbps} Gbps</span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] ml-3.5">
                        <span className="text-red-400 font-mono truncate max-w-[100px]">{item.currentTarget}</span>
                        <span className="text-muted">→</span>
                        <span className="text-pink-400 font-mono font-bold">{item.idealTarget}</span>
                        <span className="ml-auto text-cyan-400 flex-shrink-0">{item.distKm} km</span>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* Optimal T2→T1 (already correct) */}
              {ideal.t2Conns.filter(c => c.optimal).length > 0 && (
                <>
                  <div className="px-4 py-1.5 bg-border/20 text-[10px] font-bold text-green-500 uppercase tracking-wider sticky top-0 z-10">
                    T2 → T1 Already Optimal
                  </div>
                  {ideal.t2Conns.filter(c => c.optimal).map((c, i) => (
                    <div key={i} className="px-4 py-2 border-b border-border/30 flex items-center gap-2">
                      <span className="text-green-400">✓</span>
                      <span className="text-[11px] text-text flex-1 truncate">{c.t2}</span>
                      <span className="text-[10px] text-green-400 font-mono">{c.idealT1}</span>
                      <span className="text-[10px] text-muted">{c.distKm}km</span>
                    </div>
                  ))}
                </>
              )}
            </div>

            <div className="px-4 py-1.5 border-t border-border text-[9px] text-muted flex-shrink-0">
              Click any node or row to highlight its connections · Dashed ring = reroute needed
            </div>
          </>
        )}
      </div>
    </div>
  );
}
