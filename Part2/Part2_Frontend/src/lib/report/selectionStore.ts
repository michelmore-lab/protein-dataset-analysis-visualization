// src/lib/report/selectionStore.ts
import { writable } from 'svelte/store';

export type SelectionState = {
  isFocused: boolean;
  nodes: string[]; // selected node ids (original or dup ids)
  links: string[]; // `${source}-${target}`
};

export const selectionState = writable<SelectionState>({
  isFocused: false,
  nodes: [],
  links: []
});
