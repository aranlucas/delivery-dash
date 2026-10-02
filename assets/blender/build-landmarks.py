"""Original low-poly coastal landmarks. Run with Blender --background --python this_file.
Uses a separate scene, saves editable source, and merges meshes by material for cheap GLBs.
Blender Z-up is converted to the game's Y-up by the glTF exporter.
"""
from pathlib import Path
import math
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/models/landmarks'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color, glow=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = .65
    bsdf.inputs['Emission Color'].default_value = (*color, 1)
    bsdf.inputs['Emission Strength'].default_value = glow
    return m

cream = material('warm ivory', (.94, .84, .63))
coral = material('sunset coral', (.95, .17, .25))
teal = material('lagoon turquoise', (.025, .55, .58))
navy = material('midnight steel', (.045, .095, .16))
gold = material('marigold', (1, .56, .045))
glass = material('luminous mint', (.18, .9, .81), .65)
parts = []

def finish(obj, name, mat):
    obj.name = name
    obj.data.materials.append(mat)
    parts.append(obj)
    return obj

def box(name, loc, size, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, name, mat)

def cylinder(name, loc, r, depth, mat, r2=None):
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=r, radius2=r if r2 is None else r2, depth=depth, location=loc)
    return finish(bpy.context.object, name, mat)

def beam(name, a, b, r, mat):
    a,b=Vector(a),Vector(b)
    o=cylinder(name,(a+b)/2,r,(b-a).length,mat)
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    return o

def torus(name, loc, radius, tube, mat, vertical=False):
    bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=tube, major_segments=48, minor_segments=6, location=loc, rotation=(math.pi/2 if vertical else 0,0,0))
    return finish(bpy.context.object,name,mat)

def export(name):
    global parts
    merged=[]
    groups = [[o for o in parts if o.data.materials[0] == mat] for mat in {o.data.materials[0] for o in parts}]
    for same in groups:
        mat = same[0].data.materials[0]
        bpy.ops.object.select_all(action='DESELECT')
        for o in same: o.select_set(True)
        bpy.context.view_layer.objects.active=same[0]
        bpy.ops.object.join()
        same[0].name=name+'_'+mat.name
        merged.append(same[0])
    bpy.ops.object.select_all(action='DESELECT')
    for o in merged: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True,export_yup=True)
    # Offset only in the source scene for a readable asset lineup.
    for o in merged: o.location.x += export.offset
    export.offset += 85
    parts=[]
export.offset=0

# Ferris wheel: open spokes, A-frame supports, upright colourful gondolas.
cylinder('round plinth',(0,0,.45),12,.9,navy)
for y in [-3,3]:
    for x in [-9,9]: beam('A-frame',(x,y,.9),(0,y,18),.55,cream)
    torus('wheel rim',(0,y,18),13,.35,coral,True)
    for i in range(12):
        a=i*math.tau/12
        beam('spoke',(0,y,18),(13*math.cos(a),y,18+13*math.sin(a)),.13,gold)
beam('axle',(0,-4,18),(0,4,18),.8,teal)
for i in range(12):
    a=i*math.tau/12
    x,z=13*math.cos(a),18+13*math.sin(a)
    beam('gondola hanger',(x,0,z),(x,0,z-1.2),.12,navy)
    box('gondola',(x,0,z-1.9),(2.1,2.4,1.4),[teal,coral,gold][i%3])
    box('canopy',(x,0,z-.9),(2.4,2.7,.22),cream)
export('ferris')

# Art-deco lighthouse with balcony, lantern and striped tapered shaft.
cylinder('foundation',(0,0,.5),5,1,navy)
for i in range(6):
    cylinder('striped shaft',(0,0,1+i*4+2),3.7-i*.27,4,cream if i%2==0 else coral,3.43-i*.27)
cylinder('balcony',(0,0,25.2),4.2,.7,navy)
cylinder('lantern',(0,0,27.5),2.3,4,glass)
for i in range(8):
    a=i*math.tau/8
    beam('lantern mullion',(2.4*math.cos(a),2.4*math.sin(a),25.5),(2.4*math.cos(a),2.4*math.sin(a),29.5),.14,cream)
cylinder('roof',(0,0,31),3.5,3,coral,0)
beam('finial',(0,0,32.5),(0,0,35),.13,gold)
export('lighthouse')

# Retro-futurist observation tower: stepped fins and a flying-saucer crown.
cylinder('podium',(0,0,.6),7,1.2,navy)
cylinder('spire',(0,0,27),3.6,53,cream,2)
for i in range(4):
    a=i*math.tau/4
    beam('swept rib',(6*math.cos(a),6*math.sin(a),1),(2*math.cos(a),2*math.sin(a),48),.7,teal)
cylinder('saucer lower',(0,0,50),3,4,coral,11)
cylinder('observation glass',(0,0,53),9,2,glass)
cylinder('saucer roof',(0,0,55),11,2,cream,3)
torus('crown light',(0,0,54.2),10,.28,gold)
cylinder('antenna',(0,0,63),.5,14,coral,.12)
export('rocket')

# Harbour crane with triangulated boom and suspended hook.
box('crane foundation',(0,0,.65),(12,12,1.3),navy)
for x in [-3,3]:
    for y in [-3,3]: beam('tower leg',(x,y,1),(x,y,29),.4,gold)
for z in range(3,28,5):
    for y in [-3,3]:
        beam('cross brace',(-3,y,z),(3,y,z+5),.17,cream)
        beam('cross brace',(3,y,z),(-3,y,z+5),.17,cream)
box('operator cabin',(0,-1,28),(6,5,4),teal)
box('operator window',(0,-3.55,28.5),(4.7,.12,1.8),glass)
for y in [-2,2]:
    beam('boom lower',(-12,y,31),(23,y,31),.35,gold)
    beam('boom upper',(-12,y,34),(23,y,34),.28,gold)
    for x in range(-12,23,5): beam('boom lattice',(x,y,31),(x+5,y,34),.15,cream)
beam('cable',(20,0,32),(20,0,20),.09,navy)
torus('hook',(20,0,19.5),.7,.15,gold,True)
box('counterweight',(-10,0,31),(4,6,4),navy)
export('crane')

# Reusable wide portal: 15m clear opening, no barrier across the driving line.
for x in [-8.5,8.5]:
    box('portal foot',(x,0,.35),(1.8,2.6,.7),navy)
    box('portal upright',(x,0,4.4),(1,1.3,8.8),teal)
    box('luminous inset',(x,-.7,4.8),(.3,.12,6.3),glass)
box('portal header',(0,0,8.7),(18,1.4,1.7),coral)
for x in range(-7,8,2): box('header stripe',(x,-.73,8.7),(.75,.08,1.1),cream)
export('portal')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/blender/coastal-landmarks.blend'))
print('Exported 5 original coastal landmarks')
