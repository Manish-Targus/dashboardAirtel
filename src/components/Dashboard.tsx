'use client';
import { DashboardProvider, useDashboard } from '@/context/DashboardContext';
import Header from './Header';
import MapView from './MapView';
import AlertsSidebar from './AlertsSidebar';
import BngScreen from './BngScreen';

function DashboardInner() {
  const { screenMode } = useDashboard();
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg">
      <Header />
      <div className="flex flex-1 overflow-hidden relative">
        {screenMode === 'map' ? (
          <>
            <AlertsSidebar />
            <MapView />
          </>
        ) : (
          <BngScreen />
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <DashboardProvider>
      <DashboardInner />
    </DashboardProvider>
  );
}
