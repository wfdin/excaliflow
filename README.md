# ✏️ Excaliflow

**Hand-drawn diagrams with live animated flows.** Sketch out AI agents, RAG pipelines, or system architectures just like in Excalidraw, and watch data flow through your arrows in real time. Connect shapes, customize colors and sketch styles, and export a crisp 2x PNG or a 60fps video loop. Runs in a single HTML file with zero dependencies.

## Features

- **Hand-drawn look and feel.** Draw boxes, circles, decision diamonds, freehand sketches, and sticky notes using Excalidraw's hand-drawn fonts (`Excalifont`, `Virgil`, `Cascadia`) and sketch fills.
- **Live animated arrows.** Connect any two shapes and watch comets, pulses, neon streaks, or dashed streams travel along your arrows in order from start to finish.
- **Easy arrow editing.** Drag any arrow endpoint around the edge of a shape, pull the middle of an arrow to curve it, or double-click an arrow to straighten it.
- **Fast diagram building.** Press `Tab` or click a `+` port on any selected shape to add and connect the next step automatically, or drop a shape onto an existing arrow to split it in two.
- **Multi-canvas tabs & auto-save.** Work across multiple canvas tabs in the bottom tab dock or top-left canvas switcher—create new tabs (`+ New` / `+ Canvas`), fork/duplicate a diagram (`⧉`) to compare architectures side-by-side, step between tabs (`‹` / `›`), double-click to rename, and have every tab auto-saved to your browser.
- **Ready-made starter templates.** Load built-in diagrams for **AI Agent Swarm**, **RAG Pipeline**, **How Browsers Work**, and **Microservices** in one click.
- **Light & dark canvas + instant export.** Switch between a clean white canvas and a pitch-black neon canvas, then export a cropped 2x PNG, copy to clipboard, record a `.webm` video loop, or save and load `.excaliflow` / `.excalidraw` JSON files.

## How to Get Started

### Backend Golang & MySQL Database

Excaliflow supports persistence directly to a MySQL database using a high-performance Go backend.

1. **Database Configuration** (defaults match your local MySQL):
   - **Host:** `localhost`
   - **Port:** `3306`
   - **User:** `root`
   - **Password:** `12345678`
   - **Database:** `excaliflow`

   All settings live in the `.env` file at the project root and are loaded
   automatically on startup (no extra dependency required). If `.env` is
   missing, copy the template:

   ```sh
   # Windows PowerShell
   Copy-Item .env.example .env
   # macOS / Linux
   cp .env.example .env
   ```

   Then edit `.env`:

   ```env
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=12345678
   DB_NAME=excaliflow
   ```

   Real environment variables always take precedence over `.env`, and
   `ENV_FILE=/path/to/file` points the loader at a different env file. Other
   supported keys: `PORT`, `STATIC_DIR`, `JWT_SECRET`, `CORS_ORIGINS`.
   `.env` is git-ignored so local credentials never get committed.

2. **Run Server & Database Migrations**:
   The Go backend automatically checks and executes pending database migrations on startup:
   ```sh
   go run main.go
   # or using npm
   npm start
   ```

   To run migrations only without starting the HTTP server:
   ```sh
   go run main.go -migrate
   # or
   npm run migrate
   ```

3. Open **http://localhost:3000** in your browser. All canvas tabs and diagrams will be automatically synchronized with MySQL in real time.

### Multi-User Authentication & Diagram Management

Excaliflow now features a built-in multi-user authentication system:
- **Sign In / Create Account**: Click the `👤 Sign In` button in the top-right toolbar.
- **Passwords**: Securely hashed with `bcrypt`.
- **Session Tokens**: JWT authentication with 7-day validity.
- **Data Isolation**: Each user has their own private diagrams and canvas tabs isolated in MySQL.
- **Project Manager ("My Diagrams")**: Create named diagram projects, switch between multiple diagrams, or delete old ones.

API Endpoints:
- `POST /api/auth/register` — Register a new account (`username`, `email`, `password`, `fullName`).
- `POST /api/auth/login` — Sign in and receive a JWT token (`username`/`email`, `password`).
- `GET /api/auth/me` — Retrieve the currently authenticated user profile.
- `GET /api/workspace?id=...` — Load diagram workspace (filtered by authenticated user).
- `POST /api/workspace?id=...` — Save/update diagram workspace.
- `GET /api/workspaces` — List all diagrams belonging to the current user.
- `DELETE /api/workspace?id=...` — Delete a diagram project.

---

### Alternative: Node.js Static Server

You can also run the legacy static Node.js server:
```sh
npm run start:node
```

## Production Deployment

Deployment is split in two:

| Part | Host | Folder / setting |
| --- | --- | --- |
| Go API + MySQL | VPS via systemd | `/www/wwwroot/api-flow.wfdin.my.id` → `https://api-flow.wfdin.my.id` |
| Frontend (static) | Cloudflare Pages | `https://excaliflow.pages.dev` |

A ready-to-use unit file lives in [`deploy/excaliflow.service`](deploy/excaliflow.service);
the full walkthrough (build, upload, `.env`, MySQL, Nginx reverse proxy,
Cloudflare Pages build settings, log rotation, non-root user) is in
[`deploy/README.md`](deploy/README.md).

Backend:

```sh
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o excaliflow .
cp deploy/excaliflow.service /etc/systemd/system/excaliflow.service
systemctl daemon-reload && systemctl enable --now excaliflow
curl -s http://127.0.0.1:3000/api/health   # {"status":"ok","database":"connected"}
```

Because migrations are embedded in the binary (`//go:embed`) and the frontend
is hosted on Cloudflare Pages, the VPS only needs the `excaliflow` binary and
the `.env` file.

Frontend — the API origin is injected at build time, so Cloudflare Pages must
build with:

```sh
API_URL=https://api-flow.wfdin.my.id node build.js   # output: dist/
```

and the backend `.env` must allow that origin:

```env
CORS_ORIGINS=https://excaliflow.pages.dev
```

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `V` or `1` | Select, move, resize shapes, or bend arrows |
| `H` or `Space + Drag` | Pan around the canvas |
| `R` or `2` | Rectangle |
| `D` or `3` | Diamond / Decision |
| `O` or `4` | Circle / Ellipse |
| `A` or `5` | Animated Arrow |
| `P` or `7` | Freehand Pen |
| `T` or `8` | Text |
| `N` or `9` | Sticky Note |
| `K` | Laser Pointer |
| `E` or `0` | Eraser |
| `Q` | Keep selected tool active (Tool Lock) |
| `Tab` | Add and connect the next shape |
| `Double-click` | Add a node on empty canvas, edit text, or straighten an arrow |
| `Alt / Option + Drag` | Duplicate selection while dragging |
| `⌥T` (`Alt + T`) | Create a new blank canvas tab |
| `⌥[` / `⌥]` (`Alt + [` / `]`) | Step to previous / next canvas tab |
| `⌥1` – `⌥9` (`Alt + 1..9`) | Switch directly to canvas tab 1–9 |
| `⌘Z` / `⇧⌘Z` | Undo / Redo |
| `⌘D` | Duplicate selection |
| `⌘\` | Show or hide the left style panel |

## Project Structure

```text
excaliflow/
|-- index.html            Application entry point (loads CSS & modular JS)
|-- css/
|   `-- style.css         Glassmorphism UI styling, toolbars, sidebars & themes
|-- src/                  Modular JavaScript architecture
|   |-- constants.js      Allowed types, style bindings & default element configs
|   |-- prng.js           Deterministic mulberry32 seeded pseudo-random engine
|   |-- state.js          Studio application reactive state & ID generator
|   |-- sketch.js         Analytical clipping & procedural sketch engine (ShapeCache)
|   |-- geometry.js       Arrow routing (straight, curved, elbow) & perimeter sliding
|   |-- flow.js           BFS topological wave timing & particle flow animations
|   |-- render.js         Multi-pass retina occlusion-free canvas renderer
|   |-- hitTest.js        8-way resize handles, node splitting & port detection
|   |-- elements.js       Element factory & text multi-line auto-fitting
|   |-- history.js        Undo / redo snapshot history stack
|   |-- templates.js      Starter architecture templates (AI Agent Swarm, RAG, etc.)
|   |-- camera.js         World-to-screen coordinate transforms, pan & zoom
|   |-- interactions.js   Pointer events, dragging, drawing & connection wiring
|   |-- editor.js         Inline text editor & keyboard shortcuts
|   |-- export.js         2x PNG, 60fps WebM video recording & JSON import/export
|   |-- workspace.js      Multi-canvas tabs & localStorage auto-save
|   |-- ui.js             UI controls synchronization, toasts & HUD overlays
|   `-- init.js           Studio initialization, font loader & 60fps animation loop
|-- dist/                 Production standalone distribution (generated via build.js)
|-- deploy/               systemd unit + VPS deployment guide
|-- build.js              Zero-dependency bundler for distribution builds
|-- server.js             Zero-dependency local static server (http://localhost:3000)
|-- verify.js             Automated test suite for geometry, arrows, and interactions
|-- package.json          Start, build, and test scripts
`-- README.md
```

## Development

Run the automated verification checks:

```sh
npm test
```

Licensed under the repository's [Apache-2.0 license](../../LICENSE).
