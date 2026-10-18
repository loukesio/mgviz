# Message to Claude Code

Paste the text below into Claude Code, run from the root of the mgviz repository, with this folder (`design_handoff_mgviz_report/`) copied into the repo.

---

You are implementing a redesign of the mgviz HTML report. Everything you need is in `design_handoff_mgviz_report/`:

- `README.md`: the full specification. **This is the source of truth.**
- `screenshots/`: 25 reference screenshots (light and dark, 4 samples and 100 samples).
- `reference/*.dc.html`: working HTML prototypes of the design. They are a *reference for look and behaviour*, not code to copy. They run on a prototyping runtime (`support.js`) that is not part of mgviz.
- `ORIGINAL_BRIEF.md`: the product brief, hard constraints and data schema.

## Before writing any code
1. Read `README.md` end to end, then `ORIGINAL_BRIEF.md` §6 (constraints) and §7 (data fields).
2. Look at every screenshot in `screenshots/`.
3. Explore the existing mgviz report code: the HTML template, the CSS file, the JS file and the Python assembler. Find where the embedded JSON is produced and which fields it actually contains.
4. Write a short plan to `design_handoff_mgviz_report/PLAN.md`. Cover:
   - how you will map the spec onto the existing template/CSS/JS split;
   - which data fields from §7 are missing and how you will derive or add them;
   - the build order (README, last section).

   **Stop and show me the plan before implementing.**

## Hard rules
- The output is still **one self-contained HTML file**, opened from `file://`, offline. **d3 v7 vendored and inlined; no other libraries; nothing loaded from a CDN; no web fonts.** The prototypes use jsDelivr for d3 and `html-to-image`. Do not carry either over. For PNG export of HTML tables, draw an export-only SVG with d3 and rasterise it via canvas, the same way as the figures.
- **No build step.** Keep the Python template + CSS + JS assembly.
- **Do not port the synthetic data** (`genData`, `CAT`, `VIR` in the prototype). Compute every derived value (tiers, prevalence, flags, clustering) from the real embedded data, exactly as the README defines it.
- Light and dark themes, palette switchable at runtime. Family palettes must come from the project's ltc palette collection, not the hard-coded hex lists, which are only the defaults used in the prototype.
- It must work from 1 sample / 3 genomes up to 100+ samples / 500 genomes. Follow the scaling table in the README.

## Attention to detail (this matters most)
The product owner's rule: **every colour, bar and number must answer a question.** Several things were removed on purpose: a mini-bar that repeated a number, colour-coded sample types, the Overview "Needs a second look" panel, traffic-light confidence colours. Do not re-introduce them, and do not add decoration the README does not specify.

Match the README **exactly**:
- colour tokens per theme, and the rule that family colour appears only in Taxonomy and Samples × taxa;
- the type scale and the three font stacks;
- spacing, radii and the two shadows;
- number formats;
- every piece of UI copy, word for word (tab descriptions, rule sentences, legends, empty states);
- the confidence rules and thresholds;
- flag rules (flags must stay rare, a few % of calls).

Known traps from the prototype. Avoid them:
1. The abundance colour ramp must work before d3 has loaded. A fallback once painted every cell the maximum colour.
2. Text on coloured cells: choose dark or white from the **cell's luminance**, not from the data value.
3. Heatmap and tree hover must update opacity directly, never re-render the app, and must clear on mouseleave. A sticky-hover bug existed.
4. Family labels must never clip at the left edge of the rectangular tree. Rotated column labels must never run off the right edge or overlap the column title.
5. Collapse chevrons in the left panel must be clearly visible (12px, full ink).
6. Exports must include **all rows in the current focus**, not only the visible ones. CSV is UTF-8 with a BOM, CRLF line endings and RFC-4180 quoting.
7. In the radial figure, label flipping must use the **normalised** angle so labels stay upright at any rotation.

## How to work
- Implement in the README's order. After each step, open the generated report with a small and a large real dataset (create a 100-sample fixture if none exists) and compare it side by side with the matching screenshot. Fix differences before moving on.
- Keep the shared focus state (sample, family, search, minimum confidence) in one place. Overview and Detections **filter** by it; Taxonomy and Samples × taxa **fade** non-matching items.
- Hover and highlight use direct DOM updates. Redraw a figure only when its structural inputs change.
- Test in Chrome, Firefox and Safari: mouse tools (pan, rotate, zoom-to-area), wheel zoom, double-click reset, and every SVG / PNG / CSV / TSV export.
- When the spec is ambiguous or the real data lacks a field, **ask me** rather than guess.
- When you finish, list anything that deviates from the README and why.
