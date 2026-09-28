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
        "wheel_radius": 0.46,
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
            (0.62, 1.0, 0.02, 1.58),
            (0.66, 1.0, 0.02, 1.0),
            (0.84, 0.98, 0.04, 0.9),
            (0.94, 0.92, 0.08, 0.76),
            (1.0, 0.82, 0.16, 0.6),
        ],
        "cabin": [
            # Windowless cargo box: the fifth value tucks the glass inside the roof.
            (0.06, 0.82, 1.56, 1.72, False),
            (0.16, 0.86, 1.56, 1.72, False),
            (0.6, 0.86, 1.56, 1.72, False),
            (0.65, 0.94, 0.98, 1.72),
            (0.74, 0.92, 0.92, 1.7),
            (0.86, 0.8, 0.86, 1.46),
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
        "arch": 0.14,
        "checkers": False,
        "profile": [
            (0.0, 0.84, 0.12, 0.56),
            (0.08, 0.96, 0.04, 0.7),
            (0.26, 1.0, 0.02, 0.8),
            (0.55, 1.0, 0.02, 0.7),
            (0.82, 0.98, 0.02, 0.78),
            (1.0, 0.82, 0.1, 0.44),
        ],
        "cabin": [
            (0.24, 0.7, 0.68, 0.96),
            (0.36, 0.84, 0.7, 1.12),
            (0.52, 0.84, 0.7, 1.14),
            (0.72, 0.66, 0.66, 0.9),
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


def interpolate_station(stations, position):
    """Return (width scale, bottom, top) of a station list at a normalized length position."""
    for start, end in zip(stations, stations[1:]):
        if start[0] <= position <= end[0]:
            progress = 0.0 if start[0] == end[0] else (position - start[0]) / (end[0] - start[0])
            return tuple(a + (b - a) * progress for a, b in zip(start[1:], end[1:]))
    return tuple(stations[-1][1:] if position > stations[-1][0] else stations[0][1:])


def profile_top(spec, position):
    """Interpolate the body shoulder height at a normalized length position."""
    return interpolate_station(spec["profile"], position)[2]


def arch_radius(spec):
    return spec["wheel_radius"] * 1.08


def body_stations(spec):
    """Resample the body profile densely and cut round wheel arches into it.

    The authored profile only has a handful of stations, which is too coarse for a
    circular opening. Extra stations are added only across each arch (plus its exact
    edges) so the loft follows the arch without bloating the instanced fleet body, and
    the shoulder is lifted just enough to keep a fender lip over each tyre.
    """
    length = spec["length"]
    radius = arch_radius(spec)
    axles = (spec["axle_inset"], 1.0 - spec["axle_inset"])
    positions = {station[0] for station in spec["profile"]}
    for axle in axles:
        span = radius / length
        positions.update(axle + span * (index / 4 - 1) for index in range(1, 8))
        for side in (-1, 1):
            edge = axle + side * span
            positions.update((edge - side * 0.0006, edge + side * 0.0006))
    axle_height = spec["wheel_radius"] - 0.8 - spec["sill"]
    stations = []
    for position in sorted(p for p in positions if 0.0 <= p <= 1.0):
        width_scale, bottom, top = interpolate_station(spec["profile"], position)
        for axle in axles:
            distance = abs(position - axle) * length
            if distance < radius:
                arch_top = axle_height + math.sqrt(radius * radius - distance * distance)
                bottom = max(bottom, arch_top)
                top = max(top, arch_top + 0.06)
        stations.append((position, width_scale, bottom, top))
    return stations


def end_layout(spec, rear):
    """Bumper and lamp placement (relative to the sill) for one end of the body."""
    station = spec["profile"][0] if rear else spec["profile"][-1]
    bottom, top = station[2], station[3]
    bumper_top = bottom + 0.12
    room = top - bumper_top
    lamp_height = min(0.16, max(0.06, room * 0.5))
    half_width = body_half_width(spec, 0.0 if rear else 1.0)
    return {
        "bumper_y": bumper_top - 0.11,
        "bumper_width": half_width * 2 * 0.96,
        "lamp_y": bumper_top + room * 0.5,
        "lamp_height": lamp_height,
        "lamp_x": half_width * 0.6,
        "lamp_width": min(spec["width"] * 0.24, half_width * 0.62),
        "z": (-1 if rear else 1) * spec["length"] * 0.5,
    }


def loft(name, spec, profile, collection, mat, roof=False, glass=False, flare=False):
    vertices = []
    faces = []
    for station_index, station in enumerate(profile):
        position, width_scale, bottom, top = station[:4]
        glazed = station[4] if len(station) > 4 else True
        if flare:
            half_width = body_half_width(spec, position)
        else:
            half_width = spec["width"] * 0.5 * width_scale
        if glass and not glazed:
            # Unglazed stations (cargo boxes) keep the glass fully inside the roof slab.
            half_width *= 0.97
            bottom = top - 0.1
            top -= 0.03
            if station_index == 0:
                position += 0.004
            elif station_index == len(profile) - 1:
                position -= 0.004
        elif glass:
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
            spec["sill"] + bottom,
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


def tyre(name, location, radius, width, collection, mat, segments=18):
    """Revolve an open-centre tyre so the recessed rim shows through the sidewall."""
    # (radius scale, axle offset scale) around the cross-section, ending on the inner lip.
    section = [(0.66, -0.46), (0.9, -0.5), (1.0, -0.38), (1.0, 0.38), (0.9, 0.5), (0.66, 0.46)]
    smooth_edges = {1, 2, 3, 5}  # shoulders, tread and inner lip; sidewalls stay flat
    count = len(section)
    vertices = []
    for step in range(segments):
        angle = 2 * math.pi * step / segments
        for radial, axial in section:
            vertices.append(
                game_to_blender(
                    (axial * width, radial * radius * math.cos(angle), radial * radius * math.sin(angle))
                )
            )
    faces = []
    smooth = []
    for step in range(segments):
        following = (step + 1) % segments
        for edge in range(count):
            nxt = (edge + 1) % count
            faces.append(
                (step * count + edge, following * count + edge, following * count + nxt, step * count + nxt)
            )
            smooth.append(edge in smooth_edges)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.polygons.foreach_set("use_smooth", smooth)
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    obj.location = game_to_blender(location)
    collection.objects.link(obj)
    return obj


def rim(name, location, radius, width, collection, mat):
    """Recessed five-spoke rim, symmetric across the axle so one mesh serves all four corners."""
    disc = cylinder(name, location, radius * 0.66, width * 0.62, collection, mat, 12, "x")
    parts = [
        disc,
        cylinder(f"{name}_hub", location, radius * 0.2, width * 0.84, collection, mat, 8, "x"),
    ]
    for index in range(5):
        spoke = cube(
            f"{name}_spoke",
            location,
            (width * 0.72, radius * 0.44, radius * 0.1),
            collection,
            mat,
        )
        # Push the spoke out along the wheel radius, then spin it about the axle.
        for vertex in spoke.data.vertices:
            vertex.co.z += radius * 0.4
        spoke.rotation_euler[0] = index * 2 * math.pi / 5
        bpy.context.view_layer.objects.active = spoke
        spoke.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
        spoke.select_set(False)
        parts.append(spoke)
    return join(name, parts, mat)


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
            loft(f"{kind}_body_shell", spec, body_stations(spec), collection, mats["paint"], flare=True),
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
    for rear in (True, False):
        layout = end_layout(spec, rear)
        direction = -1 if rear else 1
        trim_parts.append(
            cube(
                f"{kind}_bumper",
                (0, spec["sill"] + layout["bumper_y"], layout["z"] - direction * 0.06),
                (layout["bumper_width"], 0.22, 0.22),
                collection,
                mats["trim"],
                0.025,
            )
        )
    mirror_position = spec["cabin"][-1][0] - 0.03
    mirror_z = -spec["length"] * 0.5 + mirror_position * spec["length"]
    mirror_base = spec["sill"] + max(profile_top(spec, mirror_position), spec["cabin"][-1][2])
    mirror_x = body_half_width(spec, mirror_position)
    rocker_length = (1.0 - 2 * spec["axle_inset"]) * spec["length"] - 2 * arch_radius(spec) - 0.12
    for side in (-1, 1):
        trim_parts.append(
            cube(
                f"{kind}_mirror_arm",
                (side * (mirror_x - 0.12), mirror_base + 0.04, mirror_z),
                (0.3, 0.05, 0.1),
                collection,
                mats["trim"],
            )
        )
        trim_parts.append(
            cube(
                f"{kind}_mirror",
                (side * (mirror_x + 0.05), mirror_base + 0.1, mirror_z),
                (0.12, 0.15, 0.24),
                collection,
                mats["trim"],
                0.02,
            )
        )
        trim_parts.append(
            cube(
                f"{kind}_rocker",
                (side * (spec["width"] * 0.5 + 0.01), spec["sill"] + 0.14, 0),
                (0.12, 0.16, rocker_length),
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
    front = end_layout(spec, False)
    back = end_layout(spec, True)
    trim_parts.extend(
        [
            cube(
                f"{kind}_grille",
                (0, spec["sill"] + front["lamp_y"], front["z"] - 0.02),
                (
                    max(0.3, 2 * (front["lamp_x"] - front["lamp_width"] * 0.5) - 0.12),
                    front["lamp_height"] * 0.85,
                    0.08,
                ),
                collection,
                mats["trim"],
                0.015,
            ),
            cube(
                f"{kind}_diffuser",
                (0, spec["sill"] + back["bumper_y"] - 0.06, back["z"] + 0.02),
                (spec["width"] * 0.5, 0.12, 0.2),
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
        start = spec["axle_inset"] + (arch_radius(spec) + 0.08) / spec["length"]
        span = 1.0 - 2 * start
        cell_length = spec["length"] * span / cells
        for row, row_height in enumerate((0.3, 0.42)):
            for index in range(cells):
                if (index + row) % 2:
                    continue
                position = start + (index + 0.5) / cells * span
                for side in (-1, 1):
                    trim_parts.append(
                        cube(
                            f"{kind}_checker",
                            (
                                side * (body_half_width(spec, position) + 0.012),
                                spec["sill"] + row_height,
                                -spec["length"] * 0.5 + position * spec["length"],
                            ),
                            (0.04, 0.12, cell_length),
                            collection,
                            mats["trim"],
                        )
                    )
    trim = join(f"{kind}_trim", trim_parts, mats["trim"])

    def lights(rear):
        layout = end_layout(spec, rear)
        direction = -1 if rear else 1
        output = []
        for side in (-1, 1):
            output.append(
                cube(
                    f"{kind}_{'tail' if rear else 'head'}light_part",
                    (
                        side * layout["lamp_x"],
                        spec["sill"] + layout["lamp_y"],
                        layout["z"] - direction * 0.03,
                    ),
                    (layout["lamp_width"], layout["lamp_height"], 0.1),
                    collection,
                    mats["tail" if rear else "head"],
                    0.015,
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
        wheels.append(
            tyre(
                f"{kind}_{position_name}_tyre",
                (x, y, z),
                spec["wheel_radius"],
                spec["wheel_width"],
                collection,
                mats["tyre"],
            )
        )
        wheels.append(
            rim(
                f"{kind}_{position_name}_rim",
                (x, y, z),
                spec["wheel_radius"],
                spec["wheel_width"],
                collection,
                mats["rim"],
            )
        )

    peak = spec["sill"] + max(station[3] for station in spec["cabin"])
    topper = cube(
        f"{kind}_topper",
        (0, peak + 0.2, -0.1),
        (1.1, 0.38, 0.72),
        collection,
        mats["topper"],
        0.08,
    )

    # Coarse instancing LOD: same footprint as the full trim, without bevels or small details.
    fleet_parts = []
    for rear, layout in ((False, front), (True, back)):
        direction = -1 if rear else 1
        fleet_parts.append(
            cube(
                f"{kind}_fleet_bumper_{'rear' if rear else 'front'}",
                (0, spec["sill"] + layout["bumper_y"], layout["z"] - direction * 0.06),
                (layout["bumper_width"], 0.22, 0.22),
                collection,
                mats["trim"],
            )
        )
    fleet_parts.append(
        cube(
            f"{kind}_fleet_grille",
            (0, spec["sill"] + front["lamp_y"], front["z"] - 0.02),
            (max(0.3, 2 * (front["lamp_x"] - front["lamp_width"] * 0.5) - 0.12), front["lamp_height"] * 0.85, 0.08),
            collection,
            mats["trim"],
        )
    )
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
