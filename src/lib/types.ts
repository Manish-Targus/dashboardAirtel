export interface Tower {
  id: string;
  name: string;
  lat: number;
  lng: number;
  subscribers: number;
  activeConnections: number;
  signalStrength: number;
  bandwidth: string;
  status: 'active' | 'maintenance' | 'offline';
  handoffRate: number;
  dataUsageGB: number;
  uptime: number;
}

export interface District {
  subscribers: number;
  activeSubscribers: number;
  lat: number;
  lng: number;
  towers: Tower[];
}

export interface State {
  code: string;
  totalSubscribers: number;
  activeSubscribers: number;
  churnRate: number;
  growthRate: number;
  revenueArpu: number;
  districts: Record<string, District>;
}

export interface Metadata {
  generatedAt: string;
  totalSubscribers: number;
  activeSubscribers: number;
  totalActiveTowers: number;
  networkCoverage: number;
  avgSignalStrength: number;
  dataVersion: string;
}

export interface NetworkData {
  metadata: Metadata;
  states: Record<string, State>;
}

export type BandwidthFilter = 'All' | '5G' | '4G/5G' | '4G' | 'Maintenance';
export type RightTab = 'charts' | 'towers' | 'insights';

export interface FlatTower extends Tower {
  stateName: string;
  districtName: string;
}
