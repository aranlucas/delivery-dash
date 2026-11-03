# Delivery Dash assets

Run rebuild commands from the repository root. The recipes regenerate the checked-in GLBs and,
for Blender recipes, the editable `.blend` scene. Save manual scene edits before rebuilding.

| Kit                                  | Recipe                                         | Editable scene               | Runtime output                                                |
| ------------------------------------ | ---------------------------------------------- | ---------------------------- | ------------------------------------------------------------- |
| Vehicles and street props            | [build-assets.py](build-assets.py)             | `delivery-dash-assets.blend` | `public/models/vehicles/`, `public/models/street-props.glb`   |
| Coastal landmarks                    | [build-landmarks.py](build-landmarks.py)       | `coastal-landmarks.blend`    | `public/models/landmarks/`                                    |
| Delivery storefronts and stunt gates | [build-delivery-kit.py](build-delivery-kit.py) | `delivery-kit.blend`         | `public/models/delivery/`, `src/shared/delivery-colliders.ts` |
| Market, harbor, and plaza scenery    | [build-world-kit.mjs](build-world-kit.mjs)     | The recipe itself            | `public/models/world/`                                        |

## Rebuild

Run the relevant Blender recipe in Blender's Scripting workspace or with its background CLI.
For example, on macOS:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python assets/blender/build-assets.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python assets/blender/build-landmarks.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python assets/blender/build-delivery-kit.py
```

The Blender Lab MCP server in [`.mcp.json`](../../.mcp.json) is another option; it requires
Blender's Lab `mcp` extension. The world kit uses the existing Three.js dependency without Blender
or a renderer:

```sh
node assets/blender/build-world-kit.mjs
```

The delivery recipe also regenerates collision proxies. Format that output:

```sh
pnpm exec oxfmt src/shared/delivery-colliders.ts
```

Optimize raw delivery GLBs with glTF Transform, then replace each raw export with its optimized
output. These options weld, deduplicate, and prune without adding runtime decompression or
changing silhouettes. Substitute the model's paths for `input.glb` and `output.glb`:

```sh
npx @gltf-transform/cli@4.5.0 optimize input.glb output.glb --compress false --simplify false --palette false --texture-compress false
npx @gltf-transform/cli@4.5.0 validate output.glb
```

Validate world GLBs with the same `validate` command. When replacing published GLBs, bump the
cache revision in the corresponding loader:

- Vehicles and props: [`model-assets.ts`](../../src/client/game/model-assets.ts).
- Landmarks: [`landmark-city.tsx`](../../src/client/game/landmark-city.tsx).
- Delivery kit: [`delivery-assets.tsx`](../../src/client/game/delivery-assets.tsx).
- World kit: [`world-details.tsx`](../../src/client/game/world-details.tsx).

## Authoring contracts

Runtime models use meters and game Y-up; Blender recipes convert from Z-up during glTF export.
Keep the vehicle and street-prop mesh names expected by `model-assets.ts`: separate wheels,
glass, trim, lamps, and bodies allow recoloring and animation while sharing geometry.
Landmark placement and collision footprints belong to [`city.ts`](../../src/shared/city.ts).
Merge landmark geometry by material to keep draw calls low.

Delivery models have a ground-level origin, with shop fronts along local +Z. Keep each model to
one mesh primitive and one rough vertex-color material, with no textures or animation.
Stores rotate in 90-degree increments so exported box colliders stay exact; large roof signs
need conservative proxies, while small facade trim stays visual. Gates need an 18-meter clear
opening with the header starting at 15 meters; give pillars and header separate collision boxes.
Landing targets are thin paint marks with no solid collision.

[`delivery-assets.test.ts`](../../test/shared/delivery-assets.test.ts) enforces fewer than 3,000
triangles per model and less than 450 KB for the kit, plus material/texture limits, pickup access,
and an open jump corridor. Run it after rebuilding:

```sh
pnpm test test/shared/delivery-assets.test.ts
```

World scenery uses ground pivots and geometry merged by material, without textures or runtime
decompression. It is visual only: keep placements outside landmark footprints, drift rings, and
stunt approach lanes. If scenery becomes solid, introduce explicit collision proxies shared by
the client and server rather than relying on the visual mesh.
