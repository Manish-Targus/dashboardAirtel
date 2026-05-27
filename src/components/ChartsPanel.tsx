'use client';
import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { useDashboard } from '@/context/DashboardContext';
import { formatNumber } from '@/lib/utils';

const TOOLTIP_STYLE = {
  backgroundColor: '#1c2128',
  border: '1px solid #30363d',
  borderRadius: 6,
  color: '#e6edf3',
  fontSize: 11,
  boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
};

const BW_COLORS: Record<string, string> = { '5G': '#58a6ff', '4G/5G': '#a371f7', '4G': '#f78166' };

function ChartCard({ title, children, subtitle }: { title: string; children: React.ReactNode; subtitle?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">{title}</span>
        {subtitle && <span className="text-[10px] text-muted">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

export default function ChartsPanel() {
  const { data, selectedState, filteredTowers } = useDashboard();

  const subscriberData = useMemo(() =>
    Object.entries(data.states)
      .map(([, s]) => ({ name: s.code, total: +(s.totalSubscribers / 1e6).toFixed(2), active: +(s.activeSubscribers / 1e6).toFixed(2) }))
      .sort((a, b) => b.total - a.total),
    [data]
  );

  const bwData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredTowers.forEach(t => { counts[t.bandwidth] = (counts[t.bandwidth] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
  }, [filteredTowers]);

  const signalBins = useMemo(() => [
    { label: 'Poor<br/>≤−85', count: filteredTowers.filter(t => t.signalStrength <= -85).length, color: '#da3633' },
    { label: 'Fair<br/>−75…−85', count: filteredTowers.filter(t => t.signalStrength > -85 && t.signalStrength <= -75).length, color: '#d29922' },
    { label: 'Good<br/>−65…−75', count: filteredTowers.filter(t => t.signalStrength > -75 && t.signalStrength <= -65).length, color: '#58a6ff' },
    { label: 'Exc.<br/>≥−65', count: filteredTowers.filter(t => t.signalStrength > -65).length, color: '#3fb950' },
  ], [filteredTowers]);

  const topDataTowers = useMemo(() =>
    [...filteredTowers]
      .sort((a, b) => b.dataUsageGB - a.dataUsageGB)
      .slice(0, 5)
      .map(t => ({ name: t.name.split(' ').slice(0, 2).join(' '), tb: +(t.dataUsageGB / 1000).toFixed(1) })),
    [filteredTowers]
  );

  const statusData = useMemo(() => {
    const active = filteredTowers.filter(t => t.status === 'active').length;
    const maint = filteredTowers.filter(t => t.status === 'maintenance').length;
    const offline = filteredTowers.filter(t => t.status === 'offline').length;
    return [
      { name: 'Active', value: active, color: '#3fb950' },
      { name: 'Maintenance', value: maint, color: '#d29922' },
      { name: 'Offline', value: offline, color: '#da3633' },
    ].filter(d => d.value > 0);
  }, [filteredTowers]);

  const scope = selectedState ? selectedState : 'All India';

  return (
    <div className="p-3 space-y-3">
      <ChartCard title="Subscribers by State" subtitle="millions">
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={subscriberData} margin={{ top: 2, right: 2, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363d" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#8b949e', fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#8b949e', fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(31,111,235,0.06)' }} />
              <Bar dataKey="total" name="Total (M)" fill="#1f6feb" radius={[3, 3, 0, 0]} maxBarSize={20} />
              <Bar dataKey="active" name="Active (M)" fill="#3fb950" radius={[3, 3, 0, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <div className="grid grid-cols-2 gap-3">
        <ChartCard title="Bandwidth" subtitle={scope}>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={bwData} cx="50%" cy="45%" innerRadius={28} outerRadius={48} paddingAngle={2} dataKey="value">
                  {bwData.map(e => <Cell key={e.name} fill={BW_COLORS[e.name] || '#8b949e'} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10, color: '#8b949e' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Status" subtitle={scope}>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} cx="50%" cy="45%" innerRadius={28} outerRadius={48} paddingAngle={2} dataKey="value">
                  {statusData.map(e => <Cell key={e.name} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10, color: '#8b949e' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <ChartCard title="Signal Distribution" subtitle={scope}>
        <div className="h-28">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={signalBins} margin={{ top: 2, right: 2, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363d" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#8b949e', fontSize: 9 }} axisLine={false} tickLine={false}
                tickFormatter={v => v.replace('<br/>', '\n')} />
              <YAxis tick={{ fill: '#8b949e', fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="count" name="Towers" radius={[3, 3, 0, 0]} maxBarSize={32}>
                {signalBins.map((b, i) => <Cell key={i} fill={b.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard title="Top Data Usage" subtitle="terabytes">
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topDataTowers} layout="vertical" margin={{ top: 2, right: 6, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363d" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#8b949e', fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={80} tick={{ fill: '#8b949e', fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="tb" name="TB Used" fill="#a371f7" radius={[0, 3, 3, 0]} maxBarSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* ARPU comparison */}
      <ChartCard title="Revenue ARPU by State" subtitle="₹ per month">
        <div className="h-28">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={Object.entries(data.states).map(([, s]) => ({ name: s.code, arpu: s.revenueArpu }))}
              margin={{ top: 2, right: 2, left: -22, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#30363d" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#8b949e', fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#8b949e', fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`₹${v}`, 'ARPU']} />
              <Bar dataKey="arpu" name="ARPU (₹)" fill="#f78166" radius={[3, 3, 0, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
  );
}
