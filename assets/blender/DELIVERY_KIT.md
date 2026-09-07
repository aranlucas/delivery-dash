# Delivery storefront and stunt kit

Original procedural Blender artwork for Sushi Express, Pizza Planet, Dumpling Depot,
and the Jump Works / Freight Yard launch lanes. Editable source: `delivery-kit.blend`.
The depot retains the existing food-delivery destination and order flow.

## Rebuild

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python assets/blender/build_delivery_kit.py
```

The script exports five GLBs to `public/models/delivery` and the same explicit collision
proxies to `src/shared/deliveryColliders.ts`. Format that generated TypeScript with oxfmt.
Optimize each GLB with glTF Transform 4.5.0, then replace the raw export:

```sh
npx @gltf-transform/cli@4.5.0 optimize input.glb output.glb --compress false --simplify false --palette false --texture-compress false
npx @gltf-transform/cli@4.5.0 validate output.glb
```

This welds, deduplicates and prunes without adding a runtime decompressor or changing the
silhouettes. Bump the asset revision in `DeliveryAssets.tsx` when publishing changed GLBs.

## Runtime contract

- Meters, ground-level origin, game Y-up, shop front along local +Z.
- One mesh primitive and one rough vertex-color material per model; no textures or animation.
- Stores face their pickup curb in 90-degree increments so exported box colliders remain exact
  under rotation. Large roof signs use conservative box proxies; small facade trim stays visual.
- Gates have an 18-meter clear opening and a header beginning at 15 meters. Both faces carry
  route markings. Pillars and the elevated header have separate collision boxes.
- Landing targets are 2 cm thick paint marks at ground level with no solid collision.
- Gates and landing targets are instanced. Cached GLTF geometry and materials are shared;
  the static instance helper uploads transforms once and computes culling bounds.
- No animation or extra shadow pass. Existing dynamic scene lighting shades the material.
  These small assets use a single low-poly mesh rather than extra LOD objects.

The regression tests enforce one primitive/material per model, zero textures, fewer than
3,000 triangles per model, and less than 450 KB for the whole kit. They also verify pickup
access across 32 seeds and collisions at the gate posts/header with an open jump corridor.
