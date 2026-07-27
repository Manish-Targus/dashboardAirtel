/* ── Pure ideal-BNG-routing math, shared between the network map's Ideal View
 *    (AirtelNetworkMap.tsx) and the BNG Optimisation tab's Network Optimised
 *    simulation (networkOptimised.ts). Extracted verbatim from
 *    AirtelNetworkMap.tsx's recomputeAllConstants() — no behavior change. ── */

export type MsanRecord = { msan: string; vlan: string; count: number };
export type BrasEntry = { bras: string; msans: MsanRecord[] };
export type CityData = {
  name: string; lat: number; lng: number;
  distanceKm: number; totalCount: number; brasCount: number;
  bngCity?: string; bngCityLat?: number; bngCityLng?: number;
  bras: BrasEntry[];
  complaints?: number;
};
export type CircleData = { hub: string; lat: number; lng: number; color: string; cities: CityData[] };

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ── State name → internal circle-grouping code (governs which BNG hubs are
 *    considered part of the same "circle" for ideal-reroute candidacy) ── */
export const CIRCLE_CODE_MAP: Record<string, string> = {
  'Andaman And Nicobar Islands': 'KO',
  'Andhra Pradesh': 'AP',
  'Arunachal Pradesh': 'AS',
  'Assam': 'AS',
  'Bihar': 'BH',
  'Chhattisgarh': 'MP',
  'Dadra And Nagar Haveli': 'GJ',
  'Goa': 'MH',
  'Gujarat': 'GJ',
  'Haryana': 'UN',
  'Himachal Pradesh': 'UN',
  'Jammu And Kashmir': 'JK',
  'Jharkhand': 'BH',
  'Karnataka': 'KK',
  'Kerala': 'TN',
  'Ladakh': 'JK',
  'Madhya Pradesh': 'MP',
  'Maharashtra': 'MH',
  'Manipur': 'AS',
  'Meghalaya': 'AS',
  'Mizoram': 'AS',
  'NCR': 'DL',
  'Nagaland': 'AS',
  'Orissa': 'OD',
  'Pondicherry': 'TN',
  'Punjab': 'UN',
  'Rajasthan': 'RJ',
  'Sikkim': 'AS',
  'Tamil Nadu': 'TN',
  'Telangana': 'AP',
  'Tripura': 'AS',
  'Uttar Pradesh East': 'UE',
  'Uttar Pradesh West': 'UW',
  'Uttarakhand': 'UN',
  'West Bengal': 'KO',
};

export interface IdealReroute { name: string; distKm: number }

/** For every OLT city, finds the nearest alternative BNG hub that (a) belongs to the same
 *  internal circle-code group as the city's own circle, and (b) is either the group's primary
 *  hub for a city not currently on it, or strictly closer than the city's current hub.
 *  Keyed `` `${stateName}-${cityName}-${currentBngCity}` `` → `{ name: newHubLabel, distKm }`. */
export function computeIdealBngMap(data: Record<string, CircleData>): Map<string, IdealReroute> {
  // BNG hub positions across all circles (dedup by hub label)
  const bngPositions = new Map<string, { lat: number; lng: number }>();
  for (const circle of Object.values(data)) {
    for (const city of circle.cities) {
      if (city.bngCity && city.bngCityLat != null && city.bngCityLng != null && !bngPositions.has(city.bngCity)) {
        bngPositions.set(city.bngCity, { lat: city.bngCityLat, lng: city.bngCityLng });
      }
    }
  }
  const bngEntries = Array.from(bngPositions.entries());

  // BNG hub → its PRIMARY circle code (the code it serves the most cities for)
  const bngCircleCount = new Map<string, Map<string, number>>();
  for (const [circleName, circleData] of Object.entries(data)) {
    const code = CIRCLE_CODE_MAP[circleName] ?? '';
    for (const city of circleData.cities) {
      if (!city.bngCity) continue;
      if (!bngCircleCount.has(city.bngCity)) bngCircleCount.set(city.bngCity, new Map());
      const cnt = bngCircleCount.get(city.bngCity)!;
      cnt.set(code, (cnt.get(code) ?? 0) + 1);
    }
  }
  const bngPrimaryCode = new Map<string, string>();
  for (const [bng, counts] of Array.from(bngCircleCount.entries())) {
    let primary = '', max = 0;
    for (const [code, n] of Array.from(counts.entries())) { if (n > max) { primary = code; max = n; } }
    bngPrimaryCode.set(bng, primary);
  }

  // Ideal topology rerouting
  const idealMap = new Map<string, IdealReroute>();
  for (const [circleName, circleData] of Object.entries(data)) {
    const myCode = CIRCLE_CODE_MAP[circleName] ?? '';
    for (const city of circleData.cities) {
      if (city.bngCityLat == null || city.bngCityLng == null || city.distanceKm <= 0) continue;
      const currentHubInCircle = bngPrimaryCode.get(city.bngCity!) === myCode;
      let nearest: IdealReroute | null = null;
      for (const [bngName, bngPos] of bngEntries) {
        if (bngName === city.bngCity) continue;
        if (bngPrimaryCode.get(bngName) !== myCode) continue;
        const d = Math.round(haversineKm(city.lat, city.lng, bngPos.lat, bngPos.lng));
        if ((!currentHubInCircle || d < city.distanceKm) && (!nearest || d < nearest.distKm)) nearest = { name: bngName, distKm: d };
      }
      if (nearest) idealMap.set(`${circleName}-${city.name}-${city.bngCity}`, nearest);
    }
  }
  return idealMap;
}
