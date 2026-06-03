# Privacy Policy — Monsters Analyzer for D&D Beyond

_Last updated: 2026-06-03_

Monsters Analyzer for D&D Beyond ("the extension") is an unofficial, fan-made
browser extension. It is not affiliated with, endorsed by, or sponsored by
Wizards of the Coast or D&D Beyond.

## Summary

The extension does **not** collect, transmit, sell, or share any personal or
user data. Everything it reads or produces stays on your device. There are no
analytics, no tracking, and no remote code.

## What the extension accesses

- **The active D&D Beyond page you scan.** When you click the extension and
  start a scan, it reads the current page to find referenced monsters (the
  monster tooltip links used throughout D&D Beyond) and their counts.
- **Individual monster pages on dndbeyond.com.** To fill in stat-block fields
  (Challenge Rating, Hit Points, Armor Class, damage resistances/immunities/
  vulnerabilities, condition immunities, and parsed action damage), the
  extension fetches each referenced monster's page directly from
  `dndbeyond.com`, using your existing browser session — the same way your
  browser does when you click a link. No separate login or credential is
  requested or stored by the extension.

## What the extension stores

The following data is stored **locally on your device** using the browser's
`chrome.storage.local` API, and is never sent anywhere:

- A cache of parsed monster stat-block data, to make re-scans faster.
- Your saved scan history, including timestamps.
- Campaign labels you assign to scans (auto-suggested from the page URL and
  fully editable by you).

You can clear this data at any time using the extension's **Clear cache**
control, by deleting saved scans, or by removing the extension from your
browser.

## Data sharing and transmission

- No data is transmitted to the developer or any third party.
- No data is sold or shared.
- The only network requests the extension makes are to `dndbeyond.com`, to
  fetch the monster pages you are analyzing.

## Exported data

When you use **Download JSON** or **Copy JSON**, the exported file or clipboard
content is created locally and handled entirely by you. The extension does not
upload or transmit exports anywhere.

## Permissions

- **activeTab** — read the D&D Beyond page you choose to scan, on your action.
- **scripting** — inject the scanner into that page to collect monster
  references when you click Scan.
- **storage** / **unlimitedStorage** — save the cache and scan history locally
  on your device.
- **Host access to `*://*.dndbeyond.com/*`** — fetch monster stat-block pages
  from D&D Beyond to parse their fields.

## Children's privacy

The extension does not knowingly collect any data from anyone, including
children.

## Changes to this policy

If this policy changes, the updated version will be published in the
extension's repository with a new "Last updated" date.

## Contact

For questions about this policy, please open an issue in the extension's
GitHub repository.
