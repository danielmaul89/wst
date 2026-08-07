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
