# Coastal world kit

`build_world_kit.mjs` is the canonical deterministic exporter for the larger scenery silhouettes
around the coastal superblocks. The runtime GLBs are in `public/models/world/`. This kit uses
the project's existing Three.js dependency for export and needs no Blender process or renderer.

- `market.glb` is a connected row of three painted festival stalls, two umbrellas, crates,
  and a fish display.
- `harbor.glb` is a timber dock with a fishing boat, mast, stacked containers, mooring posts,
  and cargo crates.
- `plaza.glb` is a small paved parklet with benches, planters, topiary, lamps, and a sign.

Rebuild the checked-in runtime assets deterministically with:

```sh
node assets/blender/build_world_kit.mjs
```

Edit the canonical recipe to rebuild the set, or import the GLBs into Blender for manual modeling.
The exporter uses game Y-up coordinates in meters. Each asset has a ground pivot and merges
geometry by material, keeping the exported model to a small number of draw calls without textures
or runtime decompression. The runtime loader shares each GLB's geometry and materials through
`StaticInstances`; `WorldDetails.tsx` only uploads instance transforms.

Props are visual scenery and intentionally have no collision boxes. Market and plaza placements
stay in the outer corners of the 43 m superblocks, outside landmark footprints, the 20–36 m drift
rings, and the freight/stunt approach lanes. The harbor placement is outside the west seawall,
with the boat beside Lighthouse Point in the water. If a prop becomes solid later, add a separate
`worldDetails.ts` collision contract instead of changing the authored city generation.

When replacing a published kit, bump the `world-4` revision in `WorldDetails.tsx`. Validate the
GLBs with glTF Transform when available:

```sh
npx @gltf-transform/cli@4.5.0 validate public/models/world/market.glb
npx @gltf-transform/cli@4.5.0 validate public/models/world/harbor.glb
npx @gltf-transform/cli@4.5.0 validate public/models/world/plaza.glb
```
