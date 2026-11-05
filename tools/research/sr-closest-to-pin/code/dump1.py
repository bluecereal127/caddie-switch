import sys, json, glob, os
sys.path.insert(0, r"C:/Users/Stephen/Desktop/caddie-switch-web/caddie-web/tools/harness/state/eden/tools")
import byml
R=r"C:/Users/Stephen/Desktop/Switch Sports Resort/romfs/"
out={}
for h in range(1,28):
    f=R+"Banc/Prefab/AnnaGolfCourse%02dSceneLocatorPrefab.bcett.byml.zs"%h
    d=byml.load(open(f,'rb').read())
    if h==1:
        print("top keys",list(d)[:20] if isinstance(d,dict) else type(d))
    acts=d.get('Actors') or d.get('actors')
    rows=[a for a in acts if 'NearPin' in a.get('Gyaml','')]
    out[h]=rows
    if h in(1,2,23): print(h,json.dumps(rows,indent=0)[:2500])
    # other actor kinds
    if h==1:
        print({a.get('Gyaml') for a in acts}); print(json.dumps(acts[0])[:800])
json.dump(out,open('nearpin-raw.json','w'),indent=1)
