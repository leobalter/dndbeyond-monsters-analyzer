// Copyright 2026 Leo Balter
// SPDX-License-Identifier: Apache-2.0
// Unofficial tool; not affiliated with Wizards of the Coast or D&D Beyond. See NOTICE.

import { scanMonsterTooltips } from './scanner.js';
import { parseMonsterHtml } from './parser.js';
import { getCached, setCached, clearCache, cacheSize, saveScan, getScanForUrl } from './storage.js';
import { suggestCampaign } from './analytics.js';

const FETCH_CONCURRENCY = 2;

const statusEl = document.getElementById('status');
const tableEl = document.getElementById('results');
const tbodyEl = tableEl.querySelector('tbody');
const scanBtn = document.getElementById('scan');
const statsBtn = document.getElementById('stats');
const copyBtn = document.getElementById('copy');
const clearBtn = document.getElementById('clear');
const campaignEl = document.getElementById('campaign');

let lastResults = [];

cacheSize().then((n) => {
  if (n > 0) setStatus(`${n} monster${n === 1 ? '' : 's'} in cache. Open a D&D Beyond page and click "Scan page".`);
});

// Pre-fill the campaign field: reuse a saved campaign for this page if one
// exists, otherwise suggest one parsed from the URL.
(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;
    const existing = await getScanForUrl(tab.url);
    campaignEl.value = existing?.campaign || suggestCampaign(tab.url);
  } catch {
    /* non-fatal */
  }
})();

scanBtn.addEventListener('click', () => {
  run().catch((err) => setStatus(err.message || String(err), true));
});

copyBtn.addEventListener('click', async () => {
  if (!lastResults.length) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(lastResults, null, 2));
    setStatus(`Copied ${lastResults.length} monster${lastResults.length === 1 ? '' : 's'} as JSON.`);
  } catch (err) {
    setStatus(`Copy failed: ${err.message}`, true);
  }
});

clearBtn.addEventListener('click', async () => {
  const removed = await clearCache();
  setStatus(`Cleared ${removed} cached monster${removed === 1 ? '' : 's'}.`);
});

statsBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/stats.html') });
});

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', Boolean(isError));
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function renderRow(entry, index) {
  const tr = document.createElement('tr');
  tr.dataset.href = entry.href;
  tr.innerHTML = `
    <td class="count">${entry.count}</td>
    <td class="name"><a href="${escapeHtml(entry.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(entry.name)}</a></td>
    <td data-field="challenge" class="cell-loading">…</td>
    <td data-field="meta" class="cell-loading">…</td>
    <td data-field="damageResistances" class="cell-loading">…</td>
    <td data-field="damageImmunities" class="cell-loading">…</td>
    <td data-field="damageVulnerabilities" class="cell-loading">…</td>
    <td data-field="conditionImmunities" class="cell-loading">…</td>
  `;
  return tr;
}

function fillRow(tr, stats) {
  for (const td of tr.querySelectorAll('td[data-field]')) {
    const field = td.dataset.field;
    const value = stats?.[field];
    td.classList.remove('cell-loading');
    if (value) {
      td.textContent = value;
      td.classList.remove('cell-empty');
    } else {
      td.textContent = '—';
      td.classList.add('cell-empty');
    }
  }
}

function markRowError(tr, message) {
  for (const td of tr.querySelectorAll('td[data-field]')) {
    td.classList.remove('cell-loading');
    td.classList.add('cell-error');
    td.textContent = '!';
    td.title = message;
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('No active tab.');
  return tab;
}

async function scanActiveTab(tabId) {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func: scanMonsterTooltips,
  });
  return injection?.result ?? [];
}

async function fetchMonster(href) {
  const res = await fetch(href, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return parseMonsterHtml(html);
}

async function runPool(items, limit, worker) {
  const queue = items.slice();
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      await worker(item);
    }
  });
  await Promise.all(runners);
}

// Persist the scan both as the "current" snapshot (for the default Stats view)
// and into the campaign-grouped history.
async function persistScan(monsters, tab) {
  const snapshot = { monsters, tabUrl: tab.url, timestamp: Date.now() };
  await chrome.storage.local.set({ lastScan: snapshot });
  await saveScan({ ...snapshot, campaign: campaignEl.value });
}

async function run() {
  scanBtn.disabled = true;
  copyBtn.disabled = true;
  tableEl.hidden = true;
  tbodyEl.innerHTML = '';
  lastResults = [];

  setStatus('Scanning page…');

  let tab;
  try {
    tab = await getActiveTab();
  } catch (err) {
    scanBtn.disabled = false;
    throw err;
  }

  if (!/^https?:\/\/[^/]*\.?dndbeyond\.com\//.test(tab.url || '')) {
    scanBtn.disabled = false;
    setStatus('This tab is not on dndbeyond.com.', true);
    return;
  }

  let monsters;
  try {
    monsters = await scanActiveTab(tab.id);
  } catch (err) {
    scanBtn.disabled = false;
    throw new Error(`Failed to scan page: ${err.message}`);
  }

  if (!monsters.length) {
    scanBtn.disabled = false;
    setStatus('No `.monster-tooltip` links found on this page.');
    return;
  }

  // Look up cached entries up front and pre-fill their rows; only uncached URLs hit the network.
  const cached = await getCached(monsters.map((m) => m.href));

  const rows = new Map();
  for (const m of monsters) {
    const tr = renderRow(m);
    tbodyEl.appendChild(tr);
    rows.set(m.href, tr);

    const hit = cached.get(m.href);
    if (hit) {
      Object.assign(m, hit);
      fillRow(tr, hit);
    }
  }
  tableEl.hidden = false;

  const toFetch = monsters.filter((m) => !cached.has(m.href));
  const cachedCount = monsters.length - toFetch.length;

  if (!toFetch.length) {
    lastResults = monsters;
    copyBtn.disabled = false;
    scanBtn.disabled = false;
    await persistScan(monsters, tab);
    setStatus(`Done. ${monsters.length} unique monster${monsters.length === 1 ? '' : 's'} (all from cache).`);
    return;
  }

  let done = 0;
  const updateStatus = () => {
    const prefix = cachedCount ? `${cachedCount} from cache. ` : '';
    setStatus(`${prefix}Fetching ${done} / ${toFetch.length}…`);
  };
  updateStatus();

  await runPool(toFetch, FETCH_CONCURRENCY, async (entry) => {
    const tr = rows.get(entry.href);
    try {
      const stats = await fetchMonster(entry.href);
      Object.assign(entry, stats);
      fillRow(tr, stats);
      await setCached(entry.href, stats);
    } catch (err) {
      entry.error = err.message;
      markRowError(tr, err.message);
    } finally {
      done += 1;
      updateStatus();
    }
  });

  lastResults = monsters;
  copyBtn.disabled = false;
  scanBtn.disabled = false;

  await persistScan(monsters, tab);

  const failed = monsters.filter((m) => m.error).length;
  const cachedSuffix = cachedCount ? ` (${cachedCount} from cache)` : '';
  if (failed) {
    setStatus(`Done. ${monsters.length - failed} parsed, ${failed} failed${cachedSuffix}.`, true);
  } else {
    setStatus(`Done. ${monsters.length} unique monster${monsters.length === 1 ? '' : 's'}${cachedSuffix}.`);
  }
}
