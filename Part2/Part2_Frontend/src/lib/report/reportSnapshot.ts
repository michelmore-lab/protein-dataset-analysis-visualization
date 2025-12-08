// src/lib/report/reportSnapshot.ts
import { writable, get } from 'svelte/store';

export type VisibleNode = {
  id: string;
  genome_name: string;
  protein_name: string;
  direction: 'plus' | 'minus';
  rel_position: number;
  is_present?: boolean;
  gene_type?: string;
  _dup?: boolean;
};

export type ScoreLink =
  | { source: string; target: string; score: number; is_reciprocal: boolean };

export type CompareLink =
  | { source: string; target: string; link_type: 'solid_color' | 'solid_red' | 'dotted_color' | 'dotted_grey' | 'dotted_gray' };

export type VisibleLink = ScoreLink | CompareLink;

export type Filters = {
  cutoff: number;
  showReciprocal: boolean;
  showNonReciprocal: boolean;
  showConsistent: boolean;
  showInconsistent: boolean;
  showPartiallyConsistent: boolean;
};

export type Snapshot = {
  generated_at: number;
  domain: string | undefined;
  genomes_order: string[];
  filters: {
    cutoff: number;
    showReciprocal: boolean;
    showNonReciprocal: boolean;
    showConsistent: boolean;
    showInconsistent: boolean;
    showPartiallyConsistent: boolean;
  };
  focus_mode: boolean;
  nodes: Array<{
    id: string;
    genome_name: string;
    protein_name: string;
    direction: string;   // "plus" | "minus"
    rel_position: number;
    is_present?: boolean;
    gene_type?: string;
  }>;
  // Only links that are visible under current filters (already filtered in Chart)
  links: Array<
    | { source: string; target: string; score: number; is_reciprocal: boolean }
    | { source: string; target: string; link_type: string }
  >;
};

export const reportSnapshot = writable<Snapshot | null>(null);

/** Helpers */
const DUP_SUFFIX = '__dup';
const canonicalId = (id: string) => id.endsWith(DUP_SUFFIX) ? id.slice(0, -DUP_SUFFIX.length) : id;
const undirectedKey = (a: string, b: string) => {
  const [x, y] = [a, b].map(canonicalId).sort();
  return `${x}|${y}`;
};

function linkDetailsFrom(l: VisibleLink) {
  if ('score' in l) {
    return {
      kind: 'score' as const,
      type: l.is_reciprocal ? 'reciprocal' as const : 'non_reciprocal' as const,
      similarity: l.score
    };
  }
  // CompareLink
  switch (l.link_type) {
    case 'solid_color':   return { kind: 'compare' as const, type: 'consistent' as const };
    case 'solid_red':     return { kind: 'compare' as const, type: 'inconsistent' as const };
    case 'dotted_color':  return { kind: 'compare' as const, type: 'partially_consistent' as const };
    case 'dotted_grey':
    case 'dotted_gray':   return { kind: 'compare' as const, type: 'non_reciprocal' as const };
    default:              return { kind: 'compare' as const, type: 'non_reciprocal' as const };
  }
}

/**
 * Build a snapshot of exactly what is being shown and save it to the store.
 * - Deduplicates nodes by stripping "__dup"
 * - Deduplicates links by (canonical source, canonical target)
 * - If multiple links collapse to same pair, prefers a scored link with max similarity; else keeps any compare type with priority:
 *     consistent > partially_consistent > inconsistent > non_reciprocal
 */
export function buildAndSetSnapshot(input: Omit<Snapshot, 'generated_at'>) {
  const snap: Snapshot = { ...input, generated_at: Date.now() };
  reportSnapshot.set(snap);
  return snap;
}
