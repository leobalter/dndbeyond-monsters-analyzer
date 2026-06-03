// Copyright 2026 Leo Balter
// SPDX-License-Identifier: Apache-2.0
// Unofficial tool; not affiliated with Wizards of the Coast or D&D Beyond. See NOTICE.

import { summarize, parseChallenge, formatChallenge, parseHitPoints, parseArmorClass, parseMeta, mergeMonsters } from './analytics.js';
import { getScans, deleteScan, setScanCampaign } from './storage.js';

const emptyEl = document.getElementById('empty');
const contentEl = document.getElementById('content');
const sourceEl = document.getElementById('source');

let currentExport = null;

function fmtNum(n, digits = 1) {
  if (n == null || Number.isNaN(n)) return '—';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(digits);
}

function renderOverview(snap, sum) {
  const dl = document.getElementById('overview-list');
  const when = snap.timestamp ? new Date(snap.timestamp).toLocaleString() : '—';
  const rows = [
    ['Source page', snap.tabUrl ? `<a href="${escapeHtml(snap.tabUrl)}" target="_blank" rel="noopener">${escapeHtml(snap.tabUrl)}</a>` : '—'],
    ['Scanned at', when],
    ['Unique monsters', sum.uniqueCount],
    ['Total references on page', sum.totalReferences],
  ];
  dl.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

function renderNumeric(elId, stats, unit = '') {
  const el = document.getElementById(elId);
  if (!stats || stats.coverage === 0) {
    el.innerHTML = `<dd class="coverage">No data (0 / ${stats?.total ?? 0} monsters).</dd>`;
    return;
  }
  const u = stats.unique;
  const w = stats.weighted;
  const fmt = (s, key) => fmtNum(s?.[key]);
  el.innerHTML = `
    <dt>Mean (per unique)</dt><dd>${fmt(u, 'mean')}${unit}</dd>
    <dt>Median (per unique)</dt><dd>${fmt(u, 'median')}${unit}</dd>
    <dt>Min / Max</dt><dd>${fmt(u, 'min')} / ${fmt(u, 'max')}${unit}</dd>
    <dt>Mean (weighted)</dt><dd>${fmt(w, 'mean')}${unit}</dd>
    <dt>Median (weighted)</dt><dd>${fmt(w, 'median')}${unit}</dd>
    <dd class="coverage">Based on ${stats.coverage} / ${stats.total} monsters.</dd>
  `;
}

function renderTally(elId, rows) {
  const el = document.getElementById(elId);
  if (!rows.length) {
    el.innerHTML = '<div class="muted">None.</div>';
    return;
  }
  const max = rows.reduce((m, r) => Math.max(m, r.weighted), 0) || 1;
  el.innerHTML = rows.map((r) => {
    const pct = Math.round((r.weighted / max) * 100);
    return `
      <details class="row">
        <summary>
          <span class="arrow"></span>
          <div class="label" style="--w:${pct}%"><span class="bar"></span><span class="text">${escapeHtml(r.key)}</span></div>
          <div class="num"><strong>${r.unique}</strong> monsters · ${r.weighted} refs</div>
        </summary>
        ${renderMonsterList(r.monsters)}
      </details>
    `;
  }).join('');
}

function renderMonsterList(list) {
  if (!list?.length) return '<div class="monsters-empty muted">No contributing monsters.</div>';
  return `<ul class="monsters">${list.map((m) => `
    <li>
      <a href="${escapeHtml(m.href)}" target="_blank" rel="noopener">${escapeHtml(m.name)}</a>
      <span class="muted">×${m.count}</span>
    </li>
  `).join('')}</ul>`;
}

function renderDamageOutput(rows, coverage) {
  const el = document.getElementById('damage-output');
  document.getElementById('damage-output-coverage').textContent =
    `Based on ${coverage.with} / ${coverage.total} monsters with parsed action damage.`;
  if (!rows.length) {
    el.innerHTML = '<div class="muted">No damage rolls extracted.</div>';
    return;
  }
  const max = rows.reduce((m, r) => Math.max(m, r.totalAvg), 0) || 1;
  el.innerHTML = rows.map((r) => {
    const pct = Math.round((r.totalAvg / max) * 100);
    return `
      <details class="row">
        <summary>
          <span class="arrow"></span>
          <div class="label" style="--w:${pct}%"><span class="bar"></span><span class="text">${escapeHtml(r.key)}</span></div>
          <div class="num">
            <strong>${Math.round(r.totalAvg)}</strong> avg dmg ·
            <strong>${r.unique}</strong> monsters · ${r.instances} rolls
          </div>
        </summary>
        <ul class="monsters">${r.monsters.map((m) => `
          <li>
            <a href="${escapeHtml(m.href)}" target="_blank" rel="noopener">${escapeHtml(m.name)}</a>
            <span class="muted">×${m.count} · ${m.avg} avg over ${m.instances} roll${m.instances === 1 ? '' : 's'} = ${m.avg * m.count} weighted</span>
          </li>
        `).join('')}</ul>
      </details>
    `;
  }).join('');
}

function renderDamageGroups(rows) {
  const el = document.getElementById('damage-groups');
  if (!rows.length) {
    el.innerHTML = '<div class="muted">No damage rolls extracted.</div>';
    return;
  }
  const max = rows.reduce((m, r) => Math.max(m, r.totalAvg), 0) || 1;
  el.innerHTML = rows.map((r) => {
    const pct = Math.round((r.totalAvg / max) * 100);
    return `
      <details class="row">
        <summary>
          <span class="arrow"></span>
          <div class="label" style="--w:${pct}%"><span class="bar"></span><span class="text">${escapeHtml(r.key)}</span></div>
          <div class="num">
            <strong>${Math.round(r.totalAvg)}</strong> avg dmg ·
            <strong>${r.unique}</strong> monsters · ${r.instances} rolls
          </div>
        </summary>
        <ul class="monsters">${r.monsters.map((m) => `
          <li>
            <a href="${escapeHtml(m.href)}" target="_blank" rel="noopener">${escapeHtml(m.name)}</a>
            <span class="muted">×${m.count} · ${m.avg} avg over ${m.instances} roll${m.instances === 1 ? '' : 's'} = ${m.avg * m.count} weighted</span>
          </li>
        `).join('')}</ul>
      </details>
    `;
  }).join('');
}

function renderDamageProfiles(rows, coverage) {
  document.getElementById('damage-profiles-coverage').textContent =
    `Based on ${coverage.with} / ${coverage.total} monsters with parsed action damage.`;
  renderTally('damage-profiles', rows);
}

function renderRecommendations(rec) {
  document.getElementById('recommend-coverage').textContent =
    `Offense from ${rec.coverage.defenses} / ${rec.coverage.total} monsters that list resistances/immunities/vulnerabilities · `
    + `defense from ${rec.coverage.output} / ${rec.coverage.total} with parsed action damage.`;

  const use = rec.offense.filter((o) => o.score > 0);
  const avoid = rec.offense.filter((o) => o.score < 0).sort((a, b) => a.score - b.score);
  renderOffense('recommend-use', use, 'use');
  renderOffense('recommend-avoid', avoid, 'avoid');

  const taken = rec.defense.filter((d) => d.totalAvg > 0);
  const skip = rec.defense.filter((d) => d.totalAvg === 0);
  renderResist('recommend-resist', taken, 'resist');
  renderResist('recommend-skip', skip, 'skip');
}

function renderOffense(elId, rows, kind) {
  const el = document.getElementById(elId);
  if (!rows.length) {
    el.innerHTML = `<div class="muted">${kind === 'use'
      ? 'No clearly favorable types — no exploitable vulnerabilities in this set.'
      : 'No commonly resisted or immune damage types in this set.'}</div>`;
    return;
  }
  const max = rows.reduce((m, r) => Math.max(m, Math.abs(r.score)), 0) || 1;
  el.innerHTML = rows.map((r) => {
    const pct = Math.round((Math.abs(r.score) / max) * 100);
    const parts = [];
    if (r.vulnerable.weighted) parts.push(`${r.vulnerable.weighted} vuln`);
    if (r.resistant.weighted) parts.push(`${r.resistant.weighted} resist`);
    if (r.immune.weighted) parts.push(`${r.immune.weighted} immune`);
    const detail = parts.join(' · ') || 'no interactions';
    const monsters = [
      ...r.vulnerable.monsters.map((m) => ({ ...m, tag: 'vulnerable' })),
      ...r.immune.monsters.map((m) => ({ ...m, tag: 'immune' })),
      ...r.resistant.monsters.map((m) => ({ ...m, tag: 'resistant' })),
    ];
    return `
      <details class="row">
        <summary>
          <span class="arrow"></span>
          <div class="label" style="--w:${pct}%"><span class="bar"></span><span class="text">${escapeHtml(r.key)}</span></div>
          <div class="num"><strong>${r.score > 0 ? '+' : ''}${r.score}</strong> · ${detail}</div>
        </summary>
        ${monsters.length ? `<ul class="monsters">${monsters.map((m) => `
          <li>
            <a href="${escapeHtml(m.href)}" target="_blank" rel="noopener">${escapeHtml(m.name)}</a>
            <span class="muted">×${m.count} · ${m.tag}</span>
          </li>
        `).join('')}</ul>` : '<div class="monsters-empty muted">No contributing monsters.</div>'}
      </details>
    `;
  }).join('');
}

function renderResist(elId, rows, kind) {
  const el = document.getElementById(elId);
  if (!rows.length) {
    el.innerHTML = `<div class="muted">${kind === 'skip'
      ? 'Every standard damage type shows up in this set.'
      : 'No parsed action damage to rank.'}</div>`;
    return;
  }
  const max = rows.reduce((m, r) => Math.max(m, r.totalAvg), 0) || 1;
  el.innerHTML = rows.map((r) => {
    const pct = r.totalAvg > 0 ? Math.round((r.totalAvg / max) * 100) : 0;
    const detail = r.totalAvg > 0
      ? `<strong>${Math.round(r.totalAvg)}</strong> avg dmg · ${r.unique} monsters · ${r.instances} rolls`
      : 'never dealt in this set';
    return `
      <details class="row"${r.totalAvg > 0 ? '' : ' open'}>
        <summary>
          <span class="arrow"></span>
          <div class="label" style="--w:${pct}%"><span class="bar"></span><span class="text">${escapeHtml(r.key)}</span></div>
          <div class="num">${detail}</div>
        </summary>
        ${r.monsters.length ? `<ul class="monsters">${r.monsters.map((m) => `
          <li>
            <a href="${escapeHtml(m.href)}" target="_blank" rel="noopener">${escapeHtml(m.name)}</a>
            <span class="muted">×${m.count} · ${m.avg} avg over ${m.instances} roll${m.instances === 1 ? '' : 's'}</span>
          </li>
        `).join('')}</ul>` : '<div class="monsters-empty muted">No contributing monsters.</div>'}
      </details>
    `;
  }).join('');
}

function renderMonstersTable(monsters) {
  document.getElementById('monsters-count').textContent = monsters.length;
  const tbody = document.querySelector('#monsters-table tbody');
  tbody.innerHTML = monsters.map((m) => {
    const cr = parseChallenge(m.challenge);
    const meta = parseMeta(m.meta);
    return `
      <tr>
        <td class="num">${m.count}</td>
        <td><a href="${escapeHtml(m.href)}" target="_blank" rel="noopener">${escapeHtml(m.name)}</a></td>
        <td class="num">${cr != null ? formatChallenge(cr) : '—'}</td>
        <td class="num">${parseHitPoints(m.hitPoints) ?? '—'}</td>
        <td class="num">${parseArmorClass(m.armorClass) ?? '—'}</td>
        <td>${escapeHtml(meta.type || '')}</td>
        <td>${escapeHtml(meta.size || '')}</td>
      </tr>
    `;
  }).join('');
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function buildExport(view, sum) {
  return {
    view: view.title ?? null,
    campaign: view.campaign ?? null,
    tabUrl: view.tabUrl ?? null,
    timestamp: view.timestamp ?? null,
    sources: view.sources ?? undefined,
    summary: sum,
    monsters: view.monsters,
  };
}

function exportFilename(view) {
  const d = new Date(view.timestamp || Date.now());
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  const slug = (view.campaign || view.title || 'scan')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'scan';
  return `monsters-analyzer-${slug}-${stamp}.json`;
}

function setupExport() {
  const downloadBtn = document.getElementById('download-json');
  const copyBtn = document.getElementById('copy-json');
  const statusEl = document.getElementById('export-status');

  downloadBtn.addEventListener('click', () => {
    if (!currentExport) return;
    const json = JSON.stringify(currentExport.payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentExport.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    statusEl.textContent = `Downloaded ${currentExport.filename}`;
  });

  copyBtn.addEventListener('click', async () => {
    if (!currentExport) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(currentExport.payload, null, 2));
      const n = currentExport.payload.monsters.length;
      statusEl.textContent = `Copied ${n} monster${n === 1 ? '' : 's'} + summary as JSON.`;
    } catch (err) {
      statusEl.textContent = `Copy failed: ${err.message}`;
    }
  });
}

// Render a "view" — either a single saved scan or a merged campaign — into the
// stats sections. `view` = { title, campaign?, tabUrl?, timestamp?, monsters,
// sources? }.
function renderView(view) {
  const monsters = view.monsters;
  const sum = summarize(monsters);

  currentExport = {
    payload: buildExport(view, sum),
    filename: exportFilename(view),
  };

  const titleEl = document.getElementById('view-title');
  titleEl.innerHTML = `Showing: <strong>${escapeHtml(view.title)}</strong>`;
  document.getElementById('export-bar').hidden = false;
  contentEl.hidden = false;

  renderOverview({ tabUrl: view.tabUrl, timestamp: view.timestamp }, sum);
  renderNumeric('hp', sum.hp);
  renderNumeric('ac', sum.ac);
  renderNumeric('cr', sum.cr);
  renderTally('cr-dist', sum.crDistribution);
  renderTally('types', sum.types);
  renderTally('sizes', sum.sizes);
  renderTally('dmg-immunities', sum.damageImmunities);
  renderTally('dmg-resistances', sum.damageResistances);
  renderTally('dmg-vulnerabilities', sum.damageVulnerabilities);
  renderTally('cond-immunities', sum.conditionImmunities);
  renderDamageOutput(sum.damageOutput, sum.damageOutputCoverage);
  renderDamageGroups(sum.damageGroups);
  renderDamageProfiles(sum.damageProfiles, sum.damageOutputCoverage);
  renderRecommendations(sum.recommendations);
  renderMonstersTable(monsters);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

const GROUP_UNCATEGORIZED = 'Uncategorized';

function fmtWhen(ts) {
  return ts ? new Date(ts).toLocaleString() : '—';
}

function groupByCampaign(scans) {
  const groups = new Map();
  for (const s of scans) {
    const key = (s.campaign || '').trim() || GROUP_UNCATEGORIZED;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

let allScans = [];

async function refreshDashboard() {
  allScans = await getScans();
  const dashboard = document.getElementById('dashboard');
  const groupsEl = document.getElementById('scan-groups');
  const emptyHint = document.getElementById('dashboard-empty');

  dashboard.hidden = false;
  groupsEl.innerHTML = '';

  if (!allScans.length) {
    emptyHint.hidden = false;
    return;
  }
  emptyHint.hidden = true;

  for (const [campaign, scans] of groupByCampaign(allScans)) {
    const totalMonsters = mergeMonsters(scans.map((s) => s.monsters)).length;
    const group = document.createElement('details');
    group.className = 'campaign-group';
    group.open = true;

    const summaryHtml = `
      <summary>
        <span class="campaign-name">${escapeHtml(campaign)}</span>
        <span class="campaign-count">${scans.length} scan${scans.length === 1 ? '' : 's'} · ${totalMonsters} unique monster${totalMonsters === 1 ? '' : 's'}</span>
        <button type="button" class="btn small" data-merge="${escapeHtml(campaign)}">Merge &amp; view</button>
      </summary>`;

    const items = scans.map((s) => {
      const count = s.monsters?.length ?? 0;
      const src = s.tabUrl
        ? `<a href="${escapeHtml(s.tabUrl)}" target="_blank" rel="noopener">${escapeHtml(s.tabUrl)}</a>`
        : '—';
      return `
        <li class="scan-item" data-id="${escapeHtml(s.id)}">
          <span class="scan-meta">
            <span class="scan-when">${escapeHtml(fmtWhen(s.timestamp))} · ${count} monster${count === 1 ? '' : 's'}</span>
            <span class="scan-src">${src}</span>
          </span>
          <span class="scan-actions">
            <button type="button" class="btn small" data-view="${escapeHtml(s.id)}">View</button>
            <button type="button" class="btn small" data-campaign="${escapeHtml(s.id)}">Campaign…</button>
            <button type="button" class="btn small" data-delete="${escapeHtml(s.id)}">Delete</button>
          </span>
        </li>`;
    }).join('');

    group.innerHTML = `${summaryHtml}<ul class="scan-list">${items}</ul>`;
    groupsEl.appendChild(group);
  }
}

function viewScan(id) {
  const scan = allScans.find((s) => s.id === id);
  if (!scan) return;
  renderView({
    title: `${scan.campaign ? `${scan.campaign} — ` : ''}${fmtWhen(scan.timestamp)}`,
    campaign: scan.campaign || null,
    tabUrl: scan.tabUrl,
    timestamp: scan.timestamp,
    monsters: scan.monsters,
  });
}

function viewCampaign(campaign) {
  const scans = allScans.filter(
    (s) => ((s.campaign || '').trim() || GROUP_UNCATEGORIZED) === campaign,
  );
  if (!scans.length) return;
  const monsters = mergeMonsters(scans.map((s) => s.monsters));
  renderView({
    title: `${campaign} (merged: ${scans.length} scan${scans.length === 1 ? '' : 's'})`,
    campaign: campaign === GROUP_UNCATEGORIZED ? null : campaign,
    timestamp: Math.max(...scans.map((s) => s.timestamp || 0)),
    monsters,
    sources: scans.map((s) => ({ tabUrl: s.tabUrl, timestamp: s.timestamp })),
  });
}

function wireDashboard() {
  document.getElementById('scan-groups').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.view) {
      viewScan(btn.dataset.view);
    } else if (btn.dataset.merge) {
      e.preventDefault();
      viewCampaign(btn.dataset.merge);
    } else if (btn.dataset.delete) {
      const scan = allScans.find((s) => s.id === btn.dataset.delete);
      if (scan && confirm(`Delete this saved scan?\n\n${fmtWhen(scan.timestamp)}\n${scan.tabUrl || ''}`)) {
        await deleteScan(btn.dataset.delete);
        await refreshDashboard();
      }
    } else if (btn.dataset.campaign) {
      const scan = allScans.find((s) => s.id === btn.dataset.campaign);
      if (!scan) return;
      const next = prompt('Campaign name (leave blank to uncategorize):', scan.campaign || '');
      if (next === null) return;
      await setScanCampaign(scan.id, next);
      await refreshDashboard();
    }
  });
}

async function init() {
  setupExport();
  wireDashboard();
  await refreshDashboard();

  const { lastScan } = await chrome.storage.local.get('lastScan');
  const hasCurrent = lastScan && lastScan.monsters?.length;

  if (!hasCurrent && !allScans.length) {
    emptyEl.hidden = false;
    return;
  }

  sourceEl.innerHTML = hasCurrent && lastScan.tabUrl
    ? `Source: <a href="${escapeHtml(lastScan.tabUrl)}" target="_blank" rel="noopener">${escapeHtml(lastScan.tabUrl)}</a>`
    : '';

  if (hasCurrent) {
    renderView({
      title: `Latest scan — ${fmtWhen(lastScan.timestamp)}`,
      campaign: null,
      tabUrl: lastScan.tabUrl,
      timestamp: lastScan.timestamp,
      monsters: lastScan.monsters,
    });
  } else {
    // No "current" snapshot but history exists: show the most recent saved scan.
    const recent = [...allScans].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
    viewScan(recent.id);
  }
}

init();
