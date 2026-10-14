# Home Designer

A browser-based home design app. Draw a floor plan in 2D, furnish it from a catalog of assets, and walk around the result
in 3D. You can try different styles, keep several design variants side by side, and export images to share.

## Features

- **2D floor plan editor**: draw rooms (rectangle tool) or freeform walls, add doors and windows, drag wall corners,
  set room names and flooring. Includes grid snapping, live dimensions, and pan/zoom.
- **Trace your real floor plan**: under *Build → Floor plan to trace*, import a photo, scan or PDF of your plan. Click
  both ends of a distance you know (for example a dimensioned wall), type its length, and the plan is scaled to match.
  Then draw walls and rooms on top. You can move, fade, hide or replace it.
- **Live 3D view**: an orbitable 3D model of the plan with shadows, textured floors, real door and window openings, a
  cutaway mode that lowers the walls, and an eye-level mode where you drag to look around and right-drag to walk.
- **Edit one room at a time**: pick a room in the *Room* menu in the top bar, double-click it on the plan, or use
  *Edit alone*. The plan and the 3D view then show only that room, with its own walls, doors, windows and furniture.
  You can set its flooring, finish all its walls at once (only the sides facing into the room), and see a shopping
  list for that room only.
- **Wall finishes per side**: each side of a wall can have its own paint, wallpaper (limewash, stripes, art deco,
  botanical, trellis, grasscloth) or material (red or painted brick, concrete, subway or zellige tiles, wood paneling,
  marble). Tinted patterns can be recolored. You can also upload a photo of a real wallpaper or tile and set its
  repeat size. It's then shown at its real scale.
- **Resizable furniture**: drag the square handles on a selected item, or type its width, depth and height. 3D models
  stretch to match, and *Reset to catalog size* restores the original.
- **Asset catalog**: about 60 procedurally generated furniture pieces (modern, living, dining, bedroom, kitchen, bathroom,
  office, decor) plus 6 realistic glTF models. The modern range includes wood slat wall panels, a floating TV media wall,
  a modular cloud sofa, a bouclé lounge chair, pendant lights, an arc lamp, a marble table, curtains, mirrors and wall
  art. Wall pieces snap flat against the nearest wall, and lamps or vases dropped on a table sit on top of it. The
  catalog shows rendered 3D previews in the current style's colors. They're made in the browser the first time and
  cached.
- **Real shop products**: add furniture from IKEA or any other store under *Furnish → My products*. Enter the name,
  link, price and real measurements, pick what it looks like, and optionally add a photo and the store's 3D model
  (`.glb`, `.obj`, `.fbx`, or a `.gltf` with embedded textures). It's placed at its real size, and the **Shopping list** shows quantities,
  prices and totals for each variant, with a CSV export. Product photos are kept in `localStorage`, and uploaded
  models in IndexedDB. Exported project files include the products and their models.
- **Sun, sky and garden**: pick your city (or coordinates), date and time, and which way the plan faces. The sun is
  placed astronomically, so you can check how light enters a room on a winter morning or a summer evening. The house
  sits on a lawn with trees under a physically based sky with clouds. After sunset, lamps and ceiling lights switch on.
  A compass on the plan shows north.
- **Ray-traced 3D view** (the default style): whenever the camera stops moving, the view switches to path tracing
  ([three-gpu-pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer)). Daylight bounces between walls,
  floor and furniture, colors bleed, shadows are soft, and glossy surfaces show real reflections. The image refines
  over a few seconds, and a small badge shows the progress. While you orbit, walk, edit or have something selected,
  the fast real-time view is shown and tracing restarts afterwards. Indoors, each window gets a *sky portal*, as in
  V-Ray and Corona, so light from the window is found quickly. The remaining grain is removed by an
  AI denoiser: Intel Open Image Denoise, the one in Blender, V-Ray and Corona, running on the graphics card
  through WebGPU in Chrome and Edge. It uses the surface colors and directions to tell real detail from noise, so the
  image is clean after a few dozen samples. Browsers without WebGPU fall back to a firefly filter and an edge-aware
  smoothing filter. Photo renders use the same denoiser. It needs a reasonably modern graphics card; on slow computers choose *Realistic* or *Shaded* in the
  style menu.
- **Realistic real-time rendering**: ambient occlusion, bloom on lights, neutral tone mapping that keeps colors
  accurate, and soft sun shadows. Reflections and fill light come from a real photographed interior (a Poly Haven
  HDRI, CC0, bundled locally). Floors have surface relief and varied gloss; upholstery is rounded, with fabric and
  bouclé textures; wood has grain, and the walls have skirting boards. In eye-level view the rooms get ceilings with light fixtures, and the
  camera stands where an interior photographer would, at chest height with a level camera, looking across the
  room.
- **Photo-realistic images**: the *Photo* button (or *Export → Photo-realistic image*) path-traces the current view
  with [three-gpu-pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer). Light bounces around the rooms,
  sky light comes in through the windows, and shadows and reflections are physically based. Choose Draft, Good or
  Best quality and up to 4K. The image keeps getting cleaner and can be saved at any point. This needs a reasonably
  modern graphics card.
- **SketchUp-style modeling** in the 3D view, for things the catalog doesn't have (built-ins, a kitchen island, a
  window seat, steps, a terrace planter). A tool palette on the left of the 3D view has Select, Line, Rectangle,
  Circle, Push/Pull, Move, Rotate, Scale, Tape measure, Paint bucket and Eraser, with SketchUp's keys (`Space`, `L`,
  `R`, `C`, `P`, `M`, `Q`, `S`, `T`, `B`, `E`). Draw a rectangle on the floor, a wall or another shape, then
  Push/Pull it into a solid. Pulling a face that has square sides stretches the shape, as in SketchUp. While a tool
  is in use, type an exact value and press Enter, like SketchUp's Measurements box: `2.4` or `240cm` for a
  distance, `1.2;0.6` for a rectangle, `45` degrees for Rotate, or `1.5` for Scale. Points snap to corners (green),
  midpoints (cyan) and the red, green and blue axes. In Move, hold `Ctrl` to drop a copy and press `↑` to move up
  or down. The Paint bucket paints faces of shapes, either side of a wall, or furniture.
  Select several shapes (`Shift`-click) to *Make group* or *Make component*. Copies of a component share their
  geometry, so pulling a face on one changes all of them. *Make unique* and *Explode* undo that. Shapes also show
  and drag in the 2D plan, export with the project and appear in photo renders.
- **SketchUp navigation and styles**: the middle mouse button orbits (`Shift`+middle pans), the wheel zooms toward
  the cursor, and *Views* gives Iso, Top, Front, Back, Left and Right cameras. The style menu switches between *Ray-traced*,
  *Realistic*, *Shaded*, *SketchUp* (black edges and profiles on a sky gradient), *Hidden line*, *X-ray*,
  *Monochrome* and *Sketchy* (pencil lines on paper).
- **Open SketchUp files**: *Furnish → Open SketchUp model* reads `.skp` files, including 3D Warehouse downloads,
  through the local helper (below). It also reads `.dae` (COLLADA) files exported from any SketchUp, including the
  free web version, directly in the browser. The model keeps its real size, materials and textures, is added to
  *My products*, and is placed in the middle of the home.
- **Style presets**: Scandinavian, Modern, Industrial, Classic, Boho and Japandi. Each preset changes wall paint,
  flooring and the furniture palette in one click. You can also set custom paint, accent walls, per-room floors and
  per-item colors.
- **Projects and variants**: save several projects in your browser, start from templates (single room, modern loft,
  studio, two-bedroom apartment, family house), duplicate a design into a new variant, and compare two variants side by side.
- **Export and sharing**: export the 3D view or the floor plan as PNG, and export or import a whole project as a
  `.homedesign.json` file (it includes your shop products, uploaded wallpapers and imported plans).
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

### Opening `.skp` files (local helper)

SketchUp's file format is closed. It can only be read with Trimble's official SketchUp SDK, which is free but can't
be shipped with this app, and is available for Windows and macOS only. The app opens `.skp` files through a small
helper built into the Vite server, so it works with `npm run dev` or `npm run preview` on your own computer. Files are
converted locally and never uploaded anywhere.

1. Sign in at [developer.sketchup.com](https://developer.sketchup.com), download the latest **SketchUp C SDK** for
   your system, and unzip it. Use the newest version, because files saved by a SketchUp newer than the SDK can't be
   opened.
2. Create a file called `.env.local` next to `package.json` (copy `.env.example`) and point it to the folder that
   contains `SketchUpAPI.dll`, or `SketchUpAPI.framework` on a Mac:

   ```
   SKETCHUP_SDK_DIR=C:\SketchUpSDK\binaries\sketchup\x64
   ```

3. Restart `npm run dev`, then use *Furnish → Open SketchUp model*.

Without the SDK, export from SketchUp as COLLADA (`File → Export → 3D Model → .dae`) and open the `.dae` instead.
The hosted static build has no helper, so it can only open `.dae`.

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

In the 3D view (after clicking in it), the SketchUp keys apply:

| Key | Action |
| --- | --- |
| `Space` / `L` / `R` / `C` / `P` | Select / Line / Rectangle / Circle / Push/Pull |
| `M` / `Q` / `S` / `T` / `B` / `E` | Move / Rotate / Scale / Tape measure / Paint bucket / Eraser |
| Type a value, then `Enter` | Exact length, size (`w;d`), angle or scale for the current tool |
| `Ctrl` while moving / `↑` | Move a copy / move vertically |
| `Esc` | Cancel the current operation, then go back to Select |
| Middle-drag / `Shift`+middle-drag / wheel | Orbit / pan / zoom |

## Project structure

```
src/
  catalog/      catalog entries, shop products, style presets, floor materials, wall finishes, starter templates
  components/   React UI: projects page, editor page, 2D plan editor, sidebar, properties, finish picker,
                sun panel, photo dialog, floor plan import
  lib/          geometry, color, export, room focus, sun position and plan import helpers
  state/        zustand store (projects, variants, wallpapers, history, persistence)
  three/        3D scene: procedural furniture, walls/openings, textures and wall patterns, sky and garden,
                catalog preview renderer, path-traced photos, user model loading, viewer, modeled shapes,
                SketchUp-style tools and display styles
server/         local helper for the Vite server: reads .skp files with the SketchUp SDK and returns glTF
public/models/  glTF furniture models (see CREDITS.md)
```

### Adding assets

To add furniture without touching code, use **My products** in the app (see above). Shapes you can choose for a
product are listed in `PRODUCT_SHAPES` in `src/catalog/catalog.ts`.

- **Procedural item**: add an entry to `CATALOG` in `src/catalog/catalog.ts`. It needs real-world dimensions in
  meters, a color role and a 2D plan symbol. Then add a builder case in `src/three/Procedural.tsx`. Items without a
  builder render as a simple cabinet.
- **glTF/GLB model**: copy the `.glb` into `public/models/` and add a catalog entry with a `model` field
  (`url`, `credit`, `license`, `source`). The model is scaled automatically to fit the entry's `w × d × h` footprint.

Units are meters throughout. Plan coordinates use `(x, y)`, and plan `y` maps to world `z` in 3D. Modeled shapes
(`Design.shapes`) are polygon meshes stored as JSON. Component definitions are in `Design.components`, and the
geometry operations, such as Push/Pull, live in `src/lib/solid.ts`.

## Credits

The realistic models come from the Khronos glTF Sample Assets (CC0 / CC BY 4.0). See [CREDITS.md](CREDITS.md).
Photo renders and the ray-traced view use [three-gpu-pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer)
(MIT). PDF plans are read with [PDF.js](https://mozilla.github.io/pdf.js/) (Apache 2.0). The interior HDRI comes from
[Poly Haven](https://polyhaven.com) through [@pmndrs/assets](https://github.com/pmndrs/assets) (CC0). Denoising uses
[oidn-web](https://github.com/pissang/oidn-web) (MIT) with Intel's
[Open Image Denoise weights](https://github.com/RenderKit/oidn-weights) (Apache 2.0, in `public/oidn`).
