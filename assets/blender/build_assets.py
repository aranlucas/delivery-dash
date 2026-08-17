"""Build Delivery Dash's production vehicle and street-prop assets in Blender.

Run this script from Blender (or through Blender MCP). It saves the editable source
scene and exports the named meshes consumed by the React Three Fiber runtime.
"""

from pathlib import Path
import math

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE_PATH = ROOT / "assets" / "blender" / "delivery-dash-assets.blend"
VEHICLE_DIR = ROOT / "public" / "models" / "vehicles"
PROP_PATH = ROOT / "public" / "models" / "street-props.glb"


VEHICLES = {
    "taxi": {
        "length": 5.2,
        "width": 2.5,
        "sill": -0.5,
        "chamfer": 0.16,
        "wheel_radius": 0.54,
        "wheel_width": 0.42,
        "axle_inset": 0.24,
        "arch": 0.1,
        "checkers": True,
        "profile": [
            (0.0, 0.78, 0.14, 0.62),
            (0.06, 0.92, 0.06, 0.72),
            (0.2, 1.0, 0.03, 0.76),
            (0.5, 1.0, 0.03, 0.78),
            (0.78, 1.0, 0.03, 0.72),
            (0.92, 0.93, 0.06, 0.58),
            (1.0, 0.8, 0.15, 0.48),
        ],
        "cabin": [
            (0.2, 0.72, 0.7, 1.06),
            (0.3, 0.86, 0.76, 1.26),
            (0.44, 0.88, 0.78, 1.32),
            (0.58, 0.86, 0.78, 1.3),
            (0.7, 0.74, 0.7, 1.08),
        ],
    },
    "sedan": {},
    "van": {
        "length": 5.6,
        "width": 2.6,
        "chamfer": 0.12,
        "checkers": False,
        "profile": [
            (0.0, 0.86, 0.1, 1.5),
            (0.08, 0.98, 0.04, 1.56),
            (0.3, 1.0, 0.02, 1.58),
            (0.62, 1.0, 0.02, 1.56),
            (0.84, 0.98, 0.04, 1.2),
            (0.94, 0.92, 0.08, 0.78),
            (1.0, 0.82, 0.16, 0.6),
        ],
        "cabin": [
            (0.06, 0.82, 0.94, 1.64),
            (0.16, 0.94, 0.94, 1.72),
            (0.7, 0.94, 0.94, 1.72),
            (0.82, 0.82, 0.84, 1.62),
        ],
    },
    "hatch": {
        "length": 4.2,
        "width": 2.35,
        "checkers": False,
        "profile": [
            (0.0, 0.82, 0.12, 0.92),
            (0.08, 0.95, 0.05, 0.98),
            (0.26, 1.0, 0.03, 1.0),
            (0.6, 1.0, 0.03, 0.86),
            (0.86, 0.96, 0.05, 0.6),
            (1.0, 0.82, 0.14, 0.48),
        ],
        "cabin": [
            (0.1, 0.76, 0.88, 1.16),
            (0.22, 0.88, 0.98, 1.34),
            (0.5, 0.88, 0.9, 1.34),
            (0.66, 0.76, 0.76, 1.08),
        ],
    },
    "sports": {
        "length": 5.0,
        "width": 2.62,
        "sill": -0.6,
        "chamfer": 0.2,
        "wheel_radius": 0.56,
        "arch": 0.14,
        "checkers": False,
        "profile": [
            (0.0, 0.84, 0.1, 0.5),
            (0.08, 0.96, 0.04, 0.58),
            (0.26, 1.0, 0.02, 0.6),
            (0.55, 1.0, 0.02, 0.58),
            (0.82, 0.98, 0.02, 0.46),
            (1.0, 0.82, 0.1, 0.34),
        ],
        "cabin": [
            (0.24, 0.7, 0.5, 0.84),
            (0.36, 0.84, 0.58, 0.98),
            (0.5, 0.84, 0.58, 1.0),
            (0.72, 0.68, 0.44, 0.78),
        ],
    },
}


def complete_specs():
    base = VEHICLES["taxi"]
    VEHICLES["sedan"] = {**base, "checkers": False}
    for name, partial in list(VEHICLES.items()):
        VEHICLES[name] = {**base, **partial}


def reset():
    # Remove datablocks directly so a hidden authoring helper from a previous run
    # cannot survive selection-based deletion and force unstable `.001` node names.
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for collection in list(bpy.data.collections):
        if collection != bpy.context.scene.collection:
            bpy.data.collections.remove(collection)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)
    for camera in list(bpy.data.cameras):
        bpy.data.cameras.remove(camera)
    for light in list(bpy.data.lights):
        bpy.data.lights.remove(light)
    for material in list(bpy.data.materials):
        bpy.data.materials.remove(material)


def material(name, color, metallic=0.0, roughness=0.6, emission=None):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1.0)
    value.use_nodes = True
    shader = value.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    if emission:
        shader.inputs["Emission Color"].default_value = (*emission, 1.0)
        shader.inputs["Emission Strength"].default_value = 2.4
    return value


def move_to_collection(obj, collection):
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    collection.objects.link(obj)


def game_to_blender(point):
    x, y, z = point
    return (x, -z, y)


def ring(half_width, bottom, top, chamfer):
    amount = min(chamfer, half_width * 0.6, (top - bottom) * 0.4)
    return [
        (-half_width + amount, bottom),
        (half_width - amount, bottom),
        (half_width, bottom + amount),
        (half_width, top - amount),
        (half_width - amount, top),
        (-half_width + amount, top),
        (-half_width, top - amount),
        (-half_width, bottom + amount),
    ]


def bump(position, center, spread):
    return max(0.0, 1.0 - ((position - center) / spread) ** 2)


def body_half_width(spec, position):
    width_scale = spec["profile"][-1][1]
    for start, end in zip(spec["profile"], spec["profile"][1:]):
        if start[0] <= position <= end[0]:
            progress = 0.0 if start[0] == end[0] else (position - start[0]) / (end[0] - start[0])
            width_scale = start[1] + (end[1] - start[1]) * progress
            break
    flare = spec["arch"] * (
        bump(position, spec["axle_inset"], 0.15)
        + bump(position, 1.0 - spec["axle_inset"], 0.15)
    )
    return spec["width"] * 0.5 * width_scale + flare


def profile_top(spec, position):
    """Interpolate the body shoulder height at a normalized length position."""
    top = spec["profile"][-1][3]
    for start, end in zip(spec["profile"], spec["profile"][1:]):
        if start[0] <= position <= end[0]:
            progress = 0.0 if start[0] == end[0] else (position - start[0]) / (end[0] - start[0])
            top = start[3] + (end[3] - start[3]) * progress
            break
    return top


def loft(name, spec, profile, collection, mat, roof=False, glass=False, flare=False):
    vertices = []
    faces = []
    for station_index, (position, width_scale, bottom, top) in enumerate(profile):
        if flare:
            half_width = body_half_width(spec, position)
            arch_lift = spec["wheel_radius"] * 0.82 * max(
                bump(position, spec["axle_inset"], 0.11),
                bump(position, 1.0 - spec["axle_inset"], 0.11),
            )
        else:
            half_width = spec["width"] * 0.5 * width_scale
            arch_lift = 0.0
        if glass:
            # The cabin roof is a closed shell. Put the glass skin just outside
            # it (including the end caps) so the opaque side faces cannot clip
            # the windows down to a narrow slit in Blender or the exported GLB.
            window_height = top - bottom
            half_width *= 1.025
            bottom += min(0.012, window_height * 0.06)
            top -= min(0.055, window_height * 0.22)
            if station_index == 0:
                position -= 0.004
            elif station_index == len(profile) - 1:
                position += 0.004
        if roof:
            half_width *= 1.015
            bottom = top - max(0.13, (top - bottom) * 0.3)
            top += 0.02
        cross_section = ring(
            half_width,
            spec["sill"] + bottom + arch_lift,
            spec["sill"] + top,
            spec["chamfer"] * (0.5 if roof else 0.6 if glass else 1.0),
        )
        game_z = -spec["length"] * 0.5 + position * spec["length"]
        vertices.extend(game_to_blender((x, y, game_z)) for x, y in cross_section)
    size = 8
    for station in range(len(profile) - 1):
        for point in range(size):
            nxt = (point + 1) % size
            a = station * size + point
            b = station * size + nxt
            c = (station + 1) * size + nxt
            d = (station + 1) * size + point
            faces.append((a, b, c, d))
    faces.append(tuple(range(size - 1, -1, -1)))
    end = (len(profile) - 1) * size
    faces.append(tuple(end + point for point in range(size)))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def cube(name, location, size, collection, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=game_to_blender(location))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (size[0] * 0.5, size[2] * 0.5, size[1] * 0.5)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    move_to_collection(obj, collection)
    if bevel:
        modifier = obj.modifiers.new("Edge break", "BEVEL")
        modifier.width = bevel
        modifier.segments = 1
    return obj


def cylinder(name, location, radius, depth, collection, mat, vertices=10, axis="y"):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=game_to_blender(location),
    )
    obj = bpy.context.object
    obj.name = name
    if axis == "x":
        obj.rotation_euler[1] = math.pi / 2
    elif axis == "z":
        obj.rotation_euler[0] = math.pi / 2
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.data.materials.append(mat)
    move_to_collection(obj, collection)
    return obj


def sphere(name, location, radius, collection, mat, segments=10, rings=5, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        radius=radius,
        location=game_to_blender(location),
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = (scale[0], scale[2], scale[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    move_to_collection(obj, collection)
    return obj


def apply_modifiers(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for modifier in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def join(name, parts, mat=None):
    for part in parts:
        apply_modifiers(part)
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    result = parts[0]
    result.name = name
    result.data.name = name
    if mat:
        result.data.materials.clear()
        result.data.materials.append(mat)
    result.select_set(False)
    return result


def make_parent(name, collection):
    parent = bpy.data.objects.new(name, None)
    collection.objects.link(parent)
    return parent


def parent_all(parent, objects):
    for obj in objects:
        obj.parent = parent


def wheel_positions(spec):
    y = spec["wheel_radius"] - 0.8
    front_position = 1.0 - spec["axle_inset"]
    rear_position = spec["axle_inset"]
    front = -spec["length"] * 0.5 + front_position * spec["length"]
    rear = -spec["length"] * 0.5 + rear_position * spec["length"]
    front_x = body_half_width(spec, front_position) - spec["wheel_width"] * 0.3
    rear_x = body_half_width(spec, rear_position) - spec["wheel_width"] * 0.3
    return [
        ("front_left", -front_x, y, front),
        ("front_right", front_x, y, front),
        ("rear_left", -rear_x, y, rear),
        ("rear_right", rear_x, y, rear),
    ]


def build_vehicle(kind, spec, mats, display_x):
    collection = bpy.data.collections.new(f"Vehicle_{kind}")
    bpy.context.scene.collection.children.link(collection)
    parent = make_parent(f"vehicle_{kind}", collection)

    body = join(
        f"{kind}_body",
        [
            loft(f"{kind}_body_shell", spec, spec["profile"], collection, mats["paint"], flare=True),
            loft(f"{kind}_roof", spec, spec["cabin"], collection, mats["paint"], roof=True),
        ],
        mats["paint"],
    )
    body_bevel = body.modifiers.new("Soft body edges", "BEVEL")
    body_bevel.width = 0.035
    body_bevel.segments = 2
    body_bevel.limit_method = "ANGLE"
    glass = loft(f"{kind}_glass", spec, spec["cabin"], collection, mats["glass"], glass=True)

    trim_parts = []
    top = max(station[3] for station in spec["profile"])
    for end in (-1, 1):
        trim_parts.append(
            cube(
                f"{kind}_bumper",
                (0, spec["sill"] + 0.24, end * spec["length"] * 0.5 - end * 0.05),
                (spec["width"] * 0.9, 0.3, 0.24),
                collection,
                mats["trim"],
                0.025,
            )
        )
    for side in (-1, 1):
        trim_parts.append(
            cube(
                f"{kind}_mirror",
                (side * (spec["width"] * 0.5 + 0.12), spec["sill"] + top * 0.95, spec["length"] * 0.14),
                (0.3, 0.12, 0.26),
                collection,
                mats["trim"],
                0.02,
            )
        )
        trim_parts.append(
            cube(
                f"{kind}_rocker",
                (side * (spec["width"] * 0.5 + 0.01), spec["sill"] + 0.16, 0),
                (0.12, 0.18, spec["length"] * 0.54),
                collection,
                mats["trim"],
                0.018,
            )
        )
        # A readable door break and two handles make the side elevation feel like a car rather
        # than one uninterrupted extrusion, while remaining cheap enough for the shared LOD.
        door_position = 0.5
        door_top = profile_top(spec, door_position)
        trim_parts.append(
            cube(
                f"{kind}_door_seam",
                (
                    side * (body_half_width(spec, door_position) + 0.018),
                    spec["sill"] + 0.18 + (door_top - 0.22) * 0.5,
                    0,
                ),
                (0.045, max(0.22, door_top - 0.22), 0.045),
                collection,
                mats["trim"],
                0.008,
            )
        )
        for handle_position in (0.38, 0.6):
            trim_parts.append(
                cube(
                    f"{kind}_door_handle",
                    (
                        side * (body_half_width(spec, handle_position) + 0.035),
                        spec["sill"] + profile_top(spec, handle_position) * 0.68,
                        -spec["length"] * 0.5 + handle_position * spec["length"],
                    ),
                    (0.075, 0.065, 0.28),
                    collection,
                    mats["trim"],
                    0.018,
                )
            )
        middle = spec["cabin"][len(spec["cabin"]) // 2]
        pillar_height = max(0.3, middle[3] - middle[2] - 0.08)
        trim_parts.append(
            cube(
                f"{kind}_pillar",
                (
                    side * (spec["width"] * 0.5 * middle[1] + 0.01),
                    spec["sill"] + middle[2] + pillar_height * 0.5,
                    -spec["length"] * 0.5 + middle[0] * spec["length"],
                ),
                (0.07, pillar_height, 0.13),
                collection,
                mats["trim"],
                0.012,
            )
        )
        for position in (spec["axle_inset"], 1.0 - spec["axle_inset"]):
            trim_parts.append(
                cylinder(
                    f"{kind}_wheel_liner",
                    (
                        side * (body_half_width(spec, position) - spec["wheel_width"] * 0.1),
                        spec["wheel_radius"] - 0.8,
                        -spec["length"] * 0.5 + position * spec["length"],
                    ),
                    spec["wheel_radius"] * 1.11,
                    spec["wheel_width"] * 0.16,
                    collection,
                    mats["trim"],
                    16,
                    "x",
                )
            )
    trim_parts.extend(
        [
            cube(
                f"{kind}_grille",
                (0, spec["sill"] + 0.35, spec["length"] * 0.5 + 0.01),
                (spec["width"] * 0.46, 0.24, 0.08),
                collection,
                mats["trim"],
                0.02,
            ),
            cube(
                f"{kind}_diffuser",
                (0, spec["sill"] + 0.19, -spec["length"] * 0.5 - 0.015),
                (spec["width"] * 0.5, 0.18, 0.11),
                collection,
                mats["trim"],
                0.016,
            ),
        ]
    )
    for panel_position in (0.13, 0.84):
        trim_parts.append(
            cube(
                f"{kind}_panel_break",
                (
                    0,
                    spec["sill"] + profile_top(spec, panel_position) + 0.018,
                    -spec["length"] * 0.5 + panel_position * spec["length"],
                ),
                (body_half_width(spec, panel_position) * 1.45, 0.025, 0.045),
                collection,
                mats["trim"],
                0.006,
            )
        )
    if spec["checkers"]:
        cells = 8
        span = 0.56
        start = 0.22
        cell_length = spec["length"] * span / cells
        for index in range(cells):
            if index % 2:
                continue
            position = start + (index + 0.5) / cells * span
            for side in (-1, 1):
                trim_parts.append(
                    cube(
                        f"{kind}_checker",
                        (
                            side * (body_half_width(spec, position) + 0.015),
                            spec["sill"] + 0.46,
                            -spec["length"] * 0.5 + position * spec["length"],
                        ),
                        (0.05, 0.26, cell_length),
                        collection,
                        mats["trim"],
                    )
                )
    trim = join(f"{kind}_trim", trim_parts, mats["trim"])

    def lights(rear):
        position = 0.02 if rear else 0.98
        output = []
        for side in (-1, 1):
            output.append(
                cube(
                    f"{kind}_{'tail' if rear else 'head'}light_part",
                    (
                        side * body_half_width(spec, position) * 0.62,
                        spec["sill"] + (0.44 if rear else 0.38),
                        -spec["length"] * 0.5 + 0.05 if rear else spec["length"] * 0.5 - 0.05,
                    ),
                    (spec["width"] * 0.24, 0.17, 0.14),
                    collection,
                    mats["tail" if rear else "head"],
                    0.02,
                )
            )
        return join(
            f"{kind}_{'taillights' if rear else 'headlights'}",
            output,
            mats["tail" if rear else "head"],
        )

    headlights = lights(False)
    taillights = lights(True)
    wheels = []
    for position_name, x, y, z in wheel_positions(spec):
        tyre = cylinder(
            f"{kind}_{position_name}_tyre",
            (x, y, z),
            spec["wheel_radius"],
            spec["wheel_width"],
            collection,
            mats["tyre"],
            16,
            "x",
        )
        rim = cylinder(
            f"{kind}_{position_name}_rim",
            (x, y, z),
            spec["wheel_radius"] * 0.6,
            spec["wheel_width"] * 1.02,
            collection,
            mats["rim"],
            12,
            "x",
        )
        for wheel_part in (tyre, rim):
            for polygon in wheel_part.data.polygons:
                polygon.use_smooth = True
        wheels.extend([tyre, rim])

    peak = spec["sill"] + max(station[3] for station in spec["cabin"])
    topper = cube(
        f"{kind}_topper",
        (0, peak + 0.2, -0.1),
        (1.1, 0.38, 0.72),
        collection,
        mats["topper"],
        0.08,
    )

    fleet_parts = [
        cube(f"{kind}_fleet_bumper_front", (0, -0.27, 2.54), (2.34, 0.25, 0.2), collection, mats["trim"]),
        cube(f"{kind}_fleet_bumper_rear", (0, -0.27, -2.54), (2.34, 0.25, 0.2), collection, mats["trim"]),
        cube(f"{kind}_fleet_grille", (0, -0.18, 2.65), (1.16, 0.24, 0.08), collection, mats["trim"]),
        cube(f"{kind}_fleet_diffuser", (0, -0.37, -2.65), (1.24, 0.18, 0.1), collection, mats["trim"]),
    ]
    for _, x, _, z in wheel_positions(spec):
        fleet_parts.append(
            cylinder(
                f"{kind}_fleet_wheel",
                (x, spec["wheel_radius"] - 0.8, z),
                spec["wheel_radius"],
                spec["wheel_width"],
                collection,
                mats["trim"],
                8,
                "x",
            )
        )
    fleet_trim = join(f"{kind}_fleet_trim", fleet_parts, mats["trim"])

    objects = [body, glass, trim, headlights, taillights, topper, fleet_trim, *wheels]
    parent_all(parent, objects)
    parent.location.x = display_x
    return parent, objects


def build_props(mats):
    collection = bpy.data.collections.new("Street_Props")
    bpy.context.scene.collection.children.link(collection)
    roots = []

    def root(name, display_x):
        value = make_parent(name, collection)
        value.location.x = display_x
        roots.append(value)
        return value

    hydrant_root = root("prop_hydrant", -7.5)
    hydrant = join(
        "prop_hydrant_mesh",
        [
            cylinder("hydrant_foot", (0, 0.12, 0), 0.34, 0.2, collection, mats["hydrant"], 10),
            cylinder("hydrant_body", (0, 0.61, 0), 0.25, 0.82, collection, mats["hydrant"], 10),
            sphere("hydrant_dome", (0, 1.02, 0), 0.25, collection, mats["hydrant"], 10, 5, (1, 0.72, 1)),
            cylinder("hydrant_stem", (0, 1.2, 0), 0.11, 0.25, collection, mats["hydrant"], 8),
            cylinder("hydrant_port_left", (-0.3, 0.76, 0), 0.12, 0.22, collection, mats["hydrant"], 8, "x"),
            cylinder("hydrant_port_right", (0.3, 0.76, 0), 0.12, 0.22, collection, mats["hydrant"], 8, "x"),
        ],
        mats["hydrant"],
    )
    hydrant.parent = hydrant_root

    bin_root = root("prop_bin", -4.5)
    bin_mesh = cylinder("prop_bin_mesh", (0, 0.5, 0), 0.5, 1.0, collection, mats["bin"], 10)
    bin_mesh.scale.x = 0.9
    bin_mesh.scale.y = 0.84
    bpy.context.view_layer.objects.active = bin_mesh
    bin_mesh.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bin_mesh.select_set(False)
    bin_mesh.parent = bin_root

    bench_root = root("prop_bench", 0)
    bench_back = cube(
        "bench_back",
        (0, 1.12, 0.28),
        (2.8, 0.72, 0.15),
        collection,
        mats["wood"],
        0.04,
    )
    bench_back.rotation_euler[0] = -0.16
    bpy.context.view_layer.objects.active = bench_back
    bench_back.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    bench_back.select_set(False)
    bench = join(
        "prop_bench_mesh",
        [
            cube("bench_seat", (0, 0.72, 0), (2.8, 0.16, 0.68), collection, mats["wood"], 0.04),
            bench_back,
            cube("bench_leg_left", (-0.92, 0.34, 0), (0.18, 0.68, 0.48), collection, mats["wood"], 0.035),
            cube("bench_leg_right", (0.92, 0.34, 0), (0.18, 0.68, 0.48), collection, mats["wood"], 0.035),
        ],
        mats["wood"],
    )
    bench.parent = bench_root

    light_root = root("prop_streetlight", 5.2)
    pole = join(
        "prop_streetlight_pole",
        [
            cylinder("streetlight_pole", (0, 3, 0), 0.09, 6.0, collection, mats["metal"], 8),
            cylinder("streetlight_arm", (0, 6, 0.48), 0.075, 1.05, collection, mats["metal"], 8, "z"),
            cube("streetlight_housing", (0, 5.92, 0.96), (0.7, 0.24, 0.46), collection, mats["metal"], 0.06),
        ],
        mats["metal"],
    )
    lens = cube(
        "prop_streetlight_lens",
        (0, 5.78, 0.96),
        (0.5, 0.08, 0.32),
        collection,
        mats["glow"],
        0.025,
    )
    parent_all(light_root, [pole, lens])

    palm_root = root("prop_palm", 10.5)
    trunk = cylinder("prop_palm_trunk", (0, 3.5, 0), 0.25, 7.0, collection, mats["trunk"], 7)
    vertices = []
    faces = []
    segments = 5
    for step in range(segments + 1):
        progress = step / segments
        width = math.sin(progress * math.pi) * 0.48 + (1.0 - progress) * 0.05
        drop = progress * progress * 1.15
        distance = progress * 3.5
        vertices.extend(
            [
                game_to_blender((-width, -drop, distance)),
                game_to_blender((width, -drop, distance)),
            ]
        )
    for step in range(segments):
        left = step * 2
        faces.append((left, left + 2, left + 3, left + 1))
    mesh = bpy.data.meshes.new("prop_palm_frond")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(mats["leaf"])
    frond = bpy.data.objects.new("prop_palm_frond", mesh)
    collection.objects.link(frond)
    frond.location = game_to_blender((0, 7.5, 0))
    parent_all(palm_root, [trunk, frond])
    return roots


def select_tree(parent):
    bpy.ops.object.select_all(action="DESELECT")
    parent.select_set(True)
    for child in parent.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = parent


def export_parent(parent, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    display_location = parent.location.copy()
    parent.location = (0, 0, 0)
    bpy.context.view_layer.update()
    select_tree(parent)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        export_texcoords=False,
    )
    parent.location = display_location
    bpy.context.view_layer.update()


def export_props(roots):
    PROP_PATH.parent.mkdir(parents=True, exist_ok=True)
    display_locations = {root: root.location.copy() for root in roots}
    bpy.ops.object.select_all(action="DESELECT")
    for root in roots:
        root.location = (0, 0, 0)
        root.select_set(True)
        for child in root.children_recursive:
            child.select_set(True)
    bpy.context.view_layer.update()
    bpy.ops.export_scene.gltf(
        filepath=str(PROP_PATH),
        export_format="GLB",
        use_selection=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        export_texcoords=False,
    )
    for root, location in display_locations.items():
        root.location = location
    bpy.context.view_layer.update()


def frame_source_scene():
    bpy.ops.object.light_add(type="AREA", location=(2, -9, 14))
    key = bpy.context.object
    key.name = "Studio Key"
    key.data.energy = 1800
    key.data.shape = "DISK"
    key.data.size = 8
    key.rotation_euler = (math.radians(28), 0, math.radians(18))
    bpy.ops.object.light_add(type="AREA", location=(-13, 3, 8))
    fill = bpy.context.object
    fill.name = "Studio Fill"
    fill.data.energy = 900
    fill.data.color = (0.26, 0.52, 1.0)
    fill.data.size = 7
    bpy.ops.object.camera_add(location=(22, -31, 17))
    camera = bpy.context.object
    camera.name = "Asset Overview Camera"
    camera.data.lens = 52
    target = Vector((0, 0, 1.5))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = camera
    world = bpy.context.scene.world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.012, 0.025, 0.055, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.38


def main():
    complete_specs()
    reset()
    mats = {
        "paint": material("Vehicle Paint", (1.0, 0.62, 0.015), 0.28, 0.34),
        "glass": material("Vehicle Glass", (0.025, 0.075, 0.12), 0.5, 0.12),
        "trim": material("Vehicle Trim", (0.018, 0.024, 0.032), 0.3, 0.5),
        "tyre": material("Vehicle Tyre", (0.008, 0.01, 0.014), 0, 0.92),
        "rim": material("Vehicle Rim", (0.45, 0.5, 0.58), 0.8, 0.24),
        "topper": material("Taxi Roof Sign", (1.0, 0.42, 0.015), 0.08, 0.38, (1.0, 0.2, 0.01)),
        "head": material("Vehicle Headlight", (1.0, 0.86, 0.58), 0, 0.22, (1.0, 0.65, 0.2)),
        "tail": material("Vehicle Taillight", (0.5, 0.02, 0.015), 0, 0.25, (1.0, 0.03, 0.01)),
        "hydrant": material("Hydrant Red", (0.72, 0.025, 0.018), 0.15, 0.48),
        "wood": material("Bench Wood", (0.36, 0.14, 0.04), 0, 0.82),
        "metal": material("Street Metal", (0.08, 0.1, 0.13), 0.72, 0.3),
        "glow": material("Street Glow", (1.0, 0.78, 0.42), 0, 0.2, (1.0, 0.45, 0.1)),
        "bin": material("Bin Green", (0.08, 0.16, 0.11), 0.05, 0.9),
        "trunk": material("Palm Trunk", (0.34, 0.16, 0.06), 0, 0.95),
        "leaf": material("Palm Leaf", (0.03, 0.42, 0.14), 0, 0.82),
    }
    display_positions = [-12.0, -6.0, 0.0, 6.0, 12.0]
    vehicles = {}
    for (kind, display_x) in zip(VEHICLES, display_positions):
        vehicles[kind] = build_vehicle(kind, VEHICLES[kind], mats, display_x)
    prop_roots = build_props(mats)
    for root in prop_roots:
        root.location.y = 8.5
    frame_source_scene()

    for kind, (parent, _) in vehicles.items():
        export_parent(parent, VEHICLE_DIR / f"{kind}.glb")
    export_props(prop_roots)

    # Fleet trim is a deliberately coarse instancing LOD stored in each GLB. Showing it on top
    # of the full car creates a second set of boxy window bars in the editable overview. Topper
    # geometry stays available in every export for a stable node contract, but only taxis show it.
    for _, objects in vehicles.values():
        for obj in objects:
            if obj.name.endswith("_fleet_trim") or (
                obj.name.endswith("_topper") and not obj.name.startswith("taxi_")
            ):
                obj.hide_viewport = True
                obj.hide_render = True

    SOURCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_PATH))
    print(f"Saved source: {SOURCE_PATH}")
    print(f"Exported vehicles: {VEHICLE_DIR}")
    print(f"Exported props: {PROP_PATH}")


main()
