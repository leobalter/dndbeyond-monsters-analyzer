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

// High-level damage groups. "Physical" = bludgeoning/piercing/slashing,
// "Elemental" = the classic elemental energies, "Other" = everything else
// (force, necrotic, poison, psychic, radiant).
export const DAMAGE_GROUPS = {
  physical: ['bludgeoning', 'piercing', 'slashing'],
  elemental: ['acid', 'cold', 'fire', 'lightning', 'thunder'],
};

const GROUP_LABELS = {
  physical: 'Physical (B/P/S)',
  elemental: 'Elemental',
  other: 'Other',
};

export function damageGroupOf(type) {
  const t = (type || '').toLowerCase();
  if (DAMAGE_GROUPS.physical.includes(t)) return 'physical';
  if (DAMAGE_GROUPS.elemental.includes(t)) return 'elemental';
  return 'other';
}

// Aggregate damage output collapsed into physical / elemental / other groups.
// A monster can contribute to several groups (e.g. a claw + fire breath).
export function tallyDamageGroups(monsters) {
  const order = ['physical', 'elemental', 'other'];
  const map = new Map(
    order.map((g) => [g, {
      key: GROUP_LABELS[g], group: g, unique: 0, weighted: 0, instances: 0, totalAvg: 0, monsters: [],
    }]),
  );
  for (const m of monsters) {
    const instances = Array.isArray(m.damageInstances) ? m.damageInstances : [];
    if (!instances.length) continue;
    const perGroup = new Map();
    for (const inst of instances) {
      const g = damageGroupOf(inst.type);
      const cur = perGroup.get(g) || { avg: 0, count: 0 };
      cur.avg += Number(inst.avg) || 0;
      cur.count += 1;
      perGroup.set(g, cur);
    }
    const weight = m.count || 1;
    for (const [g, agg] of perGroup) {
      const entry = map.get(g);
      entry.unique += 1;
      entry.weighted += weight;
      entry.instances += agg.count;
      entry.totalAvg += agg.avg * weight;
      entry.monsters.push({ name: m.name, href: m.href, count: weight, avg: agg.avg, instances: agg.count });
    }
  }
  for (const e of map.values()) {
    e.monsters.sort((a, b) => b.avg * b.count - a.avg * a.count || a.name.localeCompare(b.name));
  }
  return order.map((g) => map.get(g)).filter((e) => e.instances > 0);
}

// Bucket each monster (with parsed damage) into exactly one profile, comparing
// physical and elemental presence: pure physical, pure elemental, both, or
// other/mixed (anything involving "other" types without being both phys+elem).
export function categorizeDamageProfiles(monsters) {
  const buckets = [
    { key: 'Pure physical (B/P/S only)', profile: 'physical', unique: 0, weighted: 0, monsters: [] },
    { key: 'Pure elemental only', profile: 'elemental', unique: 0, weighted: 0, monsters: [] },
    { key: 'Physical + elemental', profile: 'both', unique: 0, weighted: 0, monsters: [] },
    { key: 'Other / mixed', profile: 'other', unique: 0, weighted: 0, monsters: [] },
  ];
  for (const m of monsters) {
    const instances = Array.isArray(m.damageInstances) ? m.damageInstances : [];
    if (!instances.length) continue;
    const has = { physical: false, elemental: false, other: false };
    for (const inst of instances) has[damageGroupOf(inst.type)] = true;

    let idx;
    if (has.physical && !has.elemental && !has.other) idx = 0;
    else if (has.elemental && !has.physical && !has.other) idx = 1;
    else if (has.physical && has.elemental) idx = 2;
    else idx = 3;

    const b = buckets[idx];
    b.unique += 1;
    b.weighted += m.count || 1;
    b.monsters.push({ name: m.name, href: m.href, count: m.count || 1 });
  }
  for (const b of buckets) {
    b.monsters.sort((a, c) => c.count - a.count || a.name.localeCompare(c.name));
  }
  return buckets.filter((b) => b.unique > 0);
}

// The 13 standard 5e damage types, used to score every type even when no
// monster in the set interacts with it (so "least needed" can be reported).
export const ALL_DAMAGE_TYPES = [
  'bludgeoning', 'piercing', 'slashing',
  'acid', 'cold', 'fire', 'lightning', 'thunder',
  'force', 'necrotic', 'poison', 'psychic', 'radiant',
];

function cap(t) {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Which standard damage types appear anywhere in a defense string. Handles
// compound entries like "bludgeoning, piercing, and slashing from nonmagical
// attacks" by scanning for each keyword.
function typesInText(str) {
  if (!str) return [];
  const lower = str.toLowerCase();
  return ALL_DAMAGE_TYPES.filter((t) => lower.includes(t));
}

// Player-character recommendations derived from the monster set.
//
// Offense — for each damage type, count how many monsters (weighted by page
// references) are Vulnerable / Resistant / Immune to it, then score it:
//   score = 2*vulnerable - 1*resistant - 2*immune   (per weighted reference)
// High score => great type for PCs to deal; low score => a type to avoid.
//
// Defense — reuse parsed action damage output: the damage types monsters
// actually deal the most are the resistances PCs benefit from most; the types
// they rarely/never deal are the least needed.
export function recommendations(monsters) {
  const ref = (m) => ({ name: m.name, href: m.href, count: m.count || 1 });

  const off = new Map(ALL_DAMAGE_TYPES.map((t) => [t, {
    key: cap(t),
    type: t,
    vulnerable: { unique: 0, weighted: 0, monsters: [] },
    resistant: { unique: 0, weighted: 0, monsters: [] },
    immune: { unique: 0, weighted: 0, monsters: [] },
    score: 0,
  }]));

  let defended = 0;
  for (const m of monsters) {
    const w = m.count || 1;
    const vuln = new Set(typesInText(m.damageVulnerabilities));
    const res = new Set(typesInText(m.damageResistances));
    const imm = new Set(typesInText(m.damageImmunities));
    if (vuln.size || res.size || imm.size) defended += 1;
    for (const t of ALL_DAMAGE_TYPES) {
      const e = off.get(t);
      if (vuln.has(t)) {
        e.vulnerable.unique += 1; e.vulnerable.weighted += w; e.vulnerable.monsters.push(ref(m));
      }
      // A monster is never both resistant and immune to the same type; immunity wins.
      if (imm.has(t)) {
        e.immune.unique += 1; e.immune.weighted += w; e.immune.monsters.push(ref(m));
      } else if (res.has(t)) {
        e.resistant.unique += 1; e.resistant.weighted += w; e.resistant.monsters.push(ref(m));
      }
    }
  }
  for (const e of off.values()) {
    e.score = 2 * e.vulnerable.weighted - e.resistant.weighted - 2 * e.immune.weighted;
    for (const k of ['vulnerable', 'resistant', 'immune']) {
      e[k].monsters.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    }
  }
  const offense = Array.from(off.values()).sort(
    (a, b) => b.score - a.score || a.key.localeCompare(b.key),
  );

  // Defense: per-type damage the party will be taking, covering all 13 types.
  const output = new Map(tallyDamageOutput(monsters).map((e) => [e.key.toLowerCase(), e]));
  const defense = ALL_DAMAGE_TYPES.map((t) => {
    const e = output.get(t);
    return e
      ? { key: e.key, type: t, unique: e.unique, totalAvg: e.totalAvg, weighted: e.weighted, instances: e.instances, monsters: e.monsters }
      : { key: cap(t), type: t, unique: 0, totalAvg: 0, weighted: 0, instances: 0, monsters: [] };
  }).sort((a, b) => b.totalAvg - a.totalAvg || b.weighted - a.weighted || a.key.localeCompare(b.key));

  const damageOutputCount = monsters.filter(
    (m) => Array.isArray(m.damageInstances) && m.damageInstances.length,
  ).length;

  return {
    offense,
    defense,
    coverage: {
      defenses: defended,
      output: damageOutputCount,
      total: monsters.length,
    },
  };
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
    damageGroups: tallyDamageGroups(monsters),
    damageProfiles: categorizeDamageProfiles(monsters),
    recommendations: recommendations(monsters),
  };
}

// Canonical form of a monster/page URL (origin + pathname), so the same
// resource with different query strings or fragments is treated as one.
export function canonicalUrl(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return url || '';
  }
}

// Suggest a campaign label by parsing a D&D Beyond page URL. Returns '' when
// nothing recognizable is found, in which case the user can type their own.
export function suggestCampaign(tabUrl) {
  if (!tabUrl) return '';
  let u;
  try {
    u = new URL(tabUrl);
  } catch {
    return '';
  }
  const parts = u.pathname.split('/').filter(Boolean);
  const after = (name) => {
    const i = parts.indexOf(name);
    return i >= 0 ? parts[i + 1] : undefined;
  };
  const titleize = (slug) =>
    String(slug)
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();

  const campaign = after('campaigns');
  if (campaign) return `Campaign ${campaign}`;
  const encounter = after('encounters');
  if (encounter) return `Encounter ${encounter}`;

  // Sources can be /sources/<book>/... or the newer /sources/dnd/<book>/...
  let source = after('sources');
  if (source === 'dnd') {
    const i = parts.indexOf('sources');
    if (parts[i + 2]) source = parts[i + 2];
  }
  if (source) return titleize(source);

  return '';
}

// Merge several monster lists into one, combining duplicates by canonical URL
// and summing their per-page counts. Missing stat fields are backfilled from
// whichever copy has them.
export function mergeMonsters(lists) {
  const map = new Map();
  for (const monsters of lists) {
    for (const m of monsters || []) {
      const key = canonicalUrl(m.href);
      const existing = map.get(key);
      if (existing) {
        existing.count = (existing.count || 1) + (m.count || 1);
        for (const [k, v] of Object.entries(m)) {
          if (k === 'count') continue;
          if (existing[k] == null || existing[k] === '') existing[k] = v;
        }
      } else {
        map.set(key, { ...m, count: m.count || 1 });
      }
    }
  }
  return Array.from(map.values());
}
