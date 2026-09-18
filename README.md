# Seed Oracle

A self-contained, no-build static site that turns I Ching casts into a
twelve-word BIP39 teaching phrase. It is an educational oracle, not a wallet:
never use generated phrases for real funds.

The interface includes a fixed northern-sky background adapted from the HYG
star catalogue. All project styling lives in `css/site.css`.

## The journey

1. **The Cast** — each line immediately joins the aligned hexagram, binary, and
   word weave. Subtle bands group the eleven bits behind each word; linked
   highlights trace either a word to its 11 bits or a hexagram to its 6 bits.
   The footer’s expandable Hexagrams reference switches between Fu Xi
   binary order and King Wen order without changing the reading.
2. **The Seal** — Water, Fire, Earth, or Air supplies the final two entropy bits,
   shown in its element colour beneath four gold checksum lines; together they
   complete the final hexagram and a numbered two-column twelve-word phrase.
3. **The Proof** — inspect entropy, checksum, and the resulting 512-bit BIP39
   seed together. Address details remain available in a disclosure. Credits is
   always accessible.

## Run locally

From this folder:

```bash
python3 -m http.server 8765
```

Then open <http://127.0.0.1:8765/>. A local server is recommended because Web
Crypto depends on a secure context; `localhost` is treated as secure by
browsers.

There is no build step and no package installation. Deploy the contents of
this folder directly to any static host. When served over HTTPS (or localhost),
supporting browsers can install it as a standalone web app and retain the core
page for offline use.

## Test

```bash
node tests/seedoracle-vectors.cjs
```

Before publishing, set the production canonical and Open Graph URLs in
`index.html`.

## Project layout

- `index.html` — the complete page structure and script loading order.
- `css/site.css` — shared and Seed Oracle-specific styles.
- `js/site.js` — header, accessibility helpers, and collapsible sections.
- `js/seedoracle*.js` — casting, state, hexagram, and Bitcoin teaching logic.
- `js/stardata.js` and `js/stars.js` — fixed-sky catalogue data and renderer.
- `assets/app-icon*.svg` — full-bleed regular and maskable install artwork.
- `manifest.webmanifest` and `sw.js` — install metadata and offline app shell.
- `tests/seedoracle-vectors.cjs` — deterministic cryptographic test vectors.

## Licensing

Source code is MIT licensed. Original Seed Oracle teaching and reading text is
CC BY-NC 4.0. Third-party data retains its own license. See `LICENSE`,
`LICENSE-CONTENT.md`, and `THIRD-PARTY-NOTICES.md`.
