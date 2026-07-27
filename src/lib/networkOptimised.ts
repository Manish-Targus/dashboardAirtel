/* ── "Network Optimised" simulation: estimates how BNG traffic would shift if
 *    every OLT city were rerouted to its Ideal View hub (idealBngRouting.ts),
 *    then distributes that shift down to individual MX960 BRAS nodes so
 *    BngScreen.tsx's existing L1/L2/L3 optimisation math can run on the
 *    simulated numbers unchanged. ── */

import { processedAirtelData, type AirtelCircleData } from './airtelDataHelper';
import { computeIdealBngMap } from './idealBngRouting';
import { resolveHub, hubKey } from '@/data/bngHubCrosswalk';

export type HubKey = string; // `${circle}::${city}`

export interface CityMoveRecord {
  state: string;
  cityName: string;
  subs: number;
  originHub?: HubKey;
  destHub?: HubKey;
  reason: 'moved' | 'unmapped-origin' | 'unmapped-dest' | 'no-move';
}

/** Walks every OLT city, resolves its Ideal View reroute (if any) through the
 *  hub crosswalk, and records whether it results in a real hub-to-hub move. */
export function computeIdealCityMoves(
  airtelData: Record<string, AirtelCircleData> = processedAirtelData,
): CityMoveRecord[] {
  const idealMap = computeIdealBngMap(airtelData);
  const moves: CityMoveRecord[] = [];

  for (const [state, circleData] of Object.entries(airtelData)) {
    for (const city of circleData.cities) {
      const key = `${state}-${city.name}-${city.bngCity}`;
      const ideal = idealMap.get(key);
      if (!ideal) continue; // Ideal View doesn't reroute this city

      const origin = resolveHub(city.bngCity);
      const dest = resolveHub(ideal.name);

      if (!origin) { moves.push({ state, cityName: city.name, subs: city.totalCount, reason: 'unmapped-origin' }); continue; }
      if (!dest)   { moves.push({ state, cityName: city.name, subs: city.totalCount, originHub: hubKey(origin), reason: 'unmapped-dest' }); continue; }

      const originHub = hubKey(origin);
      const destHub = hubKey(dest);
      if (originHub === destHub) { moves.push({ state, cityName: city.name, subs: city.totalCount, originHub, destHub, reason: 'no-move' }); continue; }

      moves.push({ state, cityName: city.name, subs: city.totalCount, originHub, destHub, reason: 'moved' });
    }
  }
  return moves;
}

// Static — depends only on the baseline network-map data, not on any BRAS upload.
export const IDEAL_CITY_MOVES: CityMoveRecord[] = computeIdealCityMoves();

/** Subscriber-unit deltas per hub — used for the "By Subscriber" optimisation tab. */
export function computeHubSubscriberDeltas(moves: CityMoveRecord[] = IDEAL_CITY_MOVES): Map<HubKey, number> {
  const delta = new Map<HubKey, number>();
  for (const m of moves) {
    if (m.reason !== 'moved' || !m.originHub || !m.destHub) continue;
    delta.set(m.originHub, (delta.get(m.originHub) ?? 0) - m.subs);
    delta.set(m.destHub, (delta.get(m.destHub) ?? 0) + m.subs);
  }
  return delta;
}

export const HUB_SUBSCRIBER_DELTAS: Map<HubKey, number> = computeHubSubscriberDeltas();

export interface BrasNodeLite {
  node: string;
  circle: string;
  city: string;
  bras_type: string;
  ae_interfaces: { name: string; link_type: string; bw_gb: number | null; max_util: number }[];
}

/** Traffic (Gbps) deltas per hub — depends on the currently-loaded BRAS-AE
 *  dataset, so callers must memoize this on `allNodes`, not treat it as static. */
export function computeHubTrafficDeltas(
  allNodes: BrasNodeLite[],
  moves: CityMoveRecord[] = IDEAL_CITY_MOVES,
): Map<HubKey, number> {
  // Baseline downlink traffic per hub (MX960 only) — same formula BngScreen.tsx uses.
  const hubTrafficGbps = new Map<HubKey, number>();
  for (const n of allNodes) {
    if (n.bras_type !== 'MX960') continue;
    const dl = n.ae_interfaces.filter(a => a.link_type === 'BRAS-DOWNLINK');
    if (!dl.length) continue;
    const traffic = dl.reduce((s, a) => s + ((a.max_util ?? 0) / 100) * (a.bw_gb ?? 100), 0);
    const key = `${n.circle}::${n.city}`;
    hubTrafficGbps.set(key, (hubTrafficGbps.get(key) ?? 0) + traffic);
  }

  // Current subscriber base per hub (using ACTUAL bngCity, not ideal) — calibration denominator.
  const hubSubs = new Map<HubKey, number>();
  for (const circleData of Object.values(processedAirtelData) as AirtelCircleData[]) {
    for (const city of circleData.cities) {
      const t = resolveHub(city.bngCity);
      if (!t) continue;
      const key = hubKey(t);
      hubSubs.set(key, (hubSubs.get(key) ?? 0) + city.totalCount);
    }
  }

  const gbpsPerSub = (hub: HubKey): number => {
    const subs = hubSubs.get(hub) ?? 0;
    if (subs <= 0) return 0;
    const ratio = (hubTrafficGbps.get(hub) ?? 0) / subs;
    return Number.isFinite(ratio) ? ratio : 0;
  };

  // Move city.subs * gbpsPerSub(origin) from origin hub to dest hub — the origin
  // hub's ratio is used because that's the traffic the city already generates,
  // just being rerouted, not the destination's unrelated traffic mix.
  const delta = new Map<HubKey, number>();
  for (const m of moves) {
    if (m.reason !== 'moved' || !m.originHub || !m.destHub) continue;
    const gbps = m.subs * gbpsPerSub(m.originHub);
    if (gbps === 0) continue;
    delta.set(m.originHub, (delta.get(m.originHub) ?? 0) - gbps);
    delta.set(m.destHub, (delta.get(m.destHub) ?? 0) + gbps);
  }
  return delta;
}

export interface AdjustableBrasStats {
  node: { node: string; circle: string; city: string };
  trafficGbps: number;
  bwGbps: number;
  avgUtil: number;
  maxUtil: number;
}

/** Distributes each hub's net delta across that hub's BRAS nodes: gains spread
 *  proportional to capacity (bwGbps) share, losses spread proportional to
 *  current load (trafficGbps) share and clamped at 0. Generic over Gbps-unit
 *  stats (optimData) and subscriber-unit stats (subOptimData) — both use the
 *  same field names, so the same function serves both tabs. Hubs whose delta
 *  targets have no nodes in the current upload simply drop that portion.
 *
 *  `isExcludedFromGrowth`, when provided, keeps flagged nodes (e.g. sites
 *  slated for shutdown) out of the growth-share pool entirely — they never
 *  gain simulated traffic, and the full delta is redistributed among the
 *  remaining nodes in the hub. They can still lose traffic normally. */
export function applyHubDeltasToNodes<T extends AdjustableBrasStats>(
  stats: T[],
  hubDeltas: Map<HubKey, number>,
  isExcludedFromGrowth?: (node: T) => boolean,
): T[] {
  const byHub = new Map<HubKey, T[]>();
  for (const s of stats) {
    const key = `${s.node.circle}::${s.node.city}`;
    if (!byHub.has(key)) byHub.set(key, []);
    byHub.get(key)!.push(s);
  }

  const adjust = (n: T, newTrafficGbps: number): T => {
    const newAvgUtil = n.bwGbps > 0 ? (newTrafficGbps / n.bwGbps) * 100 : 0;
    const newMaxUtil = n.trafficGbps > 0 ? n.maxUtil * (newTrafficGbps / n.trafficGbps) : newAvgUtil;
    return { ...n, trafficGbps: newTrafficGbps, avgUtil: newAvgUtil, maxUtil: newMaxUtil };
  };

  const out: T[] = [];
  for (const [hub, group] of Array.from(byHub.entries())) {
    const D = hubDeltas.get(hub) ?? 0;
    if (D === 0) { out.push(...group); continue; }

    if (D > 0) {
      const growthEligible = group.filter(n => !isExcludedFromGrowth?.(n));
      const totalBw = growthEligible.reduce((s, n) => s + n.bwGbps, 0);
      for (const n of group) {
        if (isExcludedFromGrowth?.(n)) { out.push(n); continue; }
        const share = totalBw > 0 ? n.bwGbps / totalBw : 1 / growthEligible.length;
        out.push(adjust(n, n.trafficGbps + D * share));
      }
    } else {
      const totalTraffic = group.reduce((s, n) => s + n.trafficGbps, 0);
      for (const n of group) {
        const share = totalTraffic > 0 ? n.trafficGbps / totalTraffic : 1 / group.length;
        out.push(adjust(n, Math.max(0, n.trafficGbps + D * share)));
      }
    }
  }
  return out;
}
