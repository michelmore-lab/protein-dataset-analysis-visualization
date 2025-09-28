// src/lib/report/buildReport.ts
export type NodeT = {
  id: string;
  genome_name: string;
  protein_name: string;
  direction: string;   // "plus" | "minus"
  rel_position: number;
  is_present?: boolean;
  gene_type?: string;
  // domain_*_start/_end keys may exist dynamically
  [k: string]: any;
};

export type ScoreLinkT = {
  source: string;
  target: string;
  score: number;
  is_reciprocal: boolean;
};

export type CompareLinkT = {
  source: string;
  target: string;
  link_type: string; // "solid_color" | "solid_red" | "dotted_color" | "dotted_grey"/"dotted_gray"
};

export type LinkT = ScoreLinkT | CompareLinkT;

export type GraphT = {
  domain_name?: string;
  nodes: NodeT[];
  links: LinkT[];
  genomes: string[];
};

export type FiltersT = {
  cutoff: number;
  showReciprocal: boolean;
  showNonReciprocal: boolean;
  showConsistent: boolean;
  showInconsistent: boolean;
  showPartiallyConsistent: boolean;
};

function isScoreLink(l: any): l is ScoreLinkT {
  return l && typeof l.score === 'number' && 'is_reciprocal' in l;
}
function isCompareLink(l: any): l is CompareLinkT {
  return l && typeof l.link_type === 'string';
}

function extractDomainCoords(node: NodeT) {
  const entries = Object.entries(node)
    .filter(([k]) => k.includes('domain') && (k.endsWith('_start') || k.endsWith('_end')))
    .sort(([a], [b]) => a.localeCompare(b));

  const grouped: Record<string, { start?: number | string; end?: number | string }[]> = {};
  for (const [k, v] of entries) {
    const parts = k.split('_'); // e.g., domain_TIR_start
    const domainName = parts[1];
    const coordType = parts[parts.length - 1]; // start|end
    if (!grouped[domainName]) grouped[domainName] = [{}];
    const last = grouped[domainName][grouped[domainName].length - 1];
    if (coordType === 'start') {
      if (last.start == null && last.end == null) last.start = v as any;
      else grouped[domainName].push({ start: v as any });
    } else {
      if (last.start != null && last.end == null) last.end = v as any;
      else grouped[domainName].push({ end: v as any });
    }
  }
  return grouped;
}

function describeLink(l: LinkT): string {
  if (isScoreLink(l)) {
    return `${l.is_reciprocal ? 'Reciprocal' : 'Non-reciprocal'}, Similarity ${l.score}%`;
  }
  if (isCompareLink(l)) {
    switch (l.link_type) {
      case 'solid_color':  return 'Consistent across domains (solid colored)';
      case 'solid_red':    return 'Inconsistent across domains (solid red)';
      case 'dotted_color': return 'Partially consistent (dotted colored)';
      case 'dotted_grey':
      case 'dotted_gray':  return 'Non-reciprocal (dotted grey)';
      default:             return l.link_type;
    }
  }
  return 'Link';
}

function getVisibleLinks(g: GraphT, f: FiltersT) {
  const nodeById = new Map(g.nodes.map(n => [n.id, n]));

  // 1) Drop links that reference missing nodes
  let valid = g.links.filter(l => nodeById.has((l as any).source) && nodeById.has((l as any).target));

  // 2) Drop same-genome links to match Chart.svelte behavior
  valid = valid.filter(l => {
    const s = nodeById.get((l as any).source)!;
    const t = nodeById.get((l as any).target)!;
    return s.genome_name !== t.genome_name;
  });

  // 3) Apply filter toggles & cutoff exactly like the chart
  return valid.filter(l => {
    if ('score' in l) {
      if (g.domain_name !== 'ALL' && typeof f.cutoff === 'number' && l.score < f.cutoff) return false;
      return l.is_reciprocal ? f.showReciprocal : f.showNonReciprocal;
    }
    if ('link_type' in l) {
      switch (l.link_type) {
        case 'solid_color':  return f.showConsistent;
        case 'solid_red':    return f.showInconsistent;
        case 'dotted_color': return f.showPartiallyConsistent;
        case 'dotted_grey':
        case 'dotted_gray':  return f.showNonReciprocal;
        default:             return true;
      }
    }
    return true;
  });
}

// Restrict nodes to selection focus if present
export function restrictGraphToSelection(currentGraph: GraphT, selectedNodeIds: Set<string> | null) {
  if (!selectedNodeIds || selectedNodeIds.size === 0) return currentGraph;

  // Keep nodes that are selected (by id). We also keep their dup/original partner
  // because Chart treats them interchangeably in focus mode.
  const withPartner = new Set<string>(selectedNodeIds);
  for (const n of currentGraph.nodes) {
    if (selectedNodeIds.has(n.id)) {
      const dup = n._dup ? n.id.slice(0, -'__dup'.length) : n.id + '__dup';
      withPartner.add(dup);
    }
  }

  const nodes = currentGraph.nodes.filter(n => withPartner.has(n.id));
  const ids = new Set(nodes.map(n => n.id));
  const links = currentGraph.links.filter(l => ids.has((l as any).source) && ids.has((l as any).target));

  return { ...currentGraph, nodes, links };
}

export function buildReportMarkdown(currentGraph: GraphT, filters: FiltersT, selection?: { isFocused: boolean; nodes: string[] }) {
  // If focus is active and there are selected nodes, restrict the graph to them
    if (selection?.isFocused && selection.nodes?.length) {
    currentGraph = restrictGraphToSelection(currentGraph, new Set(selection.nodes));
    }

  const g = currentGraph; // already filtered to the user’s selected genomes
  const visibleLinks = getVisibleLinks(g, filters);

  const nodeById = new Map(g.nodes.map(n => [n.id, n]));
  const linksByNode = new Map<string, LinkT[]>();
  for (const l of visibleLinks) {
    const { source, target } = l as any;
    if (!linksByNode.has(source)) linksByNode.set(source, []);
    if (!linksByNode.has(target)) linksByNode.set(target, []);
    linksByNode.get(source)!.push(l);
    linksByNode.get(target)!.push(l);
  }

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const domainName = g.domain_name ?? '(unspecified)';
  const genomesOrdered = g.genomes.join('  →  ');

  const filterLines: string[] = [];
  if (g.domain_name === 'ALL') {
    filterLines.push(
      `Consistent: ${filters.showConsistent ? 'ON' : 'OFF'}`,
      `Inconsistent: ${filters.showInconsistent ? 'ON' : 'OFF'}`,
      `Partially Consistent: ${filters.showPartiallyConsistent ? 'ON' : 'OFF'}`,
      `Non-reciprocal: ${filters.showNonReciprocal ? 'ON' : 'OFF'}`
    );
  } else {
    filterLines.push(
      `Cut-off: ${filters.cutoff}%`,
      `Reciprocal: ${filters.showReciprocal ? 'ON' : 'OFF'}`,
      `Non-reciprocal: ${filters.showNonReciprocal ? 'ON' : 'OFF'}`
    );
  }

  const nodeCount = g.nodes.length;
  const linkCount = visibleLinks.length;

  // Group nodes by genome for readability and preserve row order
  const byGenome = new Map<string, NodeT[]>();
  for (const n of g.nodes) {
    if (!byGenome.has(n.genome_name)) byGenome.set(n.genome_name, []);
    byGenome.get(n.genome_name)!.push(n);
  }

  const nodeSections: string[] = [];
  for (const [genome, nodes] of [...byGenome.entries()].sort((a, b) => g.genomes.indexOf(a[0]) - g.genomes.indexOf(b[0]))) {
    nodeSections.push(`### Genome: ${genome}`);
    for (const n of nodes) {
      const domainCoords = extractDomainCoords(n);
      const incident = (linksByNode.get(n.id) || []).map(l => {
        const otherId = (l as any).source === n.id ? (l as any).target : (l as any).source;
        const other = nodeById.get(otherId);
        const otherLabel = other ? `${other.protein_name} (${other.genome_name})` : otherId;
        return `- ${otherLabel} — ${describeLink(l)}`;
      }).join('\n') || '- (no visible links under current filters)';

      const coordsLines = Object.entries(domainCoords).map(([dname, ranges]) => {
        const pretty = ranges.map(r => `(${r.start ?? 'N/A'}, ${r.end ?? 'N/A'})`).join(', ');
        return `- ${dname}: ${pretty}`;
      }).join('\n');

      nodeSections.push(
`**Protein:** ${n.protein_name}
- Node ID: \`${n.id}\`
- Gene/Domain type: ${n.gene_type ?? '—'}
- Present: ${n.is_present === false ? 'NO' : 'YES'}
- Direction: ${n.direction === 'plus' ? '+' : '-'}
- Relative position: ${n.rel_position}
${coordsLines ? `- Domain coordinates:\n${coordsLines}` : ''}

**Links:**  
${incident}
`
      );
    }
  }

  const linkRows = visibleLinks.map(l => {
    const s = nodeById.get((l as any).source);
    const t = nodeById.get((l as any).target);
    const sLabel = s ? `${s.protein_name} (${s.genome_name})` : (l as any).source;
    const tLabel = t ? `${t.protein_name} (${t.genome_name})` : (l as any).target;
    const desc = describeLink(l);
    return `| ${sLabel} | ${tLabel} | ${desc} |`;
  });

  const md =
`# Current Graph Report

- **Generated:** ${stamp}
- **Domain:** ${domainName}
- **Selected Genomes (order):** ${genomesOrdered}

## Active Filters
${filterLines.map(l => `- ${l}`).join('\n')}

## Summary
- **Visible nodes:** ${nodeCount}
- **Visible links:** ${linkCount}

## Nodes (In Current View)
${nodeSections.join('\n')}

## Links (In Current View)
| Source | Target | Details |
|---|---|---|
${linkRows.join('\n') || '| — | — | — |'}
`;

  return md;
}

export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
