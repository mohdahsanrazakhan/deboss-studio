# Text Deboss Studio

Press any text into premium textured paper. A canvas-based debossed / letterpress text generator built with Next.js 15, React 19, and TypeScript — works beautifully with Urdu, Arabic, Hindi, English, and more. Text direction (RTL/LTR) is detected automatically as you type.

Type your text, tune the engraving (depth, shadow, highlight, edge blur, paper grain, font size), pick a font, alignment, and paper tone — or apply a one-click preset — then export a high-resolution PNG or copy it straight to the clipboard. The exported PNG is pixel-identical to the live preview because both go through the same render path. The default sample text is Urdu (`بسمِ اللہ`), reflecting the app's origin.

## Quick start

```bash
cp .env.example .env.local   # set NEXT_PUBLIC_SITE_URL for production
npm install
npm run dev                  # http://localhost:3000
```

## Scripts

| Command             | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Start the dev server with Fast Refresh         |
| `npm run build`     | Production build (includes lint + typecheck)   |
| `npm run start`     | Serve the production build                     |
| `npm run lint`      | ESLint (next/core-web-vitals + TypeScript)     |
| `npm run typecheck` | `tsc --noEmit` under strict mode               |

## Project structure

```
src/
├── app/                    # App Router: layout, page, SEO routes
│   ├── layout.tsx          # Metadata, fonts, JSON-LD, viewport
│   ├── page.tsx            # Server-rendered shell
│   ├── globals.css         # Design tokens + all UI styles
│   ├── robots.ts           # /robots.txt
│   ├── sitemap.ts          # /sitemap.xml
│   └── manifest.ts         # /manifest.webmanifest (PWA)
├── components/
│   ├── layout/Header.tsx   # Server component
│   └── studio/             # Client components (the app itself)
│       ├── Studio.tsx
│       ├── ControlPanel.tsx
│       └── PreviewStage.tsx
├── hooks/
│   └── useDebossStudio.ts  # All interactive state + render lifecycle
├── lib/deboss/
│   ├── engine.ts           # Framework-agnostic canvas rendering engine
│   └── constants.ts        # Defaults, presets, slider defs, paper tones
├── config/site.ts          # Single source of truth for SEO metadata
└── types/deboss.ts         # Domain types
```

## Documentation

- `CLAUDE.md` — orientation file for Claude Code (start here when using AI tooling)
- `docs/ARCHITECTURE.md` — how the rendering engine and React layer fit together
- `docs/FEATURES.md` — the complete feature inventory (parity checklist with the original app)
- `docs/SECURITY.md` — threat model, CSP, and header policy
- `docs/SEO-PLAN.md` — implemented SEO + roadmap
- `docs/CONTRIBUTING.md` — conventions and workflow
- `.claude/skills/text-deboss-engine/SKILL.md` — deep guide to the deboss engine for AI agents

## Requirements

Node.js ≥ 18.18. Fonts (Noto Nastaliq Urdu, Gulzar, Noto Naskh Arabic, Playfair Display, Noto Serif Devanagari, Inter) load from Google Fonts at runtime; the browser needs network access to fonts.googleapis.com and fonts.gstatic.com on first load. UI icons are [`lucide-react`](https://lucide.dev) components — never literal glyph characters.

## License

Private project. All rights reserved (update this section before open-sourcing).
