// Copyright 2026 Leo Balter
// SPDX-License-Identifier: Apache-2.0
// Unofficial tool; not affiliated with Wizards of the Coast or D&D Beyond. See NOTICE.
//
// Injected into the active D&D Beyond tab via chrome.scripting.executeScript.
// Must be a self-contained function with no external references.
export function scanMonsterTooltips() {
  const nodes = document.querySelectorAll('a.monster-tooltip, .monster-tooltip');
  const map = new Map();
  for (const el of nodes) {
    const href = el.href;
    if (!href) continue;
    const name = (el.textContent || '').trim();
    if (!name) continue;
    const key = href;
    const entry = map.get(key) || { name, href, count: 0 };
    entry.count += 1;
    map.set(key, entry);
  }
  return Array.from(map.values()).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
}
