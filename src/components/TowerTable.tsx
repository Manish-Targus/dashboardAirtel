'use client';
import { useMemo, useState } from 'react';
import { useDashboard } from '@/context/DashboardContext';
import { formatNumber, statusColor, bandwidthColor, signalToLabel, signalToColor } from '@/lib/utils';

type SortKey = 'activeConnections' | 'signalStrength' | 'uptime' | 'subscribers' | 'dataUsageGB';

export default function TowerTable() {
  const { filteredTowers, selectedTower, setSelectedTower, selectedState, setActiveTab } = useDashboard();
  const [sortKey, setSortKey] = useState<SortKey>('activeConnections');
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch] = useState('');

  const towers = useMemo(() => {
    const filtered = search
      ? filteredTowers.filter(t =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.districtName.toLowerCase().includes(search.toLowerCase())
        )
      : filteredTowers;
    return [...filtered].sort((a, b) => {
      const diff = (a[sortKey] as number) - (b[sortKey] as number);
      return sortAsc ? diff : -diff;
    });
  }, [filteredTowers, sortKey, sortAsc, search]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  }

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      onClick={() => toggleSort(k)}
      className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
        sortKey === k ? 'bg-accent2/20 text-blue-400' : 'text-muted hover:text-txt'
      }`}
    >
      {label} {sortKey === k ? (sortAsc ? '↑' : '↓') : ''}
    </button>
  );

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">
          {selectedState ?? 'All'} Towers
        </span>
        <span className="text-[10px] text-muted">{towers.length} shown</span>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search towers..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full bg-card border border-border rounded-md px-2.5 py-1.5 text-[12px] text-txt placeholder:text-muted focus:outline-none focus:border-accent2 transition-colors mb-2"
      />

      {/* Sort controls */}
      <div className="flex flex-wrap gap-1 mb-3">
        <SortBtn k="activeConnections" label="Active" />
        <SortBtn k="signalStrength" label="Signal" />
        <SortBtn k="uptime" label="Uptime" />
        <SortBtn k="subscribers" label="Subs" />
        <SortBtn k="dataUsageGB" label="Data" />
      </div>

      <div className="space-y-2">
        {towers.map(t => {
          const isSelected = selectedTower?.id === t.id;
          const sc = statusColor(t.status);
          const bc = bandwidthColor(t.bandwidth);
          const sigColor = signalToColor(t.signalStrength);

          return (
            <div
              key={t.id}
              onClick={() => {
                setSelectedTower(isSelected ? null : t);
                if (!isSelected) setActiveTab('towers');
              }}
              className={`bg-card border rounded-lg p-3 cursor-pointer transition-all hover:border-accent2/50 ${
                isSelected ? 'border-accent2 shadow-lg shadow-accent2/10' : 'border-border'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1 min-w-0 pr-2">
                  <div className="text-[12px] font-semibold text-txt truncate">{t.name}</div>
                  <div className="text-[10px] text-muted truncate">{t.districtName}, {t.stateName}</div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: `${bc}20`, color: bc }}>
                    {t.bandwidth}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold capitalize" style={{ background: `${sc}20`, color: sc }}>
                    {t.status}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <div className="text-[9px] text-muted uppercase tracking-wider mb-0.5">Active Conn.</div>
                  <div className="text-[12px] font-bold text-txt">{formatNumber(t.activeConnections)}</div>
                </div>
                <div>
                  <div className="text-[9px] text-muted uppercase tracking-wider mb-0.5">Signal</div>
                  <div className="text-[12px] font-bold" style={{ color: sigColor }}>{t.signalStrength} dBm</div>
                </div>
                <div>
                  <div className="text-[9px] text-muted uppercase tracking-wider mb-0.5">Uptime</div>
                  <div className={`text-[12px] font-bold ${t.uptime >= 99 ? 'text-good' : t.uptime >= 97 ? 'text-warn' : 'text-danger'}`}>
                    {t.uptime}%
                  </div>
                </div>
              </div>

              {/* Uptime bar */}
              <div className="mt-2 h-0.5 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${t.uptime}%`, background: t.uptime >= 99 ? '#3fb950' : t.uptime >= 97 ? '#d29922' : '#da3633' }}
                />
              </div>

              {isSelected && (
                <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 gap-x-4 gap-y-2">
                  {[
                    ['Subscribers', formatNumber(t.subscribers)],
                    ['Handoff Rate', `${t.handoffRate}%`],
                    ['Data Usage', `${formatNumber(t.dataUsageGB)} GB`],
                    ['Signal Quality', signalToLabel(t.signalStrength)],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div className="text-[9px] text-muted uppercase tracking-wider">{k}</div>
                      <div className="text-[11px] font-semibold text-txt">{v}</div>
                    </div>
                  ))}
                  <div className="col-span-2">
                    <div className="text-[9px] text-muted uppercase tracking-wider mb-0.5">Tower ID</div>
                    <div className="text-[10px] font-mono text-accent2">{t.id}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-[9px] text-muted uppercase tracking-wider mb-0.5">Coordinates</div>
                    <div className="text-[10px] font-mono text-muted">{t.lat.toFixed(4)}°N, {t.lng.toFixed(4)}°E</div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {towers.length === 0 && (
          <div className="text-center py-8 text-muted text-[12px]">No towers match your search.</div>
        )}
      </div>
    </div>
  );
}
