export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function signalToLabel(dbm: number): string {
  if (dbm >= -65) return 'Excellent';
  if (dbm >= -75) return 'Good';
  if (dbm >= -85) return 'Fair';
  return 'Poor';
}

export function signalToColor(dbm: number): string {
  if (dbm >= -65) return '#3fb950';
  if (dbm >= -75) return '#58a6ff';
  if (dbm >= -85) return '#d29922';
  return '#da3633';
}

export function statusColor(status: string): string {
  if (status === 'active') return '#3fb950';
  if (status === 'maintenance') return '#d29922';
  return '#da3633';
}

export function bandwidthColor(bw: string): string {
  if (bw === '5G') return '#58a6ff';
  if (bw === '4G/5G') return '#a371f7';
  return '#f78166';
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
