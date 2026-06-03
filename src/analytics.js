// Copyright 2026 Leo Balter
// SPDX-License-Identifier: Apache-2.0
// Unofficial tool; not affiliated with Wizards of the Coast or D&D Beyond. See NOTICE.
//
// Pure functions for turning a list of parsed monster records into aggregate
// statistics. Each monster has a `count` (how many times it appeared on the
// scanned page) so tallies are produced two ways:
//   - "unique": number of distinct monsters that have the trait
//   - "weighted": sum of counts (how many references on the page have it)

const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];

export function parseChallenge(str) {
  if (!str) return null;
  const m = str.match(/^([\d/]+)/);
  if (!m) return null;
  const tok = m[1];
  if (tok.includes('/')) {
    const [a, b] = tok.split('/').map(Number);
    if (!b) return null;
    return a / b;
  }
  const n = Number(tok);
  return Number.isFinite(n) ? n : null;
}

export function formatChallenge(n) {
  if (n == null) return '—';
  if (n === 0.125) return '1/8';
  if (n === 0.25) return '1/4';
  if (n === 0.5) return '1/2';
  return String(n);
}

export function parseHitPoints(str) {
  if (!str) return null;
  const m = str.match(/\d+/);
  return m ? Number(m[0]) : null;
}

export function parseArmorClass(str) {
  if (!str) return null;
  const m = str.match(/\d+/);
  return m ? Number(m[0]) : null;
}

export function parseMeta(meta) {
  if (!meta) return {};
  const out = {};
  const sizeMatch = meta.match(/^(Tiny|Small|Medium|Large|Huge|Gargantuan)\b/i);
  if (sizeMatch) {
    const lower = sizeMatch[1].toLowerCase();
    out.size = SIZES.find((s) => s.toLowerCase() === lower) || sizeMatch[1];
  }
  if (/^\w+\s+Swarm\s+of\b/i.test(meta)) {
    out.type = 'Swarm';
  } else {
    const typeMatch = meta.match(/^\w+\s+([A-Za-z]+)/);
    if (typeMatch) {
      out.type = typeMatch[1].charAt(0).toUpperCase() + typeMatch[1].slice(1).toLowerCase();
    }
  }
  return out;
}

// Split a tidbit value like "Cold, Lightning, Necrotic" or
// "Poison; Bludgeoning, Piercing, and Slashing from Nonmagical Attacks"
// into individual entries. Compound clauses qualified by "from ..." are
// kept as one phrase so they aggregate as a recognizable group.
export function splitDamageList(str) {
  if (!str) return [];
  const out = [];
  for (const raw of str.split(';').map((s) => s.trim()).filter(Boolean)) {
    if (/\sfrom\s/i.test(raw)) {
      out.push(raw.replace(/\s+/g, ' '));
    } else {
      for (const piece of raw.split(/,|\sand\s/i).map((s) => s.trim()).filter(Boolean)) {
        out.push(piece);
      }
    }
  }
  return out;
}

function tallyEntries(monsters, extract) {
  const map = new Map();
  for (const m of monsters) {
    const items = extract(m);
    if (!items?.length) continue;
    const seen = new Set();
    for (const item of items) {
      if (seen.has(item)) continue;
      seen.add(item);
      const entry = map.get(item) || { key: item, unique: 0, weighted: 0, monsters: [] };
      entry.unique += 1;
      entry.weighted += m.count || 1;
      entry.monsters.push({ name: m.name, href: m.href, count: m.count || 1 });
      map.set(item, entry);
    }
  }
  for (const e of map.values()) {
    e.monsters.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }
  return Array.from(map.values()).sort(
    (a, b) => b.weighted - a.weighted || b.unique - a.unique || a.key.localeCompare(b.key),
  );
}

export function tallyDamageField(monsters, field) {
  return tallyEntries(monsters, (m) => splitDamageList(m[field]));
}

export function tallyTypes(monsters) {
  return tallyEntries(monsters, (m) => {
    const t = parseMeta(m.meta).type;
    return t ? [t] : [];
  });
}

export function tallySizes(monsters) {
  return tallyEntries(monsters, (m) => {
    const s = parseMeta(m.meta).size;
    return s ? [s] : [];
  });
}

export function tallyCRs(monsters) {
  const map = new Map();
  for (const m of monsters) {
    const cr = parseChallenge(m.challenge);
    if (cr == null) continue;
    const key = formatChallenge(cr);
    const entry = map.get(key) || { key, sortKey: cr, unique: 0, weighted: 0, monsters: [] };
    entry.unique += 1;
    entry.weighted += m.count || 1;
    entry.monsters.push({ name: m.name, href: m.href, count: m.count || 1 });
    map.set(key, entry);
  }
  for (const e of map.values()) {
    e.monsters.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }
  return Array.from(map.values()).sort((a, b) => a.sortKey - b.sortKey);
}

// Aggregate per damage type across all monsters' actions/traits.
// Each monster contributes the sum of avg-damage values per type, weighted
// by how many times it appears on the page.
export function tallyDamageOutput(monsters) {
  const map = new Map();
  for (const m of monsters) {
    const instances = Array.isArray(m.damageInstances) ? m.damageInstances : [];
    if (!instances.length) continue;
    const perType = new Map();
    for (const inst of instances) {
      const t = (inst.type || '').toLowerCase();
      if (!t) continue;
      const cur = perType.get(t) || { avg: 0, count: 0 };
      cur.avg += Number(inst.avg) || 0;
      cur.count += 1;
      perType.set(t, cur);
    }
    const weight = m.count || 1;
    for (const [type, agg] of perType) {
      const cap = type.charAt(0).toUpperCase() + type.slice(1);
      const entry = map.get(type) || {
        key: cap,
        unique: 0,
        weighted: 0,
        instances: 0,
        totalAvg: 0,
        monsters: [],
      };
      entry.unique += 1;
      entry.weighted += weight;
      entry.instances += agg.count;
      entry.totalAvg += agg.avg * weight;
      entry.monsters.push({
        name: m.name,
        href: m.href,
        count: weight,
        avg: agg.avg,
        instances: agg.count,
      });
      map.set(type, entry);
    }
  }
  for (const e of map.values()) {
    e.monsters.sort((a, b) => b.avg * b.count - a.avg * a.count || a.name.localeCompare(b.name));
  }
  return Array.from(map.values()).sort(
    (a, b) => b.totalAvg - a.totalAvg || b.unique - a.unique || a.key.localeCompare(b.key),
  );
}

function stats(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / sorted.length,
    median,
  };
}

function expand(monsters, getValue) {
  const unique = [];
  const weighted = [];
  for (const m of monsters) {
    const v = getValue(m);
    if (v == null) continue;
    unique.push(v);
    for (let i = 0; i < (m.count || 1); i++) weighted.push(v);
  }
  return { unique, weighted };
}

export function numericStats(monsters, getValue) {
  const { unique, weighted } = expand(monsters, getValue);
  return {
    unique: stats(unique),
    weighted: stats(weighted),
    coverage: unique.length,
    total: monsters.length,
  };
}

export function summarize(monsters) {
  const totalRefs = monsters.reduce((s, m) => s + (m.count || 1), 0);
  const damageOutput = tallyDamageOutput(monsters);
  const damageOutputCoverage = monsters.filter(
    (m) => Array.isArray(m.damageInstances) && m.damageInstances.length,
  ).length;
  return {
    uniqueCount: monsters.length,
    totalReferences: totalRefs,
    hp: numericStats(monsters, (m) => parseHitPoints(m.hitPoints)),
    ac: numericStats(monsters, (m) => parseArmorClass(m.armorClass)),
    cr: numericStats(monsters, (m) => parseChallenge(m.challenge)),
    crDistribution: tallyCRs(monsters),
    sizes: tallySizes(monsters),
    types: tallyTypes(monsters),
    damageResistances: tallyDamageField(monsters, 'damageResistances'),
    damageImmunities: tallyDamageField(monsters, 'damageImmunities'),
    damageVulnerabilities: tallyDamageField(monsters, 'damageVulnerabilities'),
    conditionImmunities: tallyDamageField(monsters, 'conditionImmunities'),
    damageOutput,
    damageOutputCoverage: { with: damageOutputCoverage, total: monsters.length },
  };
}
