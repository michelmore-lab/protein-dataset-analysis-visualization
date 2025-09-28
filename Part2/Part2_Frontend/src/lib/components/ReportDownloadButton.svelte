<script lang="ts">
  import { get } from 'svelte/store';
  import { reportSnapshot } from '$lib/report/reportSnapshot';

  export let currentGraph: { genomes: string[] } | null = null;
  export let filters: {
    cutoff: number;
    showReciprocal: boolean;
    showNonReciprocal: boolean;
    showConsistent: boolean;
    showInconsistent: boolean;
    showPartiallyConsistent: boolean;
  };

  function fmtPct(v: number) {
    // Defensive: keep one decimal if needed
    return Number.isFinite(v) ? (Math.round(v * 10) / 10).toString() + '%' : '—';
    // but our scores are already integers most of the time
  }

  function normalizeId(id: string) {
    return id?.endsWith('__dup') ? id.slice(0, -'__dup'.length) : id;
  }

  function byGenome(nodes: any[], genomes: string[]) {
    const map = new Map<string, any[]>();
    genomes.forEach(g => map.set(g, []));
    nodes.forEach(n => {
      const g = n.genome_name;
      if (!map.has(g)) map.set(g, []);
      // keep a single entry per logical node id (dedupe dup copies)
      const arr = map.get(g)!;
      if (!arr.some(x => normalizeId(x.id) === normalizeId(n.id))) arr.push(n);
    });
    return map;
  }

  function linkDetail(l: any) {
    if ('score' in l) {
      return `${l.is_reciprocal ? 'Reciprocal' : 'Non-reciprocal'}, Similarity ${fmtPct(l.score)}`;
    }
    // ALL-domain compare link
    if (l.link_type === 'solid_red') return 'Inconsistent across domains';
    if (l.link_type === 'solid_color') return 'Consistent across domains';
    if (l.link_type === 'dotted_color') return 'Partially consistent';
    if (l.link_type === 'dotted_grey' || l.link_type === 'dotted_gray') return 'Non-reciprocal';
    return l.link_type ?? 'Unknown';
  }

  function safeName(nodesById: Map<string, any>, id: string) {
    const n = nodesById.get(normalizeId(id));
    return n ? `${n.protein_name} (${n.genome_name})` : id;
  }

  function buildMarkdown() {
    const snap = get(reportSnapshot);
    if (!snap) {
      alert('No graph is visible to report on yet.');
      return null;
    }

    // Prepare helpers
    const genomes = snap.genomes_order ?? [];
    const nodes = dedupeNodes(snap.nodes);
    const nodesById = new Map(nodes.map(n => [normalizeId(n.id), n]));
    const visibleLinks = dedupeLinks(snap.links);

    const lines: string[] = [];
    // Header (like your preferred sample)  ─────────────────────────
    lines.push(`# Current Graph Report`);
    lines.push('');
    lines.push(`- **Generated:** ${new Date(snap.generated_at).toISOString().slice(0,16).replace('T',' ')}`);
    if (snap.domain) lines.push(`- **Domain:** ${snap.domain}`);
    if (genomes.length) lines.push(`- **Selected Genomes (order):** ${genomes.join('  →  ')}`);
    lines.push('');
    lines.push(`## Active Filters`);
    lines.push(`- Cut-off: ${snap.filters.cutoff}%`);
    if (snap.domain === 'ALL') {
      lines.push(`- Consistent: ${snap.filters.showConsistent ? 'ON' : 'OFF'}`);
      lines.push(`- Inconsistent: ${snap.filters.showInconsistent ? 'ON' : 'OFF'}`);
      lines.push(`- Partially consistent: ${snap.filters.showPartiallyConsistent ? 'ON' : 'OFF'}`);
      lines.push(`- Non-reciprocal: ${snap.filters.showNonReciprocal ? 'ON' : 'OFF'}`);
    } else {
      lines.push(`- Reciprocal: ${snap.filters.showReciprocal ? 'ON' : 'OFF'}`);
      lines.push(`- Non-reciprocal: ${snap.filters.showNonReciprocal ? 'ON' : 'OFF'}`);
    }
    lines.push('');

    // Summary  ─────────────────────────────────────────────────────
    lines.push(`## Summary`);
    lines.push(`- **Visible nodes:** ${nodes.length}`);
    lines.push(`- **Visible links:** ${visibleLinks.length}`);
    lines.push('');

    // Per-genome sections  ─────────────────────────────────────────
    const grouped = byGenome(nodes, genomes);
    for (const g of genomes) {
      const list = grouped.get(g) ?? [];
      if (!list.length) continue;

      lines.push(`## Nodes (In Current View)`);
      lines.push(`### Genome: ${g}`);

      for (const n of list.sort((a,b) => a.rel_position - b.rel_position)) {
        lines.push(`**Protein:** ${n.protein_name}`);
        lines.push(`- Node ID: \`${normalizeId(n.id)}\``);
        lines.push(`- Gene/Domain type: ${n.gene_type ?? '—'}`);
        lines.push(`- Present: ${n.is_present === false ? 'NO' : 'YES'}`);
        lines.push(`- Direction: ${n.direction === 'plus' ? '+' : '-'}`);
        lines.push(`- Relative position: ${n.rel_position}`);
        lines.push('');
        // Node-local links (shown like the preferred sample)
        const local = visibleLinks.filter(l =>
          normalizeId(l.source) === normalizeId(n.id) || normalizeId(l.target) === normalizeId(n.id)
        );
        if (local.length) {
          lines.push(`**Links:**  `);
          // show as bulleted; other side’s label is “ProteinName (Genome)”
          for (const l of local) {
            const a = normalizeId(l.source);
            const b = normalizeId(l.target);
            const other = a === normalizeId(n.id) ? b : a;
            lines.push(`- ${safeName(nodesById, other)} — ${linkDetail(l)}`);
          }
          lines.push('');
        } else {
          lines.push(`**Links:**  `);
          lines.push(`- (no visible links under current filters)`);
          lines.push('');
        }
      }
    }

    // Final links table  ───────────────────────────────────────────
    lines.push('');
    lines.push(`## Links (In Current View)`);
    lines.push(`| Source | Target | Details |`);
    lines.push(`|---|---|---|`);
    for (const l of visibleLinks) {
      const src = safeName(nodesById, l.source);
      const tgt = safeName(nodesById, l.target);
      lines.push(`| ${src} | ${tgt} | ${linkDetail(l)} |`);
    }

    return lines.join('\n');
  }

  // De-dup helpers (avoid double entries when dup row exists)
  function dedupeNodes(nodes: any[]) {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const n of nodes) {
      const key = normalizeId(n.id);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...n, id: key });
    }
    return out;
    }

  function dedupeLinks(links: any[]) {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const l of links) {
      const a = normalizeId(l.source);
      const b = normalizeId(l.target);
      // undirected key for table + node sections
      const key = a < b ? `${a}|${b}|${'score' in l ? l.score : l.link_type}` : `${b}|${a}|${'score' in l ? l.score : l.link_type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...l, source: a, target: b });
    }
    return out;
  }

  function downloadReport() {
    const md = buildMarkdown();
    if (!md) return;

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0,16).replace(/[:T]/g,'-');
    a.href = url;
    a.download = `graph-report-${stamp}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
</script>

<button
  on:click={downloadReport}
  class="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors duration-200 cursor-pointer"
>
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
  Download Report
</button>
