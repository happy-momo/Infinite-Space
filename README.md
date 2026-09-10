# 🪐 Infinite Space

> An **AI-powered infinite canvas** for collecting, connecting, and storytelling — your thoughts, images, and links live on one boundless surface, organized by you, assisted by any LLM you bring.

[English](README.md) · [中文](README.zh-CN.md)

<p align="center">
  <a href="#-features"><strong>Features</strong></a> ·
  <a href="#-quick-start"><strong>Quick Start</strong></a> ·
  <a href="#-user-guide"><strong>User Guide</strong></a> ·
  <a href="#-development--extending"><strong>Extend</strong></a> ·
  <a href="#-http-api"><strong>API</strong></a> ·
  <a href="#-contributing"><strong>Contributing</strong></a>
</p>

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D%2020-green.svg)
![Stack](https://img.shields.io/badge/stack-React%2019%20%E2%80%A2%20Vite%206%20%E2%80%A2%20Express-blueviolet)
![PRs](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)

---

**Infinite Space** turns a blank browser tab into a thinking playground: drop **text, images, and links** anywhere on a seamless infinite canvas, connect them into a web of ideas, organize them across **multiple pages**, and let an **LLM of your choice** declutter the board or weave it into a narrative — in one click.

- **Bring your own LLM** — works with any OpenAI-compatible endpoint (Zhipu GLM, OpenAI, DeepSeek, Groq, OpenRouter, Ollama…). Your API key is stored server-side and **never exposed to the browser**.
- **AI that understands your board** — *AI Organize* groups related nodes and lays them out with labeled clusters; *AI Story* summarizes the whole board into a coherent storyline node you can regenerate in different styles.
- **Local-first** — your canvas lives in your browser's localStorage; an optional Express backend adds server persistence, LLM proxying, and link-metadata enrichment.

---

## ✨ Highlights

| | |
|---|---|
| 🗺️ **Boundless canvas** | Smooth pan/zoom (Space+drag, middle mouse, scroll), minimap, fit-to-content |
| 📝 **Rich text nodes** | Double-click to edit, inline bold, font family + size picker, storybook prose rendering |
| 🖼️ **Image nodes** | Paste/upload images; automatic compression to WebP ≤1600px so the canvas stays fast |
| 🔗 **Link cards** | Smart cards with display text + URL; **auto-fetch title & favicon** from the target page |
| ⛓️ **Connections** | Draw links between any nodes with a dedicated linking tool |
| 🗂️ **Multiple pages** | Tabbed workspaces — separate canvases, each with its own nodes, edges and viewport |
| ✨ **AI Organize** | LLM clusters related items and applies a clean, labeled layout; board auto-fits viewport |
| 📖 **AI Story** | Turns the whole board into a storyline; regenerate in styles like *detailed*, *concise*, *storyteller*, *formal*, *English* — or add your own instruction |
| 🧠 **BYO-LLM** | Any OpenAI-compatible model; configure in-app, test connectivity, key stored masked server-side |
| ↩️ **Undo / Redo** | Full history for every operation (drags, edits, deletes, AI actions) |
| ⌨️ **Keyboard-first** | Shortcuts for undo/redo, copy/paste, delete, nudge, pan, marquee |
| 💾 **Export / Import** | Complete board (pages + nodes + edges + viewports) as one portable JSON file |
| 🌙 **Dark mode** | One-click theme, remembered across sessions |

## 📸 Screenshots

> *Drop a few screenshots here — a wide shot of a busy board, the AI Organize before/after, and dark mode. A good first screenshot is the single best thing you can do for this project.*

```
┌──────────────────────────────────────────────────────────────┐
│  [Toolbar: T · 🖼 · 🔗 | ⛓ · ↩ · ↪ | ✨ Organize · 📖 Story] │
│                                                              │
│        ┌──────────┐        ┌─────────────┐                   │
│        │ Ideas…   │────────│  Links…     │   [ minimap ]     │
│        └──────────┘        └─────────────┘   [ viewport ]    │
│   ┌────────────────┐                                        │
│   │ AI Story: …     │   [ + New page 1 · 2 · 3 ]             │
│   └────────────────┘                                        │
└──────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

**Requirements:** [Node.js](https://nodejs.org) **≥ 20** (Tailwind CSS 4 requires it; Node 22 recommended).

```bash
git clone https://github.com/happy-momo/Infinite-Space.git
cd Online-idea-dashboard
npm install

# Start the dev server (frontend + API, auto-reload)
npm run dev
```

Open **http://127.0.0.1:3000** — the canvas is fully usable immediately. To unlock the AI features, click **⚙️ Settings**, pick a provider preset (or paste your Base URL / model), enter your API key, and hit **Test connection** — then **Save**.

> 🐢 *If `npm install` fails on an older system Node, use `nvm install 22 && nvm use 22` first.*

### Production build

```bash
npm run build   # bundles the frontend + server into dist/
npm start       # serve everything on http://127.0.0.1:3000
```

## 🐳 Docker Deployment

A multi-stage `Dockerfile` (Node 22, Alpine), `.dockerignore`, and `docker-compose.yml` are included — everything runs in **one container** (the Express server serves the built React frontend) with the `data/` folder persisted on a volume.

**Requirements:** [Docker](https://www.docker.com/products/docker-desktop/) with Compose.

```bash
docker compose up -d      # build + start
# Open http://localhost:3000

docker compose logs -f    # view logs
docker compose down       # stop (data stays in the volume)
```

Or without Compose:

```bash
docker build -t infinite-space .
docker run -d -p 3000:3000 \
  -e HOST=0.0.0.0 \
  -v infinite-space-data:/app/data \
  infinite-space
```

**Notes**

- The image already sets `HOST=0.0.0.0` and `NODE_ENV=production`, so it listens on all interfaces and serves the static build. `PORT` (default `3000`) and `HOST` can be overridden via env.
- Data (canvas state + LLM config, including API keys) lives in the **named volume** `infinite-space-data` mounted at `/app/data`; it is never baked into the image. To reuse an existing local `data/` directory instead, change the volume line in `docker-compose.yml` from `- infinite-space-data:/app/data` to `- ./data:/app/data`.
- The container runs as a non-root `app` user with restrictive file permissions (`0600`/`0700`) on `data/`.
- Because the bundled server references `vite` at import time, the runtime image installs the full dependency set (it cannot use `--omit=dev`).

## 🧭 User Guide

### Canvas basics

- **Pan** — hold `Space` and drag, drag with the **middle mouse**, or drag with a finger (touch).
- **Zoom** — mouse wheel, or the **＋ / − / fit / 100%** controls in the bottom-right corner.
- **Select** — click a node; hold `Shift`/`Cmd` to multi-select. **Marquee**: drag on empty canvas space.
- **Nudge** — arrow keys move the selection (hold `Shift` for 4× speed).

### Node types

| Node | How to create | What it does |
|---|---|---|
| **Text** | Toolbar `T` | Rich text. **Double-click** to edit; `Enter` saves, `Shift+Enter` inserts a new line. Style with bold, font family (微软雅黑 / 苹方 / 宋体 / 楷体 / Serif / Mono) and font size. |
| **Image** | Toolbar `🖼` | Upload an image; it is **auto-compressed to WebP (≤1600px)** before saving, so base64 payloads stay small. |
| **Link** | Toolbar `🔗` | A smart link card with display text + URL. On save, the server **best-effort fetches the page's title & favicon** to enrich the card. |

### Connections

Click the **⛓ Link** tool, then click the **source** node, then the **target** node — a connection line appears. Connections matter: **AI Story reads them** so the narrative follows the real structure of your board.

### AI features

Both features use the LLM configured in **⚙️ Settings** and run **server-side** (your key never reaches the browser).

- **✨ AI Organize** — one click. The LLM clusters related nodes, and the app lays each cluster out in a clean grid with an **auto-generated group label**, then fits the viewport so you see everything.
- **📖 AI Story (总结)** — summarizes the current board + its connections into a narrative and drops a highlighted **storyline text node** on the canvas. Afterward a floating bar lets you **regenerate** it in a style — 详细 / 简洁 / 讲故事 / 正式 / English — or append your own instruction (e.g. *“突出 lilei 的贡献”*). The story node itself is excluded from the prompt, and the model is prompted to **never invent facts or relationships**.

### Keyboard shortcuts

| Action | Shortcut |
|---|---|
| Undo / Redo | `Ctrl/Cmd+Z` · `Ctrl/Cmd+Shift+Z` or `Ctrl/Cmd+Y` |
| Copy / Paste | `Ctrl/Cmd+C` · `Ctrl/Cmd+V` |
| Delete selected | `Delete` / `Backspace` |
| Nudge selection | `↑ ↓ ← →` (hold `Shift` for 4×) |
| Pan | `Space` + drag / middle mouse / touch |
| Zoom | Mouse wheel |

*(Shortcuts are ignored while you're typing — including during Chinese IME composition.)*

## ⚙️ Configuration

### In-app LLM settings (recommended)

Click **⚙️ Settings** → configure **Base URL / Model / API Key** (presets included for OpenAI, DeepSeek, Groq, OpenRouter, Ollama). The key is saved to `data/llm-config.json` on the server with **0600 permissions**; the browser only ever sees a masked hint (`sk-****abc1`). Leaving the key field empty on save keeps the existing key.

### Server environment variables

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address. Set `0.0.0.0` to allow LAN access from other devices |

LLM configuration does **not** need environment variables.

### Data & privacy

- **Board data is local-first**: stored in the browser's localStorage, and mirrored to `data/state.json` on the server (debounced) so refresh / restart never loses work.
- **Secrets never ship to the client**: API keys live in `data/llm-config.json` only. `data/` is git-ignored and written with restrictive permissions.

## 🔌 HTTP API

The Express server (default `http://127.0.0.1:3000`) exposes a small JSON API:

| Method | Route | Description |
|---|---|---|
| `GET` / `POST` | `/api/data` | Read / write the persisted board state |
| `GET` / `POST` | `/api/settings` | Read (masked) / update the LLM config |
| `POST` | `/api/llm/test` | Test an (optionally unsaved) provider connection |
| `POST` | `/api/organize` | Group + layout the board via the configured LLM |
| `POST` | `/api/summarize` | Summarize the board into a storyline (`style`, `instruction` supported) |
| `GET` | `/api/linkinfo?url=…` | Best-effort title/favicon fetch for link enrichment |

## 🏗️ Project Structure

```
├── src/                     # React 19 frontend
│   ├── App.tsx              # canvas state, history, shortcuts, AI actions
│   ├── components/          # CanvasNode, Toolbar, Minimap, EdgeLayer, SettingsModal,
│   │                        # StoryControls, ViewportControls, CanvasListItem
│   ├── hooks/useHistory.ts  # undo/redo snapshot stack
│   ├── data.ts / types.ts   # seed data & shared types
│   └── index.css            # Tailwind 4 + dark-mode variant
├── server/                  # Express backend
│   ├── llm.ts               # OpenAI-compatible client, prompts, sanitize, grouping
│   └── storage.ts           # atomic JSON persistence (state + llm config)
├── server.ts                # route wiring + dev (Vite) / prod (static) serving
├── docs/superpowers/specs/  # design docs
└── package.json
```

## 🛠️ Development & Extending

The project is deliberately small and dependency-light: **React + Vite + Tailwind** on the client, **Express** on the server, **no database** — persistence is JSON files + localStorage.

### Architecture at a glance

1. **State** lives in `App.tsx` (`nodes`, `edges`, `pages`). Every mutation goes through `setNodes`/`setEdges`; operations are wrapped with `beginTransaction()` so `useHistory` can undo/redo them as units.
2. **Canvas input** is handled in `App.tsx` (`onPointerDownCanvas`, marquee, pan, zoom) and per-node in `CanvasNode.tsx` (drag, resize, edit).
3. **AI actions** are thin: `App.tsx` sends `{ nodes, edges }` to a route, and `server/llm.ts` builds the prompt, calls any OpenAI-compatible endpoint, and sanitizes the output before it returns.

### Add a new node type

1. Extend `NodeType` in `src/types.ts`.
2. Add a toolbar button in `src/components/Toolbar.tsx` that calls `onAdd('yourType')`.
3. Render the new body in `CanvasNode.tsx` (mirror the existing `text` / `image` / `link` branches).

### Add a new AI action

1. Add a prompt + function in `server/llm.ts` (reuse `callLlm` for the transport and `sanitizeText` for the output).
2. Register a route in `server.ts`.
3. Call it from a new button in `App.tsx` — send the **current** board via `stateRef.current` (see `handleAiSummarize` for the flush-commit pattern).

### Swap or add an LLM provider

The client speaks **one protocol** — OpenAI-compatible `POST {baseUrl}/chat/completions` with a Bearer key. Any provider that implements it (Zhipu GLM, OpenAI, DeepSeek, Groq, OpenRouter, Ollama, …) works by adding a preset in `SettingsModal.tsx` — no code changes to the AI logic.

### Quality checks

```bash
npm run lint   # TypeScript strict check
npm run build  # full production build (frontend + server)
```

## 🗺️ Roadmap

- [ ] Shareable boards (public links / read-only view)
- [ ] Real-time collaboration
- [ ] More node types (Kanban columns, mind-map branches, embedded notes)
- [ ] AI templates & richer story styles
- [ ] Offline PWA + cloud sync
- [ ] GitHub Actions CI (lint + build + auto-deploy)

*Have an idea? Open an issue or a PR — this roadmap is a conversation, not a contract.*

## 🤝 Contributing

Contributions of all kinds are welcome — bug reports, UI polish, docs, translations, and features.

1. Fork the repo and create a branch: `git checkout -b feat/my-feature`
2. Make your changes and verify: `npm run lint && npm run build`
3. Open a pull request with a clear description of *what* and *why*.

Please follow the existing code style and keep PRs focused. For larger changes, open an issue first so we can align on the approach.

## 📄 License

[MIT](LICENSE) — use it, fork it, build on it.

---

<p align="center">
  Enjoying Infinite Space? Give it a ⭐ to help more people find it, and open an issue to tell us what to build next. <br/>
  <sub>Built with ❤️.</sub>
</p>
