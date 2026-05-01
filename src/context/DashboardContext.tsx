'use client';
import { createContext, useContext, useState, useMemo, ReactNode } from 'react';
import type { NetworkData, FlatTower, RightTab, BandwidthFilter } from '@/lib/types';
import rawData from '@/data/grouped.json';

const data = rawData as unknown as NetworkData;

export type MapMode = 'towers' | 'network';

interface DashboardCtx {
  data: NetworkData;
  selectedState: string | null;
  setSelectedState: (s: string | null) => void;
  selectedDistrict: string | null;
  setSelectedDistrict: (d: string | null) => void;
  selectedTower: FlatTower | null;
  setSelectedTower: (t: FlatTower | null) => void;
  bandwidthFilter: BandwidthFilter;
  setBandwidthFilter: (f: BandwidthFilter) => void;
  activeTab: RightTab;
  setActiveTab: (t: RightTab) => void;
  allTowers: FlatTower[];
  filteredTowers: FlatTower[];
  mapTowers: FlatTower[];
  mapMode: MapMode;
  setMapMode: (m: MapMode) => void;
}

const Ctx = createContext<DashboardCtx | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [selectedState, setSelectedStateRaw] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [selectedTower, setSelectedTower] = useState<FlatTower | null>(null);
  const [bandwidthFilter, setBandwidthFilter] = useState<BandwidthFilter>('All');
  const [activeTab, setActiveTab] = useState<RightTab>('charts');
  const [mapMode, setMapMode] = useState<MapMode>('network');

  function setSelectedState(s: string | null) {
    setSelectedStateRaw(s);
    setSelectedDistrict(null);
    setSelectedTower(null);
  }

  const allTowers = useMemo<FlatTower[]>(() => {
    const result: FlatTower[] = [];
    for (const [stateName, state] of Object.entries(data.states)) {
      for (const [districtName, district] of Object.entries(state.districts)) {
        for (const tower of district.towers) {
          result.push({ ...tower, stateName, districtName });
        }
      }
    }
    return result;
  }, []);

  const filteredTowers = useMemo(() => {
    if (!selectedState) return allTowers;
    if (!selectedDistrict) return allTowers.filter(t => t.stateName === selectedState);
    return allTowers.filter(t => t.stateName === selectedState && t.districtName === selectedDistrict);
  }, [allTowers, selectedState, selectedDistrict]);

  const mapTowers = useMemo(() => {
    return filteredTowers.filter(t => {
      if (bandwidthFilter === 'All') return true;
      if (bandwidthFilter === 'Maintenance') return t.status === 'maintenance';
      return t.bandwidth === bandwidthFilter;
    });
  }, [filteredTowers, bandwidthFilter]);

  return (
    <Ctx.Provider value={{
      data,
      selectedState, setSelectedState,
      selectedDistrict, setSelectedDistrict,
      selectedTower, setSelectedTower,
      bandwidthFilter, setBandwidthFilter,
      activeTab, setActiveTab,
      allTowers,
      filteredTowers,
      mapTowers,
      mapMode, setMapMode,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useDashboard() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDashboard must be within DashboardProvider');
  return ctx;
}
