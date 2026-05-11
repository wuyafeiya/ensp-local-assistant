# eNSP Local Assistant

eNSP Local Assistant is a focused local launcher for saved eNSP topology templates. It scans a local lab folder, turns `.topo` experiments into clean cards, and opens the selected topology with eNSP or the system file association.

## Current MVP

- Set a local lab root directory.
- Scan folders and `.topo` files under that directory.
- Generate professional template cards for each experiment.
- Show topology file, README, config count, protocol hint, and path.
- Click **启动拓扑** to open the selected `.topo`.

Other ideas such as console connection, configuration generation, topology editing, and serial scanning are intentionally out of scope for the first version.

## Development

```bash
npm install
npm run dev
```

The web app runs on `http://localhost:5173`.
The local API runs on `http://localhost:8787`.

## Structure

```text
apps/web       Vue 3 + TypeScript frontend
apps/server    Node.js local backend
packages/shared Shared TypeScript types
docs/plans     Product and implementation notes
```
