import sys, json
sys.path.insert(0, r"C:/Users/Stephen/Desktop/caddie-switch-web/caddie-web/tools/harness/state/eden/tools")
import byml
R=r"C:/Users/Stephen/Desktop/Switch Sports Resort/romfs/"
raw=json.load(open('nearpin-raw.json'))
tot=0; same=0; extra=set(); out={}
for h in range(1,28):
    d=byml.load(open(R+"Banc/AnnaGolfCourse%02dScene.bcett.byml.zs"%h,'rb').read())
    rows=[a for a in d['Actors'] if 'NearPin' in a.get('Gyaml','')]
    p={a['Hash']:a for a in raw[str(h)]}
    out[h]=rows
    for a in rows:
        tot+=1
        extra|=set(a)
        b=p.get(a['Hash'])
        if b is None: print('hole',h,'scene actor not in prefab',a['Hash'],a.get('Translate'))
        elif all(a.get(k)==b.get(k) for k in('Translate','Rotate','Scale')): same+=1
        else: print('hole',h,'DIFF',a.get('Translate'),a.get('Rotate'),'| prefab',b.get('Translate'),b.get('Rotate'))
    if len(rows)!=3: print('hole',h,len(rows))
print(tot,'scene actors,',same,'equal to the prefab; keys',extra)
json.dump(out,open('nearpin-scene.json','w'),indent=1)
