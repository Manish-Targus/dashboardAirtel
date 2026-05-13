'use client';
import { useMemo } from 'react';
import { useDashboard } from '@/context/DashboardContext';
import { allOltCities } from '@/lib/airtelDataHelper';

export default function AlertsSidebar() {
  const { isAlertsOpen, setIsAlertsOpen } = useDashboard();

  const sortedAlerts = useMemo(() => {
    // Filter cities with complaints
    const citiesWithComplaints = allOltCities.filter(c => c.city.complaints && c.city.complaints > 0);
    // Sort by ratio: complaints / totalCount descending
    return citiesWithComplaints.sort((a, b) => {
      const ratioA = (a.city.complaints || 0) / a.city.totalCount;
      const ratioB = (b.city.complaints || 0) / b.city.totalCount;
      return ratioB - ratioA;
    });
  }, []);

  if (!isAlertsOpen) return null;

  return (
    <div className="absolute top-0 left-0 h-full w-[320px] bg-panel border-r border-border shadow-2xl z-[3000] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div>
          <div className="text-[14px] font-bold text-txt flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            Active Network Alerts
          </div>
          <div className="text-[11px] text-muted mt-0.5">Cities ranked by highest complaint ratio</div>
        </div>
        <button onClick={() => setIsAlertsOpen(false)} className="text-muted hover:text-txt text-lg leading-none">×</button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sortedAlerts.map(({ city, circleName }) => {
          const complaints = city.complaints || 0;
          const ratio = (complaints / city.totalCount * 100).toFixed(2);
          
          return (
            <div key={`${circleName}-${city.name}`} className="px-4 py-3 border-b border-border/40 hover:bg-card/40 transition-colors">
              <div className="flex justify-between items-start mb-1">
                <div>
                  <div className="text-[13px] font-bold text-txt leading-none">{city.name}</div>
                  <div className="text-[10px] text-muted mt-1">{circleName} Circle</div>
                </div>
                <div className="text-right">
                  <div className="text-[13px] font-bold text-red-500 leading-none">{complaints}</div>
                  <div className="text-[10px] text-muted mt-1">Complaints</div>
                </div>
              </div>
              <div className="flex justify-between items-end mt-2">
                <div className="text-[11px] text-muted">Total Subs: <span className="text-txt font-mono">{city.totalCount.toLocaleString()}</span></div>
                <div className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">
                  {ratio}% ratio
                </div>
              </div>
            </div>
          );
        })}
        {sortedAlerts.length === 0 && (
          <div className="px-4 py-6 text-center text-muted text-sm">
            No active complaints detected.
          </div>
        )}
      </div>
    </div>
  );
}
