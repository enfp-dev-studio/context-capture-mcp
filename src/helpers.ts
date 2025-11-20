/**
 * Helper functions for window management and matching
 */

import { Window } from "node-window-manager";

/**
 * Find window by title with flexible matching
 * Priority: Exact match > Starts with > Contains
 */
export function findWindowByTitle(searchTitle: string, windows: Window[]): Window | undefined {
  const search = searchTitle.toLowerCase().trim();

  // Empty string should not match anything
  if (search === '') return undefined;

  // Priority 1: Exact match
  let window = windows.find(w => w.getTitle().toLowerCase() === search);
  if (window) return window;

  // Priority 2: Starts with (more precise than contains)
  window = windows.find(w => w.getTitle().toLowerCase().startsWith(search));
  if (window) return window;

  // Priority 3: Contains (most flexible)
  window = windows.find(w => w.getTitle().toLowerCase().includes(search));
  return window;
}

/**
 * Get formatted list of available windows
 */
export function getAvailableWindowsList(windows: Window[]): string {
  const filtered = windows
    .filter(w => w.getTitle() && w.getTitle().trim() !== "")
    .slice(0, 20); // Limit to 20 windows to avoid overwhelming

  if (filtered.length === 0) {
    return "No windows currently available.";
  }

  return filtered
    .map((w, i) => `  ${i + 1}. "${w.getTitle()}"`)
    .join('\n');
}

/**
 * Find most likely target window based on priority patterns
 */
export function findMostLikelyTargetWindow(windows: Window[], priorities: string[]): Window | null {
  // Convert string patterns to RegExp (case-insensitive)
  const patterns = priorities.map(p => new RegExp(p, 'i'));

  for (const pattern of patterns) {
    const window = windows.find(w => pattern.test(w.getTitle()));
    if (window) return window;
  }

  return null;
}
