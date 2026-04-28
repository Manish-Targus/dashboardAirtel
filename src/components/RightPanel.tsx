'use client';
import { useDashboard } from '@/context/DashboardContext';
import ChartsPanel from './ChartsPanel';
import TowerTable from './TowerTable';
import InsightsPanel from './InsightsPanel';
import type { RightTab } from '@/lib/types';

const TABS: { id: RightTab; label: string }[] = [
  { id: 'charts',   label: 'Charts'   },
  { id: 'towers',   label: 'Towers'   },
  { id: 'insights', label: 'Insights' },
];

export default function RightPanel() {
  const { activeTab, setActiveTab, filteredTowers } = useDashboard();

  return (
    <aside className="w-80 bg-panel border-l border-border flex flex-col overflow-hidden flex-shrink-0">
      <div className="flex border-b border-border flex-shrink-0">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2.5 text-[12px] font-medium transition-colors border-b-2 ${
              activeTab === tab.id
                ? 'text-txt border-accent2'
                : 'text-muted border-transparent hover:text-txt hover:border-border'
            }`}
          >
            {tab.label}
            {tab.id === 'towers' && (
              <span className="ml-1 text-[10px] bg-card rounded-full px-1.5 py-0.5 text-muted">
                {filteredTowers.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* {activeTab === 'charts'   && <ChartsPanel />}
        {activeTab === 'towers'   && <TowerTable />}
        {activeTab === 'insights' && <InsightsPanel />} */}
      </div>
    </aside>
  );
}
