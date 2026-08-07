# WS Technicals website instructions

Read `DESIGN-SYSTEM.md` before editing any page.

## Required rules

- Treat `assets/styles/wst-design-system.css` as the visual source of truth.
- Treat `assets/styles/enterprise-polish.css` as the shared motion and glass layer.
- Treat `assets/scripts/wst-shell.js` as the only source for navigation and footer markup on migrated pages.
- Use the existing tokens and shared components; do not create near-duplicate colours, font sizes, spacing values, buttons, navigation or footer styles.
- Keep page-local CSS limited to unique page sections.
- Use the typography scale `14, 16, 24, 32, 40, 48, 56, 64px`.
- Use `.container` for alignment.
- Use the existing `data-wst-header` and `data-wst-footer` placeholders; do not copy navigation or footer markup back into individual pages.
- Preserve WCAG AA contrast, keyboard focus and reduced-motion support.
- Do not alter unrelated working-tree changes.
- Verify `index.html` and `solutions-v3.html` after shared-style changes.

When a requested change affects multiple pages, change the shared stylesheet rather than patching each HTML file separately.
