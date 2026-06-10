'use client';
import { useMemo, useState, useEffect, useRef } from 'react';
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

interface BrasOptResult {
  node: BrasNode;
  aes: AeIface[];
  trafficGbps: number;
  bwGbps: number;
  avgUtil: number;
  maxUtil: number;
  isHealthy: boolean;
  l1: { canFix: boolean; cardsNeeded: number; projectedUtil: number };
  l2: { canFix: boolean; avgUtil: number; projectedUtil: number; donors: { name: string; headroomGbps: number; avgUtil: number }[]; cardsNeeded: number };
  l3: { canFix: boolean; avgUtil: number; projectedUtil: number; donorCities: { city: string; headroomGbps: number; nodes: { name: string; avgUtil: number }[] }[]; cardsNeeded: number };
}

interface UploadMeta {
  date: string;
  filename: string;
  uploadedAt: number;
  nodeCount: number;
}

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
  return n.ae_interfaces.length ? Math.max(...n.ae_interfaces.map(a => a.max_util ?? 0)) : 0;
}

function severity(u: number) {
  if (u >= 90) return { c: 0, h: 0, m: 0, critical: 1, high: 0, medium: 0 };
  if (u >= 80) return { critical: 0, high: 1, medium: 0 };
  if (u >= 70) return { critical: 0, high: 0, medium: 1 };
  return { critical: 0, high: 0, medium: 0 };
}

function AeCube({ ae, nodeKey, selected, onClick, optimizedUtil }: {
  ae: AeIface; nodeKey: string; selected: boolean; onClick: () => void; optimizedUtil?: number;
}) {
  const util  = ae.max_util ?? 0;
  const s     = utilStyle(optimizedUtil !== undefined ? optimizedUtil : util);
  const realS = utilStyle(util);
  return (
    <button
      onClick={onClick}
      title={optimizedUtil !== undefined
        ? `${ae.name} · ${util.toFixed(1)}% now → ${optimizedUtil.toFixed(1)}% after`
        : `${ae.name} · ${ae.link_type} · ${ae.bw_gb ?? '?'}G · ${util.toFixed(1)}%`}
      style={{
        width: 80, height: 80,
        background: s.bgGrad,
        border: `2px solid ${selected ? '#60a5fa' : s.border}`,
        borderRadius: 10,
        boxShadow: selected ? `5px 5px 0 #1d3461, 0 0 0 2px #60a5fa44` : `5px 5px 0 ${s.shadow}`,
        transform: selected ? 'translate(-2px,-2px) scale(1.04)' : 'none',
        transition: 'all 0.13s ease',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 2, cursor: 'pointer', flexShrink: 0, position: 'relative',
      }}
    >
      <span style={{ position:'absolute', top:5, right:5, width:7, height:7, borderRadius:'50%', background:'rgba(255,255,255,0.15)', pointerEvents:'none' }} />
      <span style={{ fontSize:11, fontWeight:900, color:s.text, fontFamily:'monospace', letterSpacing:'-0.3px', lineHeight:1 }}>{ae.name}</span>

      {optimizedUtil !== undefined ? (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:1 }}>
          <span style={{ fontSize:11, fontWeight:700, color: realS.badge, lineHeight:1, textDecoration:'line-through', opacity:0.85 }}>
            {util.toFixed(1)}%
          </span>
          <span style={{ fontSize:13, fontWeight:900, color:'#fff', lineHeight:1 }}>
            →{optimizedUtil.toFixed(0)}%
          </span>
        </div>
      ) : (
        <span style={{ fontSize:15, fontWeight:900, color:'#fff', lineHeight:1 }}>{util.toFixed(1)}%</span>
      )}

      <span style={{ fontSize:9, color:'rgba(255,255,255,0.45)', lineHeight:1, maxWidth:70, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textAlign:'center' }}>
        {ae.link_type.replace('BRAS-','').replace('-LINK','')}
      </span>
    </button>
  );
}

function NewAeCard({ projectedUtil, label }: { projectedUtil: number; label?: string }) {
  return (
    <div
      title={`New 100G AE card · projected ${projectedUtil.toFixed(1)}%`}
      style={{
        width: 80, height: 80,
        background: 'rgba(255,255,255,0.05)',
        border: '2px dashed rgba(255,255,255,0.28)',
        borderRadius: 10,
        boxShadow: '5px 5px 0 rgba(0,0,0,0.3)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 3, flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 900, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', letterSpacing: '-0.3px', lineHeight: 1 }}>+100G</span>
      <span style={{ fontSize: 15, fontWeight: 900, color: 'rgba(255,255,255,0.75)', lineHeight: 1 }}>NEW</span>
      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', lineHeight: 1 }}>→{projectedUtil.toFixed(0)}%</span>
      {label && <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', lineHeight: 1 }}>{label}</span>}
    </div>
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
  const [allNodes, setAllNodes]         = useState<BrasNode[]>(rawAeData as BrasNode[]);
  const [uploads, setUploads]           = useState<UploadMeta[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('default');
  const [uploading, setUploading]       = useState(false);
  const [uploadError, setUploadError]   = useState<{ message: string; details?: string[] } | null>(null);
  const fileInputRef                    = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/bng/list')
      .then(r => r.json())
      .then((list: UploadMeta[]) => {
        setUploads(list);
        if (list.length > 0) {
          fetch(`/api/bng/load?date=${encodeURIComponent(list[0].date)}`)
            .then(r => r.json())
            .then((nodes: BrasNode[]) => { setAllNodes(nodes); setSelectedDate(list[0].date); });
        }
      })
      .catch(() => {});
  }, []);

  async function handleFile(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res  = await fetch('/api/bng/upload', { method: 'POST', body: form });
      const data = await res.json() as { date?: string; nodeCount?: number; error?: string; details?: string[] };
      if (!res.ok || data.error) {
        setUploadError({ message: data.error ?? 'Upload failed.', details: data.details });
        return;
      }
      const nodesRes = await fetch(`/api/bng/load?date=${encodeURIComponent(data.date!)}`);
      const nodes    = await nodesRes.json() as BrasNode[];
      const fresh    = await (await fetch('/api/bng/list')).json() as UploadMeta[];
      setUploads(fresh);
      setAllNodes(nodes);
      setSelectedDate(data.date!);
    } catch {
      setUploadError({ message: 'Network error — could not reach the upload API.' });
    } finally {
      setUploading(false);
    }
  }

  async function switchToDate(date: string) {
    if (date === 'default') {
      setAllNodes(rawAeData as BrasNode[]);
      setSelectedDate('default');
    } else {
      const nodes = await (await fetch(`/api/bng/load?date=${encodeURIComponent(date)}`)).json() as BrasNode[];
      setAllNodes(nodes);
      setSelectedDate(date);
    }
  }

  const [selectedCircle, setSelectedCircle] = useState<string | null>(null);
  const [filterCat, setFilterCat]           = useState<FilterCat>('all');
  const [selectedBrasType, setSelectedBrasType] = useState('MX960');
  const [search, setSearch]                 = useState('');
  const [selectedAe, setSelectedAe]         = useState<{ ae: AeIface; node: BrasNode } | null>(null);
  const [collapsedBras, setCollapsedBras]   = useState<Set<string>>(new Set());
  const [collapsedCities, setCollapsedCities] = useState<Set<string>>(new Set());
  const [collapsedCircles, setCollapsedCircles] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab]           = useState<'util' | 'optim'>('util');
  const [optimLevel, setOptimLevel]         = useState<1 | 2 | 3>(1);

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
      .sort((a, b) => (b.max_util ?? 0) - (a.max_util ?? 0));
  }

  const brasTypes = useMemo(() => {
    const types = Array.from(new Set(allNodes.map(n => n.bras_type))).sort();
    return ['All', ...types];
  }, [allNodes]);

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
  }, [allNodes, selectedBrasType]);

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
  }, [allNodes, selectedCircle, search]);

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
  }, [allNodes, selectedBrasType]);

  // ── Optimisation computation: MX960 BRAS-DOWNLINK only ──
  const optimData = useMemo(() => {
    const TARGET = 70;
    const CARD_BW = 100; // Gbps per new AE card

    const mx960 = allNodes.filter(n => n.bras_type === 'MX960');

    // Per-BRAS traffic stats (DOWNLINK only)
    interface BrasStats {
      node: BrasNode; aes: AeIface[];
      trafficGbps: number; bwGbps: number; avgUtil: number; maxUtil: number;
    }
    const brasStats: BrasStats[] = mx960.flatMap(n => {
      const aes = n.ae_interfaces.filter(a => a.link_type === 'BRAS-DOWNLINK');
      if (!aes.length) return [];
      const trafficGbps = aes.reduce((s, a) => s + ((a.max_util ?? 0) / 100) * (a.bw_gb ?? CARD_BW), 0);
      const bwGbps      = aes.reduce((s, a) => s + (a.bw_gb ?? CARD_BW), 0);
      const avgUtil     = bwGbps > 0 ? (trafficGbps / bwGbps) * 100 : 0;
      const maxUtil     = Math.max(...aes.map(a => a.max_util ?? 0));
      return [{ node: n, aes, trafficGbps, bwGbps, avgUtil, maxUtil }];
    });

    // City totals (all BRAS in city, not just overloaded)
    const cityTotals = new Map<string, { trafficGbps: number; bwGbps: number; nodes: BrasStats[] }>();
    for (const bs of brasStats) {
      const key = `${bs.node.circle}::${bs.node.city}`;
      if (!cityTotals.has(key)) cityTotals.set(key, { trafficGbps: 0, bwGbps: 0, nodes: [] });
      const c = cityTotals.get(key)!;
      c.trafficGbps += bs.trafficGbps;
      c.bwGbps      += bs.bwGbps;
      c.nodes.push(bs);
    }

    // Circle totals
    const circleTotals = new Map<string, { trafficGbps: number; bwGbps: number }>();
    for (const bs of brasStats) {
      const key = bs.node.circle;
      if (!circleTotals.has(key)) circleTotals.set(key, { trafficGbps: 0, bwGbps: 0 });
      const c = circleTotals.get(key)!;
      c.trafficGbps += bs.trafficGbps;
      c.bwGbps      += bs.bwGbps;
    }

    // Build per-BRAS optimisation result for all MX960 BRAS
    const results: BrasOptResult[] = [];

    for (const bs of brasStats) {
      const isHealthy = bs.maxUtil < TARGET;

      // ── L1: within BRAS ──
      const l1CanFix     = bs.avgUtil < TARGET;
      let l1CardsNeeded  = 0;
      let l1Projected    = bs.avgUtil;
      if (!l1CanFix) {
        l1CardsNeeded = Math.ceil((bs.trafficGbps / (TARGET / 100) - bs.bwGbps) / CARD_BW);
        l1Projected   = (bs.trafficGbps / (bs.bwGbps + l1CardsNeeded * CARD_BW)) * 100;
      }

      // ── L2: within city ──
      const cityKey  = `${bs.node.circle}::${bs.node.city}`;
      const city     = cityTotals.get(cityKey)!;
      const l2AvgUtil = city.bwGbps > 0 ? (city.trafficGbps / city.bwGbps) * 100 : 0;
      const l2CanFix  = l2AvgUtil < TARGET;
      const l2Donors  = city.nodes
        .filter(o => o.node.node !== bs.node.node && o.avgUtil < TARGET)
        .map(o => ({
          name: o.node.node.replace('AIRBRAS_', ''),
          headroomGbps: Math.round((TARGET / 100) * o.bwGbps - o.trafficGbps),
          avgUtil: o.avgUtil,
        }))
        .filter(d => d.headroomGbps > 0)
        .sort((a, b) => b.headroomGbps - a.headroomGbps);
      let l2CardsNeeded = 0;
      if (!l2CanFix) {
        l2CardsNeeded = Math.ceil((city.trafficGbps / (TARGET / 100) - city.bwGbps) / CARD_BW);
      }
      const l2Projected = l2CanFix ? l2AvgUtil : (city.trafficGbps / (city.bwGbps + l2CardsNeeded * CARD_BW)) * 100;

      // ── L3: within circle ──
      const circle     = circleTotals.get(bs.node.circle)!;
      const l3AvgUtil  = circle.bwGbps > 0 ? (circle.trafficGbps / circle.bwGbps) * 100 : 0;
      const l3CanFix   = l3AvgUtil < TARGET;
      const donorCities: { city: string; headroomGbps: number; nodes: { name: string; avgUtil: number }[] }[] = [];
      Array.from(cityTotals.entries()).forEach(([key, cdata]) => {
        const [cir, cit] = key.split('::');
        if (cir !== bs.node.circle || cit === bs.node.city) return;
        const cAvg = cdata.bwGbps > 0 ? (cdata.trafficGbps / cdata.bwGbps) * 100 : 0;
        if (cAvg < TARGET) {
          const headroom = Math.round((TARGET / 100) * cdata.bwGbps - cdata.trafficGbps);
          if (headroom > 0) donorCities.push({
            city: cit,
            headroomGbps: headroom,
            nodes: cdata.nodes
              .filter(n => n.avgUtil < TARGET)
              .map(n => ({ name: n.node.node.replace('AIRBRAS_', ''), avgUtil: n.avgUtil }))
              .sort((a, b) => b.avgUtil - a.avgUtil),
          });
        }
      });
      donorCities.sort((a, b) => b.headroomGbps - a.headroomGbps);
      let l3CardsNeeded = 0;
      if (!l3CanFix) {
        l3CardsNeeded = Math.ceil((circle.trafficGbps / (TARGET / 100) - circle.bwGbps) / CARD_BW);
      }
      const l3Projected = l3CanFix ? l3AvgUtil : (circle.trafficGbps / (circle.bwGbps + l3CardsNeeded * CARD_BW)) * 100;

      results.push({
        node: bs.node, aes: bs.aes,
        trafficGbps: bs.trafficGbps, bwGbps: bs.bwGbps,
        avgUtil: bs.avgUtil, maxUtil: bs.maxUtil, isHealthy,
        l1: { canFix: l1CanFix, cardsNeeded: l1CardsNeeded, projectedUtil: l1Projected },
        l2: { canFix: l2CanFix, avgUtil: l2AvgUtil, projectedUtil: l2Projected, donors: l2Donors, cardsNeeded: l2CardsNeeded },
        l3: { canFix: l3CanFix, avgUtil: l3AvgUtil, projectedUtil: l3Projected, donorCities, cardsNeeded: l3CardsNeeded },
      });
    }

    const overloaded = results.filter(r => !r.isHealthy);
    const summary = {
      alreadyOk: results.filter(r => r.isHealthy).length,
      l1Fix:     overloaded.filter(r => r.l1.canFix).length,
      l2Fix:     overloaded.filter(r => !r.l1.canFix && r.l2.canFix).length,
      l3Fix:     overloaded.filter(r => !r.l2.canFix && r.l3.canFix).length,
      needCards: overloaded.filter(r => !r.l3.canFix).length,
      total:     results.length,
      overloaded: overloaded.length,
    };

    return { results, summary };
  }, [allNodes]);

  const CATS: { key: FilterCat; label: string; color: string }[] = [
    { key: 'all',      label: 'All',    color: '#6b7280' },
    { key: 'critical', label: '>90%',   color: '#ef4444' },
    { key: 'high',     label: '80–90%', color: '#f87171' },
    { key: 'medium',   label: '70–80%', color: '#f59e0b' },
    { key: 'normal',   label: '<70%',   color: '#22c55e' },
  ];

  // Build optimisation hierarchy filtered by selectedCircle + search
  const optimHierarchy = useMemo(() => {
    let filtered = optimData.results;
    if (selectedCircle) filtered = filtered.filter(r => r.node.circle === selectedCircle);
    if (search) filtered = filtered.filter(r =>
      r.node.node.toLowerCase().includes(search.toLowerCase()) ||
      r.node.city.toLowerCase().includes(search.toLowerCase()) ||
      r.node.circle.toLowerCase().includes(search.toLowerCase())
    );

    const circleMap: Record<string, Record<string, BrasOptResult[]>> = {};
    for (const r of filtered) {
      if (!circleMap[r.node.circle]) circleMap[r.node.circle] = {};
      if (!circleMap[r.node.circle][r.node.city]) circleMap[r.node.circle][r.node.city] = [];
      circleMap[r.node.circle][r.node.city].push(r);
    }

    return Object.entries(circleMap).map(([circle, cityMap]) => ({
      circle,
      cities: Object.entries(cityMap).map(([city, nodes]) => ({
        city,
        nodes: nodes.sort((a, b) => {
          if (a.isHealthy !== b.isHealthy) return a.isHealthy ? 1 : -1;
          return b.maxUtil - a.maxUtil;
        }),
      })),
    }));
  }, [optimData, selectedCircle, search]);

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

        {/* Data source bar */}
        <div className="flex-shrink-0 px-4 py-1.5 bg-card/60 border-b border-border flex items-center gap-3 flex-wrap">
          <span className="text-[10px] text-muted uppercase tracking-wider font-semibold">Data source</span>

          {/* Upload button */}
          <label
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-semibold cursor-pointer transition-colors select-none
              ${uploading ? 'border-accent2/40 text-accent2/60' : 'border-border text-muted hover:text-txt hover:border-txt/40 bg-card'}`}
          >
            {uploading ? '⏳ Parsing…' : '↑ Upload xlsx'}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
            />
          </label>

          {/* History dropdown */}
          {uploads.length > 0 && (
            <select
              value={selectedDate}
              onChange={e => switchToDate(e.target.value)}
              className="bg-card border border-border rounded px-2 py-1 text-[11px] text-txt focus:outline-none focus:border-accent2 max-w-[260px]"
            >
              {uploads.map(u => (
                <option key={u.date} value={u.date}>
                  {u.date} · {u.nodeCount} nodes · {u.filename.slice(0, 28)}{u.filename.length > 28 ? '…' : ''}
                </option>
              ))}
              <option value="default">Default (built-in snapshot)</option>
            </select>
          )}

          {selectedDate !== 'default' && (
            <span className="text-[10px] text-accent2 font-semibold ml-1">
              Viewing {selectedDate}
            </span>
          )}
        </div>

        {/* Upload error banner */}
        {uploadError && (
          <div className="flex-shrink-0 px-4 py-2.5 bg-red-950/60 border-b border-red-700/50 flex items-start gap-3">
            <span className="text-red-400 text-[11px] font-black mt-0.5 flex-shrink-0">Upload failed</span>
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <span className="text-red-300 text-[11px] font-semibold">{uploadError.message}</span>
              {uploadError.details && uploadError.details.map((d, i) => (
                <span key={i} className="text-red-400/80 text-[10px] font-mono">{d}</span>
              ))}
            </div>
            <button
              onClick={() => setUploadError(null)}
              className="text-red-500 hover:text-red-300 text-lg leading-none flex-shrink-0"
            >×</button>
          </div>
        )}

        {/* Top bar */}
        <div className="flex-shrink-0 px-4 py-2 bg-panel border-b border-border flex items-center gap-3 flex-wrap">

          {/* Tab switcher */}
          <div className="flex border border-border rounded overflow-hidden text-[11px] font-semibold flex-shrink-0">
            <button
              onClick={() => setActiveTab('util')}
              className={`px-3 py-1 transition-colors ${activeTab === 'util' ? 'bg-accent2 text-bg' : 'text-muted hover:text-txt'}`}
            >Utilisation</button>
            <button
              onClick={() => { setActiveTab('optim'); setSelectedBrasType('MX960'); setSelectedAe(null); }}
              className={`px-3 py-1 border-l border-border transition-colors ${activeTab === 'optim' ? 'bg-accent2 text-bg' : 'text-muted hover:text-txt'}`}
            >Optimisation</button>
          </div>

          <input
            type="text"
            placeholder="Search circle / city / node..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-card border border-border rounded px-2 py-1 text-[11px] text-txt placeholder:text-muted focus:outline-none focus:border-accent2 w-52"
          />
          {activeTab === 'util' && (
            <select
              value={selectedBrasType}
              onChange={e => { setSelectedBrasType(e.target.value); setSelectedAe(null); }}
              className="bg-card border border-border rounded px-2 py-1 text-[11px] text-txt focus:outline-none focus:border-accent2"
            >
              {brasTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          )}
          {activeTab === 'optim' && (
            <span className="text-[10px] text-muted border border-border/50 rounded px-2 py-1 bg-card/50">
              MX960 · DOWNLINK only
            </span>
          )}
          {activeTab === 'util' && (
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
          )}
        </div>

        {/* ── Utilisation tab ── */}
        {activeTab === 'util' && (
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
              const aeUtil = selectedAe.ae.max_util ?? 0;
              const s = utilStyle(aeUtil);
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
                        <span style={{ fontSize:24, fontWeight:900, color:'#fff', lineHeight:1 }}>{aeUtil.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div>
                      <div className="h-2 rounded-full bg-card overflow-hidden border border-border">
                        <div className="h-full rounded-full" style={{ width:`${Math.min(aeUtil,100)}%`, background: s.border }} />
                      </div>
                      <div className="flex justify-between text-[9px] text-muted mt-0.5">
                        <span>0</span><span style={{color:'#f59e0b'}}>70</span><span style={{color:'#f87171'}}>80</span><span style={{color:'#ef4444'}}>90</span><span>100%</span>
                      </div>
                    </div>
                    {[
                      { label: 'Interface', value: selectedAe.ae.name },
                      { label: 'Link Type', value: selectedAe.ae.link_type.replace('BRAS-','').replace('-LINK','') },
                      { label: 'Bandwidth', value: selectedAe.ae.bw_gb ? `${selectedAe.ae.bw_gb} Gb` : 'N/A' },
                      { label: 'Max Util',  value: `${aeUtil.toFixed(2)}%` },
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
                        {aeUtil >= 90 ? 'CRITICAL' : aeUtil >= 80 ? 'HIGH' : aeUtil >= 70 ? 'MEDIUM' : 'NORMAL'}
                      </div>
                      <div className="text-[10px] text-muted mt-0.5">
                        {aeUtil >= 90 ? 'Severely congested. Act now.' :
                         aeUtil >= 80 ? 'Near saturation. Plan upgrade.' :
                         aeUtil >= 70 ? 'Elevated. Monitor closely.' : 'Within healthy bounds.'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── Optimisation tab ── */}
        {activeTab === 'optim' && (
          <div className="flex-1 overflow-hidden flex flex-col">

            {/* Summary strip */}
            <div className="flex-shrink-0 px-4 py-2 border-b border-border bg-card/40 flex items-center gap-5 flex-wrap">
              <span className="text-[10px] text-muted font-semibold uppercase tracking-wider flex-shrink-0">
                {optimData.summary.total} MX960 BRAS
              </span>
              {[
                { label: 'healthy',          val: optimData.summary.alreadyOk,  color: '#22c55e' },
                { label: 'L1 within BRAS',   val: optimData.summary.l1Fix,      color: '#4ade80' },
                { label: 'L2 within city',   val: optimData.summary.l2Fix,      color: '#86efac' },
                { label: 'L3 within circle', val: optimData.summary.l3Fix,      color: '#a3e635' },
                { label: 'need new cards',   val: optimData.summary.needCards,  color: '#f87171' },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-1.5">
                  <span className="text-[16px] font-black" style={{ color: s.color }}>{s.val}</span>
                  <span className="text-[10px] text-muted">{s.label}</span>
                </div>
              ))}
              {/* Level toggle */}
              <div className="ml-auto flex border border-border rounded overflow-hidden text-[11px] font-semibold flex-shrink-0">
                {([1, 2, 3] as const).map(lvl => (
                  <button
                    key={lvl}
                    onClick={() => setOptimLevel(lvl)}
                    className={`px-3 py-1 border-r last:border-r-0 border-border transition-colors ${
                      optimLevel === lvl ? 'bg-accent2 text-bg' : 'text-muted hover:text-txt'
                    }`}
                  >
                    L{lvl}
                  </button>
                ))}
              </div>
            </div>

            {/* Hierarchy */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">

              {optimHierarchy.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <span className="text-[13px] text-muted">No MX960 BRAS match current filters</span>
                </div>
              )}

              {optimHierarchy.map(({ circle, cities }) => {
                const circleCollapsed = collapsedCircles.has(`opt-${circle}`);
                return (
                  <div key={circle}>
                    {/* Circle header */}
                    <button
                      onClick={() => toggleCircle(`opt-${circle}`)}
                      className="w-full flex items-center gap-3 mb-3 group text-left"
                    >
                      <span className="text-[15px] font-black text-txt tracking-widest uppercase">{circle}</span>
                      <span className="text-[11px] text-muted">{CIRCLE_LABELS[circle] ?? ''}</span>
                      <span className="text-[10px] text-muted font-mono">
                        {cities.reduce((s, c) => s + c.nodes.length, 0)} BRAS
                      </span>
                      <div className="flex-1 h-px bg-border mx-2" />
                      <span className="text-[10px] text-muted group-hover:text-txt">{circleCollapsed ? '▶' : '▼'}</span>
                    </button>

                    {!circleCollapsed && (
                      <div className="flex flex-col gap-5 pl-3">
                        {cities.map(({ city, nodes }) => {
                          const cityKey = `opt-${circle}__${city}`;
                          const cityCollapsed = collapsedCities.has(cityKey);
                          return (
                            <div key={city}>
                              {/* City header */}
                              <button
                                onClick={() => toggleCity(cityKey)}
                                className="w-full flex items-center gap-2 mb-2 group text-left"
                              >
                                <span className="text-[12px] font-bold text-txt/80 uppercase tracking-wider">{city}</span>
                                <span className="text-[9px] text-muted font-mono">{nodes.length} BRAS</span>
                                {nodes.some(n => n.isHealthy) && (
                                  <span className="text-[9px] text-green-400/70 font-mono">
                                    {nodes.filter(n => n.isHealthy).length} ✓
                                  </span>
                                )}
                                <div className="flex-1 h-px bg-border/50 mx-1" />
                                <span className="text-[10px] text-muted group-hover:text-txt">{cityCollapsed ? '▶' : '▼'}</span>
                              </button>

                              {!cityCollapsed && (
                                <div className="flex flex-col gap-3 pl-3">
                                  {nodes.map(r => {
                                    const s = utilStyle(r.maxUtil);
                                    return (
                                      <div key={r.node.node}
                                        className={`border rounded-lg overflow-hidden ${r.isHealthy ? 'border-green-500/20 opacity-60 hover:opacity-90 transition-opacity' : 'border-border/50'}`}
                                      >

                                        {/* BRAS header */}
                                        <div className={`flex items-center gap-2 px-3 py-2 ${r.isHealthy ? 'bg-green-500/5' : 'bg-card/60'}`}>
                                          <span className="text-[11px] font-bold text-txt font-mono">
                                            {r.node.node.replace('AIRBRAS_', '')}
                                          </span>
                                          <span className="text-[9px] text-muted">MX960</span>
                                          <span className="text-[11px] font-bold" style={{ color: s.badge }}>
                                            {r.maxUtil.toFixed(1)}% max
                                          </span>
                                          {r.isHealthy && (
                                            <span className="text-[9px] font-bold text-green-400 bg-green-500/15 px-1.5 py-0.5 rounded">✓ healthy</span>
                                          )}
                                          <span className="text-[9px] text-muted">{r.aes.length} DL AEs</span>
                                          <div className="flex-1 h-1 rounded-full bg-border overflow-hidden mx-2">
                                            <div className="h-full rounded-full transition-all"
                                              style={{ width: `${Math.min(r.avgUtil, 100)}%`, background: s.badge }} />
                                          </div>
                                          <span className="text-[9px] text-muted font-mono flex-shrink-0">
                                            {r.trafficGbps.toFixed(0)}G / {r.bwGbps}G
                                          </span>
                                        </div>

                                        {/* AE card grid + white cards */}
                                        {(() => {
                                          const lv = optimLevel;
                                          const cards = r.isHealthy ? 0 : (lv === 1 ? r.l1.cardsNeeded : lv === 2 ? r.l2.cardsNeeded : r.l3.cardsNeeded);
                                          const proj  = lv === 1 ? r.l1.projectedUtil : lv === 2 ? r.l2.projectedUtil : r.l3.projectedUtil;
                                          const canFix = r.isHealthy || (lv === 1 ? r.l1.canFix : lv === 2 ? r.l2.canFix : r.l3.canFix);
                                          const whiteLabel = lv === 2 ? 'city' : lv === 3 ? 'circle' : undefined;
                                          return (
                                            <div className="px-3 py-3 flex flex-wrap gap-3 bg-bg/30">
                                              {r.aes.map(ae => (
                                                <AeCube
                                                  key={ae.name}
                                                  ae={ae}
                                                  nodeKey={r.node.node}
                                                  selected={false}
                                                  onClick={() => {}}
                                                  optimizedUtil={r.isHealthy ? undefined : proj}
                                                />
                                              ))}
                                              {!canFix && Array.from({ length: cards }).map((_, i) => (
                                                <NewAeCard key={i} projectedUtil={proj} label={whiteLabel} />
                                              ))}
                                            </div>
                                          );
                                        })()}

                                        {/* Selected-level analysis text — only for overloaded nodes */}
                                        {!r.isHealthy && <div className="px-3 pb-2.5 flex flex-col gap-2 bg-bg/30">

                                          {/* L1 */}
                                          <div className="flex items-start gap-2">
                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0 ${
                                              r.l1.canFix ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                            }`}>L1</span>
                                            <div className="text-[10px] leading-relaxed">
                                              {r.l1.canFix ? (
                                                <span className="text-green-400">
                                                  avg {r.avgUtil.toFixed(1)}% — rebalance {r.aes.length} AE cards within this BRAS → all cards below 70%
                                                </span>
                                              ) : (
                                                <>
                                                  <span className="text-muted">avg {r.avgUtil.toFixed(1)}% — rebalancing won't help · </span>
                                                  <span className="text-amber-400">
                                                    add {r.l1.cardsNeeded}×100G card{r.l1.cardsNeeded > 1 ? 's' : ''} → {r.l1.projectedUtil.toFixed(1)}% per card
                                                  </span>
                                                </>
                                              )}
                                            </div>
                                          </div>

                                          {/* L2 */}
                                          <div className="flex items-start gap-2">
                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0 ${
                                              r.l2.canFix ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'
                                            }`}>L2</span>
                                            <div className="text-[10px] leading-relaxed">
                                              {r.l2.canFix ? (
                                                <div className="flex flex-col gap-1">
                                                  <div>
                                                    <span className="text-green-400">city avg {r.l2.avgUtil.toFixed(1)}% — fixable within {r.node.city}</span>
                                                  </div>
                                                  {r.l2.donors.length > 0 && (
                                                    <div className="flex flex-col gap-0.5 pl-1 border-l-2 border-green-500/30">
                                                      {r.l2.donors.slice(0, 3).map(d => (
                                                        <div key={d.name} className="flex items-center gap-1.5">
                                                          <span className="text-txt font-semibold">{d.name}</span>
                                                          <span className="text-muted">·</span>
                                                          <span style={{ color: utilStyle(d.avgUtil).badge }}>{d.avgUtil.toFixed(1)}%</span>
                                                          <span className="text-green-400/70">{d.headroomGbps}G free</span>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  )}
                                                </div>
                                              ) : (
                                                <>
                                                  <span className="text-amber-400">city avg {r.l2.avgUtil.toFixed(1)}% — city also overloaded</span>
                                                  <span className="text-muted">
                                                    {' · '}{r.l2.cardsNeeded} card{r.l2.cardsNeeded !== 1 ? 's' : ''} needed city-wide
                                                  </span>
                                                </>
                                              )}
                                            </div>
                                          </div>

                                          {/* L3 */}
                                          <div className="flex items-start gap-2">
                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0 ${
                                              r.l3.canFix ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                            }`}>L3</span>
                                            <div className="text-[10px] leading-relaxed">
                                              {r.l3.canFix ? (
                                                <div className="flex flex-col gap-1">
                                                  <div>
                                                    <span className="text-green-400">circle avg {r.l3.avgUtil.toFixed(1)}% — fixable within {r.node.circle}</span>
                                                  </div>
                                                  {r.l3.donorCities.length > 0 && (
                                                    <div className="flex flex-col gap-1.5 pl-1 border-l-2 border-green-500/30">
                                                      {r.l3.donorCities.slice(0, 3).map(d => (
                                                        <div key={d.city} className="flex flex-col gap-0.5">
                                                          <div className="flex items-center gap-1.5">
                                                            <span className="text-txt font-semibold">{d.city}</span>
                                                            <span className="text-green-400/70">{d.headroomGbps}G free</span>
                                                          </div>
                                                          {d.nodes.slice(0, 3).map(n => (
                                                            <div key={n.name} className="flex items-center gap-1 pl-2">
                                                              <span className="text-muted/60">↳</span>
                                                              <span className="text-txt/80 font-mono text-[9px]">{n.name}</span>
                                                              <span style={{ color: utilStyle(n.avgUtil).badge }} className="text-[9px]">{n.avgUtil.toFixed(1)}%</span>
                                                            </div>
                                                          ))}
                                                        </div>
                                                      ))}
                                                    </div>
                                                  )}
                                                </div>
                                              ) : (
                                                <>
                                                  <span className="text-red-400">circle avg {r.l3.avgUtil.toFixed(1)}% — entire circle overloaded</span>
                                                  <span className="text-muted">
                                                    {' · '}{r.l3.cardsNeeded} new card{r.l3.cardsNeeded !== 1 ? 's' : ''} needed in {r.node.circle}
                                                  </span>
                                                </>
                                              )}
                                            </div>
                                          </div>

                                        </div>}
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
          </div>
        )}

      </div>
    </div>
  );
}
