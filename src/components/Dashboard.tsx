'use client';
import { DashboardProvider } from '@/context/DashboardContext';
import Header from './Header';
import Sidebar from './Sidebar';
import MapView from './MapView';
import RightPanel from './RightPanel';
import AlertsSidebar from './AlertsSidebar';

export default function Dashboard() {
  return (
    <DashboardProvider>
      <div className="flex flex-col h-screen overflow-hidden bg-bg">
        <Header />
        <div className="flex flex-1 overflow-hidden relative">
          <AlertsSidebar />
          {/* <Sidebar /> */}
          <MapView />
          {/* <RightPanel /> */}
        </div>
      </div>
    </DashboardProvider>
  );
}
