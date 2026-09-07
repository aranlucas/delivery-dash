# Delivery Dash Blender assets

`delivery-dash-assets.blend` is the editable source for every exported vehicle and the repeated
street props. The runtime-ready GLBs live under `public/models/`.

To rebuild them, open Blender's Scripting workspace and run `build_assets.py`, or execute it through
the configured `ahujasid/blender-mcp` server. The script deliberately keeps wheel, glass, trim, lamp,
and body meshes named separately so the game can recolor and animate them while sharing geometry.

## Coastal map landmarks

`coastal-landmarks.blend` contains the original Ferris wheel, lighthouse, observation tower,
harbor crane, and race portal. Rebuild the editable scene and all five runtime GLBs with:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python assets/blender/build_landmarks.py
```

The script uses Z-up modeling and glTF's Y-up conversion. Parts are merged by material before
export to keep the landmarks to a handful of draw calls each. The runtime assets live in
`public/models/landmarks/`; their placement, reserved superblocks, and collision footprints
are defined in `src/shared/city.ts`. Rebuild this separate scene without touching the vehicle assets.
