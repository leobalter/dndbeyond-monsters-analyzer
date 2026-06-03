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
