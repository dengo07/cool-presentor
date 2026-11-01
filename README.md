# Cool Presentor

**Write the content. Get a designed, animated PowerPoint.**

Cool Presentor is a desktop app where you never push boxes around. You type what you want to say (titles, bullets, numbers, charts, quotes, timelines…) and the app picks a layout, applies a curated theme and exports a real, editable `.pptx`. That file includes native **Morph transitions**, gradient text, embedded fonts and editable charts.

## The workflow

1. **Write.** Use the block editor (right panel), or switch to **Outline** mode and type the whole deck as text:
   ```
   ^ Introducing
   # Decks that make people say *wow*
   ## Write the content, get a designed deck

   # By the numbers
   = 73% | of time spent formatting
   = 10× | faster with Cool Presentor
   ```
   Wrap a word in `*asterisks*` to highlight it in the theme's accent colour (gradient text on some themes); `**double**` makes it bold.
2. **Design happens automatically.** Each slide gets the best of about 22 layouts for its content. Neighbouring slides are varied. Click a layout chip or press **Shuffle** (`Ctrl+L`) to try others.
3. **Theme** (`Ctrl+T`). Ten curated themes, each previewed on *your* slides. The **Customize** tab adjusts each deck separately:
   - background colour, with an optional soft gradient
   - text colour
   - three accent colours, from ready-made palettes or **from your photos**
   - heading and body fonts, plus heading weight
   - corner radius and decoration style

   Derived colours (highlights, chart colours, card lines, muted text) follow automatically. Contrast warnings flag hard-to-read combinations.
4. **Duplicate & morph** (`Ctrl+D`). This duplicates a slide into a new layout. Because the elements keep their identity, PowerPoint's Morph animates between the two.
5. **Present** (`F5`) right in the app, with the same morph-style animation, or **Export .pptx** (`Ctrl+E`).
6. **AI (optional).**
   - **Generate** writes a whole deck from a brief.
   - The slide **AI** menu punches up, shortens or "makes visual" a slide.
   - The wand buttons rewrite a single block.
   - **Settings** writes speaker notes for every slide.

## Why the decks look good

- **Design system, not templates.** Themes define type scale, font pairing, palette, card style and decorations. Layouts only arrange content blocks.
- **Morph everywhere.** Each slide carries persistent objects: the background, three decorative shapes (glows, orbs, blocks) and the title. They share `!!`-prefixed names, so PowerPoint Morph glides and recolours them between slides automatically.
- **Native everything.** Text stays editable. Charts are native PowerPoint charts. Icons are embedded as SVG with PNG fallbacks. Gradients are real `gradFill`s, and the fonts (all OFL licensed) are embedded in the file.
- **WYSIWYG fitting.** One layout engine produces a *scene* (positioned primitives in inches). The same scene renders the in-app preview and the `.pptx`, and text is auto-fitted using canvas measurement of the same fonts.

## Development

```bash
npm install
npm run dev          # launch the app with hot reload
npm test             # unit tests + exports every theme to tests/output/*.pptx
npm run typecheck
npm run dist         # package (AppImage on Linux, dmg on macOS, nsis on Windows)
```

AI features need an Anthropic API key. Paste it in **Settings** (stored encrypted with Electron `safeStorage`), or set `ANTHROPIC_API_KEY`. They use Claude Opus 5.5 with structured outputs and server-side refusal fallbacks (`fallbacks: "default"`).

### Architecture

```
src/core/            pure TypeScript, no DOM – shared by app, exporter and tests
  model.ts           deck / slide / block schema (zod)
  themes.ts          the 9 themes
  layout/            engine (auto-layout + variety), layouts, block renderers, morphing decorations
  scene.ts           positioned primitives – the single source of truth
  export/pptx.ts     scene → PptxGenJS, then XML post-processing (postprocess.ts):
                     morph transitions, gradients, rounded images, bullet colours, font embedding
  outline.ts         outline-mode text ⇄ slides
  ai-schema.ts       structured-output schema for Claude + conversion to blocks
src/main/            Electron main: windows, menus, file dialogs, autosave, Claude calls
src/preload/         typed IPC bridge (window.api)
src/renderer/        React UI: slide strip, live stage, block inspector, outline, themes, present mode
```

**Dev harness.** `CP_SNAPSHOT=shot.png [CP_SNAPSHOT_STEPS=steps.json] npx electron .` launches the built app, runs scripted steps (`[{ "js": "...", "wait": 500, "shot": "a.png" }]`), saves screenshots and quits. `window.__cp` exposes the stores for scripting.

### Known limitations

- **LibreOffice** ignores Morph (it plays the fade fallback) and embedded fonts. Use PowerPoint 2019+ or Microsoft 365 for the full effect.
- **Outline mode** shows charts, images, features, timelines and comparisons as `[[type id]]` references. Edit those blocks in the visual editor.
