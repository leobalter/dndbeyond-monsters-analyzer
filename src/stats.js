import { summarize, parseChallenge, formatChallenge, parseHitPoints, parseArmorClass, parseMeta } from './analytics.js';

const emptyEl = document.getElementById('empty');
const contentEl = document.getElementById('content');
const sourceEl = document.getElementById('source');

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

async function init() {
  const { lastScan } = await chrome.storage.local.get('lastScan');
  if (!lastScan || !lastScan.monsters?.length) {
    emptyEl.hidden = false;
    return;
  }
  contentEl.hidden = false;
  sourceEl.innerHTML = lastScan.tabUrl
    ? `Source: <a href="${escapeHtml(lastScan.tabUrl)}" target="_blank" rel="noopener">${escapeHtml(lastScan.tabUrl)}</a>`
    : '';

  const monsters = lastScan.monsters;
  const sum = summarize(monsters);

  renderOverview(lastScan, sum);
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
  renderMonstersTable(monsters);
}

init();
