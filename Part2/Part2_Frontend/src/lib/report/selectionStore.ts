// src/lib/report/selectionStore.ts
import { writable } from 'svelte/store';

export type SelectionState = {
  isFocused: boolean;
  nodes: string[]; // selected node ids (may contain dup ids)
  links: string[]; // `${source}-${target}` (may contain dup ids)
};

export const selectionState = writable<SelectionState>({
  isFocused: false,
  nodes: [],
  links: []
});
