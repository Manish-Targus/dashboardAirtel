'use client';
import React, { useState, useMemo } from 'react';
import mobileNetFlowData from '@/data/mobileNetFlowData.json';
import mobileIdealFlowData from '@/data/mobileIdealFlowData.json';
import rawCityCoords from '@/data/cityCoords.json';
import IdealFlowView from './IdealFlowView';

const cityCoords = rawCityCoords as unknown as Record<string, [number, number]>;

const COORD_ALIASES: Record<string, [number, number]> = {
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
  'Kolkata':               [22.557, 88.364],
  'Manesar':               [28.367, 76.932],
  'Noida':                 [28.535, 77.391],
  'Noida81':               [28.527, 77.411],
  'Mumbai-Spectrum':       [19.100, 72.920],
  'Bhopal(GP)':            [23.260, 77.413],
  'HYDERABAD UPPAL':       [17.406, 78.559],
  'Chennai Serisuri':      [12.801, 80.222],
  'AGRA':                  [27.177, 78.008],
  'SATNA':                 [24.695, 80.777],
  'Sambalpur':             [21.557, 84.153],
  'Shillong':              [25.578, 91.883],
};

function getNodeCoords(name: string): [number, number] | null {
  if (COORD_ALIASES[name]) return COORD_ALIASES[name];
  const upper = name.toUpperCase();
  if (cityCoords[upper]) return cityCoords[upper];
  const norm = upper.replace(/[^A-Z0-9 ]/g, '').trim();
  if (cityCoords[norm]) return cityCoords[norm];
  return null;
}

function haversinKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

type LinkData = {
  source: string;
  target: string;
  sourceTier: string;
  targetTier: string;
  traffic: number;
  traffic95: number;
  isRerouted?: boolean;
  distKm?: number;
};

type NodeData = {
  id: string;
  tier: string;
  x: number;
  y: number;
};

const TIER_COLORS: Record<string, string> = {
  T3: '#3b82f6', // blue-500
  T2: '#8b5cf6', // violet-500
  T1: '#ec4899', // pink-500
};

// Canonical hub names exactly as listed in mobilehubs.xlsx
const XLSX_HUB_NAMES = new Set([
  'Hyderabad','Uppal','Vijayawada',
  'Bhagalpur','Patliputra','Ranchi',
  'Manesar','Noida','Noida81',
  'Ahmedabad','Rajkot','Surat',
  'Jammu','Ludhiana','Mohali','Srinagar',
  'Divyashree','Hosur Road','Mangalore','Whitefield',
  'Calicut','Pollachi',
  'Infinity2','Kharagpur',
  'E-Space','Nagpur','Pune',
  'Bhopal','Jabalpur','Raipur',
  '4D','Chandiwali','Spectrum',
  'Guwahati','Jorhat',
  'Bhubaneswar',
  'Jaipur','Jodhpur','Udaipur',
  'Ambala','Gangaganj','Gomtinagar','Varanasi',
  'Moradabad','Meerut',
  'Siliguri','Santhome','Siruseri','Andaman',
]);

// Maps flow data variant names → canonical xlsx hub names
const FLOW_TO_HUB_NAME: Record<string, string> = {
  'SRINAGAR':              'Srinagar',
  'Bhopal(GP)':            'Bhopal',
  'Bhuvaneswar':           'Bhubaneswar',
  'HYDERABAD UPPAL':       'Uppal',
  'Chennai Santhome':      'Santhome',
  'CHENNAI SANTHOME':      'Santhome',
  'Chennai Serisuri':      'Siruseri',
  'Chennai Serisuri-2':    'Siruseri',
  'Kharagpur (NEW)':       'Kharagpur',
  'Kharagpur (OLD)':       'Kharagpur',
  'Mumbai-Spectrum':       'Spectrum',
  'Mumbai Chandivali':     'Chandiwali',
  'Ahmedabad(Changodhar)': 'Ahmedabad',
  'Bangalore Hosur Road':  'Hosur Road',
  'Bangalore WFD':         'Whitefield',
  'Vijaywada':             'Vijayawada',
  'Pune(Espace)':          'E-Space',
  'Pune Epark':            'Pune',
  'Pune_vega(Old)':        'Pune',
  'Surat(Old)':            'Surat',
};

function resolveHubName(name: string): string | null {
  if (XLSX_HUB_NAMES.has(name)) return name;
  const mapped = FLOW_TO_HUB_NAME[name];
  return mapped && XLSX_HUB_NAMES.has(mapped) ? mapped : null;
}

function HubPanel({
  nodes,
  links,
  selectedNodeId,
  onSelectNode,
}: {
  nodes: NodeData[];
  links: LinkData[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
}) {
  const hubNodes = useMemo(() => {
    const hubs = nodes.filter(n => n.tier === 'T2' || n.tier === 'T1');
    return hubs.map(node => {
      const incoming = links.filter(l => l.target === node.id);
      const reroutedIn = incoming.filter(l => l.isRerouted);
      const totalIn = incoming.reduce((s, l) => s + l.traffic, 0);
      const reroutedTraffic = reroutedIn.reduce((s, l) => s + l.traffic, 0);
      const reroutedSources = Array.from(new Set(reroutedIn.map(l => l.source)));
      return { node, totalIn, reroutedTraffic, reroutedSources };
    }).sort((a, b) => b.reroutedTraffic - a.reroutedTraffic || b.totalIn - a.totalIn);
  }, [nodes, links]);

  const totalRerouted = hubNodes.reduce((s, h) => s + h.reroutedTraffic, 0);

  return (
    <div className="w-52 bg-card rounded-lg border border-border/50 shadow-sm flex flex-col overflow-hidden flex-shrink-0">
      <div className="px-3 py-2.5 border-b border-border/50 bg-accent2/5 flex-shrink-0">
        <div className="text-[13px] font-semibold text-text">Mobile Hubs</div>
        {totalRerouted > 0 && (
          <div className="text-[10px] text-orange-400 mt-0.5 font-mono">
            {totalRerouted}G rerouted incoming
          </div>
        )}
      </div>

      <div className="text-[9px] text-muted px-3 py-1.5 border-b border-border/30 flex gap-4 flex-shrink-0">
        <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-violet-500 mr-1" />T2</span>
        <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-pink-500 mr-1" />T1</span>
        <span className="ml-auto"><span className="text-orange-400">■</span> rerouted</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {hubNodes.map(({ node, totalIn, reroutedTraffic, reroutedSources }) => {
          const isSelected = selectedNodeId === node.id;
          const hasRerouted = reroutedTraffic > 0;
          const reroutedPct = totalIn > 0 ? Math.round((reroutedTraffic / totalIn) * 100) : 0;

          return (
            <button
              key={node.id}
              onClick={() => onSelectNode(node.id)}
              className={`w-full text-left p-2 rounded-md border transition-all ${
                isSelected
                  ? 'border-white/40 bg-white/10 shadow-sm'
                  : hasRerouted
                  ? 'border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/10'
                  : 'border-border bg-bg hover:bg-card/60'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: TIER_COLORS[node.tier] ?? '#64748b' }}
                />
                <span className="text-[11px] font-semibold text-text truncate flex-1">{node.id}</span>
                <span className="text-[9px] text-muted flex-shrink-0">{node.tier}</span>
              </div>

              <div className="flex items-center justify-between text-[10px] mb-0.5">
                <span className="text-muted">In: <span className="text-text font-mono">{totalIn}G</span></span>
                {hasRerouted && (
                  <span className="text-orange-400 font-mono font-bold">{reroutedTraffic}G</span>
                )}
              </div>

              {hasRerouted && (
                <>
                  <div className="h-1 rounded-full bg-border overflow-hidden mt-1">
                    <div
                      className="h-full rounded-full bg-orange-500 transition-all"
                      style={{ width: `${reroutedPct}%` }}
                    />
                  </div>
                  <div className="text-[9px] text-orange-400/70 mt-0.5">
                    {reroutedSources.length} src · {reroutedPct}% rerouted
                  </div>
                </>
              )}
            </button>
          );
        })}

        {hubNodes.length === 0 && (
          <div className="text-[11px] text-muted italic p-2">No hub data</div>
        )}
      </div>
    </div>
  );
}

function HubFlowView({ allLinks }: { allLinks: LinkData[] }) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hubViewMode, setHubViewMode] = useState<'flow' | 'recommended'>('flow');

  const { hubLinks, nodeMap, canvasHeight, totalTraffic, reroutedTraffic } = useMemo(() => {
    // 1. Filter to hub-only links and resolve names to canonical xlsx names
    const aggregated = new Map<string, LinkData>();

    for (const l of allLinks) {
      if (l.source === l.target) continue;
      if (l.sourceTier !== 'T2' && l.sourceTier !== 'T1') continue;
      if (l.targetTier !== 'T2' && l.targetTier !== 'T1') continue;

      const src = resolveHubName(l.source);
      const tgt = resolveHubName(l.target);
      if (!src || !tgt || src === tgt) continue;

      const key = `${src}||${tgt}`;
      const existing = aggregated.get(key);
      if (!existing) {
        aggregated.set(key, { ...l, source: src, target: tgt });
      } else {
        existing.traffic += l.traffic;
        if (l.isRerouted) existing.isRerouted = true;
      }
    }

    const hubLinks = Array.from(aggregated.values());

    // 2. Build T2/T1 sets from canonical names; prefer T1 if a node appears in both
    const t2Set = new Set<string>();
    const t1Set = new Set<string>();
    hubLinks.forEach(l => {
      if (l.sourceTier === 'T2') t2Set.add(l.source);
      if (l.sourceTier === 'T1') t1Set.add(l.source);
      if (l.targetTier === 'T2') t2Set.add(l.target);
      if (l.targetTier === 'T1') t1Set.add(l.target);
    });
    t1Set.forEach(n => t2Set.delete(n));

    const t2Nodes = Array.from(t2Set).sort();
    const t1Nodes = Array.from(t1Set).sort();

    const NODE_SPACING = 90;
    const PADDING_TOP = 60;
    const maxNodes = Math.max(t2Nodes.length, t1Nodes.length, 1);
    const height = Math.max(600, maxNodes * NODE_SPACING + PADDING_TOP * 2);

    const calcY = (index: number, total: number) => {
      const sectionHeight = total * NODE_SPACING;
      const startY = (height - sectionHeight) / 2;
      return startY + index * NODE_SPACING + NODE_SPACING / 2;
    };

    const nodeMap = new Map<string, NodeData>();
    t2Nodes.forEach((id, i) => nodeMap.set(id, { id, tier: 'T2', x: 380, y: calcY(i, t2Nodes.length) }));
    t1Nodes.forEach((id, i) => nodeMap.set(id, { id, tier: 'T1', x: 860, y: calcY(i, t1Nodes.length) }));

    const totalTraffic = hubLinks.reduce((s, l) => s + l.traffic, 0);
    const reroutedTraffic = hubLinks.filter(l => l.isRerouted).reduce((s, l) => s + l.traffic, 0);

    return { hubLinks, nodeMap, canvasHeight: height, t2Count: t2Nodes.length, t1Count: t1Nodes.length, totalTraffic, reroutedTraffic };
  }, [allLinks]);

  const activeNodes = new Set<string>();
  const activeLinks = new Set<LinkData>();
  if (selectedNodeId) {
    activeNodes.add(selectedNodeId);
    hubLinks.forEach(l => {
      if (l.source === selectedNodeId || l.target === selectedNodeId) {
        activeLinks.add(l);
        activeNodes.add(l.source);
        activeNodes.add(l.target);
      }
    });
  }

  const hubNodes = Array.from(nodeMap.values());

  // Per-hub stats for recommended view
  const hubStats = useMemo(() => {
    const stats = new Map<string, {
      id: string; tier: string;
      totalIn: number; reroutedIn: number;
      totalOut: number; reroutedOut: number;
    }>();
    hubNodes.forEach(n => stats.set(n.id, { id: n.id, tier: n.tier, totalIn: 0, reroutedIn: 0, totalOut: 0, reroutedOut: 0 }));
    hubLinks.forEach(l => {
      const src = stats.get(l.source);
      const tgt = stats.get(l.target);
      if (src) { src.totalOut += l.traffic; if (l.isRerouted) src.reroutedOut += l.traffic; }
      if (tgt) { tgt.totalIn += l.traffic; if (l.isRerouted) tgt.reroutedIn += l.traffic; }
    });
    return Array.from(stats.values()).sort((a, b) => b.reroutedIn - a.reroutedIn || b.totalIn - a.totalIn);
  }, [hubNodes, hubLinks]);

  const totalReroutedAll = hubStats.reduce((s, h) => s + h.reroutedIn, 0);
  const hubsNeedingUpdate = hubStats.filter(h => h.reroutedIn > 0).length;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Inner toggle */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border/40 flex-shrink-0">
        <div className="flex bg-bg border border-border rounded-md overflow-hidden text-[11px] font-semibold">
          <button
            onClick={() => { setHubViewMode('flow'); setSelectedNodeId(null); }}
            className={`px-3 py-1.5 transition-colors ${hubViewMode === 'flow' ? 'bg-violet-600 text-white' : 'text-muted hover:text-text'}`}
          >
            Flow
          </button>
          <button
            onClick={() => { setHubViewMode('recommended'); setSelectedNodeId(null); }}
            className={`px-3 py-1.5 transition-colors border-l border-border flex items-center gap-1 ${hubViewMode === 'recommended' ? 'bg-green-600 text-white' : 'text-muted hover:text-text'}`}
          >
            <span className={hubViewMode === 'recommended' ? 'text-white' : 'text-green-400'}>✦</span>
            Recommended
          </button>
        </div>
        {hubViewMode === 'recommended' && totalReroutedAll > 0 && (
          <div className="flex items-center gap-2 text-[11px]">
            <span className="px-2 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400 font-semibold">
              {totalReroutedAll.toLocaleString()} Gbps rerouted
            </span>
            <span className="text-muted">{hubsNeedingUpdate} hub{hubsNeedingUpdate !== 1 ? 's' : ''} need routing update</span>
          </div>
        )}
        {hubViewMode === 'flow' && (
          <span className="text-[10px] text-muted ml-auto">Click a hub to highlight connections</span>
        )}
      </div>

    {hubViewMode === 'recommended' ? (
      /* ── Recommended View ── */
      <div className="flex-1 overflow-auto p-4">
        {hubStats.length === 0 && (
          <div className="text-muted text-sm italic">No hub data for this circle.</div>
        )}
        <div className="grid grid-cols-2 gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {hubStats.map(h => {
            const primaryIn = h.totalIn - h.reroutedIn;
            const reroutedPct = h.totalIn > 0 ? Math.round((h.reroutedIn / h.totalIn) * 100) : 0;
            const needsUpdate = h.reroutedIn > 0;
            return (
              <div
                key={h.id}
                className={`rounded-xl border p-4 flex flex-col gap-3 ${
                  needsUpdate
                    ? 'border-orange-500/40 bg-orange-500/5'
                    : 'border-border bg-card'
                }`}
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: TIER_COLORS[h.tier] ?? '#64748b' }}
                    />
                    <span className="text-[14px] font-bold text-text">{h.id}</span>
                  </div>
                  <span
                    className="text-[9px] font-bold px-2 py-0.5 rounded-full border"
                    style={{
                      color: TIER_COLORS[h.tier],
                      borderColor: `${TIER_COLORS[h.tier]}44`,
                      background: `${TIER_COLORS[h.tier]}11`,
                    }}
                  >
                    {h.tier}
                  </span>
                </div>

                {/* Traffic bar */}
                {h.totalIn > 0 && (
                  <div>
                    <div className="flex justify-between text-[10px] text-muted mb-1">
                      <span>Incoming Traffic</span>
                      <span className="font-mono font-semibold text-text">{h.totalIn} Gbps</span>
                    </div>
                    <div className="h-2 rounded-full bg-border overflow-hidden flex">
                      <div
                        className="h-full bg-slate-500 transition-all"
                        style={{ width: `${100 - reroutedPct}%` }}
                      />
                      {reroutedPct > 0 && (
                        <div
                          className="h-full bg-orange-500 transition-all"
                          style={{ width: `${reroutedPct}%` }}
                        />
                      )}
                    </div>
                    <div className="flex justify-between text-[9px] mt-1">
                      <span className="text-slate-400">Primary: {primaryIn} Gbps</span>
                      {reroutedPct > 0 && (
                        <span className="text-orange-400 font-mono">{reroutedPct}% rerouted</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Update Required badge */}
                {needsUpdate ? (
                  <div className="rounded-lg bg-orange-500/10 border border-orange-500/25 px-3 py-2">
                    <div className="text-[10px] text-orange-400 font-semibold uppercase tracking-wider mb-0.5">
                      Update Required
                    </div>
                    <div className="text-[18px] font-black text-orange-400 leading-none">
                      {h.reroutedIn} Gbps
                    </div>
                    <div className="text-[10px] text-orange-400/70 mt-0.5">
                      of incoming traffic is rerouted and needs to be aligned to primary paths
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2 flex items-center gap-2">
                    <span className="text-green-400 text-[13px]">✓</span>
                    <span className="text-[11px] text-green-400 font-medium">All traffic on primary paths</span>
                  </div>
                )}

                {/* Outgoing summary */}
                {h.totalOut > 0 && (
                  <div className="text-[10px] text-muted border-t border-border/40 pt-2">
                    Outgoing: <span className="text-text font-mono">{h.totalOut} Gbps</span>
                    {h.reroutedOut > 0 && (
                      <span className="text-orange-400 ml-2 font-mono">{h.reroutedOut} Gbps sent rerouted</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    ) : (
    <div className="flex flex-1 overflow-hidden gap-3 p-4">
      {/* Left: T2 hub stats */}
      <div className="w-52 bg-card rounded-lg border border-border/50 flex flex-col overflow-hidden flex-shrink-0">
        <div className="px-3 py-2.5 border-b border-border/50 bg-violet-500/5 flex-shrink-0">
          <div className="text-[12px] font-semibold text-violet-400">T2 Hubs</div>
          <div className="text-[10px] text-muted mt-0.5">{Array.from(nodeMap.values()).filter(n => n.tier === 'T2').length} nodes</div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {hubNodes.filter(n => n.tier === 'T2').map(node => {
            const outgoing = hubLinks.filter(l => l.source === node.id);
            const incoming = hubLinks.filter(l => l.target === node.id);
            const reroutedOut = outgoing.filter(l => l.isRerouted).reduce((s, l) => s + l.traffic, 0);
            const totalOut = outgoing.reduce((s, l) => s + l.traffic, 0);
            const isSelected = selectedNodeId === node.id;
            const isActive = selectedNodeId ? activeNodes.has(node.id) : true;
            return (
              <button
                key={node.id}
                onClick={() => setSelectedNodeId(isSelected ? null : node.id)}
                className={`w-full text-left px-2.5 py-2 rounded-md border transition-all text-[11px] ${
                  isSelected ? 'border-white/30 bg-white/10' :
                  reroutedOut > 0 ? 'border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/10' :
                  'border-border bg-bg hover:bg-card/60'
                } ${!isActive ? 'opacity-30' : ''}`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-500 flex-shrink-0" />
                  <span className="font-semibold text-text truncate">{node.id}</span>
                </div>
                <div className="flex justify-between text-[10px] text-muted">
                  <span>Out: <span className="text-text font-mono">{totalOut}G</span></span>
                  <span>In: <span className="text-text font-mono">{incoming.reduce((s,l)=>s+l.traffic,0)}G</span></span>
                </div>
                {reroutedOut > 0 && (
                  <div className="text-[9px] text-orange-400 mt-0.5 font-mono">{reroutedOut}G rerouted out</div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Centre: SVG flow diagram */}
      <div
        className="flex-1 bg-card rounded-lg border border-border/50 overflow-auto shadow-inner cursor-pointer"
        onClick={e => { if ((e.target as any).tagName === 'svg') setSelectedNodeId(null); }}
      >
        <svg width={1240} height={canvasHeight} className="min-w-max min-h-max">
          <defs>
            <marker id="ha" markerWidth="6" markerHeight="4" refX="5.5" refY="2" orient="auto">
              <polygon points="0 0, 6 2, 0 4" fill="#64748b" />
            </marker>
            <marker id="ha-r" markerWidth="6" markerHeight="4" refX="5.5" refY="2" orient="auto">
              <polygon points="0 0, 6 2, 0 4" fill="#f97316" />
            </marker>
            <marker id="ha-a" markerWidth="6" markerHeight="4" refX="5.5" refY="2" orient="auto">
              <polygon points="0 0, 6 2, 0 4" fill="#94a3b8" />
            </marker>
          </defs>

          {/* Column labels */}
          <text x={380} y={32} fill="#8b5cf6" fontSize={13} fontWeight="bold" textAnchor="middle" opacity={0.8}>T2 Hubs</text>
          <text x={860} y={32} fill="#ec4899" fontSize={13} fontWeight="bold" textAnchor="middle" opacity={0.8}>T1 Hubs</text>
          <line x1={380} y1={42} x2={380} y2={canvasHeight - 20} stroke="#8b5cf6" strokeWidth={1} strokeDasharray="4 6" opacity={0.12} />
          <line x1={860} y1={42} x2={860} y2={canvasHeight - 20} stroke="#ec4899" strokeWidth={1} strokeDasharray="4 6" opacity={0.12} />

          {/* Links */}
          {hubLinks.map((link, i) => {
            const src = nodeMap.get(link.source);
            const tgt = nodeMap.get(link.target);
            if (!src || !tgt) return null;

            const isSameTier = src.x === tgt.x;
            let pathData: string, textX: number, textY: number;

            if (isSameTier) {
              const offset = src.x < 600 ? -110 : 110;
              const cx = src.x + offset;
              const cy = (src.y + tgt.y) / 2;
              pathData = `M ${src.x} ${src.y} Q ${cx} ${cy}, ${tgt.x} ${tgt.y}`;
              textX = src.x + offset * 0.52;
              textY = cy - 10;
            } else {
              const cx = (src.x + tgt.x) / 2;
              pathData = `M ${src.x} ${src.y} C ${cx} ${src.y}, ${cx} ${tgt.y}, ${tgt.x} ${tgt.y}`;
              textX = cx;
              textY = (src.y + tgt.y) / 2 - 10;
            }

            const isRerouted = link.isRerouted;
            const isHighlighted = selectedNodeId ? activeLinks.has(link) : false;
            let strokeColor = isRerouted ? '#f97316' : '#64748b';
            let opacity = selectedNodeId ? (isHighlighted ? 1 : 0.04) : (isRerouted ? 0.75 : 0.45);
            let marker = isRerouted ? 'ha-r' : 'ha';

            if (selectedNodeId && isHighlighted) {
              strokeColor = isRerouted ? '#fb923c' : '#94a3b8';
              marker = isRerouted ? 'ha-r' : 'ha-a';
            }

            const sw = Math.max(2, Math.min(10, link.traffic / 50));

            return (
              <g key={`hl-${i}`}>
                <path
                  d={pathData} fill="none"
                  stroke={strokeColor} strokeWidth={sw} opacity={opacity}
                  markerEnd={`url(#${marker})`}
                  className="transition-opacity duration-200"
                />
                <text
                  x={textX} y={textY}
                  fill={isRerouted ? '#fdba74' : '#cbd5e1'}
                  fontSize={11} fontWeight="bold" textAnchor="middle"
                  stroke="#0f172a" strokeWidth={4} paintOrder="stroke fill"
                  opacity={opacity < 0.1 ? 0 : 1}
                  className="pointer-events-none transition-opacity duration-200"
                >
                  {link.traffic}G
                </text>
                {link.distKm !== undefined && (
                  <text
                    x={textX} y={textY + 13}
                    fill={isRerouted ? '#f97316' : '#64748b'}
                    fontSize={9} textAnchor="middle"
                    stroke="#0f172a" strokeWidth={3} paintOrder="stroke fill"
                    opacity={opacity < 0.1 ? 0 : 0.85}
                    className="pointer-events-none transition-opacity duration-200"
                  >
                    {link.distKm}km
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {hubNodes.map(node => {
            const isSelected = selectedNodeId === node.id;
            const isActive = selectedNodeId ? activeNodes.has(node.id) : true;
            const r = isSelected ? 20 : 16;

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onClick={e => { e.stopPropagation(); setSelectedNodeId(isSelected ? null : node.id); }}
                className="cursor-pointer transition-opacity duration-200"
                style={{ opacity: isActive ? 1 : 0.2 }}
              >
                <circle
                  r={r}
                  fill={TIER_COLORS[node.tier] ?? '#64748b'}
                  stroke={isSelected ? '#ffffff' : '#1e293b'}
                  strokeWidth={isSelected ? 3 : 2}
                  className="transition-all duration-200 hover:brightness-125"
                />
                <text
                  x={node.tier === 'T2' ? -(r + 8) : (r + 8)}
                  y={5}
                  fill={isSelected ? '#ffffff' : '#e2e8f0'}
                  fontSize={13}
                  fontWeight={isSelected ? 'bold' : 'normal'}
                  textAnchor={node.tier === 'T2' ? 'end' : 'start'}
                  stroke="#0f172a" strokeWidth={3} paintOrder="stroke fill"
                  className="pointer-events-none"
                >
                  {node.id}
                </text>
                <text
                  x={0} y={4}
                  fill="#ffffff" fontSize={10} fontWeight="bold" textAnchor="middle"
                  className="pointer-events-none"
                >
                  {node.tier}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Right: T1 hub stats */}
      <div className="w-52 bg-card rounded-lg border border-border/50 flex flex-col overflow-hidden flex-shrink-0">
        <div className="px-3 py-2.5 border-b border-border/50 bg-pink-500/5 flex-shrink-0">
          <div className="text-[12px] font-semibold text-pink-400">T1 Hubs</div>
          <div className="text-[10px] text-muted mt-0.5">{hubNodes.filter(n => n.tier === 'T1').length} nodes · {totalTraffic}G total</div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {hubNodes.filter(n => n.tier === 'T1').map(node => {
            const incoming = hubLinks.filter(l => l.target === node.id);
            const outgoing = hubLinks.filter(l => l.source === node.id);
            const reroutedIn = incoming.filter(l => l.isRerouted).reduce((s, l) => s + l.traffic, 0);
            const totalIn = incoming.reduce((s, l) => s + l.traffic, 0);
            const isSelected = selectedNodeId === node.id;
            const isActive = selectedNodeId ? activeNodes.has(node.id) : true;
            const reroutedPct = totalIn > 0 ? Math.round((reroutedIn / totalIn) * 100) : 0;
            return (
              <button
                key={node.id}
                onClick={() => setSelectedNodeId(isSelected ? null : node.id)}
                className={`w-full text-left px-2.5 py-2 rounded-md border transition-all text-[11px] ${
                  isSelected ? 'border-white/30 bg-white/10' :
                  reroutedIn > 0 ? 'border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/10' :
                  'border-border bg-bg hover:bg-card/60'
                } ${!isActive ? 'opacity-30' : ''}`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-500 flex-shrink-0" />
                  <span className="font-semibold text-text truncate">{node.id}</span>
                </div>
                <div className="flex justify-between text-[10px] text-muted">
                  <span>In: <span className="text-text font-mono">{totalIn}G</span></span>
                  {outgoing.length > 0 && <span>Out: <span className="text-text font-mono">{outgoing.reduce((s,l)=>s+l.traffic,0)}G</span></span>}
                </div>
                {reroutedIn > 0 && (
                  <>
                    <div className="h-1 rounded-full bg-border overflow-hidden mt-1">
                      <div className="h-full rounded-full bg-orange-500" style={{ width: `${reroutedPct}%` }} />
                    </div>
                    <div className="text-[9px] text-orange-400 mt-0.5 font-mono">{reroutedIn}G rerouted · {reroutedPct}%</div>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
    )}
    </div>
  );
}

export default function MobileFlowScreen() {
  const circles = Object.keys(mobileNetFlowData);
  const [selectedCircle, setSelectedCircle] = useState(circles[0] || '');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'city' | 'hubs'>('city');
  const [cityViewMode, setCityViewMode] = useState<'actual' | 'recommended'>('actual');

  const handleCircleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCircle(e.target.value);
    setSelectedNodeId(null);
  };

  const { nodes, links, totalRerouted, totalTraffic, canvasHeight } = useMemo(() => {
    if (!selectedCircle) return { nodes: [], links: [], totalRerouted: 0, totalTraffic: 0, canvasHeight: 600 };

    const rawLinks = (mobileNetFlowData as Record<string, any[]>)[selectedCircle] || [];

    const sourceGroups: Record<string, any[]> = {};
    rawLinks.forEach(l => {
      if (!sourceGroups[l.source]) sourceGroups[l.source] = [];
      sourceGroups[l.source].push(l);
    });

    let rerouted = 0;
    let total = 0;
    const processedLinks: LinkData[] = [];

    Object.values(sourceGroups).forEach(groupLinks => {
      groupLinks.sort((a, b) => b.traffic - a.traffic);
      groupLinks.forEach((l, idx) => {
        total += l.traffic || 0;
        const isRerouted = idx > 0;
        if (isRerouted) rerouted += l.traffic || 0;
        const srcC = getNodeCoords(l.source);
        const tgtC = getNodeCoords(l.target);
        const distKm = srcC && tgtC ? haversinKm(srcC[0], srcC[1], tgtC[0], tgtC[1]) : undefined;
        processedLinks.push({ ...l, isRerouted, distKm });
      });
    });

    const nodeSet = new Map<string, string>(); 
    processedLinks.forEach(l => {
      nodeSet.set(l.source, l.sourceTier);
      nodeSet.set(l.target, l.targetTier);
    });

    const tiers = { T3: [] as string[], T2: [] as string[], T1: [] as string[] };
    nodeSet.forEach((tier, id) => {
      if (tier === 'T1' || tier === 'T2' || tier === 'T3') {
        tiers[tier as 'T1'|'T2'|'T3'].push(id);
      } else {
        tiers.T3.push(id);
      }
    });

    tiers.T3.sort();
    tiers.T2.sort();
    tiers.T1.sort();

    const NODE_SPACING = 80; // Increased spacing
    const PADDING_TOP = 60;
    const maxNodes = Math.max(tiers.T3.length, tiers.T2.length, tiers.T1.length);
    const height = Math.max(800, maxNodes * NODE_SPACING + PADDING_TOP * 2);

    const calcY = (index: number, totalNodes: number) => {
      const sectionHeight = totalNodes * NODE_SPACING;
      const startY = (height - sectionHeight) / 2;
      return startY + index * NODE_SPACING + NODE_SPACING / 2;
    };

    const finalNodes: NodeData[] = [];
    // Widened X coordinates for better visibility
    tiers.T3.forEach((id, i) => finalNodes.push({ id, tier: 'T3', x: 200, y: calcY(i, tiers.T3.length) }));
    tiers.T2.forEach((id, i) => finalNodes.push({ id, tier: 'T2', x: 600, y: calcY(i, tiers.T2.length) }));
    tiers.T1.forEach((id, i) => finalNodes.push({ id, tier: 'T1', x: 1000, y: calcY(i, tiers.T1.length) }));

    return {
      nodes: finalNodes,
      links: processedLinks,
      totalRerouted: rerouted,
      totalTraffic: total,
      canvasHeight: height
    };
  }, [selectedCircle]);

  const getNodeMap = useMemo(() => {
    const map = new Map<string, NodeData>();
    nodes.forEach(n => map.set(n.id, n));
    return map;
  }, [nodes]);

  const nodeDetails = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = getNodeMap.get(selectedNodeId);
    if (!node) return null;

    const incoming = links.filter(l => l.target === selectedNodeId);
    const outgoing = links.filter(l => l.source === selectedNodeId);

    const totalIn = incoming.reduce((sum, l) => sum + l.traffic, 0);
    const totalOut = outgoing.reduce((sum, l) => sum + l.traffic, 0);
    const totalOutRerouted = outgoing.filter(l => l.isRerouted).reduce((sum, l) => sum + l.traffic, 0);

    return { node, incoming, outgoing, totalIn, totalOut, totalOutRerouted };
  }, [selectedNodeId, getNodeMap, links]);

  // Determine which elements to highlight
  const activeNodes = new Set<string>();
  const activeLinks = new Set<LinkData>();
  if (selectedNodeId) {
    activeNodes.add(selectedNodeId);
    links.forEach(l => {
      if (l.source === selectedNodeId || l.target === selectedNodeId) {
        activeLinks.add(l);
        activeNodes.add(l.source);
        activeNodes.add(l.target);
      }
    });
  }

  return (
    <div className="flex flex-col h-full w-full bg-bg overflow-hidden">
      {/* Header Stats */}
      
      <div className="flex items-center justify-between bg-card px-4 py-3 border-b border-border/50 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-[15px] font-semibold text-text">Mobile Network Flow</h2>
          <select
            className="bg-bg border border-border rounded px-3 py-1.5 text-text text-[13px] font-medium focus:outline-none cursor-pointer"
            value={selectedCircle}
            onChange={handleCircleChange}
          >
            {circles.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* View mode toggle */}
          <div className="flex bg-bg border border-border rounded-md overflow-hidden text-[12px] font-semibold ml-2">
            <button
              onClick={() => { setViewMode('city'); setSelectedNodeId(null); }}
              className={`px-3 py-1.5 transition-colors ${viewMode === 'city' ? 'bg-accent2 text-bg' : 'text-muted hover:text-text'}`}
            >
              City Flow
            </button>
            <button
              onClick={() => { setViewMode('hubs'); setSelectedNodeId(null); }}
              className={`px-3 py-1.5 transition-colors border-l border-border ${viewMode === 'hubs' ? 'bg-violet-600 text-white' : 'text-muted hover:text-text'}`}
            >
              Hub Flow
            </button>
          </div>
        </div>

        {viewMode === 'city' && cityViewMode === 'actual' && (
          <div className="flex gap-8">
            <div className="flex flex-col items-end">
              <span className="text-sm text-text/60">Total Traffic</span>
              <span className="text-xl font-bold text-text">{totalTraffic.toLocaleString()} Gbps</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-sm text-text/60">Rerouted Traffic</span>
              <span className="text-xl font-bold text-orange-500">{totalRerouted.toLocaleString()} Gbps</span>
            </div>
          </div>
        )}
      </div>

      {/* Hub flow view */}
      {viewMode === 'hubs' && (
        <HubFlowView allLinks={links}  />
      )}

      {/* City flow view */}
      {viewMode === 'city' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border/40 flex-shrink-0">
            <div className="flex bg-bg border border-border rounded-md overflow-hidden text-[11px] font-semibold">
              <button
                onClick={() => { setCityViewMode('actual'); setSelectedNodeId(null); }}
                className={`px-3 py-1.5 transition-colors ${cityViewMode === 'actual' ? 'bg-accent2 text-bg' : 'text-muted hover:text-text'}`}
              >
                Actual
              </button>
              <button
                onClick={() => { setCityViewMode('recommended'); setSelectedNodeId(null); }}
                className={`px-3 py-1.5 transition-colors border-l border-border flex items-center gap-1 ${cityViewMode === 'recommended' ? 'bg-green-600 text-white' : 'text-muted hover:text-text'}`}
              >
                <span className={cityViewMode === 'recommended' ? 'text-white' : 'text-green-400'}>✦</span>
                Recommended
              </button>
            </div>
            {cityViewMode === 'actual' && (
              <span className="text-[10px] text-muted ml-auto">Click a node to highlight connections</span>
            )}
          </div>
          
          {cityViewMode === 'recommended' ? (
            <div className="flex flex-1 overflow-hidden relative">
              <IdealFlowView initialCircle={selectedCircle} onCircleChange={setSelectedCircle} />
            </div>
          ) : (
            <div className="flex flex-1 overflow-hidden gap-3 p-4">
        
        {/* Hub Panel - left sidebar */}
        <HubPanel
          nodes={nodes}
          links={links}
          selectedNodeId={selectedNodeId}
          onSelectNode={(id) => setSelectedNodeId(prev => prev === id ? null : id)}
        />

        {/* SVG Container */}
        <div
          className="flex-1 bg-card rounded-lg border border-border/50 overflow-auto relative shadow-inner cursor-pointer"
          onClick={(e) => {
            // Deselect if clicking on the background (SVG element itself)
            if ((e.target as any).tagName === 'svg') {
              setSelectedNodeId(null);
            }
          }}
        >
          <svg width={1200} height={canvasHeight} className="min-w-max min-h-max">
            <defs>
              <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="5.5" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill="#64748b" />
              </marker>
              <marker id="arrowhead-rerouted" markerWidth="6" markerHeight="4" refX="5.5" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill="#f97316" />
              </marker>
              <marker id="arrowhead-active" markerWidth="6" markerHeight="4" refX="5.5" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill="#94a3b8" />
              </marker>
            </defs>

            {/* Links */}
            {links.map((link, i) => {
              const source = getNodeMap.get(link.source);
              const target = getNodeMap.get(link.target);
              if (!source || !target) return null;

              const isSameTier = source.x === target.x;
              let pathData;
              let textX;
              let textY;

              if (isSameTier) {
                // Curve outward for same-tier connections (T3 left, T1 right, T2 right)
                const curveOffset = source.x === 200 ? -80 : (source.x === 1000 ? 80 : 80);
                const controlX = source.x + curveOffset;
                const controlY = (source.y + target.y) / 2;
                
                pathData = `M ${source.x} ${source.y} Q ${controlX} ${controlY}, ${target.x} ${target.y}`;
                textX = source.x + curveOffset / 2;
                textY = controlY - 8;
              } else {
                const controlPointX = (source.x + target.x) / 2;
                pathData = `M ${source.x} ${source.y} C ${controlPointX} ${source.y}, ${controlPointX} ${target.y}, ${target.x} ${target.y}`;
                textX = controlPointX;
                textY = (source.y + target.y) / 2 - 8;
              }

              const isRerouted = link.isRerouted;
              let strokeColor = isRerouted ? '#f97316' : '#64748b'; 
              let opacity = 0.3;
              let marker = isRerouted ? 'arrowhead-rerouted' : 'arrowhead';
              
              const isHighlighted = selectedNodeId ? activeLinks.has(link) : false;
              
              if (selectedNodeId) {
                if (isHighlighted) {
                  opacity = 1;
                  strokeColor = isRerouted ? '#fb923c' : '#94a3b8'; // Brighter when highlighted
                  marker = isRerouted ? 'arrowhead-rerouted' : 'arrowhead-active';
                } else {
                  opacity = 0.05;
                }
              } else {
                opacity = isRerouted ? 0.7 : 0.4;
              }

              const strokeWidth = Math.max(2, Math.min(12, link.traffic / 40));

              return (
                <g key={`link-${i}`}>
                  <path
                    d={pathData}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    opacity={opacity}
                    markerEnd={`url(#${marker})`}
                    className="transition-opacity duration-300"
                  />
                  {/* Traffic + distance labels */}
                  <text
                    x={textX}
                    y={textY}
                    fill={isRerouted ? '#fdba74' : '#cbd5e1'}
                    fontSize={11}
                    fontWeight="bold"
                    textAnchor="middle"
                    stroke="#0f172a"
                    strokeWidth={4}
                    paintOrder="stroke fill"
                    opacity={opacity === 0.05 ? 0 : 1}
                    className="pointer-events-none transition-opacity duration-300"
                  >
                    {link.traffic}G
                  </text>
                  {link.distKm !== undefined && (
                    <text
                      x={textX}
                      y={textY + 13}
                      fill={isRerouted ? '#f97316' : '#64748b'}
                      fontSize={9}
                      textAnchor="middle"
                      stroke="#0f172a"
                      strokeWidth={3}
                      paintOrder="stroke fill"
                      opacity={opacity === 0.05 ? 0 : 0.9}
                      className="pointer-events-none transition-opacity duration-300"
                    >
                      {link.distKm}km
                    </text>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {nodes.map(node => {
              const isSelected = selectedNodeId === node.id;
              const isHighlighted = selectedNodeId ? activeNodes.has(node.id) : true;
              const opacity = isHighlighted ? 1 : 0.2;
              const radius = isSelected ? 20 : 16;
              const strokeColor = isSelected ? '#ffffff' : '#1e293b';

              return (
                <g 
                  key={node.id} 
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedNodeId(isSelected ? null : node.id);
                  }}
                  className="cursor-pointer transition-all duration-300"
                  style={{ opacity }}
                >
                  <circle
                    r={radius}
                    fill={TIER_COLORS[node.tier] || '#64748b'}
                    stroke={strokeColor}
                    strokeWidth={isSelected ? 3 : 2}
                    className="transition-all duration-300 hover:brightness-125"
                  />
                  <text
                    x={node.tier === 'T3' ? - (radius + 8) : (radius + 8)}
                    y={5}
                    fill={isSelected ? '#ffffff' : '#e2e8f0'}
                    fontSize={14}
                    fontWeight={isSelected ? 'bold' : 'normal'}
                    textAnchor={node.tier === 'T3' ? 'end' : 'start'}
                    stroke="#0f172a"
                    strokeWidth={3}
                    paintOrder="stroke fill"
                    className="drop-shadow-md"
                  >
                    {node.id}
                  </text>
                  <text
                    x={0}
                    y={4}
                    fill="#ffffff"
                    fontSize={10}
                    fontWeight="bold"
                    textAnchor="middle"
                    className="pointer-events-none"
                  >
                    {node.tier}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Legend */}
          {/* <div className="absolute bottom-6 left-6 bg-bg/90 backdrop-blur-md p-4 rounded-lg border border-border shadow-lg text-sm flex flex-col gap-3 z-10">
            <div className="font-semibold text-text border-b border-border pb-1 mb-1">Network Legend</div>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-blue-500 border border-slate-800"></div>
              <span className="text-text/90">Tier 3 (T3) Node</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-violet-500 border border-slate-800"></div>
              <span className="text-text/90">Tier 2 (T2) Node</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-pink-500 border border-slate-800"></div>
              <span className="text-text/90">Tier 1 (T1) Node</span>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <div className="w-6 h-1 bg-slate-500 rounded-full"></div>
              <span className="text-text/90">Primary Path</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-1 bg-orange-500 rounded-full"></div>
              <span className="text-text/90">Rerouted / Backup Path</span>
            </div>
          </div> */}
        </div>

        {/* Details Panel */}
        {nodeDetails && (
          <div className="w-80 bg-card rounded-lg border border-border/50 shadow-sm flex flex-col overflow-hidden flex-shrink-0 animate-in slide-in-from-right-8 duration-300">
            <div className="p-5 border-b border-border/50 bg-accent2/5 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-text">{nodeDetails.node.id}</h3>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-bg border border-border text-muted mt-1 inline-block">
                  {nodeDetails.node.tier} City
                </span>
              </div>
              <button 
                onClick={() => setSelectedNodeId(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-bg text-muted hover:text-text transition-colors"
                title="Close panel"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-bg p-3 rounded-lg border border-border">
                  <div className="text-xs text-muted mb-1">Incoming</div>
                  <div className="text-lg font-bold text-text">{nodeDetails.totalIn} G</div>
                </div>
                <div className="bg-bg p-3 rounded-lg border border-border">
                  <div className="text-xs text-muted mb-1">Outgoing</div>
                  <div className="text-lg font-bold text-text">{nodeDetails.totalOut} G</div>
                </div>
              </div>

              {nodeDetails.outgoing.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-text mb-3 flex items-center justify-between">
                    <span>Outgoing Paths</span>
                    <span className="text-xs bg-bg px-2 py-1 rounded text-muted">{nodeDetails.outgoing.length}</span>
                  </h4>
                  <div className="space-y-2">
                    {nodeDetails.outgoing.map((l, i) => (
                      <div key={i} className={`p-3 rounded-md border ${l.isRerouted ? 'border-orange-500/30 bg-orange-500/5' : 'border-border bg-bg'}`}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm font-medium text-text">{l.target}</span>
                          <span className={`text-sm font-bold ${l.isRerouted ? 'text-orange-400' : 'text-text'}`}>
                            {l.traffic} G
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-muted">Target: {l.targetTier}</span>
                            {l.distKm !== undefined && (
                              <span className="font-mono text-cyan-400 font-semibold">{l.distKm} km</span>
                            )}
                          </div>
                          {l.isRerouted ? (
                            <span className="text-orange-500 font-medium text-[10px] uppercase tracking-wider">Rerouted</span>
                          ) : (
                            <span className="text-slate-400 font-medium text-[10px] uppercase tracking-wider">Primary</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {nodeDetails.incoming.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-text mb-3 flex items-center justify-between">
                    <span>Incoming Paths</span>
                    <span className="text-xs bg-bg px-2 py-1 rounded text-muted">{nodeDetails.incoming.length}</span>
                  </h4>
                  <div className="space-y-2">
                    {nodeDetails.incoming.map((l, i) => (
                      <div key={i} className={`p-3 rounded-md border ${l.isRerouted ? 'border-orange-500/30 bg-orange-500/5' : 'border-border bg-bg'}`}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm font-medium text-text">{l.source}</span>
                          <span className={`text-sm font-bold ${l.isRerouted ? 'text-orange-400' : 'text-text'}`}>
                            {l.traffic} G
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-muted">Source: {l.sourceTier}</span>
                            {l.distKm !== undefined && (
                              <span className="font-mono text-cyan-400 font-semibold">{l.distKm} km</span>
                            )}
                          </div>
                          {l.isRerouted ? (
                            <span className="text-orange-500 font-medium text-[10px] uppercase tracking-wider">Rerouted</span>
                          ) : (
                            <span className="text-slate-400 font-medium text-[10px] uppercase tracking-wider">Primary</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
          )}
        </div>
      )}
    </div>
  );
}
