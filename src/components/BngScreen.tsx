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
  if (u >= 90) return { bg: '#7f1d1d', bgGrad: 'linear-gradient(145deg,#991b1b,#7f1d1d)', shadow: '#450a0a', border: '#dc2626', text: '#fca5a5', badge: '#ef4444' };
  if (u >= 80) return { bg: '#991b1b', bgGrad: 'linear-gradient(145deg,#b91c1c,#991b1b)', shadow: '#7f1d1d', border: '#f87171', text: '#fecaca', badge: '#f87171' };
  if (u >= 70) return { bg: '#78350f', bgGrad: 'linear-gradient(145deg,#92400e,#78350f)', shadow: '#451a03', border: '#fbbf24', text: '#fde68a', badge: '#f59e0b' };
  if (u >= 45) return { bg: '#14532d', bgGrad: 'linear-gradient(145deg,#166534,#14532d)', shadow: '#052e16', border: '#4ade80', text: '#86efac', badge: '#22c55e' };
  return { bg: '#052e16', bgGrad: 'linear-gradient(145deg,#14532d,#052e16)', shadow: '#022c22', border: '#16a34a', text: '#bbf7d0', badge: '#16a34a' };
}

function nodeMaxUtil(n: BrasNode) {
  return n.ae_interfaces.length ? Math.max(...n.ae_interfaces.map(a => a.max_util)) : 0;
}

// ── AE Cube ──────────────────────────────────────────────────────────────────
function AeCube({ ae, selected, onClick }: { ae: AeIface; selected: boolean; onClick: () => void }) {
  const s = utilStyle(ae.max_util);
  return (
    <button
      onClick={onClick}
      title={`${ae.name} · ${ae.link_type} · ${ae.bw_gb ?? '?'}G · ${ae.max_util.toFixed(1)}%`}
      style={{
        width: 80,
        height: 80,
        background: s.bgGrad,
        border: `2px solid ${selected ? '#60a5fa' : s.border}`,
        borderRadius: 10,
        boxShadow: selected
          ? `5px 5px 0 #1d3461, 0 0 0 2px #60a5fa44`
          : `5px 5px 0 ${s.shadow}`,
        transform: selected ? 'translate(-2px,-2px) scale(1.04)' : 'translate(0,0) scale(1)',
        transition: 'all 0.13s ease',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        cursor: 'pointer',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {/* shine */}
      <span style={{ position:'absolute', top:5, right:5, width:7, height:7, borderRadius:'50%', background:'rgba(255,255,255,0.15)', pointerEvents:'none' }} />
      <span style={{ fontSize:12, fontWeight:900, color: s.text, fontFamily:'monospace', letterSpacing:'-0.3px', lineHeight:1 }}>{ae.name}</span>
      <span style={{ fontSize:15, fontWeight:900, color:'#fff', lineHeight:1 }}>{ae.max_util.toFixed(1)}%</span>
      <span style={{ fontSize:9, color:'rgba(255,255,255,0.45)', lineHeight:1, maxWidth:68, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textAlign:'center' }}>
        {ae.link_type.replace('BRAS-','').replace('-LINK','')}
      </span>
    </button>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
type FilterCat = 'all' | 'critical' | 'high' | 'medium' | 'normal';

export default function BngScreen() {
  const [selectedCircle, setSelectedCircle] = useState<string | null>(null);
  const [selectedNodeName, setSelectedNodeName] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<FilterCat>('all');
  const [searchNode, setSearchNode] = useState('');
  const [selectedAe, setSelectedAe] = useState<AeIface | null>(null);

  // Circle stats
  const circles = useMemo(() => {
    const map: Record<string, { count: number; critical: number; high: number; medium: number }> = {};
    for (const n of allNodes) {
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
  }, []);

  // BRAS nodes for selected circle
  const nodesInCircle = useMemo(() => {
    const base = selectedCircle ? allNodes.filter(n => n.circle === selectedCircle) : allNodes;
    return base
      .filter(n => !searchNode || n.node.toLowerCase().includes(searchNode.toLowerCase()) || n.city.toLowerCase().includes(searchNode.toLowerCase()))
      .sort((a, b) => nodeMaxUtil(b) - nodeMaxUtil(a));
  }, [selectedCircle, searchNode]);

  // Selected BRAS node object
  const selectedNode = useMemo(
    () => allNodes.find(n => n.node === selectedNodeName) ?? null,
    [selectedNodeName]
  );

  // AE interfaces to show (filtered)
  const shownAe = useMemo(() => {
    if (!selectedNode) return [];
    const aes = selectedNode.ae_interfaces.filter(a => {
      if (filterCat === 'critical') return a.max_util >= 90;
      if (filterCat === 'high')     return a.max_util >= 80 && a.max_util < 90;
      if (filterCat === 'medium')   return a.max_util >= 70 && a.max_util < 80;
      if (filterCat === 'normal')   return a.max_util < 70;
      return true;
    });
    return aes.sort((a, b) => b.max_util - a.max_util);
  }, [selectedNode, filterCat]);

  // Global AE summary
  const aeSummary = useMemo(() => {
    const all = allNodes.flatMap(n => n.ae_interfaces);
    return {
      total: all.length,
      critical: all.filter(a => a.max_util >= 90).length,
      high:     all.filter(a => a.max_util >= 80 && a.max_util < 90).length,
      medium:   all.filter(a => a.max_util >= 70 && a.max_util < 80).length,
      normal:   all.filter(a => a.max_util < 70).length,
    };
  }, []);

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
            onClick={() => { setSelectedCircle(null); setSelectedNodeName(null); setSelectedAe(null); }}
            className={`px-3 py-2 cursor-pointer border-b border-border/40 flex justify-between items-center hover:bg-accent2/10 transition-colors ${!selectedCircle ? 'bg-accent2/15 border-l-2 border-l-accent2' : ''}`}
          >
            <span className={`text-[12px] font-semibold ${!selectedCircle ? 'text-accent2' : 'text-txt'}`}>All India</span>
            <span className="text-[10px] text-muted font-mono">{allNodes.length}</span>
          </div>
          {circles.map(c => (
            <div
              key={c.code}
              onClick={() => { setSelectedCircle(c.code); setSelectedNodeName(null); setSelectedAe(null); }}
              className={`px-3 py-2 cursor-pointer border-b border-border/30 hover:bg-accent2/10 transition-colors ${selectedCircle === c.code ? 'bg-accent2/15 border-l-2 border-l-accent2' : ''}`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className={`text-[12px] font-semibold ${selectedCircle === c.code ? 'text-accent2' : 'text-txt'}`}>{c.code}</div>
                  <div className="text-[9px] text-muted leading-tight">{CIRCLE_LABELS[c.code]?.split(' ')[0]}</div>
                </div>
                <span className="text-[10px] text-muted font-mono">{c.count}</span>
              </div>
              <div className="flex gap-1 mt-1.5 flex-wrap">
                {c.critical > 0 && <span className="text-[9px] px-1 py-0.5 rounded bg-red-500/20 text-red-400 font-bold">{c.critical}</span>}
                {c.high > 0 &&     <span className="text-[9px] px-1 py-0.5 rounded bg-red-400/20 text-red-300 font-bold">{c.high}</span>}
                {c.medium > 0 &&   <span className="text-[9px] px-1 py-0.5 rounded bg-yellow-400/20 text-yellow-300 font-bold">{c.medium}</span>}
                {c.critical === 0 && c.high === 0 && c.medium === 0 && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-green-500/20 text-green-400">OK</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* ── Panel 2: BRAS nodes ── */}
      <div className="w-52 flex-shrink-0 bg-panel border-r border-border flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b border-border flex flex-col gap-1.5">
          <div className="text-[11px] font-bold text-txt">
            {selectedCircle ? `${selectedCircle} BRAS` : 'All BRAS Nodes'}
          </div>
          <input
            type="text"
            placeholder="Search node / city..."
            value={searchNode}
            onChange={e => setSearchNode(e.target.value)}
            className="w-full bg-card border border-border rounded px-2 py-1 text-[10px] text-txt placeholder:text-muted focus:outline-none focus:border-accent2"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {nodesInCircle.map(n => {
            const u = nodeMaxUtil(n);
            const s = utilStyle(u);
            const isSelected = selectedNodeName === n.node;
            return (
              <div
                key={n.node}
                onClick={() => { setSelectedNodeName(isSelected ? null : n.node); setSelectedAe(null); }}
                className={`px-3 py-2.5 cursor-pointer border-b border-border/30 hover:bg-card/60 transition-colors ${isSelected ? 'bg-card border-l-2' : ''}`}
                style={isSelected ? { borderLeftColor: s.border } : {}}
              >
                <div className="flex justify-between items-start gap-1">
                  <div className="min-w-0 flex-1">
                    <div className={`text-[11px] font-bold leading-tight truncate ${isSelected ? 'text-txt' : 'text-txt'}`}>
                      {n.node.replace('AIRBRAS_', '')}
                    </div>
                    <div className="text-[9px] text-muted mt-0.5 truncate">{n.city}</div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                    <span className="text-[11px] font-bold" style={{ color: s.badge }}>{u.toFixed(1)}%</span>
                    <span className="text-[9px] text-muted">{n.ae_interfaces.length} AEs</span>
                  </div>
                </div>
                {/* mini util bar */}
                <div className="mt-1.5 h-1 rounded-full bg-border overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(u, 100)}%`, background: s.badge }} />
                </div>
              </div>
            );
          })}
          {nodesInCircle.length === 0 && (
            <div className="px-3 py-6 text-center text-[11px] text-muted">No nodes found</div>
          )}
        </div>
      </div>

      {/* ── Panel 3: AE cubes ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Sub-header */}
        <div className="flex-shrink-0 px-4 py-2 bg-panel border-b border-border flex items-center gap-3 flex-wrap">
          {selectedNode ? (
            <>
              <div>
                <span className="text-[13px] font-bold text-txt">{selectedNode.node}</span>
                <span className="text-[11px] text-muted ml-2">{selectedNode.city} · {selectedNode.bras_type}</span>
              </div>
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
            </>
          ) : (
            <div className="text-[12px] text-muted">
              {selectedCircle
                ? `Select a BRAS node from the list to view its AE interfaces`
                : `Select a Circle, then a BRAS node`}
            </div>
          )}
        </div>

        {/* Cubes + detail */}
        <div className="flex-1 overflow-hidden flex">

          {/* Cube grid */}
          <div className="flex-1 overflow-y-auto p-5">
            {!selectedNode ? (
              /* Empty state - show summary cards */
              <div className="flex flex-col items-center justify-center h-full gap-6">
                <div className="text-[13px] text-muted text-center">
                  {selectedCircle
                    ? `${nodesInCircle.length} BRAS nodes in ${selectedCircle} — pick one to view AE ports`
                    : 'Select a circle, then click a BRAS node'}
                </div>
                <div className="flex gap-4 flex-wrap justify-center">
                  {[
                    { label: '>90% Critical', val: aeSummary.critical, color: '#ef4444' },
                    { label: '80–90% High',   val: aeSummary.high,     color: '#f87171' },
                    { label: '70–80% Medium', val: aeSummary.medium,   color: '#f59e0b' },
                    { label: '<70% Normal',   val: aeSummary.normal,   color: '#22c55e' },
                  ].map(s => (
                    <div key={s.label} className="bg-panel border border-border rounded-xl px-5 py-4 flex flex-col items-center gap-1" style={{ borderColor: `${s.color}40` }}>
                      <span className="text-[28px] font-black" style={{ color: s.color }}>{s.val}</span>
                      <span className="text-[11px] text-muted">{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="text-[11px] text-muted mb-4">
                  <span className="text-txt font-semibold">{shownAe.length}</span> AE interfaces
                  {filterCat !== 'all' && <span className="ml-1 text-muted">· filtered by <span className="text-accent2">{filterCat}</span></span>}
                </div>
                <div className="flex flex-wrap gap-4">
                  {shownAe.map(ae => (
                    <AeCube
                      key={ae.name}
                      ae={ae}
                      selected={selectedAe?.name === ae.name}
                      onClick={() => setSelectedAe(selectedAe?.name === ae.name ? null : ae)}
                    />
                  ))}
                  {shownAe.length === 0 && (
                    <div className="text-muted text-sm py-8 w-full text-center">No AE interfaces match the current filter.</div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* AE detail panel */}
          {selectedAe && (() => {
            const s = utilStyle(selectedAe.max_util);
            return (
              <div className="w-56 flex-shrink-0 bg-panel border-l border-border flex flex-col overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex justify-between items-center">
                  <span className="text-[13px] font-black text-txt font-mono">{selectedAe.name}</span>
                  <button onClick={() => setSelectedAe(null)} className="text-muted hover:text-txt text-lg leading-none">×</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

                  {/* Big cube */}
                  <div className="flex justify-center py-2">
                    <div style={{
                      width:96, height:96, background:s.bgGrad,
                      border:`3px solid ${s.border}`, borderRadius:12,
                      boxShadow:`7px 7px 0 ${s.shadow}`,
                      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:5,
                    }}>
                      <span style={{ fontSize:16, fontWeight:900, color:s.text, fontFamily:'monospace' }}>{selectedAe.name}</span>
                      <span style={{ fontSize:24, fontWeight:900, color:'#fff', lineHeight:1 }}>{selectedAe.max_util.toFixed(1)}%</span>
                    </div>
                  </div>

                  {/* Bar */}
                  <div>
                    <div className="h-2 rounded-full bg-card overflow-hidden border border-border">
                      <div className="h-full rounded-full" style={{ width:`${Math.min(selectedAe.max_util,100)}%`, background: s.border }} />
                    </div>
                    <div className="flex justify-between text-[9px] text-muted mt-0.5">
                      <span>0</span><span style={{color:'#f59e0b'}}>70</span><span style={{color:'#f87171'}}>80</span><span style={{color:'#ef4444'}}>90</span><span>100%</span>
                    </div>
                  </div>

                  {/* Info rows */}
                  {[
                    { label: 'Interface', value: selectedAe.name },
                    { label: 'Link Type', value: selectedAe.link_type.replace('BRAS-','').replace('-LINK','') },
                    { label: 'Bandwidth', value: selectedAe.bw_gb ? `${selectedAe.bw_gb} Gb` : 'N/A' },
                    { label: 'Max Util', value: `${selectedAe.max_util.toFixed(2)}%` },
                    { label: 'BRAS Node', value: selectedNode?.node ?? '' },
                    { label: 'City', value: selectedNode?.city ?? '' },
                  ].map(r => (
                    <div key={r.label} className="flex justify-between gap-2 items-start">
                      <span className="text-[10px] text-muted flex-shrink-0">{r.label}</span>
                      <span className="text-[10px] font-semibold text-txt text-right leading-tight">{r.value}</span>
                    </div>
                  ))}

                  {/* Status */}
                  <div className="rounded-lg p-3 border" style={{ background:`${s.border}14`, borderColor:`${s.border}40` }}>
                    <div className="text-[12px] font-bold" style={{ color: s.text }}>
                      {selectedAe.max_util >= 90 ? 'CRITICAL' : selectedAe.max_util >= 80 ? 'HIGH' : selectedAe.max_util >= 70 ? 'MEDIUM' : 'NORMAL'}
                    </div>
                    <div className="text-[10px] text-muted mt-0.5">
                      {selectedAe.max_util >= 90 ? 'Severely congested. Act now.' :
                       selectedAe.max_util >= 80 ? 'Near saturation. Plan upgrade.' :
                       selectedAe.max_util >= 70 ? 'Elevated. Monitor closely.' : 'Within healthy bounds.'}
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
