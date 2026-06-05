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

/* ── Small reusable bar ── */
function TrafficBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 rounded-full bg-border overflow-hidden flex-1">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

interface Props {
  initialCircle?: string;
  onCircleChange?: (circle: string) => void;
}

export default function IdealFlowView({ initialCircle, onCircleChange }: Props) {
  const [selectedCircle, setSelectedCircle] = useState(initialCircle || ALL_CIRCLES[0] || '');
  const [highlightNode, setHighlightNode] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<'recs' | 'rules'>('recs');
  const [nodeTab, setNodeTab] = useState<'routing' | 'traffic'>('routing');

  function changeCircle(c: string) {
    setSelectedCircle(c);
    setHighlightNode(null);
    onCircleChange?.(c);
  }

  const ideal = useMemo(() => {
    const circleLinks = idealFlowData[selectedCircle] || [];
    const actualLinks = actualFlowData[selectedCircle] || [];

    const t3Map = new Map<string, { name: string; lat: number; lng: number }>();
    circleLinks.forEach(l => {
      if (l.sourceTier === 'T3' && !t3Map.has(l.source)) {
        const c = getCoords(l.source);
        if (c) t3Map.set(l.source, { name: l.source, lat: c[0], lng: c[1] });
      }
    });
    const t3Cities = Array.from(t3Map.values()).sort((a, b) => b.lat - a.lat);

    const circleT2Names = new Set<string>();
    circleLinks.forEach(l => {
      if (l.sourceTier === 'T3') circleT2Names.add(l.target);
      if (l.sourceTier === 'T2' && l.targetTier === 'T1') circleT2Names.add(l.source);
    });
    let candidateT2 = Array.from(circleT2Names)
      .map(n => t2HubMap.get(n)).filter(Boolean) as T2Hub[];
    if (candidateT2.length === 0) candidateT2 = allT2Hubs;

    const actualT3toT2 = new Map<string, string>();
    const actualT3Traffic = new Map<string, number>();
    const actualT2toT1 = new Map<string, string>();
    const actualT2Traffic = new Map<string, number>();

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
      // Store TOTAL traffic across all links (not just primary) so recommended % is based on real total
      actualT3Traffic.set(src, links.reduce((s, l) => s + l.traffic, 0));
    });

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

    type T3Conn = {
      t3: string; t3Lat: number; t3Lng: number;
      idealT2: string; idealT2Lat: number; idealT2Lng: number; distKm: number;
      secondaryT2: string | null; secondaryDistKm: number;
      currentT2: string | null; optimal: boolean;
      actualTraffic: number;  // total traffic from this city across ALL links
      flowToIdealT2: number;  // traffic already flowing to the recommended primary hub
      topupNeeded: number;    // gap: how much MORE capacity is needed on the ideal primary
    };

    const t3Conns: T3Conn[] = t3Cities.map(city => {
      const ranked = [...candidateT2]
        .map(h => ({ h, d: haversine(city.lat, city.lng, h.lat, h.lng) }))
        .sort((a, b) => a.d - b.d);
      const nearest = ranked[0];
      const second = ranked.length > 1 ? ranked[1] : null;
      const currentT2 = actualT3toT2.get(city.name) ?? null;
      const actualTraffic = actualT3Traffic.get(city.name) ?? 0;  // total across all links

      // How much is already flowing to the recommended primary hub right now
      const allCityLinks = t3Groups.get(city.name) ?? [];
      const flowToIdealT2 = allCityLinks.find(l => l.target === nearest.h.name)?.traffic ?? 0;
      const recommendedPrimary = Math.round(actualTraffic * 0.9);
      const topupNeeded = Math.max(0, recommendedPrimary - flowToIdealT2);

      return {
        t3: city.name, t3Lat: city.lat, t3Lng: city.lng,
        idealT2: nearest.h.name, idealT2Lat: nearest.h.lat, idealT2Lng: nearest.h.lng,
        distKm: Math.round(nearest.d),
        secondaryT2: second?.h.name ?? null,
        secondaryDistKm: second ? Math.round(second.d) : 0,
        currentT2, optimal: currentT2 === nearest.h.name,
        actualTraffic, flowToIdealT2, topupNeeded,
      };
    });

    const activeT2NamesSet = new Set<string>();
    t3Conns.forEach(c => {
      activeT2NamesSet.add(c.idealT2);
      if (c.secondaryT2) activeT2NamesSet.add(c.secondaryT2);
    });
    const activeT2 = candidateT2.filter(h => activeT2NamesSet.has(h.name))
      .sort((a, b) => b.lat - a.lat);

    type T2Conn = {
      t2: string; t2Lat: number; t2Lng: number;
      idealT1: string; idealT1Lat: number; idealT1Lng: number; distKm: number;
      secondaryT1: string | null; secondaryDistKm: number;
      currentT1: string | null; optimal: boolean;
      t3PrimaryCount: number; t3SecondaryCount: number;
      totalTraffic: number;
      localTraffic: number;  // 90% handled by T2 hub itself
      t1Traffic: number;     // 10% passed up to T1
    };

    const t2Conns: T2Conn[] = activeT2.map(hub => {
      const ranked = [...T1_DCS]
        .map(dc => ({ dc, d: haversine(hub.lat, hub.lng, dc.lat, dc.lng) }))
        .sort((a, b) => a.d - b.d);
      const nearest = ranked[0];
      const second = ranked.length > 1 ? ranked[1] : null;
      const currentT1 = actualT2toT1.get(hub.name) ?? null;
      const t3PrimaryCount = t3Conns.filter(c => c.idealT2 === hub.name).length;
      const t3SecondaryCount = t3Conns.filter(c => c.secondaryT2 === hub.name).length;
      const measuredT2Traffic = actualT2Traffic.get(hub.name);
      const sumT3Traffic = t3Conns.filter(c => c.idealT2 === hub.name).reduce((s, c) => s + c.actualTraffic, 0);
      const totalTraffic = measuredT2Traffic ?? sumT3Traffic;
      const localTraffic = Math.round(totalTraffic * 0.9);
      const t1Traffic    = Math.round(totalTraffic * 0.1);
      return {
        t2: hub.name, t2Lat: hub.lat, t2Lng: hub.lng,
        idealT1: nearest.dc.name, idealT1Lat: nearest.dc.lat, idealT1Lng: nearest.dc.lng,
        distKm: Math.round(nearest.d),
        secondaryT1: second?.dc.name ?? null,
        secondaryDistKm: second ? Math.round(second.d) : 0,
        currentT1, optimal: currentT1 === nearest.dc.name,
        t3PrimaryCount, t3SecondaryCount, totalTraffic, localTraffic, t1Traffic,
      };
    });

    const activeT1NamesSet = new Set<string>();
    t2Conns.forEach(c => {
      activeT1NamesSet.add(c.idealT1);
      if (c.secondaryT1) activeT1NamesSet.add(c.secondaryT1);
    });
    const activeT1 = T1_DCS.filter(d => activeT1NamesSet.has(d.name)).sort((a, b) => b.lat - a.lat);

    const topupT3 = t3Conns.filter(c => !c.optimal).map(c => ({
      type: 'T3→T2' as const,
      city: c.t3, currentTarget: c.currentT2 ?? '(none)', idealTarget: c.idealT2,
      distKm: c.distKm, trafficGbps: c.topupNeeded,  // gap only, not total traffic
    }));
    const topupT2 = t2Conns.filter(c => !c.optimal).map(c => ({
      type: 'T2→T1' as const,
      city: c.t2, currentTarget: c.currentT1 ?? '(none)', idealTarget: c.idealT1,
      distKm: c.distKm, trafficGbps: c.t1Traffic,
    }));

    const totalCurrentTraffic = t3Conns.reduce((s, c) => s + c.actualTraffic, 0);
    const trafficOnOptimal    = t3Conns.filter(c => c.optimal).reduce((s, c) => s + c.actualTraffic, 0);
    const totalT2Local        = t2Conns.reduce((s, c) => s + c.localTraffic, 0);
    const totalToT1           = t2Conns.reduce((s, c) => s + c.t1Traffic, 0);
    const topupT3Gbps         = t3Conns.filter(c => !c.optimal).reduce((s, c) => s + c.topupNeeded, 0);
    const topupT2Gbps         = t2Conns.filter(c => !c.optimal).reduce((s, c) => s + c.t1Traffic, 0);

    return {
      t3Cities, t3Conns, activeT2, t2Conns, activeT1,
      topup: [...topupT3, ...topupT2],
      optCount:    t3Conns.filter(c => c.optimal).length,
      rerouteCount: t3Conns.filter(c => !c.optimal).length,
      totalCurrentTraffic, trafficOnOptimal, totalT2Local, totalToT1, topupT3Gbps, topupT2Gbps,
      actualLinks,
    };
  }, [selectedCircle]);

  /* ── Node detail data for right panel ── */
  const nodeDetail = useMemo(() => {
    if (!highlightNode) return null;
    const { actualLinks, t3Conns, t2Conns, activeT1 } = ideal;

    const t3conn = t3Conns.find(c => c.t3 === highlightNode);
    if (t3conn) {
      const actualOut = [...actualLinks]
        .filter(l => l.source === highlightNode && l.sourceTier === 'T3')
        .sort((a, b) => b.traffic - a.traffic);
      return { type: 'T3' as const, conn: t3conn, actualOut };
    }

    const t2conn = t2Conns.find(c => c.t2 === highlightNode);
    if (t2conn) {
      const actualOut = [...actualLinks]
        .filter(l => l.source === highlightNode && l.sourceTier === 'T2')
        .sort((a, b) => b.traffic - a.traffic);
      const actualIn = [...actualLinks]
        .filter(l => l.target === highlightNode && l.sourceTier === 'T3')
        .sort((a, b) => b.traffic - a.traffic);
      const t3Primary = t3Conns.filter(c => c.idealT2 === highlightNode);
      const t3Secondary = t3Conns.filter(c => c.secondaryT2 === highlightNode);
      return { type: 'T2' as const, conn: t2conn, actualOut, actualIn, t3Primary, t3Secondary };
    }

    const t1node = activeT1.find(d => d.name === highlightNode);
    if (t1node) {
      const actualIn = [...actualLinks]
        .filter(l => l.target === highlightNode)
        .sort((a, b) => b.traffic - a.traffic);
      const t2Primary = t2Conns.filter(c => c.idealT1 === highlightNode);
      const t2Secondary = t2Conns.filter(c => c.secondaryT1 === highlightNode);
      return { type: 'T1' as const, node: t1node, actualIn, t2Primary, t2Secondary };
    }

    return null;
  }, [highlightNode, ideal]);

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
    ideal.t3Conns.some(c =>
      (c.t3 === highlightNode && (c.idealT2 === id || c.secondaryT2 === id)) ||
      (c.idealT2 === highlightNode && (c.t3 === id || c.secondaryT2 === id)) ||
      (c.secondaryT2 === highlightNode && (c.t3 === id || c.idealT2 === id))
    ) ||
    ideal.t2Conns.some(c =>
      (c.t2 === highlightNode && (c.idealT1 === id || c.secondaryT1 === id)) ||
      (c.idealT1 === highlightNode && (c.t2 === id || c.secondaryT1 === id)) ||
      (c.secondaryT1 === highlightNode && (c.t2 === id || c.idealT1 === id))
    );

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* SVG canvas */}
      <div className="flex-1 overflow-auto bg-bg">
        <div className="flex items-center gap-5 px-5 py-2 border-b border-border bg-panel/60 sticky top-0 z-10 flex-wrap">
          {(['T3 Cities', 'T2 Hubs', 'T1 Datacenters'] as const).map((label, i) => (
            <div key={label} className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: ['#3b82f6','#8b5cf6','#ec4899'][i] }} />
              <span>{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 text-[11px] text-muted">
            <div className="w-5 h-0.5 bg-green-400 rounded" />
            <span>Primary (90%) optimal</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted">
            <div className="w-5 h-0.5 bg-orange-400 rounded" />
            <span>Primary (90%) reroute</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted">
            <svg width="20" height="8" className="overflow-visible">
              <line x1="0" y1="4" x2="20" y2="4" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="4 2" />
            </svg>
            <span>Secondary (10%)</span>
          </div>
          <div className="ml-auto flex gap-3 items-center">
            {[
              { label: 'T3 total',       val: `${ideal.totalCurrentTraffic}G`, color: '#94a3b8' },
              { label: 'T2 local (90%)', val: `${ideal.totalT2Local}G`,        color: '#8b5cf6' },
              { label: 'T1 egress (10%)',val: `${ideal.totalToT1}G`,           color: '#ec4899' },
              { label: 'top-up needed',  val: `${ideal.topupT3Gbps + ideal.topupT2Gbps}G`, color: '#fb923c' },
              { label: 'cities optimal', val: `${ideal.optCount}`,             color: '#4ade80' },
              { label: 'need reroute',   val: `${ideal.rerouteCount}`,         color: '#fb923c' },
            ].map(s => (
              <div key={s.label} className="text-right border-l border-border pl-3 first:border-l-0 first:pl-0">
                <div className="text-[15px] font-black leading-none" style={{ color: s.color }}>{s.val}</div>
                <div className="text-[8px] text-muted mt-0.5">{s.label}</div>
              </div>
            ))}
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
            <marker id="arr-sec" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
              <polygon points="0 0, 7 2.5, 0 5" fill="#38bdf8" />
            </marker>
          </defs>

          {['T3 Cities', 'T2 Hubs', 'T1 Datacenters'].map((label, i) => (
            <text key={label} x={[COL.T3, COL.T2, COL.T1][i]} y={28}
              textAnchor="middle" fill={['#3b82f6','#8b5cf6','#ec4899'][i]}
              fontSize={12} fontWeight="bold" opacity={0.9}>
              {label}
            </text>
          ))}

          {/* T3 → T2 secondary lines */}
          {ideal.t3Conns.filter(c => c.secondaryT2 !== null).map(c => {
            const y1 = t3Y.get(c.t3), y2 = t2Y.get(c.secondaryT2!);
            if (y1 === undefined || y2 === undefined) return null;
            const dim = !!(highlightNode && !isActive(c.t3) && !isActive(c.secondaryT2!));
            const midX = (COL.T3 + COL.T2) / 2;
            return (
              <g key={`t3-sec-${c.t3}`}>
                <path d={`M ${COL.T3} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${COL.T2} ${y2}`}
                  fill="none" stroke={dim ? '#1f2937' : '#38bdf8'}
                  strokeWidth={dim ? 0.5 : 1.2} strokeDasharray="5 3"
                  opacity={dim ? 0.08 : 0.5}
                  markerEnd={dim ? undefined : 'url(#arr-sec)'} />
                {!dim && (
                  <text x={midX} y={(y1 + y2) / 2 + 13} textAnchor="middle"
                    fill="#38bdf8" fontSize={8} opacity={0.7}
                    stroke="#0f172a" strokeWidth={2} paintOrder="stroke fill">
                    {c.actualTraffic > 0 ? `~${Math.round(c.actualTraffic * 0.1)}G · ` : ''}{c.secondaryDistKm}km · 10%
                  </text>
                )}
              </g>
            );
          })}

          {/* T3 → T2 primary lines */}
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
                  strokeWidth={dim ? 0.8 : 1.8} opacity={dim ? 0.15 : 0.8}
                  markerEnd={dim ? undefined : `url(#${c.optimal ? 'arr-ok' : 'arr-bad'})`} />
                {!dim && (
                  <>
                    <text x={midX} y={(y1 + y2) / 2 - 6} textAnchor="middle"
                      fill={color} fontSize={9} fontWeight="bold" opacity={0.9}
                      stroke="#0f172a" strokeWidth={2} paintOrder="stroke fill">
                      {c.actualTraffic > 0 ? `${Math.round(c.actualTraffic * 0.9)}G · ` : ''}{c.distKm}km
                    </text>
                    {!c.optimal && c.topupNeeded > 0 && (
                      <text x={midX} y={(y1 + y2) / 2 + 6} textAnchor="middle"
                        fill="#fb923c" fontSize={8} opacity={0.9}
                        stroke="#0f172a" strokeWidth={2} paintOrder="stroke fill">
                        +{c.topupNeeded}G top-up needed
                      </text>
                    )}
                  </>
                )}
              </g>
            );
          })}

          {/* T2 → T1 secondary lines */}
          {ideal.t2Conns.filter(c => c.secondaryT1 !== null).map(c => {
            const y1 = t2Y.get(c.t2), y2 = t1Y.get(c.secondaryT1!);
            if (y1 === undefined || y2 === undefined) return null;
            const dim = !!(highlightNode && !isActive(c.t2) && !isActive(c.secondaryT1!));
            const midX = (COL.T2 + COL.T1) / 2;
            return (
              <g key={`t2-sec-${c.t2}`}>
                <path d={`M ${COL.T2} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${COL.T1} ${y2}`}
                  fill="none" stroke={dim ? '#1f2937' : '#38bdf8'}
                  strokeWidth={dim ? 0.5 : 1.5} strokeDasharray="5 3"
                  opacity={dim ? 0.08 : 0.5}
                  markerEnd={dim ? undefined : 'url(#arr-sec)'} />
                {!dim && (
                  <text x={midX} y={(y1 + y2) / 2 + 14} textAnchor="middle"
                    fill="#38bdf8" fontSize={8} opacity={0.7}
                    stroke="#0f172a" strokeWidth={2} paintOrder="stroke fill">
                    {c.t1Traffic > 0 ? `${c.t1Traffic}G backup · ` : ''}{c.secondaryDistKm}km
                  </text>
                )}
              </g>
            );
          })}

          {/* T2 → T1 primary lines (only 10% of T2 traffic egresses to T1) */}
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
                  strokeWidth={dim ? 0.8 : Math.max(1.5, Math.min(5, c.t1Traffic / 20))}
                  opacity={dim ? 0.15 : 0.8}
                  markerEnd={dim ? undefined : `url(#${c.optimal ? 'arr-ok' : 'arr-bad'})`} />
                {!dim && (
                  <>
                    <text x={midX} y={(y1 + y2) / 2 - 6} textAnchor="middle"
                      fill={color} fontSize={9} fontWeight="bold" opacity={0.9}
                      stroke="#0f172a" strokeWidth={2} paintOrder="stroke fill">
                      {c.t1Traffic > 0 ? `${c.t1Traffic}G · ` : ''}{c.distKm}km · 10%↑
                    </text>
                    {!c.optimal && c.t1Traffic > 0 && (
                      <text x={midX} y={(y1 + y2) / 2 + 6} textAnchor="middle"
                        fill="#fb923c" fontSize={8} opacity={0.9}
                        stroke="#0f172a" strokeWidth={2} paintOrder="stroke fill">
                        +{c.t1Traffic}G top-up needed
                      </text>
                    )}
                  </>
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
            const isSelected = highlightNode === city.name;
            return (
              <g key={city.name} transform={`translate(${COL.T3}, ${y})`}
                style={{ cursor: 'pointer', opacity: dim ? 0.18 : 1 }}
                onClick={() => setHighlightNode(isSelected ? null : city.name)}>
                <circle r={14} fill={TIER_COLORS.T3}
                  stroke={isSelected ? '#fff' : '#1e293b'} strokeWidth={isSelected ? 3 : 2} />
                {!conn?.optimal && (
                  <circle r={18} fill="none" stroke="#fb923c" strokeWidth={1.5} opacity={0.6} strokeDasharray="3 2" />
                )}
                <text y={4} textAnchor="middle" fill="#fff" fontSize={9} fontWeight="bold">T3</text>
                <text x={-22} y={4} textAnchor="end" fill={isSelected ? '#fff' : '#e2e8f0'} fontSize={11}
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
            const isPrimaryOnly = (conn?.t3PrimaryCount ?? 0) > 0 && (conn?.t3SecondaryCount ?? 0) === 0;
            const isSecondaryOnly = (conn?.t3PrimaryCount ?? 0) === 0 && (conn?.t3SecondaryCount ?? 0) > 0;
            const isSelected = highlightNode === hub.name;
            return (
              <g key={hub.name} transform={`translate(${COL.T2}, ${y})`}
                style={{ cursor: 'pointer', opacity: dim ? 0.18 : 1 }}
                onClick={() => setHighlightNode(isSelected ? null : hub.name)}>
                <circle r={17} fill={TIER_COLORS.T2}
                  stroke={isSelected ? '#fff' : '#1e293b'} strokeWidth={isSelected ? 3 : 2} />
                {!conn?.optimal && (
                  <circle r={21} fill="none" stroke="#fb923c" strokeWidth={1.5} opacity={0.6} strokeDasharray="3 2" />
                )}
                {isSecondaryOnly && (
                  <circle r={21} fill="none" stroke="#38bdf8" strokeWidth={1} opacity={0.5} strokeDasharray="3 2" />
                )}
                <text y={-7} textAnchor="middle" fill="#fff" fontSize={8} fontWeight="bold">T2</text>
                {conn && conn.localTraffic > 0 && (
                  <text y={2} textAnchor="middle" fill="#e9d5ff" fontSize={8} fontWeight="bold">{conn.localTraffic}G</text>
                )}
                {conn && conn.t1Traffic > 0 && (
                  <text y={11} textAnchor="middle" fill="#f9a8d4" fontSize={7}>↑{conn.t1Traffic}G→T1</text>
                )}
                <text y={20} textAnchor="middle" fill="#c4b5fd" fontSize={6}>
                  {isPrimaryOnly ? `${conn?.t3PrimaryCount}×T3` : isSecondaryOnly ? `${conn?.t3SecondaryCount}sec` : `${conn?.t3PrimaryCount ?? 0}p+${conn?.t3SecondaryCount ?? 0}s`}
                </text>
                <text x={25} y={4} textAnchor="start" fill={isSelected ? '#fff' : '#e2e8f0'} fontSize={11}
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
            const primaryTraffic = ideal.t2Conns.filter(c => c.idealT1 === dc.name).reduce((s, c) => s + c.t1Traffic, 0);
            const isSecondaryTarget = ideal.t2Conns.some(c => c.secondaryT1 === dc.name);
            const isSelected = highlightNode === dc.name;
            return (
              <g key={dc.name} transform={`translate(${COL.T1}, ${y})`}
                style={{ cursor: 'pointer', opacity: dim ? 0.18 : 1 }}
                onClick={() => setHighlightNode(isSelected ? null : dc.name)}>
                <circle r={20} fill={TIER_COLORS.T1}
                  stroke={isSelected ? '#fff' : '#1e293b'} strokeWidth={isSelected ? 3 : 2} />
                {isSecondaryTarget && (
                  <circle r={24} fill="none" stroke="#38bdf8" strokeWidth={1} opacity={0.4} strokeDasharray="4 3" />
                )}
                <text y={-6} textAnchor="middle" fill="#fff" fontSize={8} fontWeight="bold">T1</text>
                {primaryTraffic > 0 && (
                  <text y={5} textAnchor="middle" fill="#fbcfe8" fontSize={10} fontWeight="bold">{primaryTraffic}G</text>
                )}
                <text x={28} y={4} textAnchor="start" fill={isSelected ? '#fff' : '#e2e8f0'} fontSize={11}
                  stroke="#0f172a" strokeWidth={3} paintOrder="stroke fill">
                  {dc.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* ── Right panel: node detail when selected, else recommendations ── */}
      <div className="w-[360px] flex-shrink-0 border-l border-border flex flex-col overflow-hidden bg-card">

        {nodeDetail ? (
          /* ══ NODE DETAIL PANEL ══ */
          <>
            {/* Header */}
            <div className="px-4 py-3 border-b border-border flex items-start justify-between flex-shrink-0"
              style={{ borderLeftWidth: 3, borderLeftColor: TIER_COLORS[nodeDetail.type] }}>
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: TIER_COLORS[nodeDetail.type] }} />
                  <span className="text-[15px] font-black text-text">
                    {nodeDetail.type === 'T3' ? nodeDetail.conn.t3
                     : nodeDetail.type === 'T2' ? nodeDetail.conn.t2
                     : nodeDetail.node.name}
                  </span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border"
                    style={{ color: TIER_COLORS[nodeDetail.type], borderColor: `${TIER_COLORS[nodeDetail.type]}44`, background: `${TIER_COLORS[nodeDetail.type]}11` }}>
                    {nodeDetail.type}
                  </span>
                </div>
                <div className="text-[10px] text-muted mt-0.5 ml-5">
                  {nodeDetail.type === 'T3' ? 'City node' : nodeDetail.type === 'T2' ? 'Aggregation hub' : 'Core datacenter'}
                </div>
              </div>
              <button onClick={() => setHighlightNode(null)}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-border text-muted hover:text-text transition-colors flex-shrink-0 mt-0.5">
                ✕
              </button>
            </div>

            {/* Node tab bar */}
            <div className="flex border-b border-border flex-shrink-0">
              {(['routing', 'traffic'] as const).map(t => (
                <button key={t} onClick={() => setNodeTab(t)}
                  className={`flex-1 py-1.5 text-[11px] font-semibold transition-colors ${
                    nodeTab === t
                      ? t === 'routing'
                        ? 'border-b-2 border-accent2 text-accent2 bg-accent2/8'
                        : 'border-b-2 border-orange-400 text-orange-400 bg-orange-400/8'
                      : 'text-muted hover:text-text'
                  }`}>
                  {t === 'routing' ? 'Routing Detail' : 'Traffic Analysis'}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto">

            {/* ══ TRAFFIC ANALYSIS TAB ══ */}
            {nodeTab === 'traffic' && (() => {

              /* ── T3 Traffic Analysis ── */
              if (nodeDetail.type === 'T3') {
                const { conn, actualOut } = nodeDetail;
                const totalActual = conn.actualTraffic;
                const recPrimary  = Math.round(totalActual * 0.9);
                const recSec      = Math.round(totalActual * 0.1);
                const currentOnPrimary   = conn.flowToIdealT2;
                const currentOnSecondary = actualOut.find(l => l.target === conn.secondaryT2)?.traffic ?? 0;
                const excessLinks = actualOut.filter(l => l.target !== conn.idealT2 && l.target !== conn.secondaryT2);
                const excessGbps  = excessLinks.reduce((s, l) => s + l.traffic, 0);
                const maxBar = Math.max(totalActual, 1);
                return (
                  <div className="p-4 flex flex-col gap-4">

                    {/* Total traffic */}
                    <div className="rounded-lg border border-border bg-border/20 px-3 py-2.5">
                      <div className="text-[9px] text-muted uppercase tracking-wider mb-1">Total actual traffic</div>
                      <div className="text-[26px] font-black text-text leading-none">{totalActual}G</div>
                      <div className="text-[9px] text-muted mt-1">across {actualOut.length} link{actualOut.length !== 1 ? 's' : ''}</div>
                    </div>

                    {/* Per-link breakdown */}
                    <div>
                      <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">Actual links</div>
                      <div className="flex flex-col gap-1.5">
                        {actualOut.map((l, i) => {
                          const pct = Math.round((l.traffic / totalActual) * 100);
                          const isIdeal = l.target === conn.idealT2;
                          const isSec   = l.target === conn.secondaryT2;
                          const label   = isIdeal ? 'plan primary' : isSec ? 'plan secondary' : 'off-plan';
                          const col     = isIdeal ? '#4ade80' : isSec ? '#38bdf8' : '#f87171';
                          return (
                            <div key={i}>
                              <div className="flex justify-between text-[10px] mb-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-text">{l.target}</span>
                                  <span className="text-[8px] px-1 py-0.5 rounded" style={{ color: col, background: `${col}18` }}>{label}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-muted">{pct}%</span>
                                  <span className="font-bold font-mono text-text">{l.traffic}G</span>
                                </div>
                              </div>
                              <TrafficBar value={l.traffic} max={maxBar} color={col} />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Plan vs actual gap table */}
                    <div>
                      <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">Plan vs actual</div>
                      <div className="flex flex-col gap-1.5">

                        {/* Primary row */}
                        <div className={`rounded-md border px-3 py-2 ${conn.optimal ? 'border-green-500/30 bg-green-500/6' : 'border-orange-500/30 bg-orange-500/6'}`}>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] font-bold text-text">{conn.idealT2}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-600/40 text-slate-300">90% primary</span>
                          </div>
                          <div className="grid grid-cols-3 gap-1 text-center">
                            {[
                              { label: 'Target',  val: `${recPrimary}G`,       color: 'text-text' },
                              { label: 'Actual',  val: `${currentOnPrimary}G`, color: currentOnPrimary >= recPrimary ? 'text-green-400' : 'text-orange-400' },
                              { label: conn.topupNeeded > 0 ? 'Gap' : 'Status', val: conn.topupNeeded > 0 ? `+${conn.topupNeeded}G` : '✓', color: conn.topupNeeded > 0 ? 'text-orange-400' : 'text-green-400' },
                            ].map(s => (
                              <div key={s.label} className="rounded bg-border/20 py-1">
                                <div className={`text-[12px] font-black ${s.color}`}>{s.val}</div>
                                <div className="text-[7px] text-muted">{s.label}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Secondary row */}
                        {conn.secondaryT2 && (
                          <div className="rounded-md border border-sky-500/25 bg-sky-500/6 px-3 py-2">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[10px] font-bold text-text">{conn.secondaryT2}</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">10% secondary</span>
                            </div>
                            <div className="grid grid-cols-3 gap-1 text-center">
                              {[
                                { label: 'Target', val: `~${recSec}G`,            color: 'text-text' },
                                { label: 'Actual', val: `${currentOnSecondary}G`, color: 'text-text' },
                                { label: currentOnSecondary > recSec ? 'Excess' : 'Gap', val: currentOnSecondary > recSec ? `${currentOnSecondary - recSec}G↑` : currentOnSecondary < recSec ? `${recSec - currentOnSecondary}G↓` : '✓', color: currentOnSecondary > recSec ? 'text-yellow-400' : currentOnSecondary < recSec ? 'text-sky-400' : 'text-green-400' },
                              ].map(s => (
                                <div key={s.label} className="rounded bg-border/20 py-1">
                                  <div className={`text-[12px] font-black ${s.color}`}>{s.val}</div>
                                  <div className="text-[7px] text-muted">{s.label}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Off-plan excess */}
                        {excessLinks.length > 0 && (
                          <div className="rounded-md border border-red-500/30 bg-red-500/6 px-3 py-2">
                            <div className="flex justify-between items-center mb-1.5">
                              <span className="text-[10px] font-bold text-red-400">Off-plan traffic</span>
                              <span className="text-[11px] font-black text-red-400 font-mono">{excessGbps}G</span>
                            </div>
                            {excessLinks.map((l, i) => (
                              <div key={i} className="flex justify-between text-[10px]">
                                <span className="text-text font-mono">{l.target}</span>
                                <span className="text-red-400 font-bold">{l.traffic}G — remove from plan</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                );
              }

              /* ── T2 Traffic Analysis ── */
              if (nodeDetail.type === 'T2') {
                const { conn, actualOut, actualIn } = nodeDetail;
                const totalIn    = actualIn.reduce((s, l) => s + l.traffic, 0);
                const maxIn      = Math.max(totalIn, 1);
                const currentOnIdealT1 = actualOut.find(l => l.target === conn.idealT1)?.traffic ?? 0;
                const excessLinks = actualOut.filter(l => l.target !== conn.idealT1 && l.target !== conn.secondaryT1);
                const excessGbps  = excessLinks.reduce((s, l) => s + l.traffic, 0);
                const t1Gap = Math.max(0, conn.t1Traffic - currentOnIdealT1);
                return (
                  <div className="p-4 flex flex-col gap-4">

                    {/* Total traffic */}
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Total in',   val: `${totalIn || conn.totalTraffic}G`, color: 'text-text' },
                        { label: 'Local (90%)', val: `${conn.localTraffic}G`,            color: 'text-violet-400' },
                        { label: 'T1 (10%)',    val: `${conn.t1Traffic}G`,               color: 'text-pink-400' },
                      ].map(s => (
                        <div key={s.label} className="rounded-md bg-border/20 px-2 py-2 text-center">
                          <div className={`text-[15px] font-black ${s.color}`}>{s.val}</div>
                          <div className="text-[7px] text-muted">{s.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Incoming T3 links */}
                    {actualIn.length > 0 && (
                      <div>
                        <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">Incoming from T3 cities</div>
                        <div className="flex flex-col gap-1">
                          {actualIn.map((l, i) => (
                            <div key={i}>
                              <div className="flex justify-between text-[10px] mb-0.5">
                                <span className="text-text font-mono">{l.source}</span>
                                <span className="font-bold text-text">{l.traffic}G <span className="text-muted font-normal">({Math.round(l.traffic / maxIn * 100)}%)</span></span>
                              </div>
                              <TrafficBar value={l.traffic} max={maxIn} color="#8b5cf6" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* T1 egress plan vs actual */}
                    <div>
                      <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">T1 egress (10%) — plan vs actual</div>
                      <div className="flex flex-col gap-1.5">

                        <div className={`rounded-md border px-3 py-2 ${conn.optimal ? 'border-green-500/30 bg-green-500/6' : 'border-orange-500/30 bg-orange-500/6'}`}>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] font-bold text-text">{conn.idealT1}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-600/40 text-slate-300">primary T1</span>
                          </div>
                          <div className="grid grid-cols-3 gap-1 text-center">
                            {[
                              { label: 'Target',  val: `${conn.t1Traffic}G`,         color: 'text-text' },
                              { label: 'Actual',  val: `${currentOnIdealT1}G`,        color: currentOnIdealT1 >= conn.t1Traffic ? 'text-green-400' : 'text-orange-400' },
                              { label: t1Gap > 0 ? 'Gap' : 'Status', val: t1Gap > 0 ? `+${t1Gap}G` : '✓', color: t1Gap > 0 ? 'text-orange-400' : 'text-green-400' },
                            ].map(s => (
                              <div key={s.label} className="rounded bg-border/20 py-1">
                                <div className={`text-[12px] font-black ${s.color}`}>{s.val}</div>
                                <div className="text-[7px] text-muted">{s.label}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {excessLinks.length > 0 && (
                          <div className="rounded-md border border-red-500/30 bg-red-500/6 px-3 py-2">
                            <div className="flex justify-between items-center mb-1.5">
                              <span className="text-[10px] font-bold text-red-400">Off-plan T1 traffic</span>
                              <span className="text-[11px] font-black text-red-400 font-mono">{excessGbps}G</span>
                            </div>
                            {excessLinks.map((l, i) => (
                              <div key={i} className="flex justify-between text-[10px]">
                                <span className="text-text font-mono">{l.target}</span>
                                <span className="text-red-400 font-bold">{l.traffic}G — not in plan</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                );
              }

              /* ── T1 Traffic Analysis ── */
              if (nodeDetail.type === 'T1') {
                const { actualIn, t2Primary, t2Secondary } = nodeDetail;
                const totalActualIn = actualIn.reduce((s, l) => s + l.traffic, 0);
                const totalExpected = t2Primary.reduce((s, c) => s + c.t1Traffic, 0);
                const maxIn = Math.max(totalActualIn, 1);

                // Match each actual sender against the plan
                const senderRows = actualIn.map(l => {
                  const planHub = t2Primary.find(c => c.t2 === l.source) ?? t2Secondary.find(c => c.t2 === l.source);
                  const expected = planHub ? planHub.t1Traffic : 0;
                  const inPlan   = !!planHub;
                  const excess   = l.traffic - expected;
                  return { ...l, expected, inPlan, excess };
                });

                const offPlanIn  = senderRows.filter(r => !r.inPlan).reduce((s, r) => s + r.traffic, 0);
                const excessIn   = senderRows.filter(r => r.inPlan && r.excess > 0).reduce((s, r) => s + r.excess, 0);
                const deficitIn  = t2Primary.filter(c => !actualIn.find(l => l.source === c.t2))
                                            .reduce((s, c) => s + c.t1Traffic, 0);

                return (
                  <div className="p-4 flex flex-col gap-4">

                    {/* Totals */}
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Actual incoming',   val: `${totalActualIn}G`,  color: 'text-text' },
                        { label: 'Plan expected',      val: `${totalExpected}G`,  color: 'text-pink-400' },
                        { label: 'Off-plan traffic',   val: offPlanIn > 0 ? `${offPlanIn}G` : 'None',  color: offPlanIn > 0 ? 'text-red-400' : 'text-green-400' },
                        { label: 'Missing from plan',  val: deficitIn > 0 ? `${deficitIn}G` : 'None',  color: deficitIn > 0 ? 'text-orange-400' : 'text-green-400' },
                      ].map(s => (
                        <div key={s.label} className="rounded-md bg-border/20 px-2 py-2 text-center">
                          <div className={`text-[14px] font-black ${s.color}`}>{s.val}</div>
                          <div className="text-[7px] text-muted">{s.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Per-sender plan vs actual */}
                    <div>
                      <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">Sender breakdown</div>
                      <div className="flex flex-col gap-1.5">
                        {senderRows.map((r, i) => (
                          <div key={i} className={`rounded-md border px-2.5 py-2 cursor-pointer hover:brightness-110 ${
                            !r.inPlan ? 'border-red-500/30 bg-red-500/6' : r.excess > 0 ? 'border-yellow-500/30 bg-yellow-500/6' : 'border-border bg-border/10'
                          }`} onClick={() => setHighlightNode(r.source)}>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[10px] font-bold text-text">{r.source}</span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                                !r.inPlan ? 'bg-red-500/20 text-red-400' : r.excess > 0 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'
                              }`}>
                                {!r.inPlan ? 'off-plan' : r.excess > 0 ? `+${r.excess}G excess` : '✓ on-plan'}
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-1 text-center">
                              {[
                                { label: 'Expected', val: r.inPlan ? `${r.expected}G` : '0G',  color: 'text-muted' },
                                { label: 'Actual',   val: `${r.traffic}G`,                       color: 'text-text' },
                                { label: r.excess > 0 ? 'Excess' : 'Gap', val: r.excess > 0 ? `+${r.excess}G` : r.excess < 0 ? `${Math.abs(r.excess)}G` : '✓', color: r.excess > 0 ? 'text-yellow-400' : r.excess < 0 ? 'text-orange-400' : 'text-green-400' },
                              ].map(s => (
                                <div key={s.label} className="rounded bg-border/20 py-1">
                                  <div className={`text-[11px] font-black ${s.color}`}>{s.val}</div>
                                  <div className="text-[7px] text-muted">{s.label}</div>
                                </div>
                              ))}
                            </div>
                            <TrafficBar value={r.traffic} max={maxIn} color={!r.inPlan ? '#f87171' : r.excess > 0 ? '#fbbf24' : '#4ade80'} />
                          </div>
                        ))}
                        {/* T2 hubs in plan but not sending */}
                        {t2Primary.filter(c => !actualIn.find(l => l.source === c.t2)).map((c, i) => (
                          <div key={`missing-${i}`}
                            className="rounded-md border border-orange-500/25 bg-orange-500/6 px-2.5 py-2 cursor-pointer hover:brightness-110"
                            onClick={() => setHighlightNode(c.t2)}>
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-bold text-text">{c.t2}</span>
                              <span className="text-[9px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded">missing — {c.t1Traffic}G expected</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                );
              }

              return null;
            })()}

            {/* ══ ROUTING DETAIL TAB (existing content) ══ */}
            {nodeTab === 'routing' && <>

              {/* ── T3 City detail ── */}
              {nodeDetail.type === 'T3' && (() => {
                const { conn, actualOut } = nodeDetail;
                const maxT = Math.max(...actualOut.map(l => l.traffic), 1);
                const isPrimaryMatch = conn.optimal;
                return (
                  <div className="p-4 flex flex-col gap-4">

                    {/* Status badge */}
                    <div className={`rounded-lg px-3 py-2 border flex items-center gap-2 ${isPrimaryMatch ? 'bg-green-500/10 border-green-500/25' : 'bg-orange-500/10 border-orange-500/25'}`}>
                      <span className={`text-lg ${isPrimaryMatch ? 'text-green-400' : 'text-orange-400'}`}>{isPrimaryMatch ? '✓' : '✗'}</span>
                      <div>
                        <div className={`text-[11px] font-bold ${isPrimaryMatch ? 'text-green-400' : 'text-orange-400'}`}>
                          {isPrimaryMatch ? 'Primary route is optimal' : 'Primary route needs update'}
                        </div>
                        <div className="text-[9px] text-muted mt-0.5">
                          {isPrimaryMatch ? 'Connected to nearest T2 hub' : `Should connect to ${conn.idealT2}`}
                        </div>
                      </div>
                    </div>

                    {/* Actual routing */}
                    <div>
                      <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Actual Routing</div>
                      {actualOut.length === 0 ? (
                        <div className="text-[11px] text-muted italic">No actual links recorded</div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {actualOut.map((l, i) => (
                            <div key={i} className={`rounded-md border px-3 py-2 ${i === 0 ? 'border-slate-500/40 bg-slate-500/10' : 'border-orange-500/30 bg-orange-500/5'}`}>
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-1.5">
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${i === 0 ? 'bg-slate-500/30 text-slate-300' : 'bg-orange-500/20 text-orange-400'}`}>
                                    {i === 0 ? 'PRIMARY' : 'REROUTED'}
                                  </span>
                                  <span className="text-[12px] font-semibold text-text">{l.target}</span>
                                </div>
                                <span className="text-[12px] font-bold text-text font-mono">{l.traffic} G</span>
                              </div>
                              <TrafficBar value={l.traffic} max={maxT} color={i === 0 ? '#64748b' : '#f97316'} />
                              <div className="text-[9px] text-muted mt-1">{l.targetTier} node</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Recommended routing */}
                    <div>
                      <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Recommended Routing</div>
                      <div className="flex flex-col gap-1.5">
                        {/* Primary */}
                        <div className={`rounded-md border px-3 py-2.5 ${conn.optimal ? 'border-green-500/35 bg-green-500/8' : 'border-orange-500/35 bg-orange-500/8'}`}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-600/40 text-slate-300">90% PRIMARY</span>
                              {conn.optimal
                                ? <span className="text-[9px] text-green-400">✓ current</span>
                                : <span className="text-[9px] text-orange-400">✗ change needed</span>}
                            </div>
                            <span className="text-[11px] text-cyan-400 font-mono">{conn.distKm} km</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[13px] font-bold text-text">{conn.idealT2}</span>
                            {conn.actualTraffic > 0 && (
                              <span className="text-[14px] font-black text-text font-mono">
                                {Math.round(conn.actualTraffic * 0.9)}G
                              </span>
                            )}
                          </div>
                          {conn.actualTraffic > 0 && (
                            <>
                              <TrafficBar value={Math.round(conn.actualTraffic * 0.9)} max={conn.actualTraffic} color={conn.optimal ? '#4ade80' : '#fb923c'} />
                              {!conn.optimal && (
                                <div className="mt-1.5 flex flex-col gap-0.5">
                                  <div className="flex justify-between text-[9px]">
                                    <span className="text-muted">Already on this hub</span>
                                    <span className="font-mono font-bold text-text">{conn.flowToIdealT2}G</span>
                                  </div>
                                  <div className="flex justify-between text-[9px]">
                                    <span className="text-muted">Target (90% of {conn.actualTraffic}G)</span>
                                    <span className="font-mono font-bold text-text">{Math.round(conn.actualTraffic * 0.9)}G</span>
                                  </div>
                                  {conn.topupNeeded > 0 && (
                                    <div className="flex justify-between text-[9px]">
                                      <span className="text-orange-400 font-semibold">Capacity gap to add</span>
                                      <span className="font-mono font-black text-orange-400">+{conn.topupNeeded}G</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                          {!conn.optimal && conn.currentT2 && (
                            <div className="text-[9px] text-muted mt-1">
                              Currently primary via: <span className="text-orange-400 font-mono">{conn.currentT2}</span>
                            </div>
                          )}
                        </div>

                        {/* Secondary */}
                        {conn.secondaryT2 && (() => {
                          const currentToSec = actualOut.find(l => l.target === conn.secondaryT2)?.traffic ?? 0;
                          const recommended  = conn.actualTraffic > 0 ? Math.round(conn.actualTraffic * 0.1) : 0;
                          const delta        = recommended - currentToSec;
                          const maxBar       = Math.max(conn.actualTraffic, 1);
                          return (
                            <div className="rounded-md border border-sky-500/25 bg-sky-500/5 px-3 py-2.5">
                              {/* Header row */}
                              <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">10% SECONDARY</span>
                                  <span className="text-[9px] text-sky-400">backup path</span>
                                </div>
                                <span className="text-[11px] text-cyan-400 font-mono">{conn.secondaryDistKm} km</span>
                              </div>

                              {/* Hub name + recommended Gbps */}
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[13px] font-bold text-text">{conn.secondaryT2}</span>
                                {recommended > 0 && (
                                  <span className="text-[14px] font-black text-sky-300 font-mono">~{recommended}G</span>
                                )}
                              </div>

                              {/* Recommended 10% bar */}
                              {recommended > 0 && (
                                <TrafficBar value={recommended} max={maxBar} color="#38bdf8" />
                              )}

                              {/* Current vs recommended comparison */}
                              <div className="mt-2 border-t border-sky-500/15 pt-2 flex flex-col gap-1">
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="text-muted">Currently flowing here</span>
                                  <span className={`font-mono font-bold ${currentToSec > 0 ? 'text-text' : 'text-muted/60'}`}>
                                    {currentToSec > 0 ? `${currentToSec}G` : '0G'}
                                  </span>
                                </div>
                                {currentToSec > 0 && (
                                  <TrafficBar value={currentToSec} max={maxBar} color="#64748b" />
                                )}
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="text-muted">Target (10%)</span>
                                  <span className="text-sky-300 font-mono font-bold">~{recommended}G</span>
                                </div>
                                {recommended > 0 && (
                                  <div className="flex items-center justify-between text-[10px] mt-0.5">
                                    <span className="text-muted">
                                      {delta > 0 ? 'Capacity to add' : delta < 0 ? 'Excess vs target' : 'Exactly on target'}
                                    </span>
                                    <span className={`font-mono font-bold ${delta > 0 ? 'text-orange-400' : delta < 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                                      {delta > 0 ? `+${delta}G` : delta < 0 ? `${Math.abs(delta)}G over` : '✓'}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {conn.actualTraffic > 0 && (
                      <div className="rounded-lg bg-border/20 px-3 py-2 text-[11px] flex justify-between">
                        <span className="text-muted">Total actual traffic</span>
                        <span className="text-text font-bold font-mono">{conn.actualTraffic} Gbps</span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── T2 Hub detail ── */}
              {nodeDetail.type === 'T2' && (() => {
                const { conn, actualOut, actualIn, t3Primary, t3Secondary } = nodeDetail;
                const maxOut = Math.max(...actualOut.map(l => l.traffic), 1);
                const maxIn  = Math.max(...actualIn.map(l => l.traffic), 1);
                return (
                  <div className="p-4 flex flex-col gap-4">

                    {/* Status */}
                    <div className={`rounded-lg px-3 py-2 border flex items-center gap-2 ${conn.optimal ? 'bg-green-500/10 border-green-500/25' : 'bg-orange-500/10 border-orange-500/25'}`}>
                      <span className={`text-lg ${conn.optimal ? 'text-green-400' : 'text-orange-400'}`}>{conn.optimal ? '✓' : '✗'}</span>
                      <div>
                        <div className={`text-[11px] font-bold ${conn.optimal ? 'text-green-400' : 'text-orange-400'}`}>
                          {conn.optimal ? 'T1 route is optimal' : 'T1 route needs update'}
                        </div>
                        <div className="text-[9px] text-muted mt-0.5">
                          {conn.optimal ? `Correctly routed to ${conn.idealT1}` : `Should route to ${conn.idealT1}`}
                        </div>
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Total Traffic', val: `${conn.totalTraffic}G`, color: 'text-text' },
                        { label: 'T3 Primary', val: `${conn.t3PrimaryCount}`, color: 'text-violet-400' },
                        { label: 'T3 Secondary', val: `${conn.t3SecondaryCount}`, color: 'text-sky-400' },
                      ].map(s => (
                        <div key={s.label} className="rounded-md bg-border/20 px-2 py-2 text-center">
                          <div className={`text-[16px] font-black ${s.color}`}>{s.val}</div>
                          <div className="text-[8px] text-muted">{s.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Actual incoming */}
                    {actualIn.length > 0 && (
                      <div>
                        <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">Actual Incoming (from T3)</div>
                        <div className="flex flex-col gap-1">
                          {actualIn.map((l, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="text-[10px] text-text flex-1 truncate">{l.source}</span>
                              <TrafficBar value={l.traffic} max={maxIn} color="#8b5cf6" />
                              <span className="text-[10px] font-mono text-text w-10 text-right flex-shrink-0">{l.traffic}G</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actual outgoing to T1 */}
                    {actualOut.length > 0 && (
                      <div>
                        <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">Actual Outgoing (to T1)</div>
                        <div className="flex flex-col gap-1.5">
                          {actualOut.map((l, i) => (
                            <div key={i} className={`rounded-md border px-3 py-1.5 ${i === 0 ? 'border-slate-500/40 bg-slate-500/10' : 'border-orange-500/30 bg-orange-500/5'}`}>
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-1.5">
                                  <span className={`text-[9px] font-bold px-1.5 rounded ${i === 0 ? 'bg-slate-500/30 text-slate-300' : 'bg-orange-500/20 text-orange-400'}`}>
                                    {i === 0 ? 'PRIMARY' : 'REROUTED'}
                                  </span>
                                  <span className="text-[11px] font-semibold text-text">{l.target}</span>
                                </div>
                                <span className="text-[11px] font-bold font-mono text-text">{l.traffic}G</span>
                              </div>
                              <TrafficBar value={l.traffic} max={maxOut} color={i === 0 ? '#64748b' : '#f97316'} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Recommended T1 routing — T2 handles 90% locally, 10% egresses to T1 */}
                    <div>
                      <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">Recommended Traffic Split</div>
                      <div className="flex flex-col gap-1.5">

                        {/* Local 90% */}
                        <div className="rounded-md border border-violet-500/30 bg-violet-500/8 px-3 py-2.5">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-600/40 text-violet-200">90% LOCAL</span>
                            <span className="text-[9px] text-violet-400">served by this hub</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-[12px] text-violet-300">{conn.t2} (self)</span>
                            {conn.localTraffic > 0 && (
                              <span className="text-[14px] font-black text-violet-200 font-mono">{conn.localTraffic}G</span>
                            )}
                          </div>
                          {conn.totalTraffic > 0 && (
                            <TrafficBar value={conn.localTraffic} max={conn.totalTraffic} color="#8b5cf6" />
                          )}
                        </div>

                        {/* T1 egress 10% primary */}
                        <div className={`rounded-md border px-3 py-2.5 ${conn.optimal ? 'border-green-500/35 bg-green-500/8' : 'border-orange-500/35 bg-orange-500/8'}`}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-600/40 text-slate-300">10% → T1 PRIMARY</span>
                              {conn.optimal ? <span className="text-[9px] text-green-400">✓ optimal</span> : <span className="text-[9px] text-orange-400">✗ update needed</span>}
                            </div>
                            <span className="text-[11px] text-cyan-400 font-mono">{conn.distKm} km</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-[13px] font-bold text-text">{conn.idealT1}</span>
                            {conn.t1Traffic > 0 && (
                              <span className="text-[14px] font-black text-text font-mono">{conn.t1Traffic}G</span>
                            )}
                          </div>
                          {conn.totalTraffic > 0 && (
                            <TrafficBar value={conn.t1Traffic} max={conn.totalTraffic} color={conn.optimal ? '#4ade80' : '#fb923c'} />
                          )}
                          {!conn.optimal && conn.t1Traffic > 0 && (
                            <div className="text-[9px] text-orange-400 mt-1 font-semibold">+{conn.t1Traffic}G top-up needed on this path</div>
                          )}
                          {!conn.optimal && conn.currentT1 && (
                            <div className="text-[9px] text-muted mt-0.5">Currently: <span className="text-orange-400 font-mono">{conn.currentT1}</span></div>
                          )}
                        </div>

                        {/* T1 egress 10% secondary (backup) */}
                        {conn.secondaryT1 && (
                          <div className="rounded-md border border-sky-500/25 bg-sky-500/5 px-3 py-2.5">
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">10% → T1 SECONDARY</span>
                                <span className="text-[9px] text-sky-400">failover</span>
                              </div>
                              <span className="text-[11px] text-cyan-400 font-mono">{conn.secondaryDistKm} km</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-[13px] font-bold text-text">{conn.secondaryT1}</span>
                              {conn.t1Traffic > 0 && (
                                <span className="text-[14px] font-black text-sky-300 font-mono">{conn.t1Traffic}G</span>
                              )}
                            </div>
                            {conn.totalTraffic > 0 && (
                              <TrafficBar value={conn.t1Traffic} max={conn.totalTraffic} color="#38bdf8" />
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* T3 city feeds */}
                    {(t3Primary.length > 0 || t3Secondary.length > 0) && (() => {
                      const maxPrimary = Math.max(...t3Primary.map(c => c.actualTraffic), 1);
                      const maxSecondary = Math.max(...t3Secondary.map(c => c.actualTraffic), 1);
                      return (
                        <div>
                          <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">Recommended T3 Feeders</div>

                          {t3Primary.length > 0 && (
                            <div className="mb-2">
                              <div className="text-[9px] font-semibold text-slate-400 mb-1 flex justify-between">
                                <span>Primary (90% path) — {t3Primary.length} cities</span>
                                <span className="font-mono">{t3Primary.reduce((s, c) => s + Math.round(c.actualTraffic * 0.9), 0)}G total</span>
                              </div>
                              <div className="flex flex-col gap-1">
                                {t3Primary.map(c => (
                                  <div key={c.t3}
                                    className={`rounded border px-2 py-1.5 cursor-pointer hover:brightness-110 transition-all ${c.optimal ? 'border-green-500/25 bg-green-500/5' : 'border-orange-500/25 bg-orange-500/5'}`}
                                    onClick={() => setHighlightNode(c.t3)}>
                                    <div className="flex items-center justify-between mb-1">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span className={`text-[8px] flex-shrink-0 ${c.optimal ? 'text-green-400' : 'text-orange-400'}`}>{c.optimal ? '✓' : '✗'}</span>
                                        <span className="text-[11px] font-semibold text-text truncate">{c.t3}</span>
                                      </div>
                                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                        <span className="text-[10px] text-muted font-mono">{c.distKm}km</span>
                                        {c.actualTraffic > 0 && (
                                          <span className={`text-[11px] font-bold font-mono ${c.optimal ? 'text-green-400' : 'text-orange-400'}`}>
                                            {Math.round(c.actualTraffic * 0.9)}G
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    {c.actualTraffic > 0 && (
                                      <TrafficBar value={c.actualTraffic} max={maxPrimary} color={c.optimal ? '#4ade80' : '#fb923c'} />
                                    )}
                                    {!c.optimal && c.actualTraffic > 0 && (
                                      <div className="text-[8px] text-orange-400/80 mt-0.5">+{c.actualTraffic}G top-up needed</div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {t3Secondary.length > 0 && (
                            <div>
                              <div className="text-[9px] font-semibold text-sky-400 mb-1 flex justify-between">
                                <span>Secondary (10% backup) — {t3Secondary.length} cities</span>
                                <span className="font-mono">~{t3Secondary.reduce((s, c) => s + Math.round(c.actualTraffic * 0.1), 0)}G total</span>
                              </div>
                              <div className="flex flex-col gap-1">
                                {t3Secondary.map(c => (
                                  <div key={c.t3}
                                    className="rounded border border-sky-500/20 bg-sky-500/5 px-2 py-1.5 cursor-pointer hover:brightness-110 transition-all"
                                    onClick={() => setHighlightNode(c.t3)}>
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-[11px] font-semibold text-text truncate">{c.t3}</span>
                                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                        <span className="text-[10px] text-muted font-mono">{c.secondaryDistKm}km</span>
                                        {c.actualTraffic > 0 && (
                                          <span className="text-[11px] font-bold text-sky-300 font-mono">~{Math.round(c.actualTraffic * 0.1)}G</span>
                                        )}
                                      </div>
                                    </div>
                                    {c.actualTraffic > 0 && (
                                      <TrafficBar value={Math.round(c.actualTraffic * 0.1)} max={maxSecondary * 0.1 || 1} color="#38bdf8" />
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}

              {/* ── T1 DC detail ── */}
              {nodeDetail.type === 'T1' && (() => {
                const { actualIn, t2Primary, t2Secondary } = nodeDetail;
                const maxIn = Math.max(...actualIn.map(l => l.traffic), 1);
                const totalActualIn = actualIn.reduce((s, l) => s + l.traffic, 0);
                const totalRecommendedIn = t2Primary.reduce((s, c) => s + c.t1Traffic, 0);
                return (
                  <div className="p-4 flex flex-col gap-4">

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Actual Incoming', val: `${totalActualIn}G`, color: 'text-text' },
                        { label: 'Recommended In', val: `${totalRecommendedIn}G`, color: 'text-pink-400' },
                      ].map(s => (
                        <div key={s.label} className="rounded-md bg-border/20 px-3 py-2 text-center">
                          <div className={`text-[18px] font-black ${s.color}`}>{s.val}</div>
                          <div className="text-[9px] text-muted">{s.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Actual incoming */}
                    {actualIn.length > 0 && (
                      <div>
                        <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">Actual Senders</div>
                        <div className="flex flex-col gap-1">
                          {actualIn.map((l, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className={`text-[9px] w-14 flex-shrink-0 text-right font-mono ${i === 0 ? 'text-slate-300' : 'text-orange-400'}`}>
                                {i === 0 ? 'primary' : 'rerouted'}
                              </span>
                              <span className="text-[10px] text-text w-28 truncate flex-shrink-0">{l.source}</span>
                              <TrafficBar value={l.traffic} max={maxIn} color={i === 0 ? '#ec4899' : '#f97316'} />
                              <span className="text-[10px] font-mono text-text w-10 text-right flex-shrink-0">{l.traffic}G</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Recommended senders */}
                    {t2Primary.length > 0 && (
                      <div>
                        <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">Recommended Senders</div>
                        <div className="text-[9px] text-slate-400 mb-1">Primary (90% path):</div>
                        <div className="flex flex-col gap-1.5">
                          {t2Primary.map(c => (
                            <div key={c.t2}
                              className={`rounded-md border px-2.5 py-1.5 cursor-pointer hover:bg-border/10 ${c.optimal ? 'border-green-500/30 bg-green-500/5' : 'border-orange-500/30 bg-orange-500/5'}`}
                              onClick={() => setHighlightNode(c.t2)}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <span className={`text-[8px] ${c.optimal ? 'text-green-400' : 'text-orange-400'}`}>{c.optimal ? '✓' : '✗'}</span>
                                  <span className="text-[11px] font-semibold text-text">{c.t2}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {c.t1Traffic > 0 && <span className="text-[10px] font-mono text-text">{c.t1Traffic}G</span>}
                                  <span className="text-[9px] text-violet-400">{c.localTraffic}G local</span>
                                  <span className="text-[9px] text-cyan-400">{c.distKm}km</span>
                                </div>
                              </div>
                              {!c.optimal && c.currentT1 && (
                                <div className="text-[9px] text-muted mt-0.5 ml-3.5">
                                  Currently: <span className="text-orange-400 font-mono">{c.currentT1}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        {t2Secondary.length > 0 && (
                          <>
                            <div className="text-[9px] text-sky-400 mt-2 mb-1">Secondary (10% backup):</div>
                            <div className="flex flex-wrap gap-1">
                              {t2Secondary.map(c => (
                                <span key={c.t2}
                                  className="text-[9px] px-1.5 py-0.5 rounded border border-sky-500/25 bg-sky-500/8 text-sky-400 cursor-pointer"
                                  onClick={() => setHighlightNode(c.t2)}>
                                  {c.t2} · {c.secondaryDistKm}km
                                </span>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

            </>} {/* end nodeTab === 'routing' */}

            </div>

            <div className="px-4 py-1.5 border-t border-border text-[9px] text-muted flex-shrink-0">
              {nodeTab === 'routing' ? 'Click chips to navigate · Click node to deselect' : 'Click a sender row to navigate · Traffic vs plan breakdown'}
            </div>
          </>

        ) : (
          /* ══ TABBED PANEL (no node selected) ══ */
          <>
            {/* Tab bar */}
            <div className="flex border-b border-border flex-shrink-0">
              {(['recs', 'rules'] as const).map(tab => (
                <button key={tab} onClick={() => setRightTab(tab)}
                  className={`flex-1 py-2 text-[11px] font-semibold transition-colors ${
                    rightTab === tab
                      ? tab === 'recs' ? 'text-accent2 border-b-2 border-accent2 bg-accent2/8' : 'text-violet-400 border-b-2 border-violet-500 bg-violet-500/8'
                      : 'text-muted hover:text-text'
                  }`}>
                  {tab === 'recs' ? 'Recommendations' : 'Rules & Compare'}
                </button>
              ))}
            </div>

            {rightTab === 'rules' ? (
              /* ══ RULES & COMPARISON TAB ══ */
              <div className="flex-1 overflow-y-auto">

                {/* ── Routing Algorithm Rules ── */}
                <div className="px-4 py-3 border-b border-border/60">
                  <div className="text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-2">Routing Algorithm</div>

                  {[
                    {
                      step: '1', title: 'T3 City → T2 Hub assignment', color: '#3b82f6',
                      rules: [
                        'Compute haversine distance from every T3 city to every T2 hub in the circle',
                        'Nearest T2 hub → PRIMARY path (carries 90% of city traffic)',
                        'Second nearest T2 hub → SECONDARY path (carries 10%, backup/redundancy)',
                        'If current routing matches nearest hub → mark OPTIMAL (green), else REROUTE NEEDED (orange)',
                      ],
                    },
                    {
                      step: '2', title: 'T2 Hub — traffic split', color: '#8b5cf6',
                      rules: [
                        'T2 hub receives all incoming T3 traffic',
                        '90% is served locally by the T2 hub (no T1 dependency)',
                        '10% egresses upward to a T1 datacenter',
                        'This keeps T1 datacenters lightly loaded and reduces long-haul traffic',
                      ],
                    },
                    {
                      step: '3', title: 'T2 Hub → T1 Datacenter assignment', color: '#ec4899',
                      rules: [
                        'Compute haversine distance from T2 hub to all 8 T1 datacenters',
                        'Nearest T1 DC → PRIMARY path (receives the 10% egress)',
                        'Second nearest T1 DC → SECONDARY failover path',
                        'If current T1 routing matches nearest DC → mark OPTIMAL, else REROUTE NEEDED',
                      ],
                    },
                  ].map(({ step, title, color, rules }) => (
                    <div key={step} className="mb-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white flex-shrink-0" style={{ background: color }}>
                          {step}
                        </span>
                        <span className="text-[11px] font-bold text-text">{title}</span>
                      </div>
                      <ul className="ml-7 flex flex-col gap-0.5">
                        {rules.map((r, i) => (
                          <li key={i} className="text-[10px] text-muted flex gap-1.5">
                            <span className="text-muted/50 flex-shrink-0">·</span>
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                {/* ── Data Verification ── */}
                <div className="px-4 py-3 border-b border-border/60">
                  <div className="text-[10px] font-bold text-green-400 uppercase tracking-wider mb-2">Data Verification — {selectedCircle}</div>
                  <div className="grid grid-cols-2 gap-1.5 mb-2">
                    {[
                      { label: 'T3 cities total',    val: ideal.t3Conns.length,                                      color: '#3b82f6' },
                      { label: 'T3 optimal routes',  val: `${ideal.optCount} (${ideal.t3Conns.length ? Math.round(ideal.optCount / ideal.t3Conns.length * 100) : 0}%)`, color: '#4ade80' },
                      { label: 'T3 need reroute',    val: ideal.rerouteCount,                                        color: '#fb923c' },
                      { label: 'T2 hubs total',      val: ideal.t2Conns.length,                                      color: '#8b5cf6' },
                      { label: 'T2 optimal → T1',   val: ideal.t2Conns.filter(c => c.optimal).length,               color: '#4ade80' },
                      { label: 'T2 need reroute',    val: ideal.t2Conns.filter(c => !c.optimal).length,             color: '#fb923c' },
                    ].map(s => (
                      <div key={s.label} className="rounded bg-border/20 px-2 py-1 flex justify-between items-center">
                        <span className="text-[9px] text-muted">{s.label}</span>
                        <span className="text-[11px] font-bold font-mono" style={{ color: s.color }}>{s.val}</span>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { label: 'T3 total',  val: `${ideal.totalCurrentTraffic}G`, color: '#94a3b8' },
                      { label: 'T2 local',  val: `${ideal.totalT2Local}G`,        color: '#8b5cf6' },
                      { label: 'T1 egress', val: `${ideal.totalToT1}G`,           color: '#ec4899' },
                    ].map(s => (
                      <div key={s.label} className="rounded bg-border/20 px-2 py-1.5 text-center">
                        <div className="text-[13px] font-black" style={{ color: s.color }}>{s.val}</div>
                        <div className="text-[8px] text-muted">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── T3 Actual vs Recommended ── */}
                <div className="px-4 py-3 border-b border-border/60">
                  <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-2">
                    T3 Cities — Actual vs Recommended
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {[...ideal.t3Conns]
                      .sort((a, b) => (a.optimal ? 1 : 0) - (b.optimal ? 1 : 0) || b.actualTraffic - a.actualTraffic)
                      .map(c => (
                        <div key={c.t3}
                          className={`rounded-md border px-2.5 py-2 cursor-pointer hover:brightness-110 ${c.optimal ? 'border-green-500/25 bg-green-500/5' : 'border-orange-500/30 bg-orange-500/5'}`}
                          onClick={() => setHighlightNode(c.t3)}>
                          {/* City name + status */}
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] font-bold ${c.optimal ? 'text-green-400' : 'text-orange-400'}`}>{c.optimal ? '✓' : '✗'}</span>
                              <span className="text-[11px] font-bold text-text">{c.t3}</span>
                            </div>
                            {c.actualTraffic > 0 && (
                              <span className="text-[10px] text-muted font-mono">{c.actualTraffic}G total</span>
                            )}
                          </div>
                          {/* Actual row */}
                          <div className="flex items-start gap-1 text-[9px] mb-1">
                            <span className="text-muted w-12 flex-shrink-0 pt-0.5">Actual</span>
                            <div className="flex-1">
                              <span className={c.optimal ? 'text-green-300' : 'text-orange-300'} style={{ fontFamily: 'monospace' }}>
                                {c.currentT2 ?? '(none)'}
                              </span>
                              {c.actualTraffic > 0 && (
                                <span className="text-muted ml-1">· {c.actualTraffic}G</span>
                              )}
                            </div>
                          </div>
                          {/* Recommended primary row */}
                          <div className="flex items-start gap-1 text-[9px] mb-0.5">
                            <span className="text-muted w-12 flex-shrink-0 pt-0.5">90% →</span>
                            <div className="flex-1">
                              <span className="text-green-400 font-mono">{c.idealT2}</span>
                              <span className="text-muted ml-1">· {c.distKm}km</span>
                              {c.actualTraffic > 0 && (
                                <span className="text-green-400 ml-1 font-bold">· {Math.round(c.actualTraffic * 0.9)}G</span>
                              )}
                              {!c.optimal && c.topupNeeded > 0 && (
                                <span className="text-orange-400 ml-1">[+{c.topupNeeded}G gap]</span>
                              )}
                            </div>
                          </div>
                          {/* Recommended secondary row */}
                          {c.secondaryT2 && (
                            <div className="flex items-start gap-1 text-[9px]">
                              <span className="text-muted w-12 flex-shrink-0 pt-0.5">10% →</span>
                              <div className="flex-1">
                                <span className="text-sky-400 font-mono">{c.secondaryT2}</span>
                                <span className="text-muted ml-1">· {c.secondaryDistKm}km</span>
                                {c.actualTraffic > 0 && (
                                  <span className="text-sky-400 ml-1 font-bold">· ~{Math.round(c.actualTraffic * 0.1)}G</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </div>

                {/* ── T2 Actual vs Recommended ── */}
                <div className="px-4 py-3">
                  <div className="text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-2">
                    T2 Hubs — Actual vs Recommended
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {[...ideal.t2Conns]
                      .sort((a, b) => (a.optimal ? 1 : 0) - (b.optimal ? 1 : 0) || b.totalTraffic - a.totalTraffic)
                      .map(c => (
                        <div key={c.t2}
                          className={`rounded-md border px-2.5 py-2 cursor-pointer hover:brightness-110 ${c.optimal ? 'border-green-500/25 bg-green-500/5' : 'border-orange-500/30 bg-orange-500/5'}`}
                          onClick={() => setHighlightNode(c.t2)}>
                          {/* Hub name + status */}
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] font-bold ${c.optimal ? 'text-green-400' : 'text-orange-400'}`}>{c.optimal ? '✓' : '✗'}</span>
                              <span className="text-[11px] font-bold text-text">{c.t2}</span>
                            </div>
                            {c.totalTraffic > 0 && (
                              <span className="text-[10px] text-muted font-mono">{c.totalTraffic}G total</span>
                            )}
                          </div>
                          {/* Actual T1 row */}
                          <div className="flex items-start gap-1 text-[9px] mb-1">
                            <span className="text-muted w-16 flex-shrink-0 pt-0.5">Actual→T1</span>
                            <span className={`font-mono ${c.optimal ? 'text-green-300' : 'text-orange-300'}`}>
                              {c.currentT1 ?? '(none)'}
                            </span>
                          </div>
                          {/* Recommended local */}
                          <div className="flex items-start gap-1 text-[9px] mb-0.5">
                            <span className="text-muted w-16 flex-shrink-0 pt-0.5">90% local</span>
                            <div className="flex-1">
                              <span className="text-violet-400 font-mono">{c.t2} (self)</span>
                              {c.localTraffic > 0 && (
                                <span className="text-violet-300 ml-1 font-bold">· {c.localTraffic}G</span>
                              )}
                            </div>
                          </div>
                          {/* Recommended primary T1 */}
                          <div className="flex items-start gap-1 text-[9px] mb-0.5">
                            <span className="text-muted w-16 flex-shrink-0 pt-0.5">10% → T1</span>
                            <div className="flex-1">
                              <span className="text-green-400 font-mono">{c.idealT1}</span>
                              <span className="text-muted ml-1">· {c.distKm}km</span>
                              {c.t1Traffic > 0 && (
                                <span className="text-green-400 ml-1 font-bold">· {c.t1Traffic}G</span>
                              )}
                              {!c.optimal && c.t1Traffic > 0 && (
                                <span className="text-orange-400 ml-1">[+{c.t1Traffic}G top-up]</span>
                              )}
                            </div>
                          </div>
                          {/* Recommended secondary T1 */}
                          {c.secondaryT1 && (
                            <div className="flex items-start gap-1 text-[9px]">
                              <span className="text-muted w-16 flex-shrink-0 pt-0.5">T1 backup</span>
                              <div className="flex-1">
                                <span className="text-sky-400 font-mono">{c.secondaryT1}</span>
                                <span className="text-muted ml-1">· {c.secondaryDistKm}km</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              </div>

            ) : (
              /* ══ RECOMMENDATIONS TAB ══ */
              <>
                <div className="px-4 py-3 border-b border-border flex-shrink-0">
                  <div className="text-[13px] font-bold text-text">Capacity Top-up Needed</div>
                  <div className="text-[10px] text-muted mt-0.5">{selectedCircle} · click any node for details</div>
                  {(() => {
                    const excessT3Gbps = ideal.t3Conns.reduce((s, c) => {
                      const off = ideal.actualLinks.filter(l => l.source === c.t3 && l.sourceTier === 'T3' && l.target !== c.idealT2 && l.target !== c.secondaryT2);
                      return s + off.reduce((ss, l) => ss + l.traffic, 0);
                    }, 0);
                    const excessT2Gbps = ideal.t2Conns.reduce((s, c) => {
                      const off = ideal.actualLinks.filter(l => l.source === c.t2 && l.sourceTier === 'T2' && l.target !== c.idealT1 && l.target !== c.secondaryT1);
                      return s + off.reduce((ss, l) => ss + l.traffic, 0);
                    }, 0);
                    const totalExcess = excessT3Gbps + excessT2Gbps;
                    return (
                      <div className="mt-2 grid grid-cols-3 gap-1">
                        {[
                          { label: 'T3 total',      val: `${ideal.totalCurrentTraffic}G`, color: '#94a3b8' },
                          { label: 'T2 local 90%',  val: `${ideal.totalT2Local}G`,        color: '#8b5cf6' },
                          { label: 'T1 egress 10%', val: `${ideal.totalToT1}G`,           color: '#ec4899' },
                          { label: 'Top-up needed', val: `${ideal.topupT3Gbps + ideal.topupT2Gbps}G`, color: '#fb923c' },
                          { label: 'On optimal',    val: `${ideal.trafficOnOptimal}G`,    color: '#4ade80' },
                          { label: 'Excess off-plan',val: totalExcess > 0 ? `${totalExcess}G` : '0G', color: totalExcess > 0 ? '#f87171' : '#4ade80' },
                        ].map(s => (
                          <div key={s.label} className="rounded-md bg-border/30 px-2 py-1.5 text-center">
                            <div className="text-[13px] font-black leading-none" style={{ color: s.color }}>{s.val}</div>
                            <div className="text-[8px] text-muted mt-0.5">{s.label}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

            {ideal.topup.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 text-center px-6 gap-3">
                <div className="text-green-400 text-5xl">✓</div>
                <div className="text-[14px] font-bold text-green-400">All primary routes are optimal</div>
                <div className="text-[11px] text-muted leading-relaxed">
                  Every city in <strong>{selectedCircle}</strong> is connected to its nearest T2 hub and T1 datacenter.
                  Secondary (10%) backup paths are shown as dashed cyan lines.
                </div>
              </div>
            ) : (
              <>
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
                  {ideal.topup.filter(t => t.type === 'T3→T2').length > 0 && (
                    <>
                      <div className="px-4 py-1.5 bg-border/30 text-[10px] font-bold text-blue-400 uppercase tracking-wider sticky top-0 z-10">
                        T3 City → T2 Hub — Primary path (90%)
                      </div>
                      {ideal.topup.filter(t => t.type === 'T3→T2').map((item, i) => (
                        <div key={i}
                          className="px-4 py-2.5 border-b border-border/40 cursor-pointer transition-colors hover:bg-border/10"
                          onClick={() => setHighlightNode(item.city)}>
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

                  {ideal.topup.filter(t => t.type === 'T2→T1').length > 0 && (
                    <>
                      <div className="px-4 py-1.5 bg-border/30 text-[10px] font-bold text-purple-400 uppercase tracking-wider sticky top-0 z-10">
                        T2 Hub → T1 DC — Primary path (90%)
                      </div>
                      {ideal.topup.filter(t => t.type === 'T2→T1').map((item, i) => (
                        <div key={i}
                          className="px-4 py-2.5 border-b border-border/40 cursor-pointer transition-colors hover:bg-border/10"
                          onClick={() => setHighlightNode(item.city)}>
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

                  {ideal.t2Conns.filter(c => c.optimal).length > 0 && (
                    <>
                      <div className="px-4 py-1.5 bg-border/20 text-[10px] font-bold text-green-500 uppercase tracking-wider sticky top-0 z-10">
                        T2 → T1 Already Optimal
                      </div>
                      {ideal.t2Conns.filter(c => c.optimal).map((c, i) => (
                        <div key={i}
                          className="px-4 py-2 border-b border-border/30 flex items-center gap-2 cursor-pointer hover:bg-border/10"
                          onClick={() => setHighlightNode(c.t2)}>
                          <span className="text-green-400">✓</span>
                          <span className="text-[11px] text-text flex-1 truncate">{c.t2}</span>
                          <span className="text-[10px] text-green-400 font-mono">{c.idealT1}</span>
                          <span className="text-[10px] text-muted">{c.distKm}km</span>
                        </div>
                      ))}
                    </>
                  )}

                  {/* ── Excess Data ── */}
                  {(() => {
                    // T3 cities sending traffic to T2 hubs outside their recommended plan
                    const t3Excess = ideal.t3Conns.map(c => {
                      const links = ideal.actualLinks.filter(l => l.source === c.t3 && l.sourceTier === 'T3');
                      const offPlan = links.filter(l => l.target !== c.idealT2 && l.target !== c.secondaryT2);
                      return { ...c, offPlan, offGbps: offPlan.reduce((s, l) => s + l.traffic, 0) };
                    }).filter(d => d.offGbps > 0);

                    // T2 hubs sending traffic to T1 DCs outside their recommended plan
                    const t2Excess = ideal.t2Conns.map(c => {
                      const links = ideal.actualLinks.filter(l => l.source === c.t2 && l.sourceTier === 'T2');
                      const offPlan = links.filter(l => l.target !== c.idealT1 && l.target !== c.secondaryT1);
                      return { ...c, offPlan, offGbps: offPlan.reduce((s, l) => s + l.traffic, 0) };
                    }).filter(d => d.offGbps > 0);

                    const totalExcess = t3Excess.reduce((s, d) => s + d.offGbps, 0)
                                      + t2Excess.reduce((s, d) => s + d.offGbps, 0);

                    if (t3Excess.length === 0 && t2Excess.length === 0) return (
                      <div className="px-4 py-3 border-t border-border/40 flex items-center gap-2">
                        <span className="text-green-400 text-[12px]">✓</span>
                        <span className="text-[10px] text-green-400">No off-plan excess traffic detected</span>
                      </div>
                    );

                    return (
                      <>
                        <div className="px-4 py-1.5 bg-red-500/10 text-[10px] font-bold text-red-400 uppercase tracking-wider sticky top-0 z-10 flex justify-between">
                          <span>Excess Data — {t3Excess.length + t2Excess.length} nodes</span>
                          <span className="font-mono">{totalExcess}G off-plan</span>
                        </div>

                        {t3Excess.length > 0 && (
                          <>
                            <div className="px-4 pt-2 pb-1 text-[9px] font-bold text-blue-400 uppercase tracking-wider">
                              T3 Cities with off-plan routing
                            </div>
                            {t3Excess.map((d, i) => (
                              <div key={i}
                                className="px-4 py-2 border-b border-border/30 cursor-pointer hover:bg-red-500/5"
                                onClick={() => setHighlightNode(d.t3)}>
                                <div className="flex items-center justify-between mb-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                                    <span className="text-[12px] font-bold text-text">{d.t3}</span>
                                  </div>
                                  <span className="text-[11px] font-black text-red-400 font-mono">{d.offGbps}G excess</span>
                                </div>
                                <div className="text-[9px] text-muted mb-1">
                                  Plan: <span className="text-green-400 font-mono">{d.idealT2}</span> (90%)
                                  {d.secondaryT2 && <> + <span className="text-sky-400 font-mono">{d.secondaryT2}</span> (10%)</>}
                                </div>
                                {d.offPlan.map((l, j) => (
                                  <div key={j} className="flex items-center gap-1.5 text-[10px] py-0.5">
                                    <span className="text-red-400 flex-shrink-0">→</span>
                                    <span className="text-text font-mono flex-1 truncate">{l.target}</span>
                                    <span className="text-red-400 font-black font-mono flex-shrink-0">{l.traffic}G</span>
                                    <span className="text-muted text-[8px] flex-shrink-0">not in plan</span>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </>
                        )}

                        {t2Excess.length > 0 && (
                          <>
                            <div className="px-4 pt-2 pb-1 text-[9px] font-bold text-violet-400 uppercase tracking-wider">
                              T2 Hubs with off-plan T1 routing
                            </div>
                            {t2Excess.map((d, i) => (
                              <div key={i}
                                className="px-4 py-2 border-b border-border/30 cursor-pointer hover:bg-red-500/5"
                                onClick={() => setHighlightNode(d.t2)}>
                                <div className="flex items-center justify-between mb-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500 flex-shrink-0" />
                                    <span className="text-[12px] font-bold text-text">{d.t2}</span>
                                  </div>
                                  <span className="text-[11px] font-black text-red-400 font-mono">{d.offGbps}G excess</span>
                                </div>
                                <div className="text-[9px] text-muted mb-1">
                                  Plan: <span className="text-green-400 font-mono">{d.idealT1}</span> (primary)
                                  {d.secondaryT1 && <> + <span className="text-sky-400 font-mono">{d.secondaryT1}</span> (backup)</>}
                                </div>
                                {d.offPlan.map((l, j) => (
                                  <div key={j} className="flex items-center gap-1.5 text-[10px] py-0.5">
                                    <span className="text-red-400 flex-shrink-0">→</span>
                                    <span className="text-text font-mono flex-1 truncate">{l.target}</span>
                                    <span className="text-red-400 font-black font-mono flex-shrink-0">{l.traffic}G</span>
                                    <span className="text-muted text-[8px] flex-shrink-0">not in plan</span>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </>
                        )}
                      </>
                    );
                  })()}
                </div>

                <div className="px-4 py-1.5 border-t border-border text-[9px] text-muted flex-shrink-0">
                  Click any node or row to see actual vs recommended details
                </div>
              </>
            )}
            </> /* end recs tab */
            )} /* end rightTab ternary */
          </> /* end tabbed panel wrapper */
        )}
      </div>
    </div>
  );
}
