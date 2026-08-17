# Delivery Dash Blender assets

`delivery-dash-assets.blend` is the editable source for every exported vehicle and the repeated
street props. The runtime-ready GLBs live under `public/models/`.

To rebuild them, open Blender's Scripting workspace and run `build_assets.py`, or execute it through
the configured `ahujasid/blender-mcp` server. The script deliberately keeps wheel, glass, trim, lamp,
and body meshes named separately so the game can recolor and animate them while sharing geometry.
