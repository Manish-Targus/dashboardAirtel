'use client';
import { useMemo } from 'react';
import { useDashboard } from '@/context/DashboardContext';
import type { ScreenMode } from '@/context/DashboardContext';
import { formatNumber } from '@/lib/utils';

interface KpiProps {
  label: string;
  value: string;
  badge?: { text: string; variant: 'green' | 'blue' | 'warn' | 'red' };
}

function Kpi({ label, value, badge }: KpiProps) {
  const badgeCls = {
    green: 'bg-good/15 text-good',
    blue: 'bg-accent2/15 text-blue-400',
    warn: 'bg-warn/15 text-warn',
    red: 'bg-danger/15 text-danger',
  };
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <span className="text-[17px] font-bold leading-none text-txt">{value}</span>
        {badge && (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${badgeCls[badge.variant]}`}>
            {badge.text}
          </span>
        )}
      </div>
      <span className="text-muted text-[11px]">{label}</span>
    </div>
  );
}

export default function Header() {
  const { data, selectedState, allTowers, mapMode, isAlertsOpen, setIsAlertsOpen, screenMode, setScreenMode } = useDashboard();
  const { metadata } = data;

  const kpis: any[] = useMemo(() => {
    const stateData = selectedState ? data.states[selectedState] : null;
    const totalSubs = stateData ? stateData.totalSubscribers : metadata.totalSubscribers;
    const activeSubs = stateData ? stateData.activeSubscribers : metadata.activeSubscribers;
    const activePct = ((activeSubs / totalSubs) * 100).toFixed(1);
    const maintCount = allTowers.filter(t => t.status === 'maintenance').length;
    const fiveGCount = allTowers.filter(t => t.bandwidth === '5G' || t.bandwidth === '4G/5G').length;
    const fiveGPct = ((fiveGCount / allTowers.length) * 100).toFixed(0);
return []
    // return [
    //   { label: 'Total Subscribers', value: formatNumber(totalSubs) },
    //   {
    //     label: 'Active Subscribers',
    //     value: formatNumber(activeSubs),
    //     badge: { text: `${activePct}%`, variant: 'green' as const },
    //   },
    //   {
    //     label: 'Network Coverage',
    //     value: `${metadata.networkCoverage}%`,
    //     badge: { text: 'Excellent', variant: 'green' as const },
    //   },
    //   {
    //     label: 'Avg Signal',
    //     value: `${metadata.avgSignalStrength} dBm`,
    //     badge: { text: 'Good', variant: 'blue' as const },
    //   },
    //   {
    //     label: '5G / 4G/5G Towers',
    //     value: `${fiveGCount}`,
    //     badge: { text: `${fiveGPct}%`, variant: 'blue' as const },
    //   },
    //   maintCount > 0
    //     ? { label: 'Under Maintenance', value: `${maintCount} towers`, badge: { text: 'Alert', variant: 'warn' as const } }
    //     : { label: 'Tower Uptime', value: '99.4%', badge: { text: 'Healthy', variant: 'green' as const } },
    // ]; 
  }, [data, selectedState, allTowers, metadata]);

  const ts = new Date(metadata.generatedAt).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  return (
    <header className="bg-panel border-b border-border px-4 py-2.5 flex items-center gap-6 flex-shrink-0">
      <div className="flex flex-col">
        <span className="text-base font-bold text-txt leading-tight">
          <span className="text-accent2">NET</span>PULSE
        </span>
        <span className="text-[10px] text-muted">v{metadata.dataVersion}</span>
      </div>

      <div className="w-px h-8 bg-border flex-shrink-0" />

      {mapMode === 'network' ? (
        <div className="flex-1 flex items-center gap-2">
          <span className="text-[13px] font-semibold text-txt">OLT Network Map</span>
          <span className="text-[11px] text-muted">· Airtel Circle → OLT City topology</span>
        </div>
      ) : (
        <div className="flex gap-6 flex-1 flex-wrap">
          {kpis.map((kpi) => (
            <Kpi key={kpi.label} {...kpi} />
          ))}
        </div>
      )}

      {mapMode === 'complaints' && selectedState && (
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-accent2/10 border border-accent2/30 rounded-lg">
          <span className="text-[11px] text-blue-400 font-medium">{selectedState}</span>
          <span className="text-[10px] text-muted">{data.states[selectedState].code}</span>
        </div>
      )}

      {/* Screen toggle */}
      <div className="flex bg-card border border-border rounded-md text-[11px] font-semibold overflow-hidden ml-auto">
        {([['map', 'Network Map'], ['bng', 'BNG Utilization'], ['mobile', 'Mobile Networks'], ['hubs', 'Hub Map'], ['mobileflow', 'Transport Flow']] as [ScreenMode, string][]).map(([mode, label]) => (
          <button
            key={mode}
            onClick={() => setScreenMode(mode)}
            className={`px-3 py-1.5 transition-colors border-r last:border-r-0 border-border ${screenMode === mode ? 'bg-accent2 text-bg' : 'text-muted hover:text-txt'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="text-muted text-[11px] whitespace-nowrap flex items-center gap-4">
        <button 
          onClick={() => setIsAlertsOpen(!isAlertsOpen)}
          className={`relative p-1.5 rounded-md transition-colors ${isAlertsOpen ? 'bg-accent2/20 text-accent2' : 'hover:bg-border text-muted hover:text-txt'}`}
          title="Alerts"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-panel" />
        </button>

        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-good animate-pulse" />
          LIVE · {ts}
        </div>
      </div>
    </header>
  );
}
