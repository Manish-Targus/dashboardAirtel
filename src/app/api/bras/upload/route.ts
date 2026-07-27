import { NextResponse } from 'next/server';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

export const maxDuration = 300;

const UPLOAD_DIR = path.join(process.cwd(), 'bras data uploads');
const INDEX_FILE = path.join(UPLOAD_DIR, '_index.json');
const COORDS_CACHE_FILE = path.join(UPLOAD_DIR, '_city_coords_cache.json');
const SHEET_NAME = 'MSAN-BNG';

// Required headers at exact column positions (trimmed comparison)
const REQUIRED_HEADERS: Record<number, string> = {
  0: 'CIRCLE',
  1: 'City',
  2: 'OLT',
  3: 'Customers',
  4: 'VLAN',
  5: 'BNG',
  6: 'ae',
  7: 'BNG site',
  8: 'BNG type',
  9: 'site to be shut',
};

// Map BRAS circle names → canonical airtelNetworkData.json keys
const CIRCLE_NAME_MAP: Record<string, string> = {
  'Andhra Pradesh':    'Andhra Pradesh',
  'Assam':             'Assam',
  'Bihar':             'Bihar',
  'Gujarat':           'Gujarat',
  'Haryana':           'Haryana',
  'Himachal Pradesh':  'Himachal Pradesh',
  'Jammu n Kashmir':   'Jammu And Kashmir',
  'Karnataka':         'Karnataka',
  'Kerala':            'Kerala',
  'Kolkata':           'West Bengal',
  'MP':                'Madhya Pradesh',
  'Maharashtra':       'Maharashtra',
  'Mumbai':            'Maharashtra',
  'NCR':               'NCR',
  'North - UP West':   'Uttar Pradesh West',
  'North East':        'Assam',
  'Orissa':            'Orissa',
  'Punjab':            'Punjab',
  'Rajasthan':         'Rajasthan',
  'Tamilnadu':         'Tamil Nadu',
  'UP East':           'Uttar Pradesh East',
  'West Bengal':       'West Bengal',
};

// Canonical circle → Indian state name used as geocoding context
const CIRCLE_TO_STATE: Record<string, string> = {
  'Andhra Pradesh':     'Andhra Pradesh',
  'Assam':             'Assam',
  'Bihar':             'Bihar',
  'Gujarat':           'Gujarat',
  'Haryana':           'Haryana',
  'Himachal Pradesh':  'Himachal Pradesh',
  'Jammu And Kashmir': 'Jammu and Kashmir',
  'Karnataka':         'Karnataka',
  'Kerala':            'Kerala',
  'Madhya Pradesh':    'Madhya Pradesh',
  'Maharashtra':       'Maharashtra',
  'NCR':               'Delhi',
  'Orissa':            'Odisha',
  'Punjab':            'Punjab',
  'Rajasthan':         'Rajasthan',
  'Tamil Nadu':        'Tamil Nadu',
  'Uttar Pradesh East': 'Uttar Pradesh',
  'Uttar Pradesh West': 'Uttar Pradesh',
  'West Bengal':       'West Bengal',
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

async function geocodeCity(name: string, stateName?: string): Promise<[number, number] | null> {
  try {
    // Try with state context first (more accurate), fall back to plain India search
    const queries = stateName
      ? [`${name}, ${stateName}, India`, `${name}, India`]
      : [`${name}, India`];

    for (const query of queries) {
      const q = encodeURIComponent(query);
      const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=in`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'PRISM Airtel Dashboard / singhsaurav1927@gmail.com' },
      });
      if (!res.ok) continue;
      const data = await res.json() as { lat: string; lon: string }[];
      if (data.length) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
      // Rate-limit gap between the two attempts
      if (queries.length > 1) await sleep(1100);
    }
    return null;
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface UploadMeta {
  date: string;
  filename: string;
  uploadedAt: number;
  cityCount: number;
  brasCount: number;
  circleCount: number;
  geocodedCount: number;
}

async function readIndex(): Promise<UploadMeta[]> {
  if (!existsSync(INDEX_FILE)) return [];
  return JSON.parse(await readFile(INDEX_FILE, 'utf-8'));
}

async function writeIndex(entries: UploadMeta[]) {
  await writeFile(INDEX_FILE, JSON.stringify(entries, null, 2), 'utf-8');
}

interface MsanRecord { msan: string; vlan: string; count: number; }
interface BrasEntry  { bras: string; msans: MsanRecord[]; bngType?: string; }
interface CityData {
  name: string; lat: number; lng: number;
  distanceKm: number; totalCount: number; brasCount: number;
  bngCity?: string; bngCityLat?: number; bngCityLng?: number;
  bras: BrasEntry[];
  shutdownBngs?: string[];
}
interface CircleData { hub: string; lat: number; lng: number; color: string; cities: CityData[]; }

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file attached.' }, { status: 400 });

    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      return NextResponse.json(
        { error: 'Wrong file type.', details: [`Expected .xlsx or .xls, got "${file.name}".`] },
        { status: 422 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buffer, { type: 'buffer' });
    } catch {
      return NextResponse.json(
        { error: 'Could not read file.', details: ['File appears corrupt or is not a valid Excel workbook.'] },
        { status: 422 }
      );
    }

    if (!wb.SheetNames.includes(SHEET_NAME)) {
      return NextResponse.json(
        {
          error: 'Wrong sheet.',
          details: [
            `Expected a sheet named "${SHEET_NAME}".`,
            `Sheets found: ${wb.SheetNames.map(s => `"${s}"`).join(', ') || '(none)'}.`,
          ],
        },
        { status: 422 }
      );
    }

    const ws = wb.Sheets[SHEET_NAME];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });

    // Find header row (first row with CIRCLE in col 0)
    const headerIdx = rows.findIndex(r => String(r[0] ?? '').trim() === 'CIRCLE');
    if (headerIdx === -1) {
      return NextResponse.json(
        { error: 'Header row not found.', details: ['Could not find a row where column A = "CIRCLE".'] },
        { status: 422 }
      );
    }

    const header = rows[headerIdx] as unknown[];

    // Validate minimum column count
    if (header.length < 10) {
      return NextResponse.json(
        {
          error: 'Column count too low.',
          details: [`Expected at least 10 columns, found ${header.length}.`],
        },
        { status: 422 }
      );
    }

    // Validate each required header
    const colErrors: string[] = [];
    for (const [idxStr, expected] of Object.entries(REQUIRED_HEADERS)) {
      const idx = Number(idxStr);
      const actual = String(header[idx] ?? '').trim();
      if (actual !== expected) {
        colErrors.push(`Column ${idx + 1}: expected "${expected}", got "${actual || '(empty)'}".`);
      }
    }
    if (colErrors.length > 0) {
      return NextResponse.json({ error: 'Column mismatch.', details: colErrors }, { status: 422 });
    }

    const dataRows = rows.slice(headerIdx + 1).filter(r => r[0] && r[1]);
    if (dataRows.length === 0) {
      return NextResponse.json(
        { error: 'No data rows.', details: ['No rows with CIRCLE and City found after the header.'] },
        { status: 422 }
      );
    }

    // ── Load coordinate lookups ──────────────────────────────────────────────
    const cityCoords: Record<string, [number, number]> = JSON.parse(
      await readFile(path.join(process.cwd(), 'src/data/cityCoords.json'), 'utf-8')
    );

    let coordsCache: Record<string, [number, number]> = {};
    if (existsSync(COORDS_CACHE_FILE)) {
      coordsCache = JSON.parse(await readFile(COORDS_CACHE_FILE, 'utf-8'));
    }

    const staticData: Record<string, CircleData> = JSON.parse(
      await readFile(path.join(process.cwd(), 'src/data/airtelNetworkData.json'), 'utf-8')
    );

    // Lookup: compound key "{NAME}::{STATE}" takes priority (state-specific accuracy),
    // then plain key from cityCoords.json, then plain key from cache.
    const lookupCoords = (name: string, stateName?: string): [number, number] | null => {
      const key = name.trim().toUpperCase();
      if (stateName) {
        const compoundKey = `${key}::${stateName.toUpperCase()}`;
        if (coordsCache[compoundKey]) return coordsCache[compoundKey];
      }
      if (cityCoords[key]) return cityCoords[key];
      if (coordsCache[key]) return coordsCache[key];
      return null;
    };

    // ── Build list of (name, stateName) pairs that need geocoding ────────────
    // Key: "{NAME}::{STATE}" for cities (state-specific), plain name for BNG sites
    const needsGeocode = new Map<string, string | undefined>(); // geocodeKey → stateName
    for (const row of dataRows) {
      const brasCircle = String(row[0]).trim();
      const city       = String(row[1]).trim();
      const bngSite    = String(row[7] ?? '').trim();
      const canonCircle = CIRCLE_NAME_MAP[brasCircle] ?? brasCircle;
      const stateName   = CIRCLE_TO_STATE[canonCircle];

      const cityKey = stateName ? `${city.toUpperCase()}::${stateName.toUpperCase()}` : city.toUpperCase();
      if (!lookupCoords(city, stateName) && !needsGeocode.has(cityKey)) {
        needsGeocode.set(cityKey, stateName);
      }
      // BNG sites are telecom facilities — search broadly without state restriction
      if (bngSite && bngSite !== '#N/A' && !lookupCoords(bngSite) && !needsGeocode.has(bngSite.toUpperCase())) {
        needsGeocode.set(bngSite.toUpperCase(), undefined);
      }
    }

    // ── Geocode missing locations (Nominatim, 1 req/sec) ────────────────────
    let geocodedCount = 0;
    for (const [geocodeKey, stateName] of Array.from(needsGeocode.entries())) {
      await sleep(1100);
      // Extract the bare city name (strip "::STATE" suffix if present)
      const cityName = geocodeKey.includes('::') ? geocodeKey.split('::')[0] : geocodeKey;
      const coords = await geocodeCity(cityName, stateName);
      if (coords) {
        coordsCache[geocodeKey] = coords;
        geocodedCount++;
      } else {
        coordsCache[`__FAILED__${geocodeKey}`] = [0, 0];
      }
    }

    // Save updated cache
    if (!existsSync(UPLOAD_DIR)) await mkdir(UPLOAD_DIR, { recursive: true });
    if (geocodedCount > 0 || needsGeocode.size > 0) {
      await writeFile(COORDS_CACHE_FILE, JSON.stringify(coordsCache, null, 2), 'utf-8');
    }

    // ── Group rows: circle → city → bng → olts ──────────────────────────────
    type OltRow = { msan: string; vlan: string; customers: number; bngType: string; siteToShut: boolean };
    // canonCircle → city → bngKey → OltRow[]
    const grouped = new Map<string, Map<string, Map<string, OltRow[]>>>();

    for (const row of dataRows) {
      const brasCircle = String(row[0]).trim();
      const city       = String(row[1]).trim();
      const olt        = String(row[2] ?? '').trim();
      const customers  = Number(row[3]) || 0;
      const vlan       = String(row[4] ?? '').trim();
      const bng        = String(row[5] ?? '').trim();
      const bngSite    = String(row[7] ?? '').trim();
      const bngType    = String(row[8] ?? '').trim();
      const shutRaw    = String(row[9] ?? '').trim().toLowerCase();
      const siteToShut = shutRaw === 'to be shut' || shutRaw === 'to be shut ';

      if (!bng || bng === '#N/A') continue;

      const canonCircle = CIRCLE_NAME_MAP[brasCircle] ?? brasCircle;

      if (!grouped.has(canonCircle)) grouped.set(canonCircle, new Map<string, Map<string, OltRow[]>>());
      const circleMap = grouped.get(canonCircle)!;

      if (!circleMap.has(city)) circleMap.set(city, new Map<string, OltRow[]>());
      const cityMap = circleMap.get(city)!;

      // bngKey encodes both bng name and bng site for later extraction
      const bngKey = `${bng}|||${bngSite}`;
      if (!cityMap.has(bngKey)) cityMap.set(bngKey, []);
      cityMap.get(bngKey)!.push({ msan: olt, vlan, customers, bngType, siteToShut });
    }

    // ── Build output structure ───────────────────────────────────────────────
    const output: Record<string, CircleData> = {};
    const allBngSet = new Set<string>();
    let totalCities = 0;

    for (const [canonCircle, cityMap] of Array.from(grouped.entries())) {
      const staticCircle = staticData[canonCircle];
      if (!staticCircle) continue;

      const stateName = CIRCLE_TO_STATE[canonCircle];
      const cities: CityData[] = [];

      for (const [cityName, bngMap] of Array.from(cityMap.entries())) {
        // Pass state name so compound-key cache hits (e.g. Mehatpur::HIMACHAL PRADESH) are used
        const cityCoord = lookupCoords(cityName, stateName);
        if (!cityCoord) continue;

        const [cityLat, cityLng] = cityCoord;

        // Find the primary BNG site for this city (most OLTs)
        let primaryBngSite = '';
        let primaryBngName = '';
        let maxOlts = 0;
        for (const [bngKey, olts] of Array.from(bngMap.entries())) {
          const parts = bngKey.split('|||');
          const bngName = parts[0];
          const bngSite = parts[1] ?? '';
          if (olts.length > maxOlts) {
            maxOlts = olts.length;
            primaryBngSite = bngSite;
            primaryBngName = bngName;
          }
          allBngSet.add(bngName);
        }

        const bngSiteCoord = primaryBngSite ? lookupCoords(primaryBngSite) : null;
        const bngCityLat = bngSiteCoord ? bngSiteCoord[0] : staticCircle.lat;
        const bngCityLng = bngSiteCoord ? bngSiteCoord[1] : staticCircle.lng;
        const bngCity = primaryBngSite || primaryBngName;

        const distanceKm = haversineKm(cityLat, cityLng, bngCityLat, bngCityLng);

        // Build bras entries
        const brasEntries: BrasEntry[] = [];
        const shutdownBngs: string[] = [];
        let totalCount = 0;

        for (const [bngKey, olts] of Array.from(bngMap.entries())) {
          const bngName = bngKey.split('|||')[0];
          const bngType = (olts[0] as OltRow | undefined)?.bngType ?? '';
          const hasShutdown = olts.some((o: OltRow) => o.siteToShut);
          if (hasShutdown) shutdownBngs.push(bngName);

          const msans: MsanRecord[] = olts.map((o: OltRow) => ({
            msan:  o.msan,
            vlan:  o.vlan,
            count: o.customers,
          }));

          const brasTotal = msans.reduce((s, m) => s + m.count, 0);
          totalCount += brasTotal;

          brasEntries.push({ bras: bngName, msans, bngType });
        }

        cities.push({
          name:        cityName.toUpperCase(),
          lat:         cityLat,
          lng:         cityLng,
          distanceKm,
          totalCount,
          brasCount:   brasEntries.length,
          bngCity:     bngCity || undefined,
          bngCityLat:  bngSiteCoord ? bngCityLat : undefined,
          bngCityLng:  bngSiteCoord ? bngCityLng : undefined,
          bras:        brasEntries,
          ...(shutdownBngs.length > 0 ? { shutdownBngs } : {}),
        });

        totalCities++;
      }

      if (cities.length === 0) continue;

      output[canonCircle] = {
        hub:    staticCircle.hub,
        lat:    staticCircle.lat,
        lng:    staticCircle.lng,
        color:  staticCircle.color,
        cities,
      };
    }

    if (Object.keys(output).length === 0) {
      return NextResponse.json(
        { error: 'No usable data.', details: ['Could not match any circles or resolve any city coordinates.'] },
        { status: 422 }
      );
    }

    // ── Persist ──────────────────────────────────────────────────────────────
    const uploadDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const safeDate   = uploadDate;

    await writeFile(path.join(UPLOAD_DIR, `${safeDate}.json`), JSON.stringify(output, null, 2), 'utf-8');

    const index = await readIndex();
    const meta: UploadMeta = {
      date:         safeDate,
      filename:     file.name,
      uploadedAt:   Date.now(),
      cityCount:    totalCities,
      brasCount:    allBngSet.size,
      circleCount:  Object.keys(output).length,
      geocodedCount,
    };
    const existing = index.findIndex(e => e.date === safeDate);
    if (existing >= 0) index[existing] = meta;
    else index.unshift(meta);
    index.sort((a, b) => b.uploadedAt - a.uploadedAt);
    await writeIndex(index);

    return NextResponse.json(meta);
  } catch (err) {
    console.error('[bras/upload]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
