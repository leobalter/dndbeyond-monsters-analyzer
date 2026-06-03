// Copyright 2026 Leo Balter
// SPDX-License-Identifier: Apache-2.0
// Unofficial tool; not affiliated with Wizards of the Coast or D&D Beyond. See NOTICE.
//
// Per-monster cache backed by chrome.storage.local.
// Keyed by canonical URL (origin + pathname) so query strings or fragments
// on the same monster don't fragment the cache.

const KEY_PREFIX = 'monster:';

function cacheKey(href) {
  try {
    const u = new URL(href);
    return KEY_PREFIX + u.origin + u.pathname;
  } catch {
    return KEY_PREFIX + href;
  }
}

export async function getCached(hrefs) {
  const keys = hrefs.map(cacheKey);
  const data = await chrome.storage.local.get(keys);
  const out = new Map();
  for (const href of hrefs) {
    const entry = data[cacheKey(href)];
    if (entry) out.set(href, entry);
  }
  return out;
}

export async function setCached(href, stats) {
  await chrome.storage.local.set({
    [cacheKey(href)]: { ...stats, fetchedAt: Date.now() },
  });
}

export async function clearCache() {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith(KEY_PREFIX));
  if (keys.length) await chrome.storage.local.remove(keys);
  return keys.length;
}

export async function cacheSize() {
  const all = await chrome.storage.local.get(null);
  return Object.keys(all).filter((k) => k.startsWith(KEY_PREFIX)).length;
}

// --- Scan history -----------------------------------------------------------
// A list of saved scans, each: { id, tabUrl, timestamp, campaign, monsters }.
// Stored under a single key, independent of the per-monster cache above (so
// "Clear cache" does not wipe history).

const SCANS_KEY = 'scanHistory';

function canonicalUrl(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return url || '';
  }
}

export async function getScans() {
  const { [SCANS_KEY]: scans } = await chrome.storage.local.get(SCANS_KEY);
  return Array.isArray(scans) ? scans : [];
}

// Upsert a scan by canonical page URL: re-scanning the same page updates the
// existing entry (monsters + timestamp) instead of creating a duplicate.
export async function saveScan({ tabUrl, timestamp, monsters, campaign }) {
  const scans = await getScans();
  const canon = canonicalUrl(tabUrl);
  const idx = scans.findIndex((s) => canonicalUrl(s.tabUrl) === canon);
  const prev = idx >= 0 ? scans[idx] : null;
  const entry = {
    id: prev ? prev.id : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tabUrl,
    timestamp: timestamp ?? Date.now(),
    campaign: ((campaign ?? prev?.campaign ?? '') || '').trim(),
    monsters,
  };
  if (prev) scans[idx] = entry;
  else scans.push(entry);
  await chrome.storage.local.set({ [SCANS_KEY]: scans });
  return entry;
}

export async function deleteScan(id) {
  const scans = await getScans();
  const next = scans.filter((s) => s.id !== id);
  await chrome.storage.local.set({ [SCANS_KEY]: next });
  return scans.length - next.length;
}

export async function setScanCampaign(id, campaign) {
  const scans = await getScans();
  const entry = scans.find((s) => s.id === id);
  if (!entry) return false;
  entry.campaign = (campaign || '').trim();
  await chrome.storage.local.set({ [SCANS_KEY]: scans });
  return true;
}

// Find an existing saved scan for a given page URL, if any.
export async function getScanForUrl(tabUrl) {
  const canon = canonicalUrl(tabUrl);
  const scans = await getScans();
  return scans.find((s) => canonicalUrl(s.tabUrl) === canon) || null;
}
