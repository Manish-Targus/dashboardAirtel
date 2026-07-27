/* ── Crosswalk: network-map BNG hub labels (airtelNetworkData.json's `bngCity`
 *    field) → BNG Utilisation dataset's (circle, city) vocabulary (bngAeData.json).
 *
 *    The two datasets grew independently and use inconsistent, sometimes typo'd
 *    hub-name strings. This table was hand-built by cross-referencing the distinct
 *    (state, bngCity) pairs in airtelNetworkData.json against the distinct
 *    (circle, city) pairs in bngAeData.json. Keys are matched after `.trim()` only
 *    — no fuzzy normalization — so known typo/spacing variants are listed as
 *    separate explicit keys pointing at the same target.
 *
 *    Hubs with no entry here (e.g. "portblare" for Andaman) have no BNG
 *    utilisation data at all — callers must treat a missing lookup as "skip",
 *    never throw. ── */

export interface BngHubTarget {
  circle: string;
  city: string;
}

export const BNG_HUB_CROSSWALK: Record<string, BngHubTarget> = {
  'Uppal':               { circle: 'AP',   city: 'Hyderabad' },
  'Vijaywada':           { circle: 'AP',   city: 'Vijayawada' },
  'Guwahati':            { circle: 'NESA', city: 'Guwahati' },
  'Infinity- Kolkata':   { circle: 'WB',   city: 'Kolkata' },
  'Infinity-Kolkata':    { circle: 'WB',   city: 'Kolkata' },
  // 'Okhla' is a Delhi locality; NCR splits into Delhi/Gurgaon/Manesar/Noida in
  // the BNG dataset, and the network map separately uses 'Manesar'/'Noida' labels
  // for some states (mapped directly below). Bare 'Okhla' is treated as Delhi.
  'Okhla':               { circle: 'NCR',  city: 'Delhi' },
  'Manesar':             { circle: 'NCR',  city: 'Manesar' },
  'Noida':               { circle: 'NCR',  city: 'Noida' },
  'Ranchi':               { circle: 'BHJH', city: 'Ranchi' },
  'patna':                { circle: 'BHJH', city: 'Patna' },
  'Bhopal':               { circle: 'MPCG', city: 'Bhopal' },
  'Indore':               { circle: 'MPCG', city: 'Indore' },
  'Raipur':               { circle: 'MPCG', city: 'Raipur' },
  'Ahmedabad':            { circle: 'GUJ',  city: 'Ahmedabad' },
  'Rakjot':               { circle: 'GUJ',  city: 'Rajkot' },        // typo in source data
  'Nagpur':               { circle: 'MH',   city: 'Nagpur' },
  'Pune':                 { circle: 'MH',   city: 'Pune' },
  'Spectrum-Mumbai':      { circle: 'MH',   city: 'Mumbai' },
  'Chadivali-Mumbai':     { circle: 'MH',   city: 'Mumbai' },
  'Ambala':               { circle: 'HPHP', city: 'Ambala' },
  'Ludhiana':              { circle: 'HPHP', city: 'Ludhiana' },
  'Mohali ':               { circle: 'HPHP', city: 'Mohali' },       // trailing space kept verbatim
  'Jammu':                 { circle: 'JK',   city: 'Jammu' },
  'Srinagar':              { circle: 'JK',   city: 'Srinagar' },
  'Manglore':              { circle: 'KK',   city: 'Mangalore' },    // typo in source data
  'banglore':              { circle: 'KK',   city: 'Bangalore' },    // typo in source data
  'Calicut':               { circle: 'KL',   city: 'Calicut' },
  'Santhome-Chennai':      { circle: 'TN',   city: 'Chennai' },
  'serisuri- Chennai':     { circle: 'TN',   city: 'Chennai' },
  'Bhubneshwar':           { circle: 'ORR',  city: 'Bhuwneshwar' },  // both sides typo'd, kept verbatim
  'Kharagpur':             { circle: 'WB',   city: 'Kharagpur' },
  'Pollachi':              { circle: 'TN',   city: 'Pollachi' },
  'Jaipur':                { circle: 'RAJ',  city: 'Jaipur' },
  'Jodhpur':               { circle: 'RAJ',  city: 'Jodhpur' },
  'Lucknow':               { circle: 'UPE',  city: 'Lucknow' },
  'Varanasi':              { circle: 'UPE',  city: 'Tarna-Varanasi' },
  'Merrut':                { circle: 'UPW',  city: 'Meerut' },       // typo in source data
  'Moradabad':             { circle: 'UPW',  city: 'Moradabad' },
  // NOTE: 'portblare' (Andaman) intentionally absent — zero BNG utilisation data
  // exists for that circle.
};

export function normalizeHubLabel(raw: string | undefined | null): string {
  return (raw ?? '').trim();
}

export function resolveHub(rawLabel: string | undefined | null): BngHubTarget | undefined {
  return BNG_HUB_CROSSWALK[normalizeHubLabel(rawLabel)];
}

/** Must match BngScreen.tsx's existing `${node.circle}::${node.city}` key format. */
export function hubKey(t: BngHubTarget): string {
  return `${t.circle}::${t.city}`;
}
