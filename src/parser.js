// Copyright 2026 Leo Balter
// SPDX-License-Identifier: Apache-2.0
// Unofficial tool; not affiliated with Wizards of the Coast or D&D Beyond. See NOTICE.
//
// Parses a D&D Beyond monster page (HTML string) into a small structured record.
// We target the classic stat-block markup but fall back gracefully when a
// field is missing.

const TIDBIT_KEYS = {
  'damage resistances': 'damageResistances',
  'damage immunities': 'damageImmunities',
  'damage vulnerabilities': 'damageVulnerabilities',
  'condition immunities': 'conditionImmunities',
  'senses': 'senses',
  'languages': 'languages',
  // Modern D&D Beyond statblocks render CR as a tidbit, not its own element.
  'challenge': 'challenge',
};

function clean(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

const DAMAGE_TYPES = [
  'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic',
  'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder',
];

// Matches "N (XdY + Z) <type> damage" — the standard D&D Beyond rendering of a damage roll.
// Multi-die expressions like "(2d8 + 1d6 + 3)" are intentionally not matched: rare and
// would conflate damage types when combined with the type suffix.
const DAMAGE_RE = new RegExp(
  String.raw`(\d+)\s*\((\d+d\d+(?:\s*[+\-]\s*\d+)?)\)\s*(` + DAMAGE_TYPES.join('|') + String.raw`)\s+damage`,
  'gi',
);

function extractDamageInstances(doc) {
  const root =
    doc.querySelector('.mon-stat-block__description-blocks') ||
    doc.querySelector('.mon-stat-block');
  if (!root) return [];
  const text = root.textContent.replace(/\s+/g, ' ');
  const out = [];
  for (const m of text.matchAll(DAMAGE_RE)) {
    out.push({
      avg: Number(m[1]),
      dice: m[2].replace(/\s+/g, ''),
      type: m[3].toLowerCase(),
    });
  }
  return out;
}

export function parseMonsterHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const result = {};

  const nameEl = doc.querySelector(
    '.mon-stat-block__name-link, .mon-stat-block__name a, .mon-stat-block__name, h1.page-title',
  );
  if (nameEl) result.name = clean(nameEl.textContent);

  const metaEl = doc.querySelector('.mon-stat-block__meta');
  if (metaEl) result.meta = clean(metaEl.textContent);

  const crEl = doc.querySelector('.mon-stat-block__challenge');
  if (crEl) {
    const label = crEl.querySelector('.mon-stat-block__challenge-label');
    const rating = crEl.querySelector('.mon-stat-block__challenge-rating');
    if (rating) {
      result.challenge = clean(rating.textContent);
    } else if (label) {
      // Sometimes the value is the remaining text after the label.
      result.challenge = clean(crEl.textContent.replace(label.textContent, ''));
    } else {
      result.challenge = clean(crEl.textContent);
    }
  }

  for (const tidbit of doc.querySelectorAll('.mon-stat-block__tidbit')) {
    const label = clean(
      tidbit.querySelector('.mon-stat-block__tidbit-label')?.textContent,
    ).toLowerCase();
    const data = clean(
      tidbit.querySelector('.mon-stat-block__tidbit-data')?.textContent,
    );
    if (!label || !data) continue;
    const key = TIDBIT_KEYS[label];
    if (key) result[key] = data;
  }

  for (const attr of doc.querySelectorAll('.mon-stat-block__attribute')) {
    const label = clean(
      attr.querySelector('.mon-stat-block__attribute-label')?.textContent,
    ).toLowerCase();
    const value = clean(
      attr.querySelector('.mon-stat-block__attribute-data-value')?.textContent,
    );
    if (!label || !value) continue;
    if (label === 'hit points') result.hitPoints = value;
    else if (label === 'armor class') result.armorClass = value;
  }

  result.damageInstances = extractDamageInstances(doc);

  return result;
}
