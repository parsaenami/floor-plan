# Floor Plan Studio

A house plan editor in the style of real architectural drawings. Draw straight or curved walls, drop in doors, windows and furniture, draw your own components, and export print-ready sheets or GeoJSON. Choose black on white (Paper), white on black (Black) or a Blueprint theme, and sync your work through Google Drive or Dropbox.

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (geometry, GeoJSON, sync, sign-in server)
npm run build    # typecheck + production build
npm start        # serve dist/ and the Drive sign-in endpoints (VPS)
```

## Features

- **Dashboard** with plan cards and thumbnails. You can create plans (blank or sample apartment), rename, duplicate or delete them, and import or export them as JSON.
- **Editor**:
  - Draw walls point to point, or drag out a rectangle room whose interior matches the size you drag.
  - Wall thickness sits outside the wall's line. When walls close around a room, their thickness goes on the side away from it, so the line you draw is the room's inner face. You can flip any wall to its other side (F) or centre it.
  - Curved walls: the Curved wall tool (A) takes three clicks (start, end, bulge), and the bulge snaps to 15° steps, which makes quarter and half circles easy to hit. You can also drag the round handle in the middle of any wall to bend it, or pick Straight, ¼ circle, ½ circle or a custom sweep and radius in the properties panel. Doors and windows follow the curve, and rooms bounded by curves are measured correctly.
  - Doors (single, double, sliding) and windows cut into their wall and can slide along it or move to another wall.
  - Furniture can be dragged, rotated and resized.
  - Stacking order: Bring to front, forward, backward or to back, from the properties panel, the right-click menu, or the keys `]`, `[`, `⇧]` and `⇧[`.
  - Snapping: grid, wall endpoints, points on walls, and 45° angles.
  - Undo and redo.
  - Rooms are detected automatically and show their net area and inner dimensions.
  - Measure tool and room labels.
- **Component builder** (`/components`): draw a component in any shape. The designer has lines, polylines, polygons, rectangles, ellipses, arcs, pie slices, freehand strokes and text. It snaps to a grid and to existing points. You can reshape a shape by dragging its handles, set fill (none, paper or ink), dashed lines and line weight, and type exact sizes. Arcs have ¼, ½, ¾ and full-circle presets. **Fit size** shrinks the box to the drawing. Presets (rectangle, rounded, ellipse, L-shape) and every built-in symbol are still available, and switching to Draw starts from the current symbol so you can edit it.
- **More than 70 built-in components**, including corner sofa, grand piano, king and bunk beds, kitchen island, range, dining set, corner shower, double vanity, corner desk, straight and spiral stairs, columns, radiators, elevator, car, tree and hot tub. There are also pocket, bifold and open-passage openings.
- **Themes**: Paper, Black and Blueprint, from the swatches in the top bar. Exports can use any of them.
- **Cloud sync** with Google Drive or Dropbox: see below. Both are set up in the settings dialog (the gear icon).
- **Output view** (`/plan/:id/output`) shows the plan as planar GeoJSON (cm, y up), drawn with TanStack Charts `geoShape` and `geoIdentity().reflectY(true)`, with hover tooltips.
- **Export** to PDF (vector), PNG or SVG on an A4/A3 sheet. You choose a scale from 1:20 to 1:200, and the sheet includes a title block, scale bar and north arrow.
- **DXF export** (R12) for AutoCAD, LibreCAD or QCAD: 1:1 model space in centimetres, y up, on WALLS, OPENINGS, FURNITURE, ROOMS and DIMENSIONS layers.

Data is saved automatically in the browser (IndexedDB). You can connect Google Drive or Dropbox to use your plans on other devices, or use JSON export for backups.

## Google Drive sync

Connecting Drive creates a **Floor Plan Studio** folder in your Drive. Each plan is stored there as `<name>.floorplan.json`, which is the same format as JSON export. Custom components are stored together in one library file. While you are connected, changes sync a few seconds after you make them. To continue on another device, connect the same Google account there.

- The newer copy of a plan wins. The plan open in the editor is never replaced while you edit it.
- A plan you delete goes to the Drive bin, and other devices remove it on their next sync. The only exception is a device that edited the plan since then, which keeps it.
- Component libraries are merged per component.
- The app uses the `drive.file` scope, so it can only see files it created.
- Signing in is handled by the app's server (`server/driveAuth.ts`), so users connect once and stay connected. There is no popup and no hourly sign-in. The server keeps each user's Google refresh token in an encrypted, `httpOnly` cookie, and there is no database. Users can disconnect in the app, or remove access from their Google account at any time.
- If the app is hosted with no server at all, a client ID can be built in instead (`VITE_GOOGLE_CLIENT_ID`). Sign-in then uses a Google popup and lasts an hour.

### Google setup (one time, by whoever hosts the app)

Users never see any of this. They only see a **Connect Google Drive** button.

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable the **Google Drive API**.
2. Set up the **OAuth consent screen**: an app name, a support email and the `drive.file` scope. While the app is in *Testing*, only listed test users (up to 100) can connect, and Google makes them reconnect every 7 days. Publishing removes both limits. `drive.file` is a non-sensitive scope, so publishing should not need Google's security review. Before you publish, fill in *Branding*:
   - home page: `https://<your-domain>/`
   - privacy policy: `https://<your-domain>/privacy`
   - terms of service: `https://<your-domain>/terms`
   - authorised domain: `<your-domain>`, verified in Google Search Console

   The app serves both pages. Set `VITE_CONTACT_EMAIL`, and optionally `VITE_OPERATOR_NAME`, so they show who to contact. These values are read at build time.
3. Create an **OAuth client ID** of type *Web application*. Under *Authorised redirect URIs*, add `https://<your-domain>/api/drive/callback`. For local development, also add `http://localhost:5173/api/drive/callback`.
4. Give the server `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `SESSION_SECRET` (32+ random characters, e.g. `openssl rand -hex 32`). For local development, put them in `.env.local`; `.env.example` lists them all. Keep the secret out of git.

Check that `https://<your-domain>/api/drive/config` returns `{"enabled":true}`.

## Dropbox sync

Dropbox works the same way as Drive, and one of the two can be connected at a time. Files go to the app's own folder, `Apps/Floor Plan Studio`. Dropbox files have no custom properties, so each plan's id and version are kept in its file name: `<name>.<planId>.<updatedAt>.floorplan.json`. A new version replaces the old file, and deleted files can be restored from Dropbox for at least 30 days.

Sign-in runs entirely in the browser (OAuth with PKCE), so Dropbox needs no server and no secret, and users stay signed in: the refresh token is kept in the browser's local storage.

Setup, once, by whoever hosts the app:

1. In the [Dropbox App Console](https://www.dropbox.com/developers/apps), create an app with **Scoped access** and **App folder** access. Name it `Floor Plan Studio`, which becomes the folder name.
2. Under *Permissions*, enable `files.metadata.read`, `files.content.read` and `files.content.write`.
3. Under *Settings → OAuth 2 → Redirect URIs*, add `https://<your-domain>/`, and `http://localhost:5173/` for development. Keep *Allow public clients (Implicit Grant & PKCE)* on.
4. Build with the app key in `VITE_DROPBOX_APP_KEY`. It is public, so it is fine in `.env.local` or the host's build variables.

While the app is in development status, only you and up to 500 users can connect. Apply for production in the App Console to lift the limit.

## Deploying

The same sign-in code runs on both targets, so you can switch between them later.

**Netlify.** Connect the repository. `netlify.toml` sets the build, the output folder and the app routes, and `netlify/functions/drive.mts` serves `/api/drive/*`. Add the three variables under *Site configuration → Environment variables*, then deploy.

**Your own VPS** (Node 22.18 or newer runs the TypeScript server directly, with no build step for it):

```sh
npm ci && npm run build
sudo install -m 640 -o root -g www-data /dev/null /etc/floor-plan-studio.env   # then add the three variables
npm start                                   # or use the systemd unit below
```

- `deploy/floor-plan-studio.service` keeps the server running with systemd, reading `/etc/floor-plan-studio.env`.
- `deploy/Caddyfile` puts Caddy in front of it for automatic HTTPS. Replace the domain with yours.
- The server listens on `127.0.0.1:3000`; set `PORT` and `HOST` to change that.

## Offline and install

Production builds are an installable app (use *Install* in the browser's address bar, or *Add to Home Screen* on a phone) and keep working offline, since plans live in the browser anyway.

- `public/manifest.webmanifest` and the PNG icons next to it describe the app. The icons are rendered from `favicon.svg`; regenerate them if it changes.
- `vite build` turns `src/sw.js` into `dist/sw.js`, filling in the list of every built file and a cache name hashed from it, so each deploy gets a fresh cache and drops the old one.
- Page loads go to the network first and fall back to the cached app when offline, for every route. Other same-origin files come from the cache. `/api/*` and all cross-origin requests (Google, Dropbox, web fonts) are never cached, so Drive and Dropbox sync simply wait until you're back online.
- The service worker is only registered in production builds, not under `npm run dev`. Try it with `npm run build && npm run preview`.

## Shortcuts

| Key | Action | Key | Action |
| --- | --- | --- | --- |
| V | Select | ⌘Z / ⇧⌘Z | Undo / redo |
| W | Walls | ⌘D | Duplicate |
| A | Curved walls | Delete | Delete selection |
| B | Rectangle room | R / ⇧R | Rotate ±90° |
| D / N | Door / window | F / ⇧F | Flip door side / hinge, or a wall's thickness side |
| M | Measure | ] / [ | Bring forward / send backward |
| T | Room label | ⇧] / ⇧[ | Bring to front / send to back |
| H / Space | Pan | Arrows | Nudge 1 cm (⇧ 10 cm) |
| G | Toggle snapping | 0 / ? | Fit plan / shortcut help |

Right-click a selection for stacking, rotate, flip, duplicate and delete. The component designer has its own keys: V select, L line, P polyline, G polygon, R rectangle, E ellipse, A arc, S pie slice, F freehand, T text.

Pinch or ⌘-scroll to zoom, and scroll to pan. Hold ⇧ to draw at a free angle, and ⌥ to turn off snapping.

## Architecture

- `src/model`: plan types, defaults, the sample plan, and pure plan operations.
- `src/geometry`: vector math, snapping, wall helpers and room detection. Walls have a side (`align`) and an optional DXF-style `bulge` for arcs. `wallGeometry` builds their outlines with mitred joints. Room detection splits curved walls into short straight pieces, finds the enclosed areas in the wall network, and measures each one inset by the part of each wall body that lies inside it.
- `src/symbols`: drawing primitives shared by every renderer. These are the built-in furniture and door/window symbols, plus the preset shapes for custom components.
- `src/render`: the SVG plan layers, dimension lines, thumbnails, and the GeoJSON conversion.
- `src/store`: Zustand stores for the plans, custom components, and the editor (with its own undo history).
- `src/pages`: dashboard, editor (canvas, tools, panels), component builder, and output view.
- `src/export`: the print sheet and the PDF/PNG/SVG exporters. The exporters are loaded only when you export.
- `src/theme`: theme colours for the drawing. The UI uses matching CSS variables in `global.css`.
- `src/sync`: cloud sync. `provider.ts` is the small storage interface sync runs against. `auth.ts` picks how to sign in to Google (the server, or a browser popup when there is no server), `drive.ts` makes the Drive calls, `dropbox.ts` has the Dropbox sign-in and calls, `reconcile.ts` is the pure merge logic (unit-tested), and `syncStore.ts` runs the sync.
- `server`: `driveAuth.ts` is the sign-in handler, written against standard `Request`/`Response`. `index.ts` is the VPS server, which also serves `dist/`. `node.ts` adapts Node requests. The Vite dev server and `netlify/functions/drive.mts` use the same handler.

All coordinates are in centimetres. Because the editor, the exports and the GeoJSON output all draw from the same primitives, they always match.
