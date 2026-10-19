"""Export the user's existing city_model.blend without writing to the source.
Run: blender --background blender/city_model.blend --python scripts/export-city.py
Static meshes are batched by material and destination. Animated transforms remain separate.
"""
import bpy, json, os, hashlib, math, time
from collections import defaultdict
from mathutils import Vector, Matrix, Euler
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE=os.path.join(ROOT,'blender','city_model.blend')
OUT=os.path.join(ROOT,'evidence','model-export')
os.makedirs(OUT,exist_ok=True)
assert os.path.samefile(bpy.data.filepath,SOURCE), 'Open the requested city_model.blend first'
source_bytes=open(SOURCE,'rb').read()
source_hash=hashlib.sha256(source_bytes).hexdigest()
scene=bpy.context.scene
scene.frame_set(1)
bpy.context.view_layer.update()
original=list(scene.objects)
deps=bpy.context.evaluated_depsgraph_get()
animated={o for o in original if o.animation_data and o.animation_data.action}

def coords(v): return [round(v.x,6),round(v.z,6),round(-v.y,6)]
def box_bounds(objects):
 pts=[o.matrix_world@Vector(c) for o in objects if o.type in {'MESH','CURVE'} for c in o.bound_box]
 return {'min':coords(Vector((min(p.x for p in pts),min(p.y for p in pts),min(p.z for p in pts)))), 'max':coords(Vector((max(p.x for p in pts),max(p.y for p in pts),max(p.z for p in pts))))}
def center(o):return sum((o.matrix_world@Vector(c) for c in o.bound_box),Vector())/8
houses=[o for o in original if o.get('city_role')=='house_root']
game=min(houses,key=lambda o:(center(o.children_recursive[0])-Vector((-9,-46,0))).length) if houses else None
# Find the existing street-front shop nearest the central foreground.
if houses:
 game=min(houses,key=lambda o:sum(((box_bounds(o.children_recursive)['min'][j]+box_bounds(o.children_recursive)['max'][j])*.5-v)**2 for j,v in [(0,-9),(2,47)]))
game_parts=set(game.children_recursive) if game else set()
def destination(o):
 if o in game_parts:return 'game'
 groups={c.name for c in o.users_collection}
 for col,id in [('05 Observatory','research'),('06 Civic Hall','docs'),('07 Glass Tower','projects'),('08 Airport','airport'),('04 Viaduct','highway')]:
  if col in groups:return id
 if '09 South Landmarks' in groups:
  x=center(o).x
  return 'album' if x < -20 else ('contact' if x<15 else 'about')
 # Tile/roof refinement curves retain their actual world positions.
 if '17 Roof Details' in groups and o not in game_parts:
  p=center(o)
  if -19<p.x<10 and 27<p.y<43:return 'docs'
  if -13<p.x<9 and -36<p.y<-22:return 'contact'
  if 22<p.x<46 and -33<p.y<-20:return 'about'
 return 'scenery'
def nearest_animated(o):
 p=o
 while p:
  if p in animated:return p
  p=p.parent
 return None
metadata={'source':'blender/city_model.blend','sourceSha256':source_hash,'sourceObjects':len(original),'fps':scene.render.fps,'duration':(scene.frame_end-scene.frame_start+1)/scene.render.fps,'camera':{'position':coords(scene.camera.matrix_world.translation),'rotation':list(scene.camera.matrix_world.to_quaternion()),'orthoScale':scene.camera.data.ortho_scale},'landmarks':{},'animations':[]}
for id in ['about','projects','research','docs','album','contact','game','airport','highway']:
 objs=[o for o in original if destination(o)==id and o.type in {'MESH','CURVE'}]
 b=box_bounds(objs)
 # Y-up conversion reverses Z min/max.
 if b['min'][2]>b['max'][2]:b['min'][2],b['max'][2]=b['max'][2],b['min'][2]
 metadata['landmarks'][id]={'bounds':b,'objects':len(objs)}
metadata['gameHouse']=game.name if game else None
# Save transform samples independently; the Node pipeline writes a standard glTF clip.
def fcurves(o):
 action=o.animation_data.action
 slot=o.animation_data.action_slot
 return [fc for layer in action.layers for strip in layer.strips for fc in strip.channelbag(slot).fcurves]
anim_ids={o:'motion_%03d'%i for i,o in enumerate(sorted(animated,key=lambda o:o.name))}
for o,name in anim_ids.items():
 curves=fcurves(o)
 paths={fc.data_path for fc in curves}
 track={'node':name,'source':o.name,'role':o.get('city_role','part')}
 for path,key,width in [('location','translation',3),('rotation_euler','rotation',4),('scale','scale',3)]:
  if path not in paths:continue
  base=list(getattr(o,path))
  channels={fc.array_index:fc for fc in curves if fc.data_path==path}
  values=[]
  for frame in range(scene.frame_start,scene.frame_end+2):
   v=[channels[i].evaluate(frame) if i in channels else base[i] for i in range(3)]
   if path=='rotation_euler':
    q=Euler(v,o.rotation_mode).to_quaternion();values.extend([q.x,q.z,-q.y,q.w])
   elif path=='scale':values.extend([v[0],v[2],v[1]])
   else:values.extend([v[0],v[2],-v[1]])
  track[key]=values
 metadata['animations'].append(track)
# Build an export-only scene. The user's opened source is never saved or altered.
export_scene=bpy.data.scenes.new('Web export')
bpy.context.window.scene=export_scene
clones={}
for o,name in anim_ids.items():
 n=bpy.data.objects.new(name,None);export_scene.collection.objects.link(n);n['sourceName']=o.name;n['cityRole']=o.get('city_role','part');clones[o]=n
for o,n in clones.items():
 parent=nearest_animated(o.parent) if o.parent else None
 n.parent=clones.get(parent)
 n.matrix_local=(parent.matrix_world.inverted()@o.matrix_world) if parent else o.matrix_world.copy()
groups=defaultdict(lambda:{'verts':[],'faces':[],'smooth':[]})
source_geometry=0
for o in original:
 if o.type not in {'MESH','CURVE'} or o.hide_render or o.name=='Studio ground':continue
 ev=o.evaluated_get(deps)
 mesh=bpy.data.meshes.new_from_object(ev,depsgraph=deps)
 if not mesh:continue
 parent=nearest_animated(o)
 transform=(parent.matrix_world.inverted()@o.matrix_world) if parent else o.matrix_world
 tag=destination(o)
 if parent:
  parent_tag='motion'
 else:parent_tag=tag
 materials=list(mesh.materials)
 bymat=defaultdict(list)
 for poly in mesh.polygons:bymat[poly.material_index].append(poly)
 for mi,polygons in bymat.items():
  material=materials[mi] if mi<len(materials) else None
  key=(parent,tag,material)
  group=groups[key]
  used={vi for poly in polygons for vi in poly.vertices}
  mapping={vi:len(group['verts'])+index for index,vi in enumerate(sorted(used))}
  group['verts'].extend(tuple(transform@mesh.vertices[vi].co) for vi in sorted(used))
  group['faces'].extend(tuple(mapping[vi] for vi in poly.vertices) for poly in polygons)
  group['smooth'].extend(poly.use_smooth for poly in polygons)
 bpy.data.meshes.remove(mesh)
 source_geometry+=1
for i,((parent,tag,mat),group) in enumerate(groups.items()):
 mesh=bpy.data.meshes.new('Web geometry %04d'%i);mesh.from_pydata(group['verts'],[],group['faces']);mesh.update()
 for poly,smooth in zip(mesh.polygons,group['smooth']):poly.use_smooth=smooth
 if mat:mesh.materials.append(mat)
 obj=bpy.data.objects.new('city_%s_%04d'%(tag,i),mesh);export_scene.collection.objects.link(obj)
 obj.parent=clones.get(parent)
 obj['place']=tag
 obj['cityBatch']=True
 # Materials preserve the source palette and roughness; viewport night lighting is separate.
# Export only new scene, with Y-up conversion performed by Blender's official exporter.
export_scene.frame_set(1)
options=dict(filepath=os.path.join(OUT,'city-raw.glb'),export_format='GLB',use_active_scene=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True,export_yup=True,export_apply=False,export_texcoords=False,export_normals=True,export_materials='EXPORT')
bpy.ops.export_scene.gltf(**options)
metadata['geometryObjects']=source_geometry
metadata['webBatches']=len(groups)
metadata['animatedNodes']=len(clones)
if open(SOURCE,'rb').read()!=source_bytes:
 open(SOURCE,'wb').write(source_bytes)
metadata['sourceUnchanged']=hashlib.sha256(open(SOURCE,'rb').read()).hexdigest()==source_hash
with open(os.path.join(OUT,'city-export.json'),'w',encoding='utf8')as f:json.dump(metadata,f,separators=(',',':'))
print(json.dumps({k:v for k,v in metadata.items() if k not in ['animations','landmarks']},indent=2))
