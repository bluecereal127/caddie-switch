# 27 maps with the three spots (1 nearest the green), the start line and the six cups.
import json, math, sys
from PIL import Image, ImageDraw, ImageFont
REPO="C:/Users/Stephen/Desktop/caddie-switch-web/caddie-web/"
D=json.load(open('spots.json'))['holes']
pins=json.load(open(REPO+'tools/nss-pins.json'))['holes']
W,H,C=250,304,7
font=ImageFont.truetype("arialbd.ttf",15); small=ImageFont.truetype("arialbd.ttf",17)
S=2
rows=(27+C-1)//C
sheet=Image.new('RGB',(C*(W+6)+6,rows*(H+6)+6),(24,24,24))
for h in range(1,28):
    im=Image.open(REPO+f"captures/derived/render-nss/h{h:02d}.png").convert('RGB')
    d=ImageDraw.Draw(im)
    for c in pins[str(h)]['cups']:
        X,Y=c['x']*500,c['y']*608; d.ellipse((X-3,Y-3,X+3,Y+3),fill=(230,30,30))
    for e in D[str(h)]['spots']:
        X,Y=e['mapX']*500,e['mapY']*608; a=math.radians(e['facingDeg'])
        d.line((X,Y,X+math.sin(a)*46,Y-math.cos(a)*46),fill=(255,255,255),width=3)
        d.ellipse((X-11,Y-11,X+11,Y+11),fill=(255,255,255),outline=(0,0,0),width=2)
        d.text((X,Y),str(e['spot']),fill=(0,0,0),font=font,anchor='mm')
    d.rectangle((0,0,44,26),fill=(0,0,0)); d.text((22,13),str(h),fill=(255,255,255),font=small,anchor='mm')
    im=im.resize((W,H),Image.LANCZOS)
    i=h-1; sheet.paste(im,(6+(i%C)*(W+6),6+(i//C)*(H+6)))
sheet.save(sys.argv[1],quality=82)
print(sheet.size)
