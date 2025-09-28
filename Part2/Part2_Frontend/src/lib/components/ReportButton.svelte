<script lang="ts">
  import { buildReportMarkdown, downloadText, type GraphT, type FiltersT } from '$lib/report/buildReport';
  import { selectionState } from '$lib/report/selectionStore';

  export let currentGraph: GraphT;
  export let filters: FiltersT;

  let selection = { isFocused: false, nodes: [], links: [] };
  const unsub = selectionState.subscribe(v => (selection = v));

  function downloadReport() {
    if (!currentGraph || !currentGraph.nodes?.length) return;
    const md = buildReportMarkdown(currentGraph, filters, { isFocused: selection.isFocused, nodes: selection.nodes });
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const fname = `graph-report-${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.md`;
    downloadText(fname, md);
  }

  // (optional) clean up if this component is ever destroyed
  import { onDestroy } from 'svelte';
  onDestroy(() => unsub());
</script>

<button
  on:click={downloadReport}
  disabled={!currentGraph?.nodes?.length}
  class="inline-flex items-center px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
  title={currentGraph?.nodes?.length ? 'Download a report of the current view' : 'Select genomes to view the graph first'}
>
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2">
    <path d="M12 5v14M5 12h14"/>
  </svg>
  Download Report
</button>
