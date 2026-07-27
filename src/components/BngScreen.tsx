'use client';
import { useMemo, useState, useEffect, useRef } from 'react';
import rawAeData from '@/data/bngAeData.json';
import rawFabricData from '@/data/bngFabricType.json';
import { computeHubTrafficDeltas, HUB_SUBSCRIBER_DELTAS, applyHubDeltasToNodes } from '@/lib/networkOptimised';
import { joinFabricClassification, normalizeNodeName, type FabricRecord } from '@/lib/bngFabricJoin';

interface AeIface {
  name: string;
  link_type: string;
  bw_gb: number | null;
  max_util: number;
  port_capacity?: number;
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
  preOptimMaxUtil?: number;
  isHealthy: boolean;
  site: string;
  shuttingDown: boolean;
  l1: { canFix: boolean; cardsNeeded: number; projectedUtil: number };
  l2: { canFix: boolean; avgUtil: number; projectedUtil: number; donors: { name: string; headroomGbps: number; avgUtil: number; shuttingDown: boolean }[]; cardsNeeded: number };
  l3: { canFix: boolean; avgUtil: number; projectedUtil: number; donorCities: { city: string; headroomGbps: number; nodes: { name: string; avgUtil: number; shuttingDown: boolean }[] }[]; cardsNeeded: number };
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

const FABRIC_TYPE_COLORS: Record<string, string> = {
  'Fabric': '#60a5fa', 'Non Fabric': '#a78bfa', 'Unknown': '#6b7280',
};
const BNG_TYPE_COLORS: Record<string, string> = {
  'FTTH': '#22c55e', 'CFWA RBNG': '#f59e0b', 'Non CFWA': '#6b7280', 'CFWA BNG': '#f59e0b', 'CFWA': '#f59e0b', 'Unknown': '#6b7280',
};
const STATUS_COLORS: Record<string, string> = {
  'Live': '#22c55e', 'Non Live': '#ef4444', 'Unknown': '#6b7280',
};
const SERVICES_COLORS: Record<string, string> = {
  'FTTH': '#22c55e', 'FWA': '#3b82f6', 'FTTH+FWA': '#a78bfa', 'Unknown': '#6b7280',
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

function fmtSubs(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}K` : Math.round(n).toString();
}

function NewAeCard({ projectedUtil, label, capacityLabel }: { projectedUtil: number; label?: string; capacityLabel?: string }) {
  return (
    <div
      title={`New ${capacityLabel ?? '100G AE card'} · projected ${projectedUtil.toFixed(1)}%`}
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
      <span style={{ fontSize: 11, fontWeight: 900, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', letterSpacing: '-0.3px', lineHeight: 1 }}>+{capacityLabel ?? '100G'}</span>
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

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="text-[10px] font-semibold px-2 py-1 rounded-md border"
      style={{ color, borderColor: `${color}55`, background: `${color}18` }}
    >{label}</span>
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

    fetch('/api/bng/list-subscriber')
      .then(r => r.json())
      .then((list: UploadMeta[]) => {
        setSubUploads(list);
        if (list.length > 0) {
          fetch(`/api/bng/load-subscriber?date=${encodeURIComponent(list[0].date)}`)
            .then(r => r.json())
            .then((nodes: BrasNode[]) => { setSubNodes(nodes); setSelectedSubDate(list[0].date); });
        }
      })
      .catch(() => {});

    fetch('/api/bng/list-fabric')
      .then(r => r.json())
      .then((list: UploadMeta[]) => {
        setFabricUploads(list);
        if (list.length > 0) {
          fetch(`/api/bng/load-fabric?date=${encodeURIComponent(list[0].date)}`)
            .then(r => r.json())
            .then((records: FabricRecord[]) => { setFabricRecords(records); setSelectedFabricDate(list[0].date); });
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

  async function handleSubFile(file: File) {
    setSubUploading(true);
    setSubUploadError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res  = await fetch('/api/bng/upload-subscriber', { method: 'POST', body: form });
      const data = await res.json() as { date?: string; nodeCount?: number; error?: string; details?: string[] };
      if (!res.ok || data.error) {
        setSubUploadError({ message: data.error ?? 'Upload failed.', details: data.details });
        return;
      }
      const nodesRes = await fetch(`/api/bng/load-subscriber?date=${encodeURIComponent(data.date!)}`);
      const nodes    = await nodesRes.json() as BrasNode[];
      const fresh    = await (await fetch('/api/bng/list-subscriber')).json() as UploadMeta[];
      setSubUploads(fresh);
      setSubNodes(nodes);
      setSelectedSubDate(data.date!);
    } catch {
      setSubUploadError({ message: 'Network error — could not reach the upload API.' });
    } finally {
      setSubUploading(false);
    }
  }

  async function switchToSubDate(date: string) {
    const nodes = await (await fetch(`/api/bng/load-subscriber?date=${encodeURIComponent(date)}`)).json() as BrasNode[];
    setSubNodes(nodes);
    setSelectedSubDate(date);
  }

  async function handleFabricFile(file: File) {
    setFabricUploading(true);
    setFabricUploadError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res  = await fetch('/api/bng/upload-fabric', { method: 'POST', body: form });
      const data = await res.json() as { date?: string; nodeCount?: number; error?: string; details?: string[] };
      if (!res.ok || data.error) {
        setFabricUploadError({ message: data.error ?? 'Upload failed.', details: data.details });
        return;
      }
      const recordsRes = await fetch(`/api/bng/load-fabric?date=${encodeURIComponent(data.date!)}`);
      const records     = await recordsRes.json() as FabricRecord[];
      const fresh       = await (await fetch('/api/bng/list-fabric')).json() as UploadMeta[];
      setFabricUploads(fresh);
      setFabricRecords(records);
      setSelectedFabricDate(data.date!);
    } catch {
      setFabricUploadError({ message: 'Network error — could not reach the upload API.' });
    } finally {
      setFabricUploading(false);
    }
  }

  async function switchToFabricDate(date: string) {
    if (date === 'default') {
      setFabricRecords(rawFabricData as FabricRecord[]);
      setSelectedFabricDate('default');
    } else {
      const records = await (await fetch(`/api/bng/load-fabric?date=${encodeURIComponent(date)}`)).json() as FabricRecord[];
      setFabricRecords(records);
      setSelectedFabricDate(date);
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
  const [activeTab, setActiveTab]           = useState<'util' | 'optim' | 'sub' | 'sub-optim' | 'fabric' | 'shutdown'>('util');
  const [networkOptimised, setNetworkOptimised] = useState(false);
  const [optimLevel, setOptimLevel]         = useState<0 | 1 | 2 | 3>(1);
  const [optimDrilldown, setOptimDrilldown] = useState<{ key: 'healthy' | 'l1' | 'l2' | 'l3' | 'needCards'; isTraffic: boolean } | null>(null);

  // ── Subscriber data ──
  const [subNodes, setSubNodes]               = useState<BrasNode[]>([]);
  const [subUploads, setSubUploads]           = useState<UploadMeta[]>([]);
  const [selectedSubDate, setSelectedSubDate] = useState<string>('none');
  const [subUploading, setSubUploading]       = useState(false);
  const [subUploadError, setSubUploadError]   = useState<{ message: string; details?: string[] } | null>(null);
  const subFileInputRef                       = useRef<HTMLInputElement>(null);

  // ── Fabric/Non-Fabric BNG type classification (from BRAS DATA_1.xlsx "Input sheet") ──
  const [fabricRecords, setFabricRecords]         = useState<FabricRecord[]>(rawFabricData as FabricRecord[]);
  const [fabricUploads, setFabricUploads]         = useState<UploadMeta[]>([]);
  const [selectedFabricDate, setSelectedFabricDate] = useState<string>('default');
  const [fabricUploading, setFabricUploading]     = useState(false);
  const [fabricUploadError, setFabricUploadError] = useState<{ message: string; details?: string[] } | null>(null);
  const fabricFileInputRef                        = useRef<HTMLInputElement>(null);
  const [fabricFilterCat, setFabricFilterCat]     = useState<'all' | 'Fabric' | 'Non Fabric'>('all');
  const [fabricBngTypeFilter, setFabricBngTypeFilter] = useState<string>('All');
  const [fabricStatusFilter, setFabricStatusFilter]   = useState<string>('All');

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
        if (activeTab === 'sub' || activeTab === 'sub-optim') {
          if (!a.name.toLowerCase().includes('ae')) return false;
        }
        if (filterCat === 'critical') return a.max_util >= 90;
        if (filterCat === 'high')     return a.max_util >= 80 && a.max_util < 90;
        if (filterCat === 'medium')   return a.max_util >= 70 && a.max_util < 80;
        if (filterCat === 'normal')   return a.max_util < 70;
        return true;
      })
      .sort((a, b) => (b.max_util ?? 0) - (a.max_util ?? 0));
  }

  // Switch between traffic and subscriber data based on active tab
  const displayNodes = useMemo(
    () => activeTab === 'sub' ? subNodes : allNodes,
    [activeTab, subNodes, allNodes]
  );

  // Fabric/Non-Fabric classification joined onto the real BNG population (excludes
  // QFX5120 leaf/spine switches, which aren't BNGs). Joined against allNodes (always
  // populated) rather than displayNodes, since classification is static inventory
  // data independent of which traffic/subscriber tab is active.
  const fabricNodes = useMemo(
    () => joinFabricClassification(allNodes.filter(n => n.bras_type !== 'QFX5120-32C'), fabricRecords),
    [allNodes, fabricRecords]
  );

  // Nodes at a BNG site slated for shutdown — used to flag (not silently drop)
  // Optimisation donor candidates, and to skip growth in the Network Optimised
  // simulation (which actually moves simulated traffic, unlike the donor lists).
  const shuttingDownNodeSet = useMemo(
    () => new Set(fabricRecords.filter(r => r.shuttingDown).map(r => normalizeNodeName(r.node))),
    [fabricRecords]
  );
  const isShuttingDown = (nodeName: string) => shuttingDownNodeSet.has(normalizeNodeName(nodeName));

  // Site name per node — surfaced on the BRAS itself (not just donor candidates)
  // in the Optimisation tabs, so a shutting-down BRAS being analyzed is obvious.
  const siteByNode = useMemo(
    () => new Map(fabricRecords.map(r => [normalizeNodeName(r.node), r.site ?? 'Unknown'])),
    [fabricRecords]
  );
  const siteOf = (nodeName: string) => siteByNode.get(normalizeNodeName(nodeName)) ?? 'Unknown';

  // Subscriber-based utilisation per node (from the "By Subscriber" upload), looked
  // up alongside the traffic-based utilisation in the Fabric/Non-Fabric and Sites
  // Shutting Down tabs so both views are visible together.
  const subUtilByNode = useMemo(
    () => new Map(subNodes.map(n => [normalizeNodeName(n.node), nodeMaxUtil(n)])),
    [subNodes]
  );

  const brasTypes = useMemo(() => {
    const types = Array.from(new Set(displayNodes.map(n => n.bras_type))).sort();
    return ['All', ...types];
  }, [displayNodes]);

  // Circle sidebar stats
  const circleStats = useMemo(() => {
    const map: Record<string, { count: number; critical: number; high: number; medium: number }> = {};
    for (const n of displayNodes) {
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
  }, [displayNodes, selectedBrasType]);

  // Build Circle → City → BRAS hierarchy for main panel
  const hierarchy = useMemo(() => {
    const base = displayNodes
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
  }, [displayNodes, selectedCircle, search, selectedBrasType]);

  const fabricBngTypeOptions = useMemo(
    () => ['All', ...Array.from(new Set(fabricNodes.map(n => n.bngType))).sort()],
    [fabricNodes]
  );
  const fabricStatusOptions = useMemo(
    () => ['All', ...Array.from(new Set(fabricNodes.map(n => n.status))).sort()],
    [fabricNodes]
  );

  const fabricSummary = useMemo(() => {
    const fabricList    = fabricNodes.filter(n => n.fabricType === 'Fabric');
    const nonFabricList = fabricNodes.filter(n => n.fabricType === 'Non Fabric');
    const avg = (list: typeof fabricNodes) => list.length ? list.reduce((s, n) => s + nodeMaxUtil(n), 0) / list.length : 0;
    return {
      total:     fabricNodes.length,
      fabric:    fabricList.length,
      nonFabric: nonFabricList.length,
      unknown:   fabricNodes.filter(n => n.fabricType === 'Unknown').length,
      live:      fabricNodes.filter(n => n.status === 'Live').length,
      nonLive:   fabricNodes.filter(n => n.status === 'Non Live').length,
      avgUtilFabric:    avg(fabricList),
      avgUtilNonFabric: avg(nonFabricList),
      hotNonFabric: nonFabricList.filter(n => nodeMaxUtil(n) >= 70).length,
    };
  }, [fabricNodes]);

  // Two comparison groups (Non Fabric first — these are the conversion candidates),
  // each a flat list sorted by utilisation descending so the busiest / highest-priority
  // BNGs to convert to Fabric surface at the top.
  const fabricGroups = useMemo(() => {
    const base = fabricNodes
      .filter(n => fabricBngTypeFilter === 'All' || n.bngType === fabricBngTypeFilter)
      .filter(n => fabricStatusFilter === 'All' || n.status === fabricStatusFilter)
      .filter(n => !selectedCircle || n.circle === selectedCircle)
      .filter(n => !search ||
        n.node.toLowerCase().includes(search.toLowerCase()) ||
        n.city.toLowerCase().includes(search.toLowerCase()) ||
        n.circle.toLowerCase().includes(search.toLowerCase())
      );

    const order: ('Non Fabric' | 'Fabric' | 'Unknown')[] = ['Non Fabric', 'Fabric', 'Unknown'];
    const groups = order
      .filter(t => fabricFilterCat === 'all' || t === fabricFilterCat)
      .map(t => ({ fabricType: t, nodes: base.filter(n => n.fabricType === t) }))
      .filter(g => g.nodes.length > 0)
      .map(g => ({ fabricType: g.fabricType, nodes: [...g.nodes].sort((a, b) => nodeMaxUtil(b) - nodeMaxUtil(a)) }));

    return groups;
  }, [fabricNodes, fabricFilterCat, fabricBngTypeFilter, fabricStatusFilter, selectedCircle, search]);

  // BNG nodes at a site slated for shutdown, grouped by site, sorted busiest-first
  // so it's clear what needs migrating off first.
  const shutdownGroups = useMemo(() => {
    const affected = fabricNodes
      .filter(n => n.shuttingDown)
      .filter(n => !selectedCircle || n.circle === selectedCircle)
      .filter(n => !search ||
        n.node.toLowerCase().includes(search.toLowerCase()) ||
        n.city.toLowerCase().includes(search.toLowerCase()) ||
        n.circle.toLowerCase().includes(search.toLowerCase())
      );

    const bySite = new Map<string, typeof affected>();
    for (const n of affected) {
      if (!bySite.has(n.site)) bySite.set(n.site, []);
      bySite.get(n.site)!.push(n);
    }

    return Array.from(bySite.entries())
      .map(([site, nodes]) => ({ site, nodes: [...nodes].sort((a, b) => nodeMaxUtil(b) - nodeMaxUtil(a)) }))
      .sort((a, b) => a.site.localeCompare(b.site));
  }, [fabricNodes, selectedCircle, search]);

  const shutdownSummary = useMemo(() => {
    const affected = fabricNodes.filter(n => n.shuttingDown);
    const avgUtil = affected.length ? affected.reduce((s, n) => s + nodeMaxUtil(n), 0) / affected.length : 0;
    return {
      sites: new Set(affected.map(n => n.site)).size,
      nodes: affected.length,
      avgUtil,
    };
  }, [fabricNodes]);

  const aeSummary = useMemo(() => {
    const all = displayNodes
      .filter(n => selectedBrasType === 'All' || n.bras_type === selectedBrasType)
      .flatMap(n => n.ae_interfaces);
    return {
      total:    all.length,
      critical: all.filter(a => a.max_util >= 90).length,
      high:     all.filter(a => a.max_util >= 80 && a.max_util < 90).length,
      medium:   all.filter(a => a.max_util >= 70 && a.max_util < 80).length,
      normal:   all.filter(a => a.max_util < 70).length,
    };
  }, [displayNodes, selectedBrasType]);

  // ── Network Optimised: simulated hub-level Gbps deltas if every OLT city were
  // rerouted to its Ideal View hub (see src/lib/networkOptimised.ts) ──
  const hubTrafficDeltas = useMemo(() => computeHubTrafficDeltas(allNodes), [allNodes]);

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

    // When Network Optimised is on, simulate traffic as if every OLT city were
    // rerouted to its Ideal View hub — only this input array changes, the
    // L1/L2/L3 math below is untouched.
    const preOptimByNode = new Map(brasStats.map(bs => [bs.node.node, bs.maxUtil]));
    const effectiveStats = networkOptimised
      ? applyHubDeltasToNodes(brasStats, hubTrafficDeltas, n => shuttingDownNodeSet.has(normalizeNodeName(n.node.node)))
      : brasStats;

    // City totals (all BRAS in city, not just overloaded)
    const cityTotals = new Map<string, { trafficGbps: number; bwGbps: number; nodes: BrasStats[] }>();
    for (const bs of effectiveStats) {
      const key = `${bs.node.circle}::${bs.node.city}`;
      if (!cityTotals.has(key)) cityTotals.set(key, { trafficGbps: 0, bwGbps: 0, nodes: [] });
      const c = cityTotals.get(key)!;
      c.trafficGbps += bs.trafficGbps;
      c.bwGbps      += bs.bwGbps;
      c.nodes.push(bs);
    }

    // Circle totals
    const circleTotals = new Map<string, { trafficGbps: number; bwGbps: number }>();
    for (const bs of effectiveStats) {
      const key = bs.node.circle;
      if (!circleTotals.has(key)) circleTotals.set(key, { trafficGbps: 0, bwGbps: 0 });
      const c = circleTotals.get(key)!;
      c.trafficGbps += bs.trafficGbps;
      c.bwGbps      += bs.bwGbps;
    }

    // Build per-BRAS optimisation result for all MX960 BRAS
    const results: BrasOptResult[] = [];

    for (const bs of effectiveStats) {
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
          shuttingDown: isShuttingDown(o.node.node),
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
      const donorCities: { city: string; headroomGbps: number; nodes: { name: string; avgUtil: number; shuttingDown: boolean }[] }[] = [];
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
              .map(n => ({ name: n.node.node.replace('AIRBRAS_', ''), avgUtil: n.avgUtil, shuttingDown: isShuttingDown(n.node.node) }))
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
        site: siteOf(bs.node.node), shuttingDown: isShuttingDown(bs.node.node),
        preOptimMaxUtil: networkOptimised ? preOptimByNode.get(bs.node.node) : undefined,
        l1: { canFix: l1CanFix, cardsNeeded: l1CardsNeeded, projectedUtil: l1Projected },
        l2: { canFix: l2CanFix, avgUtil: l2AvgUtil, projectedUtil: l2Projected, donors: l2Donors, cardsNeeded: l2CardsNeeded },
        l3: { canFix: l3CanFix, avgUtil: l3AvgUtil, projectedUtil: l3Projected, donorCities, cardsNeeded: l3CardsNeeded },
      });
    }

    const overloaded = results.filter(r => !r.isHealthy);
    const shuttingDownResults = results.filter(r => r.shuttingDown);
    const summary = {
      alreadyOk: results.filter(r => r.isHealthy).length,
      l1Fix:     overloaded.filter(r => r.l1.canFix).length,
      l2Fix:     overloaded.filter(r => !r.l1.canFix && r.l2.canFix).length,
      l3Fix:     overloaded.filter(r => !r.l2.canFix && r.l3.canFix).length,
      needCards: overloaded.filter(r => !r.l3.canFix).length,
      total:     results.length,
      overloaded: overloaded.length,
      shuttingDownNodes: shuttingDownResults.length,
      shuttingDownSites: new Set(shuttingDownResults.map(r => r.site)).size,
    };

    return { results, summary };
  }, [allNodes, networkOptimised, hubTrafficDeltas, shuttingDownNodeSet, siteByNode]);

  const CATS: { key: FilterCat; label: string; color: string }[] = [
    { key: 'all',      label: 'All',    color: '#6b7280' },
    { key: 'critical', label: '>90%',   color: '#ef4444' },
    { key: 'high',     label: '80–90%', color: '#f87171' },
    { key: 'medium',   label: '70–80%', color: '#f59e0b' },
    { key: 'normal',   label: '<70%',   color: '#22c55e' },
  ];

  const FABRIC_CATS: { key: 'all' | 'Fabric' | 'Non Fabric'; label: string; color: string }[] = [
    { key: 'all',         label: 'All',         color: '#6b7280' },
    { key: 'Fabric',      label: 'Fabric',      color: '#60a5fa' },
    { key: 'Non Fabric',  label: 'Non Fabric',  color: '#a78bfa' },
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

  // ── Subscriber optimisation (same L1/L2/L3 logic, units = subscriber counts via port_capacity) ──
  const subOptimData = useMemo(() => {
    const TARGET = 70;
    const mx960 = subNodes.filter(n => n.bras_type === 'MX960');

    // Average port_capacity across all DOWNLINK AEs → used as "new AE bundle" unit
    const allDlAes = mx960.flatMap(n => n.ae_interfaces.filter(a => a.link_type === 'BRAS-DOWNLINK'));
    const SLOT_CAP = allDlAes.length > 0
      ? Math.round(allDlAes.reduce((s, a) => s + (a.port_capacity ?? 0), 0) / allDlAes.length)
      : 43000;

    interface BrasStats {
      node: BrasNode; aes: AeIface[];
      trafficGbps: number; bwGbps: number; avgUtil: number; maxUtil: number;
    }
    const brasStats: BrasStats[] = mx960.flatMap(n => {
      const aes = n.ae_interfaces.filter(a => a.link_type === 'BRAS-DOWNLINK' && a.name.startsWith('ae'));
      if (!aes.length) return [];
      const trafficGbps = aes.reduce((s, a) => s + ((a.max_util ?? 0) / 100) * (a.port_capacity ?? SLOT_CAP), 0);
      const bwGbps      = aes.reduce((s, a) => s + (a.port_capacity ?? SLOT_CAP), 0);
      const avgUtil     = bwGbps > 0 ? (trafficGbps / bwGbps) * 100 : 0;
      const maxUtil     = Math.max(...aes.map(a => a.max_util ?? 0));
      return [{ node: n, aes, trafficGbps, bwGbps, avgUtil, maxUtil }];
    });

    const preOptimByNode = new Map(brasStats.map(bs => [bs.node.node, bs.maxUtil]));
    const effectiveStats = networkOptimised
      ? applyHubDeltasToNodes(brasStats, HUB_SUBSCRIBER_DELTAS, n => shuttingDownNodeSet.has(normalizeNodeName(n.node.node)))
      : brasStats;

    const cityTotals = new Map<string, { trafficGbps: number; bwGbps: number; nodes: BrasStats[] }>();
    for (const bs of effectiveStats) {
      const key = `${bs.node.circle}::${bs.node.city}`;
      if (!cityTotals.has(key)) cityTotals.set(key, { trafficGbps: 0, bwGbps: 0, nodes: [] });
      const c = cityTotals.get(key)!;
      c.trafficGbps += bs.trafficGbps;
      c.bwGbps      += bs.bwGbps;
      c.nodes.push(bs);
    }

    const circleTotals = new Map<string, { trafficGbps: number; bwGbps: number }>();
    for (const bs of effectiveStats) {
      const key = bs.node.circle;
      if (!circleTotals.has(key)) circleTotals.set(key, { trafficGbps: 0, bwGbps: 0 });
      const c = circleTotals.get(key)!;
      c.trafficGbps += bs.trafficGbps;
      c.bwGbps      += bs.bwGbps;
    }

    const results: BrasOptResult[] = [];
    for (const bs of effectiveStats) {
      const isHealthy = bs.maxUtil < TARGET;

      const l1CanFix    = bs.avgUtil < TARGET;
      let l1CardsNeeded = 0;
      let l1Projected   = bs.avgUtil;
      if (!l1CanFix) {
        l1CardsNeeded = Math.ceil((bs.trafficGbps / (TARGET / 100) - bs.bwGbps) / SLOT_CAP);
        l1Projected   = (bs.trafficGbps / (bs.bwGbps + l1CardsNeeded * SLOT_CAP)) * 100;
      }

      const cityKey   = `${bs.node.circle}::${bs.node.city}`;
      const city      = cityTotals.get(cityKey)!;
      const l2AvgUtil = city.bwGbps > 0 ? (city.trafficGbps / city.bwGbps) * 100 : 0;
      const l2CanFix  = l2AvgUtil < TARGET;
      const l2Donors  = city.nodes
        .filter(o => o.node.node !== bs.node.node && o.avgUtil < TARGET)
        .map(o => ({ name: o.node.node.replace('AIRBRAS_', ''), headroomGbps: Math.round((TARGET / 100) * o.bwGbps - o.trafficGbps), avgUtil: o.avgUtil, shuttingDown: isShuttingDown(o.node.node) }))
        .filter(d => d.headroomGbps > 0)
        .sort((a, b) => b.headroomGbps - a.headroomGbps);
      let l2CardsNeeded = 0;
      if (!l2CanFix) l2CardsNeeded = Math.ceil((city.trafficGbps / (TARGET / 100) - city.bwGbps) / SLOT_CAP);
      const l2Projected = l2CanFix ? l2AvgUtil : (city.trafficGbps / (city.bwGbps + l2CardsNeeded * SLOT_CAP)) * 100;

      const circle    = circleTotals.get(bs.node.circle)!;
      const l3AvgUtil = circle.bwGbps > 0 ? (circle.trafficGbps / circle.bwGbps) * 100 : 0;
      const l3CanFix  = l3AvgUtil < TARGET;
      const donorCities: { city: string; headroomGbps: number; nodes: { name: string; avgUtil: number; shuttingDown: boolean }[] }[] = [];
      Array.from(cityTotals.entries()).forEach(([key, cdata]) => {
        const [cir, cit] = key.split('::');
        if (cir !== bs.node.circle || cit === bs.node.city) return;
        const cAvg = cdata.bwGbps > 0 ? (cdata.trafficGbps / cdata.bwGbps) * 100 : 0;
        if (cAvg < TARGET) {
          const headroom = Math.round((TARGET / 100) * cdata.bwGbps - cdata.trafficGbps);
          if (headroom > 0) donorCities.push({
            city: cit, headroomGbps: headroom,
            nodes: cdata.nodes.filter(n => n.avgUtil < TARGET).map(n => ({ name: n.node.node.replace('AIRBRAS_', ''), avgUtil: n.avgUtil, shuttingDown: isShuttingDown(n.node.node) })).sort((a, b) => b.avgUtil - a.avgUtil),
          });
        }
      });
      donorCities.sort((a, b) => b.headroomGbps - a.headroomGbps);
      let l3CardsNeeded = 0;
      if (!l3CanFix) l3CardsNeeded = Math.ceil((circle.trafficGbps / (TARGET / 100) - circle.bwGbps) / SLOT_CAP);
      const l3Projected = l3CanFix ? l3AvgUtil : (circle.trafficGbps / (circle.bwGbps + l3CardsNeeded * SLOT_CAP)) * 100;

      results.push({
        node: bs.node, aes: bs.aes,
        trafficGbps: bs.trafficGbps, bwGbps: bs.bwGbps,
        avgUtil: bs.avgUtil, maxUtil: bs.maxUtil, isHealthy,
        site: siteOf(bs.node.node), shuttingDown: isShuttingDown(bs.node.node),
        preOptimMaxUtil: networkOptimised ? preOptimByNode.get(bs.node.node) : undefined,
        l1: { canFix: l1CanFix, cardsNeeded: l1CardsNeeded, projectedUtil: l1Projected },
        l2: { canFix: l2CanFix, avgUtil: l2AvgUtil, projectedUtil: l2Projected, donors: l2Donors, cardsNeeded: l2CardsNeeded },
        l3: { canFix: l3CanFix, avgUtil: l3AvgUtil, projectedUtil: l3Projected, donorCities, cardsNeeded: l3CardsNeeded },
      });
    }

    const overloaded = results.filter(r => !r.isHealthy);
    const shuttingDownResults = results.filter(r => r.shuttingDown);
    return {
      results,
      slotCap: SLOT_CAP,
      summary: {
        alreadyOk:  results.filter(r => r.isHealthy).length,
        l1Fix:      overloaded.filter(r => r.l1.canFix).length,
        l2Fix:      overloaded.filter(r => !r.l1.canFix && r.l2.canFix).length,
        l3Fix:      overloaded.filter(r => !r.l2.canFix && r.l3.canFix).length,
        needCards:  overloaded.filter(r => !r.l3.canFix).length,
        total:      results.length,
        overloaded: overloaded.length,
        shuttingDownNodes: shuttingDownResults.length,
        shuttingDownSites: new Set(shuttingDownResults.map(r => r.site)).size,
      },
    };
  }, [subNodes, networkOptimised, shuttingDownNodeSet, siteByNode]);

  const subOptimHierarchy = useMemo(() => {
    let filtered = subOptimData.results;
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
        nodes: nodes.sort((a, b) => { if (a.isHealthy !== b.isHealthy) return a.isHealthy ? 1 : -1; return b.maxUtil - a.maxUtil; }),
      })),
    }));
  }, [subOptimData, selectedCircle, search]);

  return (
    <>
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
            <span className="text-[10px] text-muted font-mono">{displayNodes.length}</span>
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

          {activeTab === 'util' || activeTab === 'optim' ? (
            <>
              {/* Traffic upload */}
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
                <span className="text-[10px] text-accent2 font-semibold ml-1">Viewing {selectedDate}</span>
              )}
            </>
          ) : (activeTab === 'sub' || activeTab === 'sub-optim') ? (
            <>
              {/* Subscriber upload */}
              <label
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-semibold cursor-pointer transition-colors select-none
                  ${subUploading ? 'border-accent2/40 text-accent2/60' : 'border-border text-muted hover:text-txt hover:border-txt/40 bg-card'}`}
              >
                {subUploading ? '⏳ Parsing…' : '↑ Upload subscriber xlsx'}
                <input
                  ref={subFileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleSubFile(f); e.target.value = ''; }}
                />
              </label>

              {subUploads.length > 0 && (
                <select
                  value={selectedSubDate}
                  onChange={e => switchToSubDate(e.target.value)}
                  className="bg-card border border-border rounded px-2 py-1 text-[11px] text-txt focus:outline-none focus:border-accent2 max-w-[260px]"
                >
                  {subUploads.map(u => (
                    <option key={u.date} value={u.date}>
                      {u.date} · {u.nodeCount} nodes · {u.filename.slice(0, 28)}{u.filename.length > 28 ? '…' : ''}
                    </option>
                  ))}
                </select>
              )}

              {selectedSubDate !== 'none' && (
                <span className="text-[10px] text-accent2 font-semibold ml-1">Viewing {selectedSubDate}</span>
              )}
            </>
          ) : (
            <>
              {/* Fabric/type upload */}
              <label
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-semibold cursor-pointer transition-colors select-none
                  ${fabricUploading ? 'border-accent2/40 text-accent2/60' : 'border-border text-muted hover:text-txt hover:border-txt/40 bg-card'}`}
              >
                {fabricUploading ? '⏳ Parsing…' : '↑ Upload fabric/type xlsx'}
                <input
                  ref={fabricFileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFabricFile(f); e.target.value = ''; }}
                />
              </label>

              {fabricUploads.length > 0 && (
                <select
                  value={selectedFabricDate}
                  onChange={e => switchToFabricDate(e.target.value)}
                  className="bg-card border border-border rounded px-2 py-1 text-[11px] text-txt focus:outline-none focus:border-accent2 max-w-[260px]"
                >
                  {fabricUploads.map(u => (
                    <option key={u.date} value={u.date}>
                      {u.date} · {u.nodeCount} nodes · {u.filename.slice(0, 28)}{u.filename.length > 28 ? '…' : ''}
                    </option>
                  ))}
                  <option value="default">Default (built-in snapshot)</option>
                </select>
              )}

              {selectedFabricDate !== 'default' && (
                <span className="text-[10px] text-accent2 font-semibold ml-1">Viewing {selectedFabricDate}</span>
              )}
            </>
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

        {/* Subscriber upload error banner */}
        {subUploadError && (
          <div className="flex-shrink-0 px-4 py-2.5 bg-red-950/60 border-b border-red-700/50 flex items-start gap-3">
            <span className="text-red-400 text-[11px] font-black mt-0.5 flex-shrink-0">Upload failed</span>
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <span className="text-red-300 text-[11px] font-semibold">{subUploadError.message}</span>
              {subUploadError.details && subUploadError.details.map((d, i) => (
                <span key={i} className="text-red-400/80 text-[10px] font-mono">{d}</span>
              ))}
            </div>
            <button
              onClick={() => setSubUploadError(null)}
              className="text-red-500 hover:text-red-300 text-lg leading-none flex-shrink-0"
            >×</button>
          </div>
        )}

        {/* Fabric upload error banner */}
        {fabricUploadError && (
          <div className="flex-shrink-0 px-4 py-2.5 bg-red-950/60 border-b border-red-700/50 flex items-start gap-3">
            <span className="text-red-400 text-[11px] font-black mt-0.5 flex-shrink-0">Upload failed</span>
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <span className="text-red-300 text-[11px] font-semibold">{fabricUploadError.message}</span>
              {fabricUploadError.details && fabricUploadError.details.map((d, i) => (
                <span key={i} className="text-red-400/80 text-[10px] font-mono">{d}</span>
              ))}
            </div>
            <button
              onClick={() => setFabricUploadError(null)}
              className="text-red-500 hover:text-red-300 text-lg leading-none flex-shrink-0"
            >×</button>
          </div>
        )}

        {/* Top bar */}
        <div className="flex-shrink-0 px-4 py-2 bg-panel border-b border-border flex items-center gap-3 flex-wrap">

          {/* Tab switcher — two-level: By Traffic / By Subscriber → Utilisation / Optimisation */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Primary: mode */}
            <div className="flex border border-border rounded overflow-hidden text-[11px] font-semibold">
              <button
                onClick={() => { setActiveTab(activeTab === 'sub-optim' ? 'optim' : 'util'); setSelectedAe(null); }}
                className={`px-3 py-1 transition-colors ${(activeTab === 'util' || activeTab === 'optim') ? 'bg-accent2 text-bg' : 'text-muted hover:text-txt'}`}
              >By Traffic</button>
              <button
                onClick={() => { setActiveTab(activeTab === 'optim' ? 'sub-optim' : 'sub'); setSelectedAe(null); }}
                className={`px-3 py-1 border-l border-border transition-colors ${(activeTab === 'sub' || activeTab === 'sub-optim') ? 'bg-accent2 text-bg' : 'text-muted hover:text-txt'}`}
              >By Subscriber</button>
              <button
                onClick={() => { setActiveTab('fabric'); setSelectedAe(null); }}
                className={`relative px-3 py-1 border-l border-border transition-colors font-bold ${
                  activeTab === 'fabric'
                    ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-[0_0_10px_rgba(168,85,247,0.6)]'
                    : 'text-violet-400 hover:text-violet-300 bg-violet-500/10'
                }`}
              >
                Fabric/Non Fabric
                {activeTab !== 'fabric' && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-fuchsia-400 animate-pulse" />
                )}
              </button>
              <button
                onClick={() => { setActiveTab('shutdown'); setSelectedAe(null); }}
                className={`relative px-3 py-1 border-l border-border transition-colors font-bold ${
                  activeTab === 'shutdown'
                    ? 'bg-gradient-to-r from-red-600 to-orange-500 text-white shadow-[0_0_10px_rgba(239,68,68,0.6)]'
                    : 'text-red-400 hover:text-red-300 bg-red-500/10'
                }`}
              >
                Sites Shutting Down
                {activeTab !== 'shutdown' && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                )}
              </button>
            </div>
            {activeTab !== 'fabric' && activeTab !== 'shutdown' && (
              <>
                <span className="text-[9px] text-border select-none">|</span>
                {/* Secondary: sub-tab */}
                <div className="flex border border-border rounded overflow-hidden text-[11px] font-semibold">
                  <button
                    onClick={() => { setActiveTab(activeTab === 'sub' || activeTab === 'sub-optim' ? 'sub' : 'util'); setSelectedAe(null); }}
                    className={`px-3 py-1 transition-colors ${(activeTab === 'util' || activeTab === 'sub') ? 'bg-accent2 text-bg' : 'text-muted hover:text-txt'}`}
                  >Utilisation</button>
                  <button
                    onClick={() => { setActiveTab(activeTab === 'sub' || activeTab === 'sub-optim' ? 'sub-optim' : 'optim'); setSelectedBrasType('MX960'); setSelectedAe(null); }}
                    className={`px-3 py-1 border-l border-border transition-colors ${(activeTab === 'optim' || activeTab === 'sub-optim') ? 'bg-accent2 text-bg' : 'text-muted hover:text-txt'}`}
                  >Optimisation</button>
                </div>
              </>
            )}
          </div>

          <input
            type="text"
            placeholder="Search circle / city / node..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-card border border-border rounded px-2 py-1 text-[11px] text-txt placeholder:text-muted focus:outline-none focus:border-accent2 w-52"
          />
          {(activeTab === 'util' || activeTab === 'sub') && (
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
          {(activeTab === 'optim' || activeTab === 'sub-optim') && (
            <>
              <span className="text-[10px] text-muted border border-border/50 rounded px-2 py-1 bg-card/50">
                MX960 · DOWNLINK only
              </span>
              <button
                onClick={() => setNetworkOptimised(v => !v)}
                title="Simulate traffic as if every OLT city were routed to its nearest (Ideal View) BNG hub"
                className={`flex items-center gap-2 px-2 py-1 rounded border text-[11px] font-semibold transition-colors ${
                  networkOptimised ? 'bg-amber-500/15 border-amber-500 text-amber-300' : 'bg-card border-border text-muted hover:text-txt'
                }`}
              >
                <span className={`relative inline-block w-7 h-4 rounded-full transition-colors flex-shrink-0 ${networkOptimised ? 'bg-amber-500' : 'bg-border'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${networkOptimised ? 'translate-x-3' : ''}`} />
                </span>
                Network Optimised
              </button>
            </>
          )}
          {(activeTab === 'util' || activeTab === 'sub') && (
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
          {activeTab === 'fabric' && (
            <>
              <div className="flex gap-1">
                {FABRIC_CATS.map(cat => (
                  <button
                    key={cat.key}
                    onClick={() => setFabricFilterCat(cat.key)}
                    style={fabricFilterCat === cat.key ? { background: cat.color, borderColor: cat.color, color: '#0f172a' } : {}}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${fabricFilterCat === cat.key ? '' : 'bg-card border-border text-muted hover:text-txt'}`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              <select
                value={fabricBngTypeFilter}
                onChange={e => setFabricBngTypeFilter(e.target.value)}
                className="bg-card border border-border rounded px-2 py-1 text-[11px] text-txt focus:outline-none focus:border-accent2"
              >
                {fabricBngTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select
                value={fabricStatusFilter}
                onChange={e => setFabricStatusFilter(e.target.value)}
                className="bg-card border border-border rounded px-2 py-1 text-[11px] text-txt focus:outline-none focus:border-accent2"
              >
                {fabricStatusOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </>
          )}
        </div>

        {/* ── Utilisation / Subscribers tab ── */}
        {(activeTab === 'util' || activeTab === 'sub') && (
          <div className="flex-1 overflow-hidden flex">

            {/* Scrollable hierarchy */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">

              {hierarchy.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-6">
                  <div className="text-[13px] text-muted">
                    {activeTab === 'sub' && subNodes.length === 0
                      ? 'Upload a Subscriber Utilisation Report to view data'
                      : 'No data matches current filters'}
                  </div>
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
                      { label: 'Parent Interface', value: selectedAe.ae.name },
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

        {/* ── Fabric / Non-Fabric BNG type tab ── */}
        {activeTab === 'fabric' && (
          <div className="flex-1 overflow-hidden flex">
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">

              {/* Summary strip */}
              <div className="flex gap-4 flex-wrap">
                {[
                  { label: 'BNG nodes',        val: fabricSummary.total,     color: '#94a3b8' },
                  { label: 'Fabric',           val: fabricSummary.fabric,    color: FABRIC_TYPE_COLORS['Fabric'] },
                  { label: 'Non Fabric',       val: fabricSummary.nonFabric, color: FABRIC_TYPE_COLORS['Non Fabric'] },
                  { label: 'Non-Fabric ≥70% util', val: fabricSummary.hotNonFabric, color: '#ef4444' },
                  { label: 'Avg util · Fabric',     val: `${fabricSummary.avgUtilFabric.toFixed(0)}%`,    color: '#22c55e' },
                  { label: 'Avg util · Non Fabric',  val: `${fabricSummary.avgUtilNonFabric.toFixed(0)}%`, color: '#f59e0b' },
                ].map(s => (
                  <div key={s.label} className="bg-panel border border-border rounded-xl px-5 py-3 flex flex-col items-center gap-1" style={{ borderColor: `${s.color}40` }}>
                    <span className="text-[24px] font-black" style={{ color: s.color }}>{s.val}</span>
                    <span className="text-[11px] text-muted">{s.label}</span>
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-muted -mt-3">
                Non-Fabric BNGs are sorted busiest-first below — the highest-utilisation ones are the top candidates to convert to Fabric.
              </div>

              {fabricGroups.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <div className="text-[13px] text-muted">
                    {fabricNodes.length === 0 ? 'Upload a BNG type/inventory report to view data' : 'No data matches current filters'}
                  </div>
                </div>
              )}

              {fabricGroups.map(({ fabricType, nodes }) => {
                const groupCollapsed = collapsedCircles.has(`fabric-group-${fabricType}`);
                const color = FABRIC_TYPE_COLORS[fabricType] ?? '#6b7280';
                return (
                  <div key={fabricType}>
                    <button
                      onClick={() => toggleCircle(`fabric-group-${fabricType}`)}
                      className="w-full flex items-center gap-3 mb-3 group text-left"
                    >
                      <span className="text-[15px] font-black tracking-widest uppercase" style={{ color }}>{fabricType}</span>
                      <span className="text-[9px] text-muted font-mono">{nodes.length} BNG</span>
                      <div className="flex-1 h-px bg-border mx-2" />
                      <span className="text-[10px] text-muted group-hover:text-txt">{groupCollapsed ? '▶' : '▼'}</span>
                    </button>

                    {!groupCollapsed && (
                      <div className="flex flex-col gap-2 pl-3">
                        {nodes.map(n => {
                          const u = nodeMaxUtil(n);
                          const s = utilStyle(u);
                          const subU = subUtilByNode.get(normalizeNodeName(n.node));
                          const subS = subU !== undefined ? utilStyle(subU) : null;
                          return (
                            <div key={n.node} className="border border-border/50 rounded-lg px-3 py-2 flex items-center gap-2 flex-wrap bg-card/40">
                              <span className="text-[11px] font-bold text-txt font-mono">{n.node.replace('AIRBRAS_', '')}</span>
                              <span className="text-[9px] text-muted">{n.bras_type}</span>
                              <span className="text-[9px] text-muted">{n.circle} · {n.city}</span>
                              <div className="flex items-center gap-1.5 w-36 flex-shrink-0">
                                <span className="text-[8px] text-muted w-8 flex-shrink-0">Traffic</span>
                                <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${Math.min(u, 100)}%`, background: s.badge }} />
                                </div>
                                <span className="text-[11px] font-bold w-9 text-right" style={{ color: s.badge }}>{u.toFixed(0)}%</span>
                              </div>
                              <div className="flex items-center gap-1.5 w-36 flex-shrink-0">
                                <span className="text-[8px] text-muted w-8 flex-shrink-0">Subs</span>
                                {subU !== undefined ? (
                                  <>
                                    <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                                      <div className="h-full rounded-full" style={{ width: `${Math.min(subU, 100)}%`, background: subS!.badge }} />
                                    </div>
                                    <span className="text-[11px] font-bold w-9 text-right" style={{ color: subS!.badge }}>{subU.toFixed(0)}%</span>
                                  </>
                                ) : (
                                  <span className="text-[10px] text-muted/50 flex-1">no data</span>
                                )}
                              </div>
                              <div className="flex-1" />
                              <Badge label={n.bngType}  color={BNG_TYPE_COLORS[n.bngType] ?? '#6b7280'} />
                              <Badge label={n.status}   color={STATUS_COLORS[n.status] ?? '#6b7280'} />
                              <Badge label={n.services} color={SERVICES_COLORS[n.services] ?? '#6b7280'} />
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

        {/* ── Sites Shutting Down tab ── */}
        {activeTab === 'shutdown' && (
          <div className="flex-1 overflow-hidden flex">
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">

              {/* Summary strip */}
              <div className="flex gap-4 flex-wrap">
                {[
                  { label: 'Sites shutting down', val: shutdownSummary.sites, color: '#ef4444' },
                  { label: 'Affected BNG nodes',  val: shutdownSummary.nodes, color: '#f59e0b' },
                  { label: 'Avg util · affected', val: `${shutdownSummary.avgUtil.toFixed(0)}%`, color: '#f59e0b' },
                ].map(s => (
                  <div key={s.label} className="bg-panel border border-border rounded-xl px-5 py-3 flex flex-col items-center gap-1" style={{ borderColor: `${s.color}40` }}>
                    <span className="text-[24px] font-black" style={{ color: s.color }}>{s.val}</span>
                    <span className="text-[11px] text-muted">{s.label}</span>
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-muted -mt-3">
                These BNG nodes sit at a site slated for shutdown — plan to migrate their traffic elsewhere before decommission. Sorted busiest-first within each site.
              </div>

              {shutdownGroups.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <div className="text-[13px] text-muted">
                    {fabricNodes.length === 0 ? 'Upload a BNG type/inventory report to view data' : 'No sites currently flagged for shutdown'}
                  </div>
                </div>
              )}

              {shutdownGroups.map(({ site, nodes }) => {
                const groupCollapsed = collapsedCircles.has(`shutdown-site-${site}`);
                return (
                  <div key={site}>
                    <button
                      onClick={() => toggleCircle(`shutdown-site-${site}`)}
                      className="w-full flex items-center gap-3 mb-3 group text-left"
                    >
                      <span className="text-[15px] font-black tracking-widest uppercase text-red-400">{site}</span>
                      <span className="text-[9px] text-muted font-mono">{nodes.length} BNG</span>
                      <div className="flex-1 h-px bg-border mx-2" />
                      <span className="text-[10px] text-muted group-hover:text-txt">{groupCollapsed ? '▶' : '▼'}</span>
                    </button>

                    {!groupCollapsed && (
                      <div className="flex flex-col gap-2 pl-3">
                        {nodes.map(n => {
                          const u = nodeMaxUtil(n);
                          const s = utilStyle(u);
                          const subU = subUtilByNode.get(normalizeNodeName(n.node));
                          const subS = subU !== undefined ? utilStyle(subU) : null;
                          return (
                            <div key={n.node} className="border border-red-500/30 rounded-lg px-3 py-2 flex items-center gap-2 flex-wrap bg-card/40">
                              <span className="text-[11px] font-bold text-txt font-mono">{n.node.replace('AIRBRAS_', '')}</span>
                              <span className="text-[9px] text-muted">{n.bras_type}</span>
                              <span className="text-[9px] text-muted">{n.circle} · {n.city}</span>
                              <div className="flex items-center gap-1.5 w-36 flex-shrink-0">
                                <span className="text-[8px] text-muted w-8 flex-shrink-0">Traffic</span>
                                <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${Math.min(u, 100)}%`, background: s.badge }} />
                                </div>
                                <span className="text-[11px] font-bold w-9 text-right" style={{ color: s.badge }}>{u.toFixed(0)}%</span>
                              </div>
                              <div className="flex items-center gap-1.5 w-36 flex-shrink-0">
                                <span className="text-[8px] text-muted w-8 flex-shrink-0">Subs</span>
                                {subU !== undefined ? (
                                  <>
                                    <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                                      <div className="h-full rounded-full" style={{ width: `${Math.min(subU, 100)}%`, background: subS!.badge }} />
                                    </div>
                                    <span className="text-[11px] font-bold w-9 text-right" style={{ color: subS!.badge }}>{subU.toFixed(0)}%</span>
                                  </>
                                ) : (
                                  <span className="text-[10px] text-muted/50 flex-1">no data</span>
                                )}
                              </div>
                              <div className="flex-1" />
                              <Badge label={n.fabricType} color={FABRIC_TYPE_COLORS[n.fabricType] ?? '#6b7280'} />
                              <Badge label={n.status}     color={STATUS_COLORS[n.status] ?? '#6b7280'} />
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

        {/* ── Optimisation tab ── */}
        {activeTab === 'optim' && (
          <div className="flex-1 overflow-hidden flex flex-col">

            {/* Summary strip */}
            <div className="flex-shrink-0 px-4 py-2 border-b border-border bg-card/40 flex items-center gap-5 flex-wrap">
              <span className="text-[10px] text-muted font-semibold uppercase tracking-wider flex-shrink-0">
                {optimData.summary.total} MX960 BRAS
              </span>
              {([
                { key: 'healthy'   as const, label: 'healthy',          val: optimData.summary.alreadyOk,  color: '#22c55e' },
                { key: 'l1'       as const, label: 'L1 within BRAS',   val: optimData.summary.l1Fix,      color: '#4ade80' },
                { key: 'l2'       as const, label: 'L2 within city',   val: optimData.summary.l2Fix,      color: '#86efac' },
                { key: 'l3'       as const, label: 'L3 within circle', val: optimData.summary.l3Fix,      color: '#a3e635' },
                { key: 'needCards'as const, label: 'need new cards',   val: optimData.summary.needCards,  color: '#f87171' },
              ]).map(s => {
                const active = optimDrilldown?.isTraffic && optimDrilldown.key === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => setOptimDrilldown(active ? null : { key: s.key, isTraffic: true })}
                    className={`flex items-center gap-1.5 rounded px-2 py-0.5 transition-colors ${active ? 'bg-card ring-1 ring-border' : 'hover:bg-card/60'}`}
                  >
                    <span className="text-[16px] font-black" style={{ color: s.color }}>{s.val}</span>
                    <span className="text-[10px] text-muted">{s.label}</span>
                  </button>
                );
              })}
              {optimData.summary.shuttingDownNodes > 0 && (
                <span className="flex items-center gap-1.5 rounded px-2 py-0.5 bg-red-500/10 border border-red-500/30">
                  <span className="text-[16px] font-black text-red-400">{optimData.summary.shuttingDownSites}</span>
                  <span className="text-[10px] text-red-300/80">
                    site{optimData.summary.shuttingDownSites !== 1 ? 's' : ''} shutting down
                    {' '}({optimData.summary.shuttingDownNodes} BRAS)
                  </span>
                </span>
              )}
              {/* Level toggle */}
              <div className="ml-auto flex border border-border rounded overflow-hidden text-[11px] font-semibold flex-shrink-0">
                {([0, 1, 2, 3] as const).map(lvl => (
                  <button
                    key={lvl}
                    onClick={() => setOptimLevel(lvl)}
                    className={`px-3 py-1 border-r last:border-r-0 border-border transition-colors ${
                      optimLevel === lvl ? 'bg-accent2 text-bg' : 'text-muted hover:text-txt'
                    }`}
                  >
                    {lvl === 0 ? 'Actual' : `L${lvl}`}
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
                                            {r.preOptimMaxUtil !== undefined && (
                                              <span className="line-through text-muted/50 mr-1 font-normal">{r.preOptimMaxUtil.toFixed(1)}%</span>
                                            )}
                                            {r.maxUtil.toFixed(1)}% max
                                          </span>
                                          {r.isHealthy && (
                                            <span className="text-[9px] font-bold text-green-400 bg-green-500/15 px-1.5 py-0.5 rounded">✓ healthy</span>
                                          )}
                                          {r.shuttingDown && (
                                            <span className="text-[9px] font-bold text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded">
                                              SITE SHUTTING DOWN · {r.site}
                                            </span>
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
                                          if (lv === 0) return (
                                            <div className="px-3 py-3 flex flex-wrap gap-3 bg-bg/30">
                                              {r.aes.map(ae => (
                                                <AeCube key={ae.name} ae={ae} nodeKey={r.node.node} selected={false} onClick={() => {}} />
                                              ))}
                                            </div>
                                          );
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

                                        {/* Selected-level analysis text — only for overloaded nodes and not L0 */}
                                        {!r.isHealthy && optimLevel !== 0 && <div className="px-3 pb-2.5 flex flex-col gap-2 bg-bg/30">

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
                                                        <div key={d.name} className="flex items-center gap-1.5 flex-wrap">
                                                          <span className={d.shuttingDown ? 'line-through text-muted/60' : 'text-txt font-semibold'}>{d.name}</span>
                                                          <span className="text-muted">·</span>
                                                          <span style={{ color: utilStyle(d.avgUtil).badge }}>{d.avgUtil.toFixed(1)}%</span>
                                                          <span className="text-green-400/70">{d.headroomGbps}G free</span>
                                                          {d.shuttingDown && (
                                                            <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-red-500/20 text-red-400">SITE SHUTTING DOWN</span>
                                                          )}
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
                                                            <div key={n.name} className="flex items-center gap-1 pl-2 flex-wrap">
                                                              <span className="text-muted/60">↳</span>
                                                              <span className={n.shuttingDown ? 'line-through text-muted/60 font-mono text-[9px]' : 'text-txt/80 font-mono text-[9px]'}>{n.name}</span>
                                                              <span style={{ color: utilStyle(n.avgUtil).badge }} className="text-[9px]">{n.avgUtil.toFixed(1)}%</span>
                                                              {n.shuttingDown && (
                                                                <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-red-500/20 text-red-400">SITE SHUTTING DOWN</span>
                                                              )}
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

        {/* ── Subscriber Optimisation tab ── */}
        {activeTab === 'sub-optim' && (
          <div className="flex-1 overflow-hidden flex flex-col">

            {/* Summary strip */}
            <div className="flex-shrink-0 px-4 py-2 border-b border-border bg-card/40 flex items-center gap-5 flex-wrap">
              <span className="text-[10px] text-muted font-semibold uppercase tracking-wider flex-shrink-0">
                {subOptimData.summary.total} MX960 BRAS
              </span>
              <span className="text-[10px] text-muted border border-border/50 rounded px-2 py-0.5 bg-card/50">
                AE bundle ≈ {fmtSubs(subOptimData.slotCap)} subs
              </span>
              {([
                { key: 'healthy'   as const, label: 'healthy',          val: subOptimData.summary.alreadyOk,  color: '#22c55e' },
                { key: 'l1'       as const, label: 'L1 within BRAS',   val: subOptimData.summary.l1Fix,      color: '#4ade80' },
                { key: 'l2'       as const, label: 'L2 within city',   val: subOptimData.summary.l2Fix,      color: '#86efac' },
                { key: 'l3'       as const, label: 'L3 within circle', val: subOptimData.summary.l3Fix,      color: '#a3e635' },
                { key: 'needCards'as const, label: 'need new bundles', val: subOptimData.summary.needCards,  color: '#f87171' },
              ]).map(s => {
                const active = optimDrilldown && !optimDrilldown.isTraffic && optimDrilldown.key === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => setOptimDrilldown(active ? null : { key: s.key, isTraffic: false })}
                    className={`flex items-center gap-1.5 rounded px-2 py-0.5 transition-colors ${active ? 'bg-card ring-1 ring-border' : 'hover:bg-card/60'}`}
                  >
                    <span className="text-[16px] font-black" style={{ color: s.color }}>{s.val}</span>
                    <span className="text-[10px] text-muted">{s.label}</span>
                  </button>
                );
              })}
              {subOptimData.summary.shuttingDownNodes > 0 && (
                <span className="flex items-center gap-1.5 rounded px-2 py-0.5 bg-red-500/10 border border-red-500/30">
                  <span className="text-[16px] font-black text-red-400">{subOptimData.summary.shuttingDownSites}</span>
                  <span className="text-[10px] text-red-300/80">
                    site{subOptimData.summary.shuttingDownSites !== 1 ? 's' : ''} shutting down
                    {' '}({subOptimData.summary.shuttingDownNodes} BRAS)
                  </span>
                </span>
              )}
              <div className="ml-auto flex border border-border rounded overflow-hidden text-[11px] font-semibold flex-shrink-0">
                {([0, 1, 2, 3] as const).map(lvl => (
                  <button
                    key={lvl}
                    onClick={() => setOptimLevel(lvl)}
                    className={`px-3 py-1 border-r last:border-r-0 border-border transition-colors ${
                      optimLevel === lvl ? 'bg-accent2 text-bg' : 'text-muted hover:text-txt'
                    }`}
                  >{lvl === 0 ? 'Actual' : `L${lvl}`}</button>
                ))}
              </div>
            </div>

            {/* Hierarchy */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
              {subOptimHierarchy.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <span className="text-[13px] text-muted">
                    {subNodes.length === 0 ? 'Upload a Subscriber Utilisation Report to view optimisation' : 'No MX960 BRAS match current filters'}
                  </span>
                </div>
              )}

              {subOptimHierarchy.map(({ circle, cities }) => {
                const circleCollapsed = collapsedCircles.has(`sub-opt-${circle}`);
                return (
                  <div key={circle}>
                    <button
                      onClick={() => toggleCircle(`sub-opt-${circle}`)}
                      className="w-full flex items-center gap-3 mb-3 group text-left"
                    >
                      <span className="text-[15px] font-black text-txt tracking-widest uppercase">{circle}</span>
                      <span className="text-[11px] text-muted">{CIRCLE_LABELS[circle] ?? ''}</span>
                      <span className="text-[10px] text-muted font-mono">{cities.reduce((s, c) => s + c.nodes.length, 0)} BRAS</span>
                      <div className="flex-1 h-px bg-border mx-2" />
                      <span className="text-[10px] text-muted group-hover:text-txt">{circleCollapsed ? '▶' : '▼'}</span>
                    </button>

                    {!circleCollapsed && (
                      <div className="flex flex-col gap-5 pl-3">
                        {cities.map(({ city, nodes }) => {
                          const cityKey = `sub-opt-${circle}__${city}`;
                          const cityCollapsed = collapsedCities.has(cityKey);
                          return (
                            <div key={city}>
                              <button
                                onClick={() => toggleCity(cityKey)}
                                className="w-full flex items-center gap-2 mb-2 group text-left"
                              >
                                <span className="text-[12px] font-bold text-txt/80 uppercase tracking-wider">{city}</span>
                                <span className="text-[9px] text-muted font-mono">{nodes.length} BRAS</span>
                                {nodes.some(n => n.isHealthy) && (
                                  <span className="text-[9px] text-green-400/70 font-mono">{nodes.filter(n => n.isHealthy).length} ✓</span>
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
                                            {r.preOptimMaxUtil !== undefined && (
                                              <span className="line-through text-muted/50 mr-1 font-normal">{r.preOptimMaxUtil.toFixed(1)}%</span>
                                            )}
                                            {r.maxUtil.toFixed(1)}% max
                                          </span>
                                          {r.isHealthy && (
                                            <span className="text-[9px] font-bold text-green-400 bg-green-500/15 px-1.5 py-0.5 rounded">✓ healthy</span>
                                          )}
                                          {r.shuttingDown && (
                                            <span className="text-[9px] font-bold text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded">
                                              SITE SHUTTING DOWN · {r.site}
                                            </span>
                                          )}
                                          <span className="text-[9px] text-muted">{r.aes.length} DL AEs</span>
                                          <div className="flex-1 h-1 rounded-full bg-border overflow-hidden mx-2">
                                            <div className="h-full rounded-full transition-all"
                                              style={{ width: `${Math.min(r.avgUtil, 100)}%`, background: s.badge }} />
                                          </div>
                                          <span className="text-[9px] text-muted font-mono flex-shrink-0">
                                            {fmtSubs(r.trafficGbps)} / {fmtSubs(r.bwGbps)} subs
                                          </span>
                                        </div>

                                        {/* AE cube grid */}
                                        {(() => {
                                          const lv = optimLevel;
                                          if (lv === 0) return (
                                            <div className="px-3 py-3 flex flex-wrap gap-3 bg-bg/30">
                                              {r.aes.map(ae => (
                                                <AeCube key={ae.name} ae={ae} nodeKey={r.node.node} selected={false} onClick={() => {}} />
                                              ))}
                                            </div>
                                          );
                                          const cards = r.isHealthy ? 0 : (lv === 1 ? r.l1.cardsNeeded : lv === 2 ? r.l2.cardsNeeded : r.l3.cardsNeeded);
                                          const proj  = lv === 1 ? r.l1.projectedUtil : lv === 2 ? r.l2.projectedUtil : r.l3.projectedUtil;
                                          const canFix = r.isHealthy || (lv === 1 ? r.l1.canFix : lv === 2 ? r.l2.canFix : r.l3.canFix);
                                          const bundleLabel = lv === 2 ? 'city' : lv === 3 ? 'circle' : undefined;
                                          return (
                                            <div className="px-3 py-3 flex flex-wrap gap-3 bg-bg/30">
                                              {r.aes.map(ae => (
                                                <AeCube key={ae.name} ae={ae} nodeKey={r.node.node} selected={false} onClick={() => {}} optimizedUtil={r.isHealthy ? undefined : proj} />
                                              ))}
                                              {!canFix && Array.from({ length: cards }).map((_, i) => (
                                                <NewAeCard key={i} projectedUtil={proj} label={bundleLabel} capacityLabel="AE" />
                                              ))}
                                            </div>
                                          );
                                        })()}

                                        {/* L1/L2/L3 analysis */}
                                        {!r.isHealthy && optimLevel !== 0 && (
                                          <div className="px-3 pb-2.5 flex flex-col gap-2 bg-bg/30">
                                            <div className="flex items-start gap-2">
                                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0 ${r.l1.canFix ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>L1</span>
                                              <div className="text-[10px] leading-relaxed">
                                                {r.l1.canFix ? (
                                                  <span className="text-green-400">avg {r.avgUtil.toFixed(1)}% — rebalance {r.aes.length} AE bundles within this BRAS → all below 70%</span>
                                                ) : (
                                                  <>
                                                    <span className="text-muted">avg {r.avgUtil.toFixed(1)}% — rebalancing won't help · </span>
                                                    <span className="text-amber-400">add {r.l1.cardsNeeded} AE bundle{r.l1.cardsNeeded > 1 ? 's' : ''} → {r.l1.projectedUtil.toFixed(1)}% each</span>
                                                  </>
                                                )}
                                              </div>
                                            </div>

                                            <div className="flex items-start gap-2">
                                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0 ${r.l2.canFix ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>L2</span>
                                              <div className="text-[10px] leading-relaxed">
                                                {r.l2.canFix ? (
                                                  <div className="flex flex-col gap-1">
                                                    <span className="text-green-400">city avg {r.l2.avgUtil.toFixed(1)}% — fixable within {r.node.city}</span>
                                                    {r.l2.donors.length > 0 && (
                                                      <div className="flex flex-col gap-0.5 pl-1 border-l-2 border-green-500/30">
                                                        {r.l2.donors.slice(0, 3).map(d => (
                                                          <div key={d.name} className="flex items-center gap-1.5 flex-wrap">
                                                            <span className={d.shuttingDown ? 'line-through text-muted/60' : 'text-txt font-semibold'}>{d.name}</span>
                                                            <span className="text-muted">·</span>
                                                            <span style={{ color: utilStyle(d.avgUtil).badge }}>{d.avgUtil.toFixed(1)}%</span>
                                                            <span className="text-green-400/70">{fmtSubs(d.headroomGbps)} subs free</span>
                                                            {d.shuttingDown && (
                                                              <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-red-500/20 text-red-400">SITE SHUTTING DOWN</span>
                                                            )}
                                                          </div>
                                                        ))}
                                                      </div>
                                                    )}
                                                  </div>
                                                ) : (
                                                  <>
                                                    <span className="text-amber-400">city avg {r.l2.avgUtil.toFixed(1)}% — city also overloaded</span>
                                                    <span className="text-muted">{' · '}{r.l2.cardsNeeded} bundle{r.l2.cardsNeeded !== 1 ? 's' : ''} needed city-wide</span>
                                                  </>
                                                )}
                                              </div>
                                            </div>

                                            <div className="flex items-start gap-2">
                                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0 ${r.l3.canFix ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>L3</span>
                                              <div className="text-[10px] leading-relaxed">
                                                {r.l3.canFix ? (
                                                  <div className="flex flex-col gap-1">
                                                    <span className="text-green-400">circle avg {r.l3.avgUtil.toFixed(1)}% — fixable within {r.node.circle}</span>
                                                    {r.l3.donorCities.length > 0 && (
                                                      <div className="flex flex-col gap-1.5 pl-1 border-l-2 border-green-500/30">
                                                        {r.l3.donorCities.slice(0, 3).map(d => (
                                                          <div key={d.city} className="flex flex-col gap-0.5">
                                                            <div className="flex items-center gap-1.5">
                                                              <span className="text-txt font-semibold">{d.city}</span>
                                                              <span className="text-green-400/70">{fmtSubs(d.headroomGbps)} subs free</span>
                                                            </div>
                                                            {d.nodes.slice(0, 3).map(n => (
                                                              <div key={n.name} className="flex items-center gap-1 pl-2 flex-wrap">
                                                                <span className="text-muted/60">↳</span>
                                                                <span className={n.shuttingDown ? 'line-through text-muted/60 font-mono text-[9px]' : 'text-txt/80 font-mono text-[9px]'}>{n.name}</span>
                                                                <span style={{ color: utilStyle(n.avgUtil).badge }} className="text-[9px]">{n.avgUtil.toFixed(1)}%</span>
                                                                {n.shuttingDown && (
                                                                  <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-red-500/20 text-red-400">SITE SHUTTING DOWN</span>
                                                                )}
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
                                                    <span className="text-muted">{' · '}{r.l3.cardsNeeded} new bundle{r.l3.cardsNeeded !== 1 ? 's' : ''} needed in {r.node.circle}</span>
                                                  </>
                                                )}
                                              </div>
                                            </div>
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
          </div>
        )}

      </div>
    </div>

    {/* ── Optimisation drilldown modal ── */}
    {optimDrilldown && (() => {
      const results = optimDrilldown.isTraffic ? optimData.results : subOptimData.results;
      const isSub   = !optimDrilldown.isTraffic;
      const { key } = optimDrilldown;

      const items = results.filter(r => {
        if (key === 'healthy')   return r.isHealthy;
        if (key === 'l1')        return !r.isHealthy && r.l1.canFix;
        if (key === 'l2')        return !r.isHealthy && !r.l1.canFix && r.l2.canFix;
        if (key === 'l3')        return !r.isHealthy && !r.l2.canFix && r.l3.canFix;
        /* needCards */          return !r.isHealthy && !r.l3.canFix;
      }).sort((a, b) => b.maxUtil - a.maxUtil);

      const LABELS: Record<typeof key, { title: string; color: string }> = {
        healthy:   { title: 'Healthy BRAS',          color: '#22c55e' },
        l1:        { title: 'Fixable — L1 within BRAS',   color: '#4ade80' },
        l2:        { title: 'Fixable — L2 within city',   color: '#86efac' },
        l3:        { title: 'Fixable — L3 within circle', color: '#a3e635' },
        needCards: { title: isSub ? 'Need new AE bundles' : 'Need new cards', color: '#f87171' },
      };
      const { title, color } = LABELS[key];

      return (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setOptimDrilldown(null)}
        >
          <div
            className="bg-panel border border-border rounded-xl shadow-2xl w-[680px] max-h-[75vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-card/60 flex-shrink-0">
              <span className="text-[13px] font-black" style={{ color }}>{items.length}</span>
              <span className="text-[13px] font-bold text-txt">{title}</span>
              <span className="text-[10px] text-muted ml-1">{isSub ? 'subscriber' : 'traffic'}</span>
              <button
                onClick={() => setOptimDrilldown(null)}
                className="ml-auto text-muted hover:text-txt text-[16px] leading-none"
              >✕</button>
            </div>

            {/* Table header */}
            <div className="flex items-center gap-2 px-5 py-1.5 border-b border-border/50 bg-card/30 flex-shrink-0 text-[9px] font-semibold uppercase tracking-wider text-muted">
              <span className="w-40 flex-shrink-0">BRAS Node</span>
              <span className="w-16 flex-shrink-0">Circle</span>
              <span className="w-24 flex-shrink-0">City</span>
              <span className="w-16 flex-shrink-0 text-right">Max Util</span>
              <span className="w-16 flex-shrink-0 text-right">Avg Util</span>
              <span className="w-12 flex-shrink-0 text-right">AEs</span>
              {key !== 'healthy' && <span className="flex-1 text-right">Action</span>}
            </div>

            {/* Rows */}
            <div className="overflow-y-auto flex-1">
              {items.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-[12px] text-muted">No BRAS in this category</div>
              ) : items.map(r => {
                const s = utilStyle(r.maxUtil);
                const action = key === 'l1'
                  ? (r.l1.canFix ? `rebalance ${r.aes.length} AEs` : `add ${r.l1.cardsNeeded} ${isSub ? 'bundle' : 'card'}${r.l1.cardsNeeded > 1 ? 's' : ''}`)
                  : key === 'l2'
                  ? `shift to ${r.l2.donors[0]?.name ?? r.node.city} (${r.l2.avgUtil.toFixed(0)}% city avg)`
                  : key === 'l3'
                  ? `shift to ${r.l3.donorCities[0]?.city ?? r.node.circle} (${r.l3.avgUtil.toFixed(0)}% circle avg)`
                  : key === 'needCards'
                  ? `needs ${r.l3.cardsNeeded} new ${isSub ? 'bundle' : 'card'}${r.l3.cardsNeeded > 1 ? 's' : ''}`
                  : '';
                return (
                  <div key={r.node.node} className="flex items-center gap-2 px-5 py-2 border-b border-border/30 hover:bg-card/30 transition-colors">
                    <span className="w-40 flex-shrink-0 text-[11px] font-bold font-mono text-txt truncate">
                      {r.node.node.replace('AIRBRAS_', '').replace('AIR_BRAS_', '')}
                    </span>
                    <span className="w-16 flex-shrink-0 text-[10px] text-muted">{r.node.circle}</span>
                    <span className="w-24 flex-shrink-0 text-[10px] text-muted truncate">{r.node.city}</span>
                    <span className="w-16 flex-shrink-0 text-[11px] font-bold text-right" style={{ color: s.badge }}>
                      {r.maxUtil.toFixed(1)}%
                    </span>
                    <span className="w-16 flex-shrink-0 text-[10px] text-muted text-right">
                      {r.avgUtil.toFixed(1)}%
                    </span>
                    <span className="w-12 flex-shrink-0 text-[10px] text-muted text-right">{r.aes.length}</span>
                    {key !== 'healthy' && (
                      <span className="flex-1 text-[10px] text-right" style={{ color: key === 'needCards' ? '#f87171' : '#4ade80' }}>
                        {action}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    })()}
    </>
  );
}
