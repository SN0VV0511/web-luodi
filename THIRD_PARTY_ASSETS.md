# Third-party assets

The city is still generated procedurally. The only external 3D source data is listed below. Every entry
is in the public domain (CC0), so attribution is not required; it is recorded here for provenance.

| Asset | Used for | Source | License | Shipped files | Size |
| --- | --- | --- | --- | --- | --- |
| Quaternius — *Universal Base Characters* (Standard, Superhero_Male / Superhero_Female, body + eyebrows + eyes, base colour textures) | Realistic residents (instanced, pose-skinned bodies) | https://quaternius.itch.io/universal-base-characters (also https://quaternius.com) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `public/models/people/body-male.bin`, `body-female.bin`, `body-male.webp`, `body-female.webp` | ~270 KB total |

## How the shipped files are produced

1. Download the free "Standard" pack of Universal Base Characters and extract it.
2. `node scripts/build-people-assets.mjs "<pack>/Base Characters/Godot - UE"` — remaps the 65-joint skeleton
   to 15 pose segments driven by the existing `ActorPose` simulation, simplifies with meshoptimizer
   (LOD0 4,800 tris, LOD1 1,100 tris), quantizes positions/normals/UVs and writes clothing zones.
3. `python3 scripts/build-people-textures.py "<pack>/Base Characters"` — resizes the base colour maps to
   512 px WebP.

The files are fetched only after the scene is ready; if they fail to load, residents fall back to the
procedural figures.
