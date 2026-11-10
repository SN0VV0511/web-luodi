# Third-party assets

The city is still generated procedurally. The only external 3D source data is listed below. Entries are
public domain (CC0) or MIT; attribution is recorded here for provenance (and required for the MIT entry).

| Asset | Used for | Source | License | Shipped files | Size |
| --- | --- | --- | --- | --- | --- |
| Quaternius — *LowPoly Cars / Realistic Car Pack (Nov 2018)*: NormalCar1, NormalCar2, SUV (OBJ) | Traffic and parked sedans, hatchbacks and SUVs (body / glass / trim / chrome; wheels stay procedural so they can spin) | https://quaternius.itch.io/lowpoly-cars (also https://quaternius.com/packs/cars.html) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `public/models/vehicles/cars.bin` | ~95 KB of `cars.bin` (~143 KB total with the truck) |
| Daniel Greenheck — *EZ-Tree* procedural tree generator v1.1.0 (`@dgreenheck/ez-tree`), presets Oak Medium / Ash Medium / Pine Medium, leaf sprite textures (oak, aspen, pine) | Street and park trees (3 forms, baked offline; nothing from EZ-Tree runs in the browser) | https://github.com/dgreenheck/ez-tree | [MIT](https://github.com/dgreenheck/ez-tree/blob/main/LICENSE) — Copyright (c) 2024 Daniel Greenheck | `public/models/trees/trees.bin`, `leaves.webp` | ~310 KB |
| Poly Haven — *Bark Brown 02* (colour map, via EZ-Tree's `oak_color_1k.jpg`) | Tree bark | https://polyhaven.com/a/bark_brown_02 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `public/models/trees/bark.webp` | ~17 KB |
| Quaternius — *Truck* (2024, glTF) | Box/delivery trucks in traffic and parked fleets | https://poly.pizza/m/cXw6oiFtZ8 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | packed into `public/models/vehicles/cars.bin` | ~48 KB of `cars.bin` |
| Quaternius — *Universal Base Characters* (Standard, Superhero_Male / Superhero_Female, body + eyebrows + eyes, base colour textures) | Realistic residents (instanced, pose-skinned bodies) | https://quaternius.itch.io/universal-base-characters (also https://quaternius.com) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `public/models/people/body-male.bin`, `body-female.bin`, `body-male.webp`, `body-female.webp` | ~155 KB total |

## How the shipped files are produced

1. Download the free "Standard" pack of Universal Base Characters and extract it.
2. `node scripts/build-people-assets.mjs "<pack>/Base Characters/Godot - UE"` — remaps the 65-joint skeleton
   to 15 pose segments driven by the existing `ActorPose` simulation, simplifies with meshoptimizer
   (LOD0 4,800 tris, LOD1 1,100 tris), quantizes positions/normals/UVs, writes clothing zones and packs everything with the meshoptimizer vertex/index codecs
   (decoded in the browser by three.js' bundled `meshopt_decoder`).
3. `python3 scripts/build-people-textures.py "<pack>/Base Characters"` — resizes the base colour maps to
   512 px WebP.

4. Download the Quaternius *Truck* glb from Poly Pizza and run `python3 scripts/glb-atlas-to-obj.py truck.glb <dir>/Truck.obj`
   (samples the palette atlas per triangle into body / glass / trim / grey-metal groups), then
   `node scripts/build-vehicle-assets.mjs "<Realistic Car Pack - Nov 2018>/OBJ" <dir>` — splits the vehicles by material,
   strips the wheel objects (exporting wheel centres/radius and lamp centroids instead) and writes a meshopt-compressed `cars.bin`.

5. Trees: `npm pack @dgreenheck/ez-tree`, extract, copy `package/src/lib` to a scratch directory, replace its
   `textures.js` with no-op `getBarkTexture`/`getLeafTexture` exports, add `.js` to the relative imports
   (and `with { type: 'json' }` to the preset imports), symlink this repo's `node_modules`, then run
   `node scripts/build-tree-assets.mjs <scratch>/lib` (bakes the three presets, meshopt-simplifies the bark to
   LOD0 ~1.8k / LOD1 ~0.3k tris and stores leaf-card corners only; UVs, crown normals, ambient occlusion and the
   sparse far-LOD cards are rebuilt at load) and
   `python3 scripts/build-tree-textures.py <package>/src/lib/assets` (2×2 leaf atlas, the aspen sprite is
   hue-shifted to summer green; 256 px bark).

All shipped model data totals ~580 KB (meshopt-compressed geometry + 512 px WebP). The files are fetched only after the scene is ready; if they fail to load, residents, cars and trees fall back to the
procedural versions.
