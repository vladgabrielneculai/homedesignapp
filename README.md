# Home Designer

A browser-based home design app. Draw a floor plan in 2D, furnish it from a catalog of assets, and walk around the result
in 3D. You can try different styles, keep several design variants side by side, and export images to share.

## Features

- **2D floor plan editor**: draw rooms (rectangle tool) or freeform walls, add doors and windows, drag wall corners,
  set room names and flooring. Includes grid snapping, live dimensions, and pan/zoom.
- **Live 3D view**: an orbitable 3D model of the plan with shadows, textured floors, real door and window openings, and
  a cutaway mode that lowers the walls.
- **Asset catalog**: about 40 procedurally generated furniture pieces (living, dining, bedroom, kitchen, bathroom, office,
  decor) plus 6 realistic glTF models. Drag items onto the plan or click to place them, then move, rotate, recolor,
  duplicate or delete them.
- **Style presets**: Scandinavian, Modern, Industrial, Classic, Boho and Japandi. Each preset changes wall paint,
  flooring and the furniture palette in one click. You can also set custom paint, accent walls, per-room floors and
  per-item colors.
- **Projects and variants**: save several projects in your browser, start from templates (single room, studio,
  two-bedroom apartment, family house), duplicate a design into a new variant, and compare two variants side by side.
- **Export and sharing**: export the 3D view or the floor plan as PNG, and export or import a whole project as a
  `.homedesign.json` file.
- Undo/redo, keyboard shortcuts, and autosave to `localStorage`.

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
npm run preview  # serve the production build
```

The build uses a relative base path, so you can host the `dist/` folder as-is (GitHub Pages, Vercel, Netlify or any
static file server).

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `V` / `M` / `W` / `D` / `N` | Select / Room / Wall / Door / Window tool |
| `R` / `Shift+R` | Rotate selected item 90° clockwise / counter-clockwise |
| Arrow keys (`Shift` for bigger steps) | Nudge selected item |
| `Ctrl+D` | Duplicate selected item |
| `Delete` / `Backspace` | Delete selection |
| `Ctrl+Z` / `Ctrl+Shift+Z` (or `Ctrl+Y`) | Undo / redo |
| `Esc` | Finish drawing / cancel tool / clear selection |
| `Space` + drag, or right-drag | Pan while another tool is active |

## Project structure

```
src/
  catalog/      catalog entries, style presets, floor materials, starter templates
  components/   React UI: projects page, editor page, 2D plan editor, sidebar, properties
  lib/          geometry, color and export helpers
  state/        zustand store (projects, variants, history, persistence)
  three/        3D scene: procedural furniture, walls/openings, floor textures, viewer
public/models/  glTF furniture models (see CREDITS.md)
```

### Adding assets

- **Procedural item**: add an entry to `CATALOG` in `src/catalog/catalog.ts`. It needs real-world dimensions in
  meters, a color role and a 2D plan symbol. Then add a builder case in `src/three/Procedural.tsx`. Items without a
  builder render as a simple cabinet.
- **glTF/GLB model**: copy the `.glb` into `public/models/` and add a catalog entry with a `model` field
  (`url`, `credit`, `license`, `source`). The model is scaled automatically to fit the entry's `w × d × h` footprint.

Units are meters throughout. Plan coordinates use `(x, y)`, and plan `y` maps to world `z` in 3D.

## Credits

The realistic models come from the Khronos glTF Sample Assets (CC0 / CC BY 4.0). See [CREDITS.md](CREDITS.md).
