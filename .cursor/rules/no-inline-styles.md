# No Inline Styles Rule

## Rule
Never create HTML pages with inline `<style>` blocks. Always extract CSS to separate stylesheet files.

## Why
- Keeps HTML clean and focused on structure
- CSS files can be cached independently
- Easier to maintain and update styles
- Follows project convention of modular structure (HTML = layout, CSS = design, JS = logic)

## What to do instead
1. Create a new CSS file for page-specific styles (e.g., `hub.css`, `compare.css`)
2. Link it in the `<head>` after `landing.css`
3. Reuse existing CSS files when styles are shared across pages

## Existing CSS files
- `landing.css` — Core styles shared across all pages
- `udemy.css` — Platform page styles (hero eyebrow, breadcrumbs, etc.)
- `teachable.css` — Teachable-specific overrides
- `hub.css` — Platform hub/directory page styles
- `compare.css` — Comparison page styles
- `privacy.css` — Privacy page styles
- `onboarding.css` — Onboarding page styles
- `popup.css` — Extension popup styles
