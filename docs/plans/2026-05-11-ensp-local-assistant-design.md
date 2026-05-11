# eNSP Local Assistant Design

## Product Direction

eNSP Local Assistant starts as a local topology template launcher. It is not a generic topology drawing tool and it is not a full eNSP automation platform yet. The first product loop is:

1. Scan a user-selected lab folder.
2. Detect saved eNSP `.topo` files and supporting lab material.
3. Show labs as professional launch cards.
4. Open the selected topology in eNSP from the local backend.

This keeps the first release useful and very clear: find local saved topologies, choose one, and start it.

## First Release Scope

- Lab library with search, protocol tags, and lab health status.
- Local settings for lab root and optional eNSP executable path.
- Backend scan of lab folders and `.topo` files.
- One-click open action for the `.topo` file through the operating system or configured eNSP executable.

## Deferred Scope

- Full from-scratch `.topo` generation.
- `.topo` topology preview and editing.
- Guaranteed eNSP import automation beyond opening files.
- Web terminal console sessions.
- Serial port auto-mapping.
- Automated configuration delivery and lab grading.

These are important, but they depend on reliable local-device behavior and should build on the lab library foundation.

## Architecture

The app uses a web frontend and a local backend.

- `apps/web`: Vue 3, TypeScript, Vite, professional template launcher UI.
- `apps/server`: Node.js, Express, filesystem scanning, settings storage, and local open commands.
- `packages/shared`: Shared TypeScript types.

The frontend talks to the backend through REST APIs. Later console sessions should use WebSocket streams.

## Frontend Design

The interface should feel like a network engineering launcher: precise, fast, calm, and card-driven. The primary screen is not a marketing page. It is a usable template launcher with:

- Header with product name and local service status.
- Toolbar for lab root, optional eNSP executable path, save, and scan.
- Search/filter control.
- Responsive card grid for saved topology templates.
- Per-card launch action.

Icons use a professional icon library. Motion is purposeful: page entrance, hover feedback, scan pulse, canvas controls, and status changes. Animations use transform and opacity and respect `prefers-reduced-motion`.

## Backend Design

The backend provides:

- `GET /api/health`: service status.
- `GET /api/settings`: current lab root and eNSP executable configuration.
- `PUT /api/settings`: update local settings.
- `GET /api/labs`: scan and return labs.
- `POST /api/labs/:id/open`: open the topology in eNSP or with the OS file association.

Settings are stored locally in `data/settings.json`. The app should tolerate missing settings by returning demo data so the UI stays usable on first launch.

## Data Model

- `LabProject`: a folder or file-backed experiment with id, name, path, topology file, README, configs, tags, modified time, and status.
- `AppSettings`: lab root and optional eNSP executable path.

## Error Handling

- Missing lab root: show setup state and demo labs.
- Open failed: show command error and keep the user on the same screen.
- Backend offline: frontend shows local service unavailable state.

## Testing And Verification

First pass verification:

- TypeScript build for web and server.
- Build the frontend and backend.
- API smoke check for health, settings, labs, and launch error handling.

Later releases can add `.topo` parser fixtures based on real samples if topology preview becomes part of scope.
