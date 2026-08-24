# Building new pages and components

`DESIGN-SYSTEM.md` describes the tokens and standards. This document describes
the **process**: how to build a new page out of what exists, and what to do
when nothing existing fits.

The live reference is `component-library.html` — every shared block rendered in
isolation with its markup. Read it before writing markup; read this before
writing CSS.

## The layers

| Layer | File | Owns |
| --- | --- | --- |
| Tokens & shell | `assets/styles/wst-design-system.css` | Colour, type scale, heading tiers, spacing, container, navigation, buttons, forms, footer |
| Components | `assets/styles/wst-components.css` | Section blocks: cards, grids, splits, bands, galleries, row lists |
| Polish | `assets/styles/enterprise-polish.css` | Glass, cursor lighting, motion, finishing |
| Page | the page's own `<style>` | Only what is unique to that one page |

New pages load them in that order:

```html
<style> /* page-local only */ </style>
<link rel="stylesheet" href="assets/styles/wst-design-system.css">
<link rel="stylesheet" href="assets/styles/wst-components.css">
<link rel="stylesheet" href="assets/styles/enterprise-polish.css">
```

The page's own `<style>` comes **first**, before the shared sheets. That is
deliberate and matches every existing page: the shared system then wins any
equal-specificity conflict, so a page cannot accidentally override the system
by declaring the same rule.

## The `wst-` prefix is the contract

Every class in `wst-components.css` starts with `wst-`. Page-local classes
never do.

That single rule is what keeps the two namespaces from colliding, and it is
the rule whose absence produced the current situation: the pages built before
2026-08 each carry a full private copy of the navigation, button and footer CSS
under the same class names as the shared system. Those copies are mostly inert
— the shared sheets load after them — but they make it impossible to tell by
reading a page which rules are actually live, and any property the shared sheet
does not happen to set is still governed by the page's private copy.

So:

- **Never declare a `wst-*` class in a page's `<style>` block.** Not to
  override it, not to extend it, not "just this once".
- **Never name a page-local class `wst-*`.**
- If a shared component is wrong for your page, add a variant to the shared
  file. If it is wrong for every page, fix it in the shared file.

`scripts/check-design-system.ps1` enforces this.

## Building a new page

1. Copy the head block and shell placeholders from `component-library.html`.
   Set `data-wst-page` on `<body>` so the navigation marks the right item.
2. Lay the page out as a sequence of `<section class="wst-section">` blocks.
   Alternate surfaces (`--tint`, `--card`, `--dark`) to give the page rhythm;
   do not put two dark bands in a row.
3. Fill each section with components from `component-library.html`.
4. Add page-local CSS only for sections that exist nowhere else.

## When nothing fits

Work down this list. Stop at the first step that solves it.

### 1. Change a token

If the decision applies everywhere — a colour, a size, a duration, a radius —
it belongs in `wst-design-system.css` as a token. A new hard-coded value in a
component is a fork of the system.

### 2. Use an existing component

Pick by **what the content is**, not by which component looks closest to the
mockup. Most "we need a new card" turns out to be an existing card with
different content:

| You have | Use |
| --- | --- |
| Text that needs to sit apart from the page | `.wst-card` |
| A symbol, a short title, a line of copy | `.wst-icon-tile` |
| A short numbered stage | `.wst-step-card` |
| A numbered stage that earns a paragraph | `.wst-row` in `.wst-row-list` |
| A photograph you navigate into | `.wst-feature-card` |
| A product in a listing | `.wst-product-tile` |
| A figure inside a layout | `.wst-stat-card` |
| Headline figures across the page width | `.wst-stat-band` |
| Copy beside a render or photograph | `.wst-split` |

### 3. Add a variant

If your content differs from an existing component by **proportion, surface or
density** rather than by structure, add a `--modifier` to that component. This
is almost always the right answer.

A variant is a small block directly below its base component that changes only
what differs:

```css
/* Photographic variant — the image fills the plinth instead of floating on it. */
.wst-product-tile--photo .wst-product-tile-img { background: none; }
```

### 4. Add a new component

Only when it will appear on **more than one page**. A block used once is
page-local CSS, not a component.

A new component in `wst-components.css` needs all of:

- A `wst-` prefixed name describing what it *is*, not what it looks like.
- Its own numbered section with a comment explaining what the component is for,
  when to use it instead of its nearest neighbour, and any non-obvious
  constraint — the row list's "never set `overflow` here" note is the model.
- Every value resolved to a token.
- Its responsive collapse in section 12, not inline with the component.
- Its motion opt-out in section 13.
- A specimen added to `component-library.html`, with its markup contract.

### 5. Page-local CSS

For a section genuinely unique to one page. Keep it in that page's `<style>`
block, name it after the page or the section, and never prefix it `wst-`.

## Rules that do not bend

1. **Tokens, always.** Every value resolves to a token from
   `wst-design-system.css`. If you need a number the tokens cannot express, add
   the token.
2. **Headings by level, not by size.** Use the tier tokens (`--h1-display`
   through `--h6-label`), chosen for the heading's position in the page. A
   nested heading never outranks its parent section heading. When a heading in
   a spacious framed block reads cramped, use the *featured* variant of its own
   tier — never the token from the tier above. See `DESIGN-SYSTEM.md`.
3. **Motion promises meaning.** Buttons never translate vertically on hover.
   Cards lift only when they lead somewhere — `.wst-card` is static and
   `.wst-card--interactive` opts in.
4. **Accessibility is not a pass at the end.** WCAG AA contrast, visible
   keyboard focus, labelled form controls, state never signalled by opacity
   alone, and a `prefers-reduced-motion` path for every animation.
5. **Brass in text is `--brass-text`.** The decorative `--brass` fails AA at
   body sizes; it is for rules, dots and large numerals only. On dark surfaces
   use `--brass-on-dark`.
6. **Decoration is hidden from assistive tech.** Ambient washes and blueprint
   grids are always `aria-hidden="true"` and never carry text contrast.
7. **`.container` for alignment.** Never a bespoke max-width.
8. **One component per block boundary.** Each component is structurally
   self-contained so it maps 1:1 to a Payload block. A component that only
   works when a specific sibling is present is not a block.

## Payload blocks

Each numbered section of `wst-components.css` is one block boundary. When these
are registered in Payload, the block's field schema follows the markup contract
shown in `component-library.html` — a `.wst-split` block takes a heading, body,
optional link and one media item; a `.wst-row-list` block takes a repeating row
of index, heading and body.

Variants become a `select` field on the block (`--reverse`, `--media-wide`),
not separate blocks.

## Checking your work

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-design-system.ps1
```

It reports any page declaring a `wst-*` class in its own `<style>` block, and
any page-local class that shadows a shared component. Pages predating the
component layer are listed separately as known debt, not as failures.

### Conformance score

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/score-design-system.ps1 -Json
```

Scores every page 0–100 on mechanical adherence to this document: heading
tiers (25), type scale (15), spacing tokens (15), absence of duplicated
component CSS (20), shared shell (10), accessibility hooks (10), component
layer (5). `-Json` writes `design-scores.json`, which `page-index.html` reads
to badge each thumbnail.

This measures maintainability, **not** visual quality. A page can be the
site's visual reference and score poorly because it carries a large private
stylesheet — `index.html` is exactly that. Read a low score as "will not
inherit shared changes", not as "looks wrong".

Where a page loses points is more useful than the total. The two that move the
number most are `noDuplication` — delete the private copy of the nav, button
and footer CSS — and `headingTiers` — replace raw `font-size` on headings with
the tier tokens.
