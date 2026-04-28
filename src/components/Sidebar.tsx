'use client';
import { useMemo, useState } from 'react';
import { useDashboard } from '@/context/DashboardContext';
import { formatNumber } from '@/lib/utils';

export default function Sidebar() {
  const { data, selectedState, setSelectedState, selectedDistrict, setSelectedDistrict } = useDashboard();
  const [search, setSearch] = useState('');

  const states = useMemo(() =>
    Object.entries(data.states)
      .map(([name, s]) => ({
        name,
        code: s.code,
        totalSubscribers: s.totalSubscribers,
        activeSubscribers: s.activeSubscribers,
        churnRate: s.churnRate,
        growthRate: s.growthRate,
        revenueArpu: s.revenueArpu,
        towerCount: Object.values(s.districts).reduce((acc, d) => acc + d.towers.length, 0),
        districtCount: Object.keys(s.districts).length,
      }))
      .sort((a, b) => b.totalSubscribers - a.totalSubscribers)
      .filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase())),
    [data, search]
  );

  const selectedStateDistricts = useMemo(() => {
    if (!selectedState) return [];
    return Object.entries(data.states[selectedState].districts).map(([name, d]) => ({
      name,
      subscribers: d.subscribers,
      activeSubscribers: d.activeSubscribers,
      towerCount: d.towers.length,
    })).sort((a, b) => b.subscribers - a.subscribers);
  }, [selectedState, data]);

  const avgArpu = useMemo(() => {
    const vals = Object.values(data.states).map(s => s.revenueArpu);
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }, [data]);

  return (
    <aside className="w-56 bg-panel border-r border-border flex flex-col overflow-hidden flex-shrink-0">
      {/* Search */}
      <div className="p-2 border-b border-border">
        <input
          type="text"
          placeholder="Search states..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-card border border-border rounded-md px-2.5 py-1.5 text-[12px] text-txt placeholder:text-muted focus:outline-none focus:border-accent2 transition-colors"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* All India row */}
        <div
          onClick={() => { setSelectedState(null); setSelectedDistrict(null); }}
          className={`px-3 py-2.5 cursor-pointer border-b border-border/50 flex justify-between items-center transition-colors hover:bg-accent2/10 ${
            !selectedState ? 'bg-accent2/10 border-l-[3px] border-l-accent2' : ''
          }`}
        >
          <div>
            <div className="font-semibold text-[13px] text-txt">All India</div>
            <div className="text-muted text-[10px]">{Object.keys(data.states).length} states</div>
          </div>
          <div className="text-right">
            <div className="text-[12px] font-bold text-txt">{formatNumber(data.metadata.totalSubscribers)}</div>
            <div className="text-muted text-[10px]">total subs</div>
          </div>
        </div>

        {/* State list */}
        {states.map(state => {
          const isActive = selectedState === state.name;
          return (
            <div key={state.name}>
              <div
                onClick={() => setSelectedState(isActive ? null : state.name)}
                className={`px-3 py-2 cursor-pointer border-b border-border/50 transition-colors hover:bg-accent2/10 ${
                  isActive ? 'bg-accent2/10 border-l-[3px] border-l-accent2' : ''
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[13px] text-txt truncate">{state.name}</div>
                    <div className="text-muted text-[10px]">{state.code} · {state.towerCount} towers</div>
                  </div>
                  <div className="text-right ml-2 flex-shrink-0">
                    <div className="text-[12px] font-bold text-txt">{formatNumber(state.totalSubscribers)}</div>
                    <div className="text-muted text-[10px]">subs</div>
                  </div>
                </div>
                <div className="flex gap-1.5 mt-1.5">
                  <span className={`text-[10px] px-1 py-0.5 rounded font-semibold ${
                    state.growthRate > 7 ? 'bg-good/15 text-good' : 'bg-accent2/15 text-blue-400'
                  }`}>+{state.growthRate}%</span>
                  <span className={`text-[10px] px-1 py-0.5 rounded font-semibold ${
                    state.churnRate > 2.5 ? 'bg-danger/15 text-danger' : 'bg-warn/15 text-warn'
                  }`}>{state.churnRate}% churn</span>
                  <span className="text-[10px] px-1 py-0.5 rounded font-semibold bg-card text-muted">
                    ₹{state.revenueArpu}
                  </span>
                </div>
              </div>

              {/* District sub-list */}
              {isActive && selectedStateDistricts.map(dist => (
                <div
                  key={dist.name}
                  onClick={() => setSelectedDistrict(selectedDistrict === dist.name ? null : dist.name)}
                  className={`pl-5 pr-3 py-1.5 cursor-pointer border-b border-border/30 flex justify-between items-center transition-colors hover:bg-accent2/5 ${
                    selectedDistrict === dist.name ? 'bg-accent2/5 border-l-[3px] border-l-accent2/50' : ''
                  }`}
                >
                  <div>
                    <div className="text-[12px] text-txt truncate">{dist.name}</div>
                    <div className="text-[10px] text-muted">{dist.towerCount} towers</div>
                  </div>
                  <div className="text-[11px] font-semibold text-muted ml-2">{formatNumber(dist.subscribers)}</div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="p-2.5 border-t border-border bg-card flex justify-between items-center">
        <span className="text-[10px] text-muted">Avg ARPU</span>
        <span className="text-[12px] font-bold text-txt">₹{avgArpu}</span>
      </div>
    </aside>
  );
}
