"""Original delivery and stunt kit; Blender -b --python assets/blender/build_delivery_kit.py.
Meters, ground pivot, front is Blender -Y / game +Z. One vertex-color material.
Explicit simple solid proxies are exported alongside the models for client/server collision.
"""
from pathlib import Path
import json, math
import bpy
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/models/delivery'; OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
C={'cream':(.93,.82,.59,1),'dark':(.025,.065,.10,1),'mint':(.08,.7,.61,1),'coral':(.92,.12,.17,1),'gold':(1,.57,.025,1),'glass':(.10,.38,.45,1),'white':(.96,.97,.85,1)}
mat=bpy.data.materials.new('delivery_vertex_palette'); mat.use_nodes=True
bsdf=mat.node_tree.nodes.get('Principled BSDF'); bsdf.inputs['Roughness'].default_value=.78
color=mat.node_tree.nodes.new('ShaderNodeVertexColor');color.layer_name='Color'
mat.node_tree.links.new(color.outputs['Color'],bsdf.inputs['Base Color'])
parts=[]; proxies={}; lineup=0

def finish(o,name,tint):
    o.name=name
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    a=o.data.color_attributes.new(name='Color',type='BYTE_COLOR',domain='CORNER')
    for v in a.data:v.color=C[tint]
    o.data.materials.append(mat);parts.append(o);return o

def box(name,loc,size,tint):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.scale=size
    return finish(o,name,tint)

def ellipsoid(name,loc,size,tint):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,location=loc)
    o=bpy.context.object;o.scale=size;return finish(o,name,tint)

def prism(name,points,depth,y,tint):
    verts=[(x,y+d,z) for d in [-depth/2,depth/2] for x,z in points];n=len(points)
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active=o;o.select_set(True);return finish(o,name,tint)

def proxy(cx,cy,cz,w,d,h):
    return dict(minX=cx-w/2,maxX=cx+w/2,minZ=-cy-d/2,maxZ=-cy+d/2,base=cz-h/2,top=cz+h/2)

def export(name,solids):
    global parts,lineup
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:o.select_set(True)
    bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();o=parts[0];o.name=name
    bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True,export_yup=True)
    proxies[name]=solids;o.location.x=lineup;lineup+=25;parts=[]

def shop(accent):
    box('solid shop',(0,0,1.9),(8.5,6,3.8),'cream')
    box('roof fascia',(0,0,3.9),(8.5,6,.2),accent)
    box('window',(0,-3.025,1.65),(7.4,.05,2.3),'glass')
    for x in [-3.75,-1.2,1.2,3.75]:box('window mullion',(x,-3.07,1.6),(.12,.08,2.6),accent)
    box('door',(0,-3.08,1.2),(1.65,.08,2.4),'dark')
    box('door glass',(0,-3.13,1.55),(1.35,.03,1.4),'glass')
    box('handle',(.55,-3.17,1),(.07,.06,.4),'gold')
    box('signboard',(0,-2.9,4.5),(7.5,.3,1),'dark')
    box('awning',(0,-2.95,3),(8.1,.35,.25),accent)
    return [proxy(0,0,2,8.5,6,4),proxy(0,-2.9,4.5,7.5,.3,1)]

solids=shop('mint')
for x in [-3.1,3.1]:
    box('lantern top',(x,-2.95,2.7),(.55,.42,.18),'dark')
    ellipsoid('lantern',(x,-3.05,2.32),(.31,.27,.39),'coral')
box('fish pedestal',(0,0,4.3),(2,1.2,.6),'dark')
ellipsoid('giant fish',(.2,0,5.65),(2.5,.6,1.05),'mint')
prism('fish tail',[(-3.4,4.7),(-1.8,5.65),(-3.4,6.65)],.5,0,'coral')
prism('dorsal fin',[(-.8,6.2),(.4,7.1),(1.1,6.2)],.35,0,'gold')
for y in [-.58,.58]:
    ellipsoid('eye',(1.65,y,5.85),(.24,.08,.24),'white')
    ellipsoid('pupil',(1.7,y*1.13,5.85),(.11,.04,.12),'dark')
solids += [proxy(-.45,0,5.8,6,.9,2.6)]
export('sushi',solids)

solids=shop('coral')
box('pizza pedestal',(0,0,4.35),(1.6,1,.7),'dark')
prism('pizza crust',[(-2.8,7.3),(2.8,7.3),(0,4.35)],.65,0,'cream')
prism('pizza cheese',[(-2.3,6.93),(2.3,6.93),(0,4.65)],.69,0,'gold')
for x,z in [(-1.25,6.55),(1.1,6.5),(0,5.55)]:
    for y in [-.36,.36]:ellipsoid('pepperoni',(x,y,z),(.34,.045,.34),'coral')
for x in [-3.4,-2.55,-1.7,-.85,0,.85,1.7,2.55,3.4]:
    box('checker trim',(x,-3.065,.32),(.42,.04,.32),'coral')
solids += [proxy(0,0,5.8,5.6,.7,3)]
export('pizza',solids)

solids=shop('gold')
box('roller door',(0,-3.12,1.6),(5.8,.1,2.65),'dark')
for z in [.5,.85,1.2,1.55,1.9,2.25,2.6]:box('roller slat',(0,-3.185,z),(5.65,.04,.05),'glass')
for x in [-3.3,3.3]:
    box('dock bumper',(x,-3.1,.8),(.35,.15,1.5),'gold')
box('rooftop parcel',(0,0,5.1),(3.3,2.6,2.2),'gold')
box('parcel tape',(0,0,6.22),(.5,2.64,.04),'cream')
box('parcel tape',(0,-1.32,5.1),(.5,.04,2.2),'cream')
box('shipping label',(.88,-1.34,5.3),(.9,.04,.65),'white')
solids += [proxy(0,0,5.1,3.3,2.6,2.24)]
export('depot',solids)

solids=[]
for x in [-10,10]:
    box('pylon',(x,0,7.5),(2,2,15),'dark')
    for face in [-1,1]:
        box('pylon inset',(x,face*1.025,8),(1.3,.05,12),'mint')
        for z in [2,5,8,11]:prism('climb chevron',[(x-.7,z),(x,z+.65),(x+.7,z),(x,z+.27)],.1,face*1.1,'gold')
    solids += [proxy(x,0,7.5,2,2,15)]
box('header',(0,0,16),(22,2,2),'dark')
for face in [-1,1]:
    box('header stripe',(0,face*1.03,16.6),(21,.08,.28),'mint')
    for x in [-8,-6,6,8]:
        prism('header arrow',[(x-.6,15.5),(x,16),(x-.6,16.5),(x+.05,16.5),(x+.65,16),(x+.05,15.5)],.1,face*1.1,'gold')
    box('center panel',(0,face*1.08,16),(7,.08,.85),'coral')
solids += [proxy(0,0,16,22,2,2)]
export('jump-gate',solids)

# Flat runway paint: no curb, raised platform, or invisible collision.
for x in [-4.8,4.8]:box('landing edge',(x,0,.07),(.3,9,.02),'mint')
for y in [-4,-2,0,2,4]:box('runway bar',(0,y,.07),(7,.3,.02),'gold')
export('landing-target',[])
(ROOT/'src/shared/deliveryColliders.ts').write_text('// Generated by assets/blender/build_delivery_kit.py. Game Y-up meters.\nexport const deliveryColliders = '+json.dumps(proxies,indent=2)+';\n')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/blender/delivery-kit.blend'))
