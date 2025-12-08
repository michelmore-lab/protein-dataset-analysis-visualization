<script lang="ts">
  import { get } from 'svelte/store';
  import { reportSnapshot } from '$lib/report/reportSnapshot';

  let open = false;

  // ----- helpers (same data model you already use) -----
  function normalizeId(id: string) {
    return id?.endsWith('__dup') ? id.slice(0, -'__dup'.length) : id;
  }

  function dedupeNodes(nodes: any[]) {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const n of nodes ?? []) {
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
    for (const l of links ?? []) {
      const a = normalizeId(l.source);
      const b = normalizeId(l.target);
      const bucket = 'score' in l ? `score:${l.score}` : `type:${l.link_type}`;
      const key = a < b ? `${a}|${b}|${bucket}` : `${b}|${a}|${bucket}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...l, source: a, target: b });
    }
    return out;
  }

  function fmtPct(v: number) {
    if (!Number.isFinite(v as any)) return '—';
    const n = Math.round((v as number) * 10) / 10;
    return `${n}%`;
  }

  function linkDetail(l: any) {
    if ('score' in l) {
      return `${l.is_reciprocal ? 'Reciprocal' : 'Non-reciprocal'}, Similarity ${fmtPct(l.score)}`;
    }
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

  function groupByGenome(nodes: any[], genomes: string[]) {
    const map = new Map<string, any[]>();
    genomes.forEach(g => map.set(g, []));
    nodes.forEach(n => {
      const g = n.genome_name;
      if (!map.has(g)) map.set(g, []);
      const arr = map.get(g)!;
      if (!arr.some(x => normalizeId(x.id) === normalizeId(n.id))) arr.push(n);
    });
    return map;
  }

  function getReportData() {
    const snap = get(reportSnapshot);
    if (!snap) {
      alert('No graph is visible to report on yet.');
      return null;
    }
    const genomes = snap.genomes_order ?? [];
    const nodes = dedupeNodes(snap.nodes ?? []);
    const nodesById = new Map(nodes.map(n => [normalizeId(n.id), n]));
    const links = dedupeLinks(snap.links ?? []);
    return { snap, genomes, nodes, nodesById, links };
  }

  // ----- builders for each format -----
  function buildMarkdown() {
    const data = getReportData();
    if (!data) return null;
    const { snap, genomes, nodes, nodesById, links } = data;

    const lines: string[] = [];
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
    if ((snap as any).focus_mode) lines.push(`- Focus mode: ON`);
    lines.push('');

    lines.push(`## Summary`);
    lines.push(`- **Visible nodes:** ${nodes.length}`);
    lines.push(`- **Visible links:** ${links.length}`);
    lines.push('');

    const grouped = groupByGenome(nodes, genomes);
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

        const local = links.filter(l =>
          normalizeId(l.source) === normalizeId(n.id) || normalizeId(l.target) === normalizeId(n.id)
        );
        lines.push(`**Links:**  `);
        if (local.length) {
          for (const l of local) {
            const a = normalizeId(l.source);
            const b = normalizeId(l.target);
            const other = a === normalizeId(n.id) ? b : a;
            lines.push(`- ${safeName(nodesById, other)} — ${linkDetail(l)}`);
          }
        } else {
          lines.push(`- (no visible links under current filters)`);
        }
        lines.push('');
      }
    }

    lines.push('');
    lines.push(`## Links (In Current View)`);
    lines.push(`| Source | Target | Details |`);
    lines.push(`|---|---|---|`);
    for (const l of links) {
      const src = safeName(nodesById, l.source);
      const tgt = safeName(nodesById, l.target);
      lines.push(`| ${src} | ${tgt} | ${linkDetail(l)} |`);
    }

    return lines.join('\n');
  }

  function buildTXT() {
    const data = getReportData();
    if (!data) return null;
    const { snap, genomes, nodes, nodesById, links } = data;

    const lines: string[] = [];
    lines.push(`Current Graph Report`);
    lines.push(`Generated: ${new Date(snap.generated_at).toISOString().slice(0,16).replace('T',' ')}`);
    if (snap.domain) lines.push(`Domain: ${snap.domain}`);
    if (genomes.length) lines.push(`Selected Genomes (order): ${genomes.join(' -> ')}`);
    if ((snap as any).focus_mode) lines.push(`Focus mode: ON`);
    lines.push('');

    lines.push(`Active Filters`);
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

    lines.push(`Summary`);
    lines.push(`- Visible nodes: ${nodes.length}`);
    lines.push(`- Visible links: ${links.length}`);
    lines.push('');

    const grouped = groupByGenome(nodes, genomes);
    for (const g of genomes) {
      const list = grouped.get(g) ?? [];
      if (!list.length) continue;
      lines.push(`Nodes (Genome: ${g})`);
      for (const n of list.sort((a,b) => a.rel_position - b.rel_position)) {
        lines.push(`Protein: ${n.protein_name}`);
        lines.push(`  Node ID: ${normalizeId(n.id)}`);
        lines.push(`  Gene/Domain type: ${n.gene_type ?? '—'}`);
        lines.push(`  Present: ${n.is_present === false ? 'NO' : 'YES'}`);
        lines.push(`  Direction: ${n.direction === 'plus' ? '+' : '-'}`);
        lines.push(`  Relative position: ${n.rel_position}`);
        const local = links.filter(l =>
          normalizeId(l.source) === normalizeId(n.id) || normalizeId(l.target) === normalizeId(n.id)
        );
        lines.push(`  Links:`);
        if (local.length) {
          for (const l of local) {
            const a = normalizeId(l.source);
            const b = normalizeId(l.target);
            const other = a === normalizeId(n.id) ? b : a;
            lines.push(`    - ${safeName(nodesById, other)} — ${linkDetail(l)}`);
          }
        } else {
          lines.push(`    - (no visible links under current filters)`);
        }
        lines.push('');
      }
    }

    lines.push(`Links (In Current View)`);
    for (const l of links) {
      lines.push(`- ${safeName(nodesById, l.source)}  <->  ${safeName(nodesById, l.target)}  |  ${linkDetail(l)}`);
    }

    return lines.join('\n');
  }

  function buildHTML() {
    const data = getReportData();
    if (!data) return null;
    const { snap, genomes, nodes, nodesById, links } = data;

    const esc = (s: string) => String(s)
      .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

    const sections: string[] = [];
    sections.push(`<h1>Current Graph Report</h1>`);
    sections.push(`<ul>`);
    sections.push(`<li><strong>Generated:</strong> ${esc(new Date(snap.generated_at).toISOString().slice(0,16).replace('T',' '))}</li>`);
    if (snap.domain) sections.push(`<li><strong>Domain:</strong> ${esc(snap.domain)}</li>`);
    if (genomes.length) sections.push(`<li><strong>Selected Genomes (order):</strong> ${esc(genomes.join(' → '))}</li>`);
    if ((snap as any).focus_mode) sections.push(`<li><strong>Focus mode:</strong> ON</li>`);
    sections.push(`</ul>`);

    sections.push(`<h2>Active Filters</h2>`);
    const af: string[] = [];
    af.push(`<li>Cut-off: ${esc(String(snap.filters.cutoff))}%</li>`);
    if (snap.domain === 'ALL') {
      af.push(`<li>Consistent: ${snap.filters.showConsistent ? 'ON' : 'OFF'}</li>`);
      af.push(`<li>Inconsistent: ${snap.filters.showInconsistent ? 'ON' : 'OFF'}</li>`);
      af.push(`<li>Partially consistent: ${snap.filters.showPartiallyConsistent ? 'ON' : 'OFF'}</li>`);
      af.push(`<li>Non-reciprocal: ${snap.filters.showNonReciprocal ? 'ON' : 'OFF'}</li>`);
    } else {
      af.push(`<li>Reciprocal: ${snap.filters.showReciprocal ? 'ON' : 'OFF'}</li>`);
      af.push(`<li>Non-reciprocal: ${snap.filters.showNonReciprocal ? 'ON' : 'OFF'}</li>`);
    }
    sections.push(`<ul>${af.join('')}</ul>`);

    sections.push(`<h2>Summary</h2>`);
    sections.push(`<ul>`);
    sections.push(`<li><strong>Visible nodes:</strong> ${nodes.length}</li>`);
    sections.push(`<li><strong>Visible links:</strong> ${links.length}</li>`);
    sections.push(`</ul>`);

    const grouped = groupByGenome(nodes, genomes);
    for (const g of genomes) {
      const list = grouped.get(g) ?? [];
      if (!list.length) continue;

      sections.push(`<h2>Nodes (In Current View)</h2>`);
      sections.push(`<h3>Genome: ${esc(g)}</h3>`);

      for (const n of list.sort((a,b) => a.rel_position - b.rel_position)) {
        const nodeRows: string[] = [];
        nodeRows.push(`<tr><td><strong>Protein</strong></td><td>${esc(n.protein_name)}</td></tr>`);
        nodeRows.push(`<tr><td>Node ID</td><td><code>${esc(normalizeId(n.id))}</code></td></tr>`);
        nodeRows.push(`<tr><td>Gene/Domain type</td><td>${esc(n.gene_type ?? '—')}</td></tr>`);
        nodeRows.push(`<tr><td>Present</td><td>${n.is_present === false ? 'NO' : 'YES'}</td></tr>`);
        nodeRows.push(`<tr><td>Direction</td><td>${n.direction === 'plus' ? '+' : '-'}</td></tr>`);
        nodeRows.push(`<tr><td>Relative position</td><td>${n.rel_position}</td></tr>`);

        const local = links.filter(l =>
          normalizeId(l.source) === normalizeId(n.id) || normalizeId(l.target) === normalizeId(n.id)
        );
        const linkLis = local.length
          ? local.map(l => {
              const a = normalizeId(l.source);
              const b = normalizeId(l.target);
              const other = a === normalizeId(n.id) ? b : a;
              return `<li>${esc(safeName(nodesById, other))} — ${esc(linkDetail(l))}</li>`;
            }).join('')
          : `<li>(no visible links under current filters)</li>`;

        sections.push(`
          <table class="node"><tbody>${nodeRows.join('')}</tbody></table>
          <div class="links"><strong>Links:</strong><ul>${linkLis}</ul></div>
        `);
      }
    }

    const linkRows = links.map(l =>
      `<tr><td>${esc(safeName(nodesById, l.source))}</td><td>${esc(safeName(nodesById, l.target))}</td><td>${esc(linkDetail(l))}</td></tr>`
    ).join('');

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>Graph Report</title>
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; line-height: 1.45; padding: 24px; color: #0f172a; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  h2 { font-size: 18px; margin: 20px 0 8px; }
  h3 { font-size: 15px; margin: 14px 0 6px; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0 14px; }
  table.node td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  table.links, .links ul { margin-top: 6px; }
  table.links th, table.links td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
  code { background: #f1f5f9; padding: 1px 4px; border-radius: 4px; }
  ul { margin: 6px 0 10px 18px; }
</style>
</head>
<body>
  ${sections.join('\n')}
  <h2>Links (In Current View)</h2>
  <table class="links">
    <thead><tr><th>Source</th><th>Target</th><th>Details</th></tr></thead>
    <tbody>${linkRows}</tbody>
  </table>
</body>
</html>`;
    return html;
  }

  function buildJSON() {
    const data = getReportData();
    if (!data) return null;
    const { snap, genomes, nodes, links } = data;
    const payload = {
      meta: {
        generated_at: snap.generated_at,
        domain: snap.domain ?? null,
        genomes_order: genomes,
        focus_mode: !!(snap as any).focus_mode,
        filters: snap.filters
      },
      nodes,
      links
    };
    return JSON.stringify(payload, null, 2);
  }

  // ----- download plumbing -----
  function download(base: string, ext: string, content: string, mime: string) {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0,16).replace(/[:T]/g,'-');
    a.href = url;
    a.download = `${base}-${stamp}${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function onChoose(kind: 'md' | 'html' | 'txt' | 'json') {
    let data: string | null = null;
    let mime = 'text/plain';
    let ext = '.txt';

    if (kind === 'md') { data = buildMarkdown(); mime = 'text/markdown'; ext = '.md'; }
    else if (kind === 'html') { data = buildHTML(); mime = 'text/html'; ext = '.html'; }
    else if (kind === 'json') { data = buildJSON(); mime = 'application/json'; ext = '.json'; }
    else { data = buildTXT(); mime = 'text/plain'; ext = '.txt'; }

    if (data) download('graph-report', ext, data, mime);
    open = false;
  }

  function toggleMenu() { open = !open; }
  function closeOnEscape(e: KeyboardEvent) { if (e.key === 'Escape') open = false; }
</script>

<div class="relative inline-block">
  <button
    on:click={toggleMenu}
    on:keydown={closeOnEscape}
    aria-haspopup="true"
    aria-expanded={open}
    class="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors duration-200 cursor-pointer"
  >
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
    Download Report
    <svg xmlns="http://www.w3.org/2000/svg" class="ml-2" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  </button>

  {#if open}
    <div
      class="menu"
      role="menu"
      aria-label="Download format"
      on:keydown={closeOnEscape}
    >
      <button role="menuitem" on:click={() => onChoose('md')}>Markdown (.md)</button>
      <button role="menuitem" on:click={() => onChoose('html')}>HTML (.html)</button>
      <button role="menuitem" on:click={() => onChoose('txt')}>Plain Text (.txt)</button>
      <button role="menuitem" on:click={() => onChoose('json')}>JSON (.json)</button>
    </div>
  {/if}
</div>

<style>
  .menu {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 6px;
    min-width: 180px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    box-shadow: 0 6px 16px rgba(2,6,23,0.15);
    padding: 6px;
    z-index: 20;
  }
  .menu button {
    display: block;
    width: 100%;
    text-align: left;
    padding: 8px 10px;
    font-size: 14px;
    border: 0;
    background: transparent;
    border-radius: 6px;
    cursor: pointer;
  }
  .menu button:hover {
    background: #f1f5f9;
  }
</style>
