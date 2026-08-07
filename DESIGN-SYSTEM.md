# WS Technicals design system

This project is a static, multi-page website. The shared visual source of truth is:

- `design-system.html` — interactive visual reference and live token adjustment lab.
- `assets/styles/wst-design-system.css` — brand tokens, typography, layout, navigation, buttons, forms, footer and responsive standards.
- `assets/styles/enterprise-polish.css` — glass lighting, cursor-aware button light, motion and finishing details.
- `assets/scripts/wst-shell.js` — the canonical navigation and footer markup used by every migrated page.
- `assets/scripts/enterprise-motion.js` — shared interaction behaviour.

Page-level `<style>` blocks are reserved for layouts and components unique to that page.

Migrated pages use `<div data-wst-header></div>` and `<div data-wst-footer></div>`. Load `wst-shell.js` before the page's own script so the shared navigation and footer exist when page behaviour is initialized. Set `data-wst-page` on `<body>` to identify the active navigation item.

## Source priority

When making a change, use this order:

1. Change a token in `wst-design-system.css` when the decision applies everywhere.
2. Change a shared component in `wst-design-system.css` when navigation, buttons, forms or the footer should change everywhere.
3. Change `enterprise-polish.css` only for animation, glass, lighting and interaction polish.
4. Change `wst-shell.js` when navigation or footer content must change everywhere.
5. Add page-local CSS only when the section is genuinely unique.

Do not redefine global colours, fonts, spacing, container width, navigation, buttons, forms or footer styles inside an HTML file.

## Canonical standards

### Typography

- Display: Geogrotesque, with Sora fallback.
- Body: Arbeit, with Inter and Arial fallback.
- Scale: `14, 16, 24, 32, 40, 48, 56, 64px`.
- Responsive headings may use `clamp()`, but their minimum and maximum values must come from the scale.

#### Heading hierarchy

The raw scale steps linearly (`+8`), which is too fine to read as hierarchy at
the top end — 56px next to 64px is a size difference, not a level. The heading
tiers therefore skip steps so each level lands roughly a fourth or a fifth
apart. Pages must use these tokens rather than declaring heading sizes:

| Tier | Token | Size | Use |
| --- | --- | --- | --- |
| 1 | `--h1-display` | `clamp(40, 6vw, 64)` | Page hero. **One per page.** |
| 2 | `--h2-section` | `clamp(32, 4.4vw, 48)` | Major section headings. |
| 3 | `--h3-subsection` | `clamp(24, 2.4vw, 32)` | Headings nested inside a section. |
| 4 | `--h4-card` | `24` | Card and list-item titles. |
| 5 | `--h5-card-sm` | `16` | Compact card titles, dense grids. |
| 6 | `--h6-label` | `14` | Eyebrows, footer column labels. |

Each tier has matching `--hN-lh` and `--hN-ls` tokens; tracking and leading
tighten as size grows. Apply all three together.

Rules:

- Pick a tier for the **level**, never for the size it happens to produce.
- Tier follows position in the page, not the tag. A section heading is tier 2
  whether the document outline needs `h2` or `h3` there.
- Never let a nested heading outrank its parent section heading.
- `56px` and `40px` remain in the scale as optical adjustments within a tier —
  for a long hero line that needs to breathe — not as levels of their own.
- The utility classes `.t-display`, `.t-section`, `.t-subsection`, `.t-card`
  and `.t-card-sm` apply a tier directly in markup.

A page may legitimately have no tier 1: `about.html` opens with a lead
paragraph and a visually hidden `h1`, so its top visible level is tier 2.

#### Featured sizes for framed content

`h1` is the hero and `h2` is a major block heading — those two stay reserved.
`h3` and `h4` are the working range for everything nested inside a block:
card titles, list-item titles, and the heading on a single generously-framed
piece of content — a proof card, a family intro sitting above its own
gallery. That last case reads cramped at the plain tier-3 size (`24–32px`),
so it gets a **featured** variant instead of borrowing the `h2` token:

| Token | Size | Use |
| --- | --- | --- |
| `--h3-subsection-featured` | `clamp(24, 3.4vw, 40)` | The one heading in a spacious framed block — image + copy, real whitespace, nothing competing beside it. |
| `--h4-card-featured` | `clamp(24, 2.4vw, 32)` | Same idea, one tier down — a single oversized card in an otherwise plain layout. |

Utility classes: `.t-subsection-featured`, `.t-card-featured`.

The featured ceiling is fixed at a full scale step below the tier above's
floor at every viewport from 320–1920px — a featured `h3` cannot reach the
`h2` on the same page. That's the actual rule, not "smaller than 32px": a
heading earns the featured size by being the sole focal point of a framed
block, and it must still read as visibly smaller than that page's real `h2`s.

The bug this replaced: three `h3`s (`product-drone.html`'s proof-card
heading, `solutions-v3.html`'s family and explorer headings) were set to the
plain `--h2-section` token to make them "big enough," which made them the
identical size as actual `h2` section headings on the same page — the major
block and the card nested inside a block became visually indistinguishable.
Reaching for the tier above is how that happens; reach for the featured
variant of the correct tier instead.

#### Heading beside supporting text

Use `.head-split` for the common "heading left, supporting paragraph right"
section head. It places the eyebrow on its own grid row so the paragraph shares
a row with the heading and their top edges line up, and applies a small optical
nudge so the paragraph's first line matches the heading's cap height. Aligning
on the wrapper instead pins the paragraph to the eyebrow, which reads as
misaligned. Expected markup:

```html
<div class="section-head head-split">
  <span class="eyebrow">Eyebrow</span>
  <h2>Section heading.</h2>
  <p>Supporting paragraph.</p>
</div>
```

### Layout

- Maximum content width: `1240px`.
- Desktop horizontal gutter: `32px`.
- Mobile horizontal gutter: `16px`.
- Major section spacing: `96–140px`.
- Shared content must use `.container`.

### Visual language

- Warm off-white is the default page surface.
- Deep blue is reserved for primary actions and intentional dark sections.
- Brass is a restrained structural accent.
- Radius: `6px` controls, `10px` larger surfaces.
- No decorative divider lines unless they communicate structure.
- Blueprint grids are subtle, square and aligned to the `96px` grid token.

### Buttons

- Primary actions use the same deep-blue glass treatment.
- Navigation actions are 42px high.
- Page and card actions are 46px high.
- Buttons never translate vertically on hover.
- Cursor lighting must stay subtle and disappear in the direction the pointer exits.

### Accessibility

- Maintain WCAG AA contrast for normal text and controls.
- Do not use opacity alone to communicate state.
- Preserve visible keyboard focus.
- Honour `prefers-reduced-motion`.
- Form controls require labels.

## Additional system areas worth maintaining

- Breakpoint tokens and responsive patterns.
- Z-index layers for navigation, overlays, labels and ambient graphics.
- Image treatments: object positioning, background blending and safe cropping.
- Animation duration/easing tokens.
- Form states: default, hover, focus, error, disabled and success.
- Icon sizing and stroke standards.
- Content width rules for readable paragraphs.
- Accessibility and browser QA checklist.
- Version number and short change log for the shared system.

## Active pages

The shared system is connected to:

- `index.html`
- `solutions-v3.html`
- `development.html`
- `production.html`
- `bms.html`
- `about.html`
- `contact.html`
- `product.html`

`index.html` remains the visual homepage reference. Versioned alternatives such as `index-v3.html` and `solutions-v2.html` are design experiments and are intentionally not migrated until selected for production.
