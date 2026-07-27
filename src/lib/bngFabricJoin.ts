/* ── Joins BNG/BRAS nodes against the Fabric/Non-Fabric inventory classification
 *    parsed from BRAS DATA_1.xlsx's "Input sheet" (see scripts/generateBngFabricType.py
 *    and src/app/api/bng/upload-fabric/route.ts). Node names are matched by exact
 *    string first, then a prefix/case-normalized fallback — no circle crosswalk is
 *    needed since the inventory sheet's own Circle column uses yet another
 *    inconsistent vocabulary that doesn't match anything else in this app. ── */

export interface FabricRecord {
  node: string;
  fabricType: 'Fabric' | 'Non Fabric' | 'Unknown';
  bngType?: string | null;
  status?: string | null;
  services?: string | null;
  site?: string | null;
  shuttingDown?: boolean;
}

export interface BrasNodeLite {
  node: string;
  circle: string;
  city: string;
  bras_type: string;
  ae_interfaces: unknown[];
}

export type FabricClassifiedNode<T extends BrasNodeLite = BrasNodeLite> = T & {
  fabricType: string;
  bngType: string;
  status: string;
  services: string;
  site: string;
  shuttingDown: boolean;
};

export function normalizeNodeName(n: string): string {
  return n.trim().toLowerCase().replace(/^airbras[_-]/, '');
}

export function joinFabricClassification<T extends BrasNodeLite>(
  nodes: T[],
  records: FabricRecord[],
): FabricClassifiedNode<T>[] {
  const exact = new Map(records.map(r => [r.node.trim(), r]));
  const fuzzy = new Map(records.map(r => [normalizeNodeName(r.node), r]));

  return nodes.map(n => {
    const rec = exact.get(n.node.trim()) ?? fuzzy.get(normalizeNodeName(n.node));
    return {
      ...n,
      fabricType: rec?.fabricType ?? 'Unknown',
      bngType: rec?.bngType ?? 'Unknown',
      status: rec?.status ?? 'Unknown',
      services: rec?.services ?? 'Unknown',
      site: rec?.site ?? 'Unknown',
      shuttingDown: rec?.shuttingDown ?? false,
    };
  });
}
