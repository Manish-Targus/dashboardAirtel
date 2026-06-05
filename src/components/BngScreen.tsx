'use client';
import { useMemo, useState } from 'react';
import rawAeData from '@/data/bngAeData.json';

interface AeIface {
  name: string;
  link_type: string;
  bw_gb: number | null;
  max_util: number;
}

interface BrasNode {
  node: string;
  circle: string;
  city: string;
  bras_type: string;
  ae_interfaces: AeIface[];
}

const allNodes = rawAeData as BrasNode[];

const CIRCLE_LABELS: Record<string, string> = {
  AP: 'Andhra Pradesh', BHJH: 'Bihar & Jharkhand', GUJ: 'Gujarat',
  HPHP: 'HP · PB · HR', JK: 'J&K', KK: 'Karnataka', KL: 'Kerala',
  MH: 'Maharashtra', MPCG: 'MP & CG', NCR: 'Delhi NCR', NESA: 'North East',
  ORR: 'Odisha', RAJ: 'Rajasthan', TN: 'Tamil Nadu', UPE: 'UP East',
  UPW: 'UP West', WB: 'West Bengal',
};

function utilStyle(u: number) {
  if (u >= 90) return { bgGrad: 'linear-gradient(145deg,#991b1b,#7f1d1d)', shadow: '#450a0a', border: '#dc2626', text: '#fca5a5', badge: '#ef4444' };
  if (u >= 80) return { bgGrad: 'linear-gradient(145deg,#b91c1c,#991b1b)', shadow: '#7f1d1d', border: '#f87171', text: '#fecaca', badge: '#f87171' };
  if (u >= 70) return { bgGrad: 'linear-gradient(145deg,#92400e,#78350f)', shadow: '#451a03', border: '#fbbf24', text: '#fde68a', badge: '#f59e0b' };
  if (u >= 45) return { bgGrad: 'linear-gradient(145deg,#166534,#14532d)', shadow: '#052e16', border: '#4ade80', text: '#86efac', badge: '#22c55e' };
  return { bgGrad: 'linear-gradient(145deg,#14532d,#052e16)', shadow: '#022c22', border: '#16a34a', text: '#bbf7d0', badge: '#16a34a' };
}

function nodeMaxUtil(n: BrasNode) {
  return n.ae_interfaces.length ? Math.max(...n.ae_interfaces.map(a => a.max_util)) : 0;
}

function severity(u: number) {
  if (u >= 90) return { c: 0, h: 0, m: 0, critical: 1, high: 0, medium: 0 };
  if (u >= 80) return { critical: 0, high: 1, medium: 0 };
  if (u >= 70) return { critical: 0, high: 0, medium: 1 };
  return { critical: 0, high: 0, medium: 0 };
}

function AeCube({ ae, nodeKey, selected, onClick }: {
  ae: AeIface; nodeKey: string; selected: boolean; onClick: () => void;
}) {
  const s = utilStyle(ae.max_util);
  return (
    <button
      onClick={onClick}
      title={`${ae.name} · ${ae.link_type} · ${ae.bw_gb ?? '?'}G · ${ae.max_util.toFixed(1)}%`}
      style={{
        width: 80, height: 80,
        background: s.bgGrad,
        border: `2px solid ${selected ? '#60a5fa' : s.border}`,
        borderRadius: 10,
        boxShadow: selected ? `5px 5px 0 #1d3461, 0 0 0 2px #60a5fa44` : `5px 5px 0 ${s.shadow}`,
        transform: selected ? 'translate(-2px,-2px) scale(1.04)' : 'none',
        transition: 'all 0.13s ease',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 3, cursor: 'pointer', flexShrink: 0, position: 'relative',
      }}
    >
      <span style={{ position:'absolute', top:5, right:5, width:7, height:7, borderRadius:'50%', background:'rgba(255,255,255,0.15)', pointerEvents:'none' }} />
      <span style={{ fontSize:11, fontWeight:900, color:s.text, fontFamily:'monospace', letterSpacing:'-0.3px', lineHeight:1 }}>{ae.name}</span>
      <span style={{ fontSize:15, fontWeight:900, color:'#fff', lineHeight:1 }}>{ae.max_util.toFixed(1)}%</span>
      <span style={{ fontSize:9, color:'rgba(255,255,255,0.45)', lineHeight:1, maxWidth:70, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textAlign:'center' }}>
        {ae.link_type.replace('BRAS-','').replace('-LINK','')}
      </span>
    </button>
  );
}

type FilterCat = 'all' | 'critical' | 'high' | 'medium' | 'normal';

function SeverityDots({ critical, high, medium }: { critical: number; high: number; medium: number }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {critical > 0 && <span className="text-[9px] px-1 py-0.5 rounded bg-red-500/20 text-red-400 font-bold">{critical}</span>}
      {high > 0     && <span className="text-[9px] px-1 py-0.5 rounded bg-red-400/20 text-red-300 font-bold">{high}</span>}
      {medium > 0   && <span className="text-[9px] px-1 py-0.5 rounded bg-yellow-400/20 text-yellow-300 font-bold">{medium}</span>}
      {critical === 0 && high === 0 && medium === 0 && (
        <span className="text-[9px] px-1 py-0.5 rounded bg-green-500/20 text-green-400">OK</span>
      )}
    </div>
  );
}

export default function BngScreen() {
  const [selectedCircle, setSelectedCircle] = useState<string | null>(null);
  const [filterCat, setFilterCat]           = useState<FilterCat>('all');
  const [selectedBrasType, setSelectedBrasType] = useState('MX960');
  const [search, setSearch]                 = useState('');
  const [selectedAe, setSelectedAe]         = useState<{ ae: AeIface; node: BrasNode } | null>(null);
  const [collapsedBras, setCollapsedBras]   = useState<Set<string>>(new Set());
  const [collapsedCities, setCollapsedCities] = useState<Set<string>>(new Set());
  const [collapsedCircles, setCollapsedCircles] = useState<Set<string>>(new Set());

  function toggleBras(key: string) {
    setCollapsedBras(p => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }
  function toggleCity(key: string) {
    setCollapsedCities(p => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }
  function toggleCircle(key: string) {
    setCollapsedCircles(p => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  function filterAe(aes: AeIface[]) {
    return aes
      .filter(a => {
        if (filterCat === 'critical') return a.max_util >= 90;
        if (filterCat === 'high')     return a.max_util >= 80 && a.max_util < 90;
        if (filterCat === 'medium')   return a.max_util >= 70 && a.max_util < 80;
        if (filterCat === 'normal')   return a.max_util < 70;
        return true;
      })
      .sort((a, b) => b.max_util - a.max_util);
  }

  const brasTypes = useMemo(() => {
    const types = Array.from(new Set(allNodes.map(n => n.bras_type))).sort();
    return ['All', ...types];
  }, []);

  // Circle sidebar stats
  const circleStats = useMemo(() => {
    const map: Record<string, { count: number; critical: number; high: number; medium: number }> = {};
    for (const n of allNodes) {
      if (selectedBrasType !== 'All' && n.bras_type !== selectedBrasType) continue;
      if (!map[n.circle]) map[n.circle] = { count: 0, critical: 0, high: 0, medium: 0 };
      map[n.circle].count++;
      const u = nodeMaxUtil(n);
      if (u >= 90) map[n.circle].critical++;
      else if (u >= 80) map[n.circle].high++;
      else if (u >= 70) map[n.circle].medium++;
    }
    return Object.entries(map)
      .map(([code, s]) => ({ code, ...s }))
      .sort((a, b) => (b.critical*3 + b.high*2 + b.medium) - (a.critical*3 + a.high*2 + a.medium));
  }, [selectedBrasType]);

  // Build Circle → City → BRAS hierarchy for main panel
  const hierarchy = useMemo(() => {
    const base = allNodes
      .filter(n => selectedBrasType === 'All' || n.bras_type === selectedBrasType)
      .filter(n => !selectedCircle || n.circle === selectedCircle)
      .filter(n => !search ||
        n.node.toLowerCase().includes(search.toLowerCase()) ||
        n.city.toLowerCase().includes(search.toLowerCase()) ||
        n.circle.toLowerCase().includes(search.toLowerCase())
      );

    // circle → city → nodes
    const circleMap: Record<string, Record<string, BrasNode[]>> = {};
    for (const n of base) {
      if (!circleMap[n.circle]) circleMap[n.circle] = {};
      if (!circleMap[n.circle][n.city]) circleMap[n.circle][n.city] = [];
      circleMap[n.circle][n.city].push(n);
    }

    return Object.entries(circleMap)
      .map(([circle, cityMap]) => {
        const cities = Object.entries(cityMap)
          .map(([city, nodes]) => {
            const sorted = [...nodes].sort((a, b) => nodeMaxUtil(b) - nodeMaxUtil(a));
            const critical = sorted.filter(n => nodeMaxUtil(n) >= 90).length;
            const high     = sorted.filter(n => nodeMaxUtil(n) >= 80 && nodeMaxUtil(n) < 90).length;
            const medium   = sorted.filter(n => nodeMaxUtil(n) >= 70 && nodeMaxUtil(n) < 80).length;
            return { city, nodes: sorted, critical, high, medium };
          })
          .sort((a, b) => (b.critical*3 + b.high*2 + b.medium) - (a.critical*3 + a.high*2 + a.medium));
        const critical = cities.reduce((s, c) => s + c.critical, 0);
        const high     = cities.reduce((s, c) => s + c.high, 0);
        const medium   = cities.reduce((s, c) => s + c.medium, 0);
        return { circle, cities, critical, high, medium };
      })
      .sort((a, b) => (b.critical*3 + b.high*2 + b.medium) - (a.critical*3 + a.high*2 + a.medium));
  }, [selectedCircle, search]);

  const aeSummary = useMemo(() => {
    const all = allNodes
      .filter(n => selectedBrasType === 'All' || n.bras_type === selectedBrasType)
      .flatMap(n => n.ae_interfaces);
    return {
      total:    all.length,
      critical: all.filter(a => a.max_util >= 90).length,
      high:     all.filter(a => a.max_util >= 80 && a.max_util < 90).length,
      medium:   all.filter(a => a.max_util >= 70 && a.max_util < 80).length,
      normal:   all.filter(a => a.max_util < 70).length,
    };
  }, [selectedBrasType]);

  const CATS: { key: FilterCat; label: string; color: string }[] = [
    { key: 'all',      label: 'All',    color: '#6b7280' },
    { key: 'critical', label: '>90%',   color: '#ef4444' },
    { key: 'high',     label: '80–90%', color: '#f87171' },
    { key: 'medium',   label: '70–80%', color: '#f59e0b' },
    { key: 'normal',   label: '<70%',   color: '#22c55e' },
  ];

  return (
    <div className="flex h-full overflow-hidden bg-bg text-txt">

      {/* ── Panel 1: Circles ── */}
      <aside className="w-44 flex-shrink-0 bg-panel border-r border-border flex flex-col overflow-hidden">
        <div className="px-3 py-2.5 border-b border-border">
          <div className="text-[11px] font-bold text-txt uppercase tracking-wider">Circles</div>
          <div className="text-[10px] text-muted mt-0.5">{aeSummary.total} AE ports total</div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div
            onClick={() => { setSelectedCircle(null); setSelectedAe(null); }}
            className={`px-3 py-2 cursor-pointer border-b border-border/40 flex justify-between items-center hover:bg-accent2/10 transition-colors ${!selectedCircle ? 'bg-accent2/15 border-l-2 border-l-accent2' : ''}`}
          >
            <span className={`text-[12px] font-semibold ${!selectedCircle ? 'text-accent2' : 'text-txt'}`}>All India</span>
            <span className="text-[10px] text-muted font-mono">{allNodes.length}</span>
          </div>
          {circleStats.map(c => (
            <div
              key={c.code}
              onClick={() => { setSelectedCircle(c.code); setSelectedAe(null); }}
              className={`px-3 py-2 cursor-pointer border-b border-border/30 hover:bg-accent2/10 transition-colors ${selectedCircle === c.code ? 'bg-accent2/15 border-l-2 border-l-accent2' : ''}`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className={`text-[12px] font-semibold ${selectedCircle === c.code ? 'text-accent2' : 'text-txt'}`}>{c.code}</div>
                  <div className="text-[9px] text-muted leading-tight">{CIRCLE_LABELS[c.code]?.split(' ')[0]}</div>
                </div>
                <span className="text-[10px] text-muted font-mono">{c.count}</span>
              </div>
              <div className="mt-1.5">
                <SeverityDots critical={c.critical} high={c.high} medium={c.medium} />
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <div className="flex-shrink-0 px-4 py-2 bg-panel border-b border-border flex items-center gap-3 flex-wrap">
          <input
            type="text"
            placeholder="Search circle / city / node..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-card border border-border rounded px-2 py-1 text-[11px] text-txt placeholder:text-muted focus:outline-none focus:border-accent2 w-52"
          />
          <select
            value={selectedBrasType}
            onChange={e => { setSelectedBrasType(e.target.value); setSelectedAe(null); }}
            className="bg-card border border-border rounded px-2 py-1 text-[11px] text-txt focus:outline-none focus:border-accent2"
          >
            {brasTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <div className="flex gap-1 ml-auto">
            {CATS.map(cat => (
              <button
                key={cat.key}
                onClick={() => { setFilterCat(cat.key); setSelectedAe(null); }}
                style={filterCat === cat.key ? { background: cat.color, borderColor: cat.color, color: '#0f172a' } : {}}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${filterCat === cat.key ? '' : 'bg-card border-border text-muted hover:text-txt'}`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Hierarchy + detail */}
        <div className="flex-1 overflow-hidden flex">

          {/* Scrollable hierarchy */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">

            {hierarchy.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-6">
                <div className="text-[13px] text-muted">No data matches current filters</div>
                <div className="flex gap-4 flex-wrap justify-center">
                  {[
                    { label: '>90% Critical', val: aeSummary.critical, color: '#ef4444' },
                    { label: '80–90% High',   val: aeSummary.high,     color: '#f87171' },
                    { label: '70–80% Medium', val: aeSummary.medium,   color: '#f59e0b' },
                    { label: '<70% Normal',   val: aeSummary.normal,   color: '#22c55e' },
                  ].map(s => (
                    <div key={s.label} className="bg-panel border border-border rounded-xl px-5 py-4 flex flex-col items-center gap-1" style={{ borderColor:`${s.color}40` }}>
                      <span className="text-[28px] font-black" style={{ color: s.color }}>{s.val}</span>
                      <span className="text-[11px] text-muted">{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {hierarchy.map(({ circle, cities, critical, high, medium }) => {
              const circleCollapsed = collapsedCircles.has(circle);
              return (
                <div key={circle}>
                  {/* ── Circle header ── */}
                  <button
                    onClick={() => toggleCircle(circle)}
                    className="w-full flex items-center gap-3 mb-3 group text-left"
                  >
                    <span className="text-[15px] font-black text-txt tracking-widest uppercase">{circle}</span>
                    <span className="text-[11px] text-muted">{CIRCLE_LABELS[circle] ?? ''}</span>
                    <SeverityDots critical={critical} high={high} medium={medium} />
                    <div className="flex-1 h-px bg-border mx-2" />
                    <span className="text-[10px] text-muted group-hover:text-txt">{circleCollapsed ? '▶' : '▼'}</span>
                  </button>

                  {!circleCollapsed && (
                    <div className="flex flex-col gap-5 pl-3">
                      {cities.map(({ city, nodes, critical: cc, high: ch, medium: cm }) => {
                        const cityKey = `${circle}__${city}`;
                        const cityCollapsed = collapsedCities.has(cityKey);
                        return (
                          <div key={city}>
                            {/* ── City header ── */}
                            <button
                              onClick={() => toggleCity(cityKey)}
                              className="w-full flex items-center gap-2 mb-2 group text-left"
                            >
                              <span className="text-[12px] font-bold text-txt/80 uppercase tracking-wider">{city}</span>
                              <span className="text-[9px] text-muted font-mono">{nodes.length} BRAS</span>
                              <SeverityDots critical={cc} high={ch} medium={cm} />
                              <div className="flex-1 h-px bg-border/50 mx-1" />
                              <span className="text-[10px] text-muted group-hover:text-txt">{cityCollapsed ? '▶' : '▼'}</span>
                            </button>

                            {!cityCollapsed && (
                              <div className="flex flex-col gap-3 pl-3">
                                {nodes.map(n => {
                                  const u = nodeMaxUtil(n);
                                  const s = utilStyle(u);
                                  const brasKey = `${circle}__${city}__${n.node}`;
                                  const brasCollapsed = collapsedBras.has(brasKey);
                                  const aes = filterAe(n.ae_interfaces);
                                  return (
                                    <div key={n.node} className="border border-border/50 rounded-lg overflow-hidden">
                                      {/* ── BRAS header ── */}
                                      <button
                                        onClick={() => toggleBras(brasKey)}
                                        className="w-full flex items-center gap-2 px-3 py-2 bg-card/60 hover:bg-card/90 transition-colors text-left"
                                      >
                                        <span className="text-[11px] font-bold text-txt font-mono">
                                          {n.node.replace('AIRBRAS_', '')}
                                        </span>
                                        <span className="text-[9px] text-muted">{n.bras_type}</span>
                                        <span className="text-[11px] font-bold ml-1" style={{ color: s.badge }}>
                                          {u.toFixed(1)}%
                                        </span>
                                        <span className="text-[9px] text-muted">{n.ae_interfaces.length} AEs</span>
                                        <div className="flex-1 h-1 rounded-full bg-border overflow-hidden mx-2">
                                          <div className="h-full rounded-full" style={{ width:`${Math.min(u,100)}%`, background: s.badge }} />
                                        </div>
                                        <span className="text-[10px] text-muted">{brasCollapsed ? '▶' : '▼'}</span>
                                      </button>

                                      {/* ── AE cubes ── */}
                                      {!brasCollapsed && (
                                        <div className="px-3 py-3 flex flex-wrap gap-3 bg-bg/30">
                                          {aes.length === 0 ? (
                                            <span className="text-[11px] text-muted py-2">No AE interfaces match filter</span>
                                          ) : aes.map(ae => (
                                            <AeCube
                                              key={`${n.node}-${ae.name}`}
                                              ae={ae}
                                              nodeKey={n.node}
                                              selected={selectedAe?.ae.name === ae.name && selectedAe?.node.node === n.node}
                                              onClick={() => setSelectedAe(
                                                selectedAe?.ae.name === ae.name && selectedAe?.node.node === n.node
                                                  ? null : { ae, node: n }
                                              )}
                                            />
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── AE detail panel ── */}
          {selectedAe && (() => {
            const s = utilStyle(selectedAe.ae.max_util);
            return (
              <div className="w-56 flex-shrink-0 bg-panel border-l border-border flex flex-col overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex justify-between items-center">
                  <span className="text-[13px] font-black text-txt font-mono">{selectedAe.ae.name}</span>
                  <button onClick={() => setSelectedAe(null)} className="text-muted hover:text-txt text-lg leading-none">×</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                  <div className="flex justify-center py-2">
                    <div style={{
                      width:96, height:96, background:s.bgGrad,
                      border:`3px solid ${s.border}`, borderRadius:12,
                      boxShadow:`7px 7px 0 ${s.shadow}`,
                      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:5,
                    }}>
                      <span style={{ fontSize:16, fontWeight:900, color:s.text, fontFamily:'monospace' }}>{selectedAe.ae.name}</span>
                      <span style={{ fontSize:24, fontWeight:900, color:'#fff', lineHeight:1 }}>{selectedAe.ae.max_util.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div>
                    <div className="h-2 rounded-full bg-card overflow-hidden border border-border">
                      <div className="h-full rounded-full" style={{ width:`${Math.min(selectedAe.ae.max_util,100)}%`, background: s.border }} />
                    </div>
                    <div className="flex justify-between text-[9px] text-muted mt-0.5">
                      <span>0</span><span style={{color:'#f59e0b'}}>70</span><span style={{color:'#f87171'}}>80</span><span style={{color:'#ef4444'}}>90</span><span>100%</span>
                    </div>
                  </div>
                  {[
                    { label: 'Interface', value: selectedAe.ae.name },
                    { label: 'Link Type', value: selectedAe.ae.link_type.replace('BRAS-','').replace('-LINK','') },
                    { label: 'Bandwidth', value: selectedAe.ae.bw_gb ? `${selectedAe.ae.bw_gb} Gb` : 'N/A' },
                    { label: 'Max Util',  value: `${selectedAe.ae.max_util.toFixed(2)}%` },
                    { label: 'BRAS Node', value: selectedAe.node.node },
                    { label: 'City',      value: selectedAe.node.city },
                    { label: 'Circle',    value: selectedAe.node.circle },
                  ].map(r => (
                    <div key={r.label} className="flex justify-between gap-2 items-start">
                      <span className="text-[10px] text-muted flex-shrink-0">{r.label}</span>
                      <span className="text-[10px] font-semibold text-txt text-right leading-tight">{r.value}</span>
                    </div>
                  ))}
                  <div className="rounded-lg p-3 border" style={{ background:`${s.border}14`, borderColor:`${s.border}40` }}>
                    <div className="text-[12px] font-bold" style={{ color: s.text }}>
                      {selectedAe.ae.max_util >= 90 ? 'CRITICAL' : selectedAe.ae.max_util >= 80 ? 'HIGH' : selectedAe.ae.max_util >= 70 ? 'MEDIUM' : 'NORMAL'}
                    </div>
                    <div className="text-[10px] text-muted mt-0.5">
                      {selectedAe.ae.max_util >= 90 ? 'Severely congested. Act now.' :
                       selectedAe.ae.max_util >= 80 ? 'Near saturation. Plan upgrade.' :
                       selectedAe.ae.max_util >= 70 ? 'Elevated. Monitor closely.' : 'Within healthy bounds.'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
