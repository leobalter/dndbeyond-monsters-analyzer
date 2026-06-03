# Monsters Analyzer for D&D Beyond

> Unofficial. Not affiliated with, endorsed by, or sponsored by Wizards of the Coast or D&D Beyond.

A Chrome extension that scans any [D&D Beyond](https://www.dndbeyond.com/) page for monster references (the `.monster-tooltip` links used throughout adventures, encounters, and source books), groups them by unique monster, counts occurrences, and pulls a small set of stat-block fields from each monster's page. A separate stats view aggregates the results: common immunities, CR distribution, HP/AC/CR averages, and an exploratory "damage output by type" tally to help spot which character resistances are worth taking.

## Features

- Per-page monster scan with occurrence counts
- Stat-block fields surfaced per monster: CR, size/type/alignment, HP, AC, damage resistances/immunities/vulnerabilities, condition immunities
- Local cache (`chrome.storage.local`) so re-scans reuse what has already been fetched; **Clear cache** when you want a fresh crawl
- Copy JSON of the current scan for external analysis
- Full-page **Stats** view with:
  - Overview (unique monsters, total references on the page)
  - HP / AC / CR — mean, median, min, max (per-unique and weighted by count)
  - CR distribution, creature types, sizes
  - Damage resistances / immunities / vulnerabilities / condition immunities, each row expandable to list the contributing monsters
  - Exploratory **Damage output by type** (parsed from action damage rolls)

## Install (unpacked, for development)

1. Open `chrome://extensions` in Chrome (or any Chromium browser).
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this folder.
4. Pin the extension to the toolbar if you want quick access.

## Use

1. Open any D&D Beyond page that references monsters (e.g. an adventure chapter, encounter, or random table).
2. Click the extension icon.
3. Click **Scan page**. Rows render immediately with name/count and fill in stat fields as fetches complete (2 in parallel, using your existing D&D Beyond session).
4. Click **Stats** to open the analysis page in a new tab.
5. Click **Copy JSON** to copy the structured result.

## Privacy

This extension does not collect, transmit, or share any user data. Everything it reads stays in your browser:

- Scanned monster references and parsed stat-block data are stored in `chrome.storage.local` on your machine and never sent anywhere.
- Monster pages are fetched directly from `dndbeyond.com` using your existing session cookies — the same way your browser already does when you click a link.
- No analytics, no tracking, no remote code.

## Layout

```
manifest.json          # MV3 manifest
src/
  popup.html / .css / .js   # popup UI
  scanner.js                # injected scanner for .monster-tooltip links
  parser.js                 # parses a monster page into structured fields
  storage.js                # chrome.storage.local cache helpers
  analytics.js              # tally + aggregate helpers for the stats view
  stats.html / .css / .js   # full-page analysis view
icons/                      # generated PNG icons
tools/
  make-icons.py             # regenerate icons (pure stdlib + macOS sips)
```

## Extending the parser

The parser in [src/parser.js](src/parser.js) is intentionally small. To add more fields:

1. For stat-block "tidbits" (Saving Throws, Skills, etc.) add a key to `TIDBIT_KEYS`.
2. For attribute rows (HP, AC, Speed) extend the `.mon-stat-block__attribute` loop.
3. Surface the field in [src/popup.html](src/popup.html) / [src/popup.js](src/popup.js) and/or aggregate it in [src/analytics.js](src/analytics.js) for the stats page.

## Notes / limitations

- Only `.monster-tooltip` links are scanned. Other monster reference styles on D&D Beyond would need their own selector.
- Monster pages behind a paywall are fetched with your browser's existing cookies. If you're not logged in (or don't own the source), the relevant fields may be missing.
- D&D Beyond may change their stat-block markup at any time; if a column suddenly shows "—" for every row, update the selectors in [src/parser.js](src/parser.js).
- Damage output parsing only matches the canonical `N (XdY + Z) <type> damage` form and does not model multiattack, saves, recharge, or conditional riders — treat the section as a directional ranking, not an encounter budget.

## Packaging for the Chrome Web Store

From the repo root:

```sh
zip -r monsters-analyzer.zip manifest.json src icons \
  -x "*.DS_Store" "tools/*" "*.git*"
```

Then upload the resulting `monsters-analyzer.zip` in the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole), set visibility to **Unlisted**, and submit for review.

> Anyone is free to use, modify, and distribute this extension under the Apache-2.0 license, including publishing their own build. See [License](#license).

## License

This project is licensed under the **[Apache License 2.0](LICENSE)**. Copyright © 2026 Leo Balter.

In short:

- ✅ You may use, modify, and distribute the code — including commercially and including publishing your own build to a store — provided you comply with the license.
- ✅ Apache-2.0 includes an explicit patent grant and a strong "AS IS" warranty/liability disclaimer, so the author is not on the hook for how you use it.
- 📎 You must keep the [LICENSE](LICENSE) and [NOTICE](NOTICE) files, retain attribution notices, and state significant changes you make.

### Important: D&D Beyond / Wizards of the Coast content

This is an **unofficial** tool and is **not** affiliated with, endorsed by, or sponsored by Wizards of the Coast or D&D Beyond. "Dungeons & Dragons", "D&D Beyond", and the stat blocks and game content this tool reads are the property of Wizards of the Coast and are **not** covered by this project's license.

The Apache-2.0 license covers *this project's own code* — it cannot and does not grant any rights to D&D Beyond's content. Your use of this tool is also governed by the **[D&D Beyond / Wizards of the Coast Terms of Service](https://www.dndbeyond.com/terms)**, and you are responsible for complying with them. See [NOTICE](NOTICE) for the full attribution and disclaimer.
