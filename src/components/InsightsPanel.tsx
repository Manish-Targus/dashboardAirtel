'use client';
import { useMemo } from 'react';
import { useDashboard } from '@/context/DashboardContext';
import { formatNumber } from '@/lib/utils';

type InsightType = 'success' | 'warning' | 'alert' | 'info';

interface Insight {
  title: string;
  body: string;
  type: InsightType;
  metric?: string;
}

const TYPE_STYLES: Record<InsightType, { bg: string; border: string; badge: string; dot: string }> = {
  success: { bg: 'bg-good/8',    border: 'border-good/25',    badge: 'bg-good/20 text-good',     dot: 'bg-good' },
  warning: { bg: 'bg-warn/8',    border: 'border-warn/25',    badge: 'bg-warn/20 text-warn',     dot: 'bg-warn' },
  alert:   { bg: 'bg-danger/8',  border: 'border-danger/25',  badge: 'bg-danger/20 text-danger', dot: 'bg-danger' },
  info:    { bg: 'bg-accent2/8', border: 'border-accent2/25', badge: 'bg-accent2/20 text-blue-400', dot: 'bg-accent2' },
};

export default function InsightsPanel() {
  const { data, allTowers, filteredTowers, selectedState } = useDashboard();

  const insights = useMemo<Insight[]>(() => {
    const towers = selectedState ? filteredTowers : allTowers;
    const states = Object.entries(data.states);

    const highGrowth = [...states].sort((a, b) => b[1].growthRate - a[1].growthRate)[0];
    const highChurn  = [...states].sort((a, b) => b[1].churnRate  - a[1].churnRate)[0];
    const mostLoaded = [...towers].sort((a, b) => b.activeConnections - a.activeConnections)[0];
    const bestSignal = [...towers].sort((a, b) => b.signalStrength - a.signalStrength)[0];
    const lowestUptime = [...towers].sort((a, b) => a.uptime - b.uptime)[0];
    const maintTowers = towers.filter(t => t.status === 'maintenance');
    const fiveG = towers.filter(t => t.bandwidth === '5G' || t.bandwidth === '4G/5G');
    const fiveGPct = towers.length ? ((fiveG.length / towers.length) * 100).toFixed(0) : '0';
    const totalActive = towers.reduce((a, t) => a + t.activeConnections, 0);
    const totalSubs = towers.reduce((a, t) => a + t.subscribers, 0);
    const activeRate = totalSubs ? ((totalActive / totalSubs) * 100).toFixed(1) : '0';
    const avgUptime = towers.length
      ? (towers.reduce((a, t) => a + t.uptime, 0) / towers.length).toFixed(1)
      : '0';

    const result: Insight[] = [
      {
        title: 'Top Growth Market',
        body: `${highGrowth[0]} leads subscriber growth at ${highGrowth[1].growthRate}% YoY, driven by urban 5G rollout and competitive pricing.`,
        type: 'success',
        metric: `+${highGrowth[1].growthRate}% growth`,
      },
      {
        title: 'Churn Risk',
        body: `${highChurn[0]} has the highest churn rate at ${highChurn[1].churnRate}%. Review retention offers and network quality in this region.`,
        type: highChurn[1].churnRate > 2.5 ? 'alert' : 'warning',
        metric: `${highChurn[1].churnRate}% churn`,
      },
    ];

    if (maintTowers.length > 0) {
      result.push({
        title: 'Towers Under Maintenance',
        body: `${maintTowers.length} tower${maintTowers.length > 1 ? 's' : ''} offline for maintenance: ${maintTowers.slice(0, 2).map(t => t.name).join(', ')}${maintTowers.length > 2 ? ` +${maintTowers.length - 2} more` : ''}. Estimated service impact is localised.`,
        type: 'alert',
        metric: `${maintTowers.length} towers`,
      });
    }

    if (mostLoaded) {
      result.push({
        title: 'Peak Load Tower',
        body: `${mostLoaded.name} (${mostLoaded.districtName}) is handling ${formatNumber(mostLoaded.activeConnections)} active connections — the highest in the current view. Monitor for congestion.`,
        type: 'warning',
        metric: `${formatNumber(mostLoaded.activeConnections)} active`,
      });
    }

    result.push({
      title: '5G Network Expansion',
      body: `${fiveGPct}% of towers in the current view support 5G or dual 4G/5G mode (${fiveG.length}/${towers.length} towers). Rollout is progressing across metro areas.`,
      type: 'info',
      metric: `${fiveGPct}% 5G-ready`,
    });

    result.push({
      title: 'Network Active Rate',
      body: `${activeRate}% of subscribers are actively connected right now. Dynamic load-balancing should be applied during peak hours (18:00–22:00).`,
      type: parseFloat(activeRate) > 40 ? 'warning' : 'info',
      metric: `${activeRate}% active`,
    });

    if (lowestUptime) {
      result.push({
        title: lowestUptime.uptime < 98 ? 'Critical Uptime Alert' : 'Uptime Watch',
        body: `${lowestUptime.name} reports ${lowestUptime.uptime}% uptime — the lowest in the current view. ${lowestUptime.uptime < 98 ? 'Immediate investigation recommended.' : 'Monitor closely for degradation.'}`,
        type: lowestUptime.uptime < 98 ? 'alert' : 'warning',
        metric: `${lowestUptime.uptime}% uptime`,
      });
    }

    if (bestSignal) {
      result.push({
        title: 'Strongest Signal Tower',
        body: `${bestSignal.name} delivers ${bestSignal.signalStrength} dBm — the best signal in the current view. Use it as the benchmark for tower placement planning.`,
        type: 'success',
        metric: `${bestSignal.signalStrength} dBm`,
      });
    }

    result.push({
      title: 'Average Network Uptime',
      body: `Across all ${towers.length} towers in view, average uptime is ${avgUptime}%. ${parseFloat(avgUptime) >= 99 ? 'The network is in excellent health.' : 'Some towers are dragging the average — review the Towers tab.'}`,
      type: parseFloat(avgUptime) >= 99 ? 'success' : 'info',
      metric: `${avgUptime}% avg`,
    });

    return result;
  }, [data, allTowers, filteredTowers, selectedState]);

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">AI Network Insights</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent2/20 text-blue-400 font-semibold animate-pulse">LIVE</span>
        {selectedState && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-card text-muted ml-auto">{selectedState}</span>
        )}
      </div>

      {insights.map((insight, i) => {
        const s = TYPE_STYLES[insight.type];
        return (
          <div key={i} className={`${s.bg} border ${s.border} rounded-lg p-3`}>
            <div className="flex justify-between items-start gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
                <span className="text-[12px] font-semibold text-txt truncate">{insight.title}</span>
              </div>
              {insight.metric && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold whitespace-nowrap flex-shrink-0 ${s.badge}`}>
                  {insight.metric}
                </span>
              )}
            </div>
            <p className="text-muted text-[11px] leading-relaxed pl-3">{insight.body}</p>
          </div>
        );
      })}
    </div>
  );
}
