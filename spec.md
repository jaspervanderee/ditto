# Ditto Project Specification

> **Purpose of this file:** Comprehensive project context for AI assistants and future development sessions. This is the single source of truth for understanding the Ditto project.

---

## 1. Vision & Core Philosophy

**Brand Essence:** A privacy-first, local-only browser utility for the "Sovereign Individual."

**The "Sovereign" Advantage:** Unlike cloud-based tools (NoteGPT, Tactiq, YouTube-Transcript.io), Ditto operates 100% locally. The user is the driver, not the product.

**Core Values:**
- **Privacy:** No cloud processing. Data never leaves the browser tab.
- **Zero Friction:** No accounts, no logins, no "Sign in with Google."
- **Value-for-Value (V4V):** Monetized via Lightning Network/Nostr zaps instead of data harvesting.
- **Open Source:** MIT-licensed. "Don't trust, verify."

**Domain:** `https://dittotranscriptgenerator.com/`

**Author:** Jasper van de Ree
- Website: jaspervanderee.com
- Nostr: npub165w944kqt29hrt90l2ssc0rvmhf0u77dgezskknfnczr7r030v0s2g6kae
- Lightning Address: flaxhorse13@primal.net

---

## 2. Technical Architecture

### 2.1 Browser Extension (Chrome MV3)

**Manifest Version:** 3

**Permissions:**
- `activeTab` — Read current page when user clicks
- `scripting` — Inject content script on demand
- `clipboardWrite` — Copy extracted transcript
- `offscreen` — Theme detection for dynamic icon switching

**Core Files** (all in `extension/` folder):

| File | Purpose |
|------|---------|
| `manifest.json` | Extension configuration |
| `background.js` | Service worker for icon theme switching (dark/light mode detection via offscreen document) |
| `content.js` | Main extraction engine—platform detection and transcript scraping |
| `popup.html/js/css` | Minimal popup UI showing extraction status (Working → Success/Error) |
| `offscreen.html/js` | Hidden document for `matchMedia` theme detection |
| `onboarding.html/js/css` | First-run welcome page explaining the tool |
| `icons/` | Extension icons (all size/theme variants) |

### 2.2 Transcript Extraction Methods

Ditto uses a **heuristic engine** that automatically detects the optimal extraction method:

| Method | Description | Platforms |
|--------|-------------|-----------|
| **DOM Scraper** | Reads caption elements directly from the page DOM | YouTube, Udemy |
| **VTT Ripper** | Fetches raw VTT subtitle track files directly from `<track>` elements | Rumble, Coursera |
| **Metadata Master** | Extracts transcript from JSON-LD metadata embedded in page | Kajabi, Wistia-hosted platforms |
| **Generic Heuristic** | Scans for "Show Transcript" buttons and timestamp-rich containers | Teachable, Circle.so, other platforms |

**Key Processing Features:**
- Automatic timestamp removal (`00:15`, `1:23:45`)
- Intelligent paragraph reconstruction (5 sentences per paragraph)
- VTT tag stripping (`<c>`, `<v Speaker>`)
- Viewport-aware video detection for multi-video pages (Wistia)

### 2.3 Platform-Specific Scrapers

**YouTube (`youtube.com`):**
- Opens transcript panel via multiple fallback methods (description button, expand description, "More actions" menu)
- Uses `MutationObserver` to wait for panel to populate
- Extracts from `ytd-transcript-segment-renderer` elements

**Udemy (`udemy.com`):**
- Toggles transcript panel via `data-purpose="transcript-toggle"` button
- Extracts from `data-purpose="cue-text"` elements
- Handles already-open panel state

**Coursera (`coursera.org`):**
- Prefers VTT track extraction from `<track kind="captions">`
- Fallback to sidebar transcript panel (`.rc-Transcript`)

**Rumble (`rumble.com`):**
- Direct VTT fetch from `<track>` elements
- Prefers English tracks

**Wistia (Kajabi, Teachable, custom sites):**
- Identifies active video via viewport visibility scoring
- Scans JSON-LD for transcript field
- Fallback: Direct VTT fetch from `fast.wistia.com/embed/captions/{id}.vtt`
- Fallback: DOM scraping of `.w-transcript-line` elements
- Fallback: Shadow DOM traversal

---

## 3. Website Architecture & SEO Strategy

### 3.1 Hub-and-Spoke Model

The site is built to maximize authority and capture search intent.

**A. The Core Hubs:**
- `index.html` — Targets "YouTube Transcript Generator" (highest volume keyword). Main landing page with comparison table, platform grid, privacy section, FAQ.
- `video-transcript-generator.html` — Universal hub/directory of 100+ supported platforms. Targets "Video Transcript Generator."

**B. Platform Spoke Pages:**
Each platform has a dedicated page with how-to guide, FAQ, and HowTo schema markup.

| File | Target Platform |
|------|-----------------|
| `udemy-notes-extractor.html` | Udemy |
| `coursera-transcript-extractor.html` | Coursera |
| `teachable-transcript-extractor.html` | Teachable |
| `kajabi-transcript-extractor.html` | Kajabi (Wistia) |
| `rumble-transcript-generator.html` | Rumble |

**C. Use Case Silos:**
Persona-targeted pages optimizing for intent:

| File | Persona | Messaging |
|------|---------|-----------|
| `transcripts-for-students.html` | Students | "Turn lectures into exam-ready notes" — Workflow: Capture → Clean → Notion/Obsidian |
| `transcripts-for-creators.html` | Creators | "High-velocity content repurposing" — Workflow: Capture → Clean → AI Refinery (Claude/ChatGPT) |
| `transcripts-for-high-agency.html` | High-Agency Thinkers | "Intellectual asset management" — Workflow: Capture → Clean → Synthesis tools (Perplexity/Tana) |
| `transcripts-for-sovereign-individuals.html` | Sovereign Individuals | "Permissionless research" — Workflow: Capture → Clean → Local Processing (Ollama/PrivateGPT) |

**D. Rivalry/Interception Pages:**
Comparison pages targeting competitor keywords:

| File | Battle |
|------|--------|
| `ditto-vs-notegpt.html` | "Local vs. Cloud" — Privacy focus |
| `ditto-vs-tactiq.html` | "Invisible vs. Intrusive" — Minimal permissions |
| `ditto-vs-youtube-transcript-io.html` | "Unlimited vs. Token Tax" — No usage limits |

**E. Supporting Pages:**
- `privacy.html` — Privacy Promise page explaining no data collection
- `onboarding.html` — Extension first-run experience

### 3.2 SEO Schema Markup

Each page includes appropriate JSON-LD schema:
- `FAQPage` — For FAQ sections
- `SoftwareApplication` — For the extension
- `BreadcrumbList` — Site navigation
- `Organization` — Brand/author info
- `HowTo` — Step-by-step workflows on use case pages

---

## 4. Design System

### 4.1 Visual Identity

**Aesthetic:** Retro-future/Cyberpunk (Scanlines, grid floors, gradient suns)

**Color Palette:**
```css
--yellow: #ffff8a           /* Primary accent, represents "shining light on hidden data" */
--yellow-dim: rgba(255, 255, 138, 0.6)
--dark-blue: #1b0159        /* "Vault of privacy" */
--dark-blue-light: #2a0a7a
--black: #000000
--white: #ffffff
--white-dim: rgba(255, 255, 255, 0.7)
--white-faint: rgba(255, 255, 138, 0.12)
```

**Typography:**
- `Outfit` — Primary sans-serif (headings, body)
- `JetBrains Mono` — Monospace for code, terminal-style elements

### 4.2 Key UI Components

- **Scanlines overlay** — Fixed CRT effect across all pages
- **Hero background** — Grid floor with perspective transform + gradient sun
- **Comparison table** — Cloud vs. Ditto feature comparison
- **Before/After split view** — Demonstrates timestamp removal and paragraph formatting
- **Platform cards** — Logo, title, description, "View Guide" link
- **FAQ accordion** — Native `<details>` elements with single-open behavior
- **Lightning modal** — QR code and Lightning address for V4V support
- **Ghost browser animation** — Hero demo showing extension workflow

### 4.3 CSS File Structure

**Website CSS** (`website/`):
| File | Purpose |
|------|---------|
| `landing.css` | Core styles shared across all pages (design tokens, reset, hero, sections) |
| `hub.css` | Platform hub/directory styles |
| `udemy.css` | Platform page styles (breadcrumbs, hero eyebrow) |
| `teachable.css` | Teachable-specific overrides |
| `coursera.css` | Coursera-specific overrides |
| `kajabi.css` | Kajabi-specific overrides |
| `rumble.css` | Rumble-specific overrides |
| `compare.css` | Comparison page styles |
| `privacy.css` | Privacy page styles |

**Extension CSS** (`extension/`):
| File | Purpose |
|------|---------|
| `popup.css` | Extension popup styles |
| `onboarding.css` | Extension first-run page styles |

**CSS Convention:** Mobile-first, no frameworks, no inline styles. Each page links `landing.css` first, then page-specific CSS.

---

## 5. File Structure Reference

```
app/
├── extension/              # Chrome extension (zip this folder for Web Store)
│   ├── manifest.json
│   ├── background.js       # Service worker (theme detection)
│   ├── content.js          # Transcript extraction engine
│   ├── popup.html/js/css   # Extension popup UI
│   ├── offscreen.html/js   # Theme detection helper
│   ├── onboarding.html/js/css  # Extension welcome page
│   └── icons/              # Extension icons (16/32/48/128, light/dark/bg variants)
│
├── website/                # Website files (deploy this folder to hosting)
│   ├── index.html          # Main landing page
│   ├── video-transcript-generator.html  # Universal platform hub
│   ├── privacy.html        # Privacy policy page
│   │
│   ├── udemy-notes-extractor.html       # Platform pages
│   ├── coursera-transcript-extractor.html
│   ├── teachable-transcript-extractor.html
│   ├── kajabi-transcript-extractor.html
│   ├── rumble-transcript-generator.html
│   │
│   ├── transcripts-for-students.html     # Use case pages
│   ├── transcripts-for-creators.html
│   ├── transcripts-for-high-agency.html
│   ├── transcripts-for-sovereign-individuals.html
│   │
│   ├── ditto-vs-notegpt.html             # Comparison pages
│   ├── ditto-vs-tactiq.html
│   ├── ditto-vs-youtube-transcript-io.html
│   │
│   ├── landing.css         # Core shared styles
│   ├── landing.js          # Landing page interactivity
│   ├── hub.css             # Hub page styles
│   ├── udemy.css           # Platform page base styles
│   ├── compare.css         # Comparison page styles
│   ├── [other CSS files]
│   │
│   ├── icons/              # Favicon icons
│   ├── images/             # Site images, logos, SVG assets
│   │
│   ├── robots.txt
│   ├── sitemap.xml
│   └── .htaccess           # Apache redirect/caching config
│
├── spec.md                 # Project documentation (this file)
├── README.md               # GitHub readme
└── LICENSE                 # MIT License
```

**Deployment Notes:**
- **Website:** Upload the entire `website/` folder contents to your hosting root
- **Extension:** Zip the `extension/` folder contents for Chrome Web Store submission

---

## 6. Key Assets

### 6.1 Icons

Both `extension/icons/` and `website/icons/` contain the same icon set.

Three variants for each size (16, 32, 48, 128):
- `icon{size}-light.png` — For light system theme (dark icon)
- `icon{size}-dark.png` — For dark system theme (light icon)
- `icon{size}-bg.png` — With background (favicon, social)

### 6.2 Images (`website/images/`)

**Logos:**
- `ditto-transcript-logo-yellow.svg` — Main site logo
- Platform logos (YouTube, Udemy, Coursera, etc.)
- AI tool logos (ChatGPT, Claude, Gemini, Perplexity, Ollama)
- Note-taking app logos (Notion, Obsidian, Logseq, etc.)

**Icons:**
- `checkmark.svg`, `cross.svg` — Feature comparison
- `arrow.svg`, `click.svg`, `clipboard.svg` — Process steps
- `cloud.svg` — Cloud competitor representation
- `ditto-*.svg` — Privacy, security, open-source, speed icons

**Social:**
- `ditto-transcript-generator-social.png` — Open Graph image (1200x630)
- `jasper-van-de-ree.webp` — Creator photo for footer

---

## 7. Competitive Differentiators

| Feature | Cloud Tools (NoteGPT, Tactiq) | Ditto |
|---------|-------------------------------|-------|
| Processing | Server-side | 100% local |
| Privacy | Data sent to cloud | Zero data leaves browser |
| Account | Required | None |
| Pricing | Freemium/subscription | Free forever (V4V optional) |
| Platform Access | Public URLs only | Works on gated content (Udemy, Kajabi) |
| Formatting | Raw timestamps | Clean paragraphs, no timestamps |
| Source | Closed | MIT open source |

---

## 8. Development Notes

### 8.1 Current Status
- Website is complete with all major pages built
- Extension core functionality is complete
- Extension published to Chrome Web Store (download URL: `https://chromewebstore.google.com/detail/ditto/dleoedkgocakdfeblljodfpgfkbgjkhm`)
- Extension files are in `extension/` folder, website files in `website/` folder

### 8.2 Known Patterns

**HTML Structure:**
- All pages use consistent structure: scanlines overlay → hero section → content sections → footer
- Hero includes fixed logo, headline, tagline, CTA, and visual guide
- Footer includes creator section, footer grid with links, and bottom bar

**CSS Patterns:**
- Use CSS custom properties (`var(--yellow)`, etc.) for theming
- Mobile-first breakpoints
- `clamp()` for responsive typography
- BEM-ish class naming (`.hero-headline`, `.platform-card`, `.faq-item`)

**JS Patterns:**
- `content.js` uses IIFE pattern, returns Promise
- Platform detection via `window.location.hostname`
- `MutationObserver` for async DOM waiting
- Status communication via `chrome.runtime.sendMessage`

### 8.3 Development Rules (from `.cursor/rules/`)

- **No inline styles:** Always use external CSS files
- See `landing.css` for available design tokens
- When adding new page types, create dedicated CSS file and link after `landing.css`

---

## 9. Quick Reference: Adding New Pages

All website pages are in the `website/` folder.

### Platform Page
1. Copy `website/udemy-notes-extractor.html` as template
2. Update meta tags, canonical URL, schema markup
3. Link appropriate CSS (`landing.css` + `udemy.css` or new file)
4. Update breadcrumb navigation
5. Add to `website/sitemap.xml`
6. Add footer link in all pages

### Use Case Page
1. Copy `website/transcripts-for-students.html` as template
2. Define persona, messaging, and 3-step workflow
3. Add HowTo schema markup
4. Include AI tool grid relevant to persona

### Comparison Page
1. Copy `website/ditto-vs-notegpt.html` as template
2. Update competitor-specific claims
3. Include FAQ schema with common questions
4. Focus on Ditto's advantage (privacy, gated access, unlimited)

---

## 10. Future Considerations

- **Chrome Web Store publication** — Update download URL across all pages once published
- **Real testimonials** — Replace placeholder quotes with verified Nostr/X testimonials
- **GitHub integration** — Link to actual repo once public (currently placeholder)
- **Analytics** — Consider privacy-respecting analytics (Plausible, Umami) if desired
- **Additional platforms** — Circle.so, Vimeo, Skillshare scrapers if needed
- **Internationalization** — Language detection for non-English VTT tracks

---

*Last updated: January 2026*
