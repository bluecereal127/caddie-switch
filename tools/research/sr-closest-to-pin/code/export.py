# ctp-table.json + ctp-seats.json + nearpin-scene.json -> spots.json, spots.csv (the float32 values as stored in the Banc file)
import json, csv
import numpy as np
T=json.load(open('ctp-table.json')); B=json.load(open('ctp-seats.json'))
f=lambda v: float(str(np.float32(v)))
holes={}
rows=[]
for h in range(1,28):
    t=T[str(h)]; L=[]
    for n,(r,b) in enumerate(zip(t['rows'],B[str(h)]),1):
        e={'spot':n,'actorIndex':r['i'],'x':f(r['x']),'y':f(r['y']),'z':f(r['z']),'yawRad':f(r['yawRad']),'facingDeg':r['facingDeg'],
           'groundY':r['groundY'],'surface':r['surface'],'mapX':r['mapX'],'mapY':r['mapY'],
           'cups':[{'cup':c['k']+1,'difficult':c['difficult'],'yd':c['yd'],'ft':c['ft'],'dyM':c['dy'],'offAimDeg':c['off']} for c in r['cups']],'onlineBalls':b}
        L.append(e)
        ds=[c['yd'] for c in r['cups']]
        rows.append([h,t['par'],n,e['x'],e['y'],e['z'],e['yawRad'],e['facingDeg'],e['surface'].replace('Golf',''),e['mapX'],e['mapY'],min(ds),max(ds)]+ds)
    holes[str(h)]={'par':t['par'],'spots':L}
json.dump({'_note':'Switch Sports Resort 1.0.0, the 81 AnnaObject_BGOBJ_Glf_NearPinOBJ placements (Banc/AnnaGolfCourseNNScene). x, y, z: the hole\'s world in metres (+x east, +y up, -z north), as stored; spots ordered nearest the green first; actorIndex = order in the Banc file. facingDeg: the map bearing of the start line (the actor turned 180 deg, 0x316db80). mapX / mapY: fractions of the 250x304 frame through tools/nss-registration.json. onlineBalls: the spot through the near-pin matrix at each standing place and hand, grounded.','holes':holes},open('spots.json','w'),indent=1)
with open('spots.csv','w',newline='') as o:
    w=csv.writer(o); w.writerow('hole par spot x y z yawRad facingDeg surface mapX mapY cupYdMin cupYdMax yd1 yd2 yd3 yd4 yd5 yd6'.split()); w.writerows(rows)
import collections
print(collections.Counter(r[8] for r in rows))
md=[]
for h in range(1,28):
    c=[]
    for e in holes[str(h)]['spots']:
        ds=[q['yd'] for q in e['cups']]
        c.append(f"{e['x']:.2f}, {e['y']:.2f}, {e['z']:.2f} · {e['surface'].replace('Golf','').lower()} · {min(ds):.0f}–{max(ds):.0f} yd")
    md.append(f"| {h} | {holes[str(h)]['par']} | "+" | ".join(c)+" |")
open('table.md','w',encoding='utf8').write("\n".join(md)+"\n")
near=[min(q['yd'] for q in holes[str(h)]['spots'][0]['cups']) for h in range(1,28)]
print(sum(1 for r in rows if r[11]>200))
