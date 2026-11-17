# Schematic drawings of the proposed brig (Cruizer-class brig-sloop), metres. Not to the draught yet.
# Writes brig-profile.svg and brig-decks.svg next to docs/design/ship.md: python3 docs/design/ship/draw.py
import os
import math
L=30.5; S=22  # px per metre
W=int((L+16)*S)+40
def X(a): return 30+(a+2)*S   # a: metres from the stern (taffrail) forward
INK="#2b2b2b"; MUTED="#8a8a8a"; WATER="#4f7fa8"; WOOD="#b98f5f"; HULL="#2f2f33"; BAND="#d9b25a"; COPPER="#b56d43"; CANV="#efe6d2"
def txt(x,y,s,size=12,anchor="start",fill=INK,weight="normal"):
    return f'<text x="{x:.1f}" y="{y:.1f}" font-family="Helvetica,Arial,sans-serif" font-size="{size}" text-anchor="{anchor}" fill="{fill}" font-weight="{weight}">{s}</text>'

# ---------- profile ----------
H0=860  # y of waterline in px
def Y(h): return H0-h*S
deck=2.4; low=0.55; hold=-3.2; rail=3.7
def sheer(a):  # rail height along the ship
    t=(a-L*0.45)/(L*0.55)
    return rail+(0.65 if t>0 else 0.45)*t*t
def keel(a):
    if a>27.0: return -3.25+((a-27.0)/3.5)**1.6*(sheer(L)+3.25)
    if a<1.8: return -3.75+((1.8-a)/1.8)**1.0*(3.75+1.2)
    return -3.75+(a-1.8)/(27.0-1.8)*0.5
out=[]
out.append(f'<rect x="0" y="0" width="{W}" height="1040" fill="#f7f4ee"/>')
out.append(txt(-400,30,"The brig, side view (schematic, before the draught is digitised)",18,weight="bold"))
out.append(txt(-400,50,"Cruizer-class brig-sloop: 30.5 m on deck, 9.3 m beam, about 3.5 m draught, 16 × 32-pounder carronades and 2 long 6-pounders, 121 men",12,fill=MUTED))
# sky rigging first
fore=22.6; main=12.6
masts=[(fore,29.5,[(12.0,15.0),(19.5,10.6),(25.5,6.6)]),(main,32.5,[(13.2,17.0),(21.5,12.0),(28.0,7.6)])]
for a,top,yards in masts:
    out.append(f'<line x1="{X(a)}" y1="{Y(hold)}" x2="{X(a-0.6)}" y2="{Y(deck+top)}" stroke="{WOOD}" stroke-width="5"/>')
    # tops
    out.append(f'<line x1="{X(a-1.3)}" y1="{Y(deck+yards[0][0]+0.9)}" x2="{X(a+1.0)}" y2="{Y(deck+yards[0][0]+0.9)}" stroke="{INK}" stroke-width="3"/>')
    for i,(h,span) in enumerate(yards):
        y=Y(deck+h); ax=X(a-0.6*(h/top)); hw=span/2*S
        lowh = deck+ (yards[i-1][0]+1.0 if i>0 else 2.6)
        bw = (yards[i-1][1]/2*S*0.98 if i>0 else hw*1.08)
        lx=X(a-0.6*((lowh-deck)/top))
        out.append(f'<polygon points="{ax-hw},{y} {ax+hw},{y} {lx+bw},{Y(lowh)} {lx-bw},{Y(lowh)}" fill="{CANV}" stroke="{MUTED}" stroke-width="0.6" opacity="0.82"/>')
        out.append(f'<line x1="{ax-hw}" y1="{y}" x2="{ax+hw}" y2="{y}" stroke="{WOOD}" stroke-width="3"/>')
    # shrouds
    out.append(f'<line x1="{X(a-0.6*(yards[0][0]/top))}" y1="{Y(deck+yards[0][0]+0.9)}" x2="{X(a-2.2)}" y2="{Y(rail+0.1)}" stroke="{INK}" stroke-width="1"/>')
    out.append(f'<line x1="{X(a-0.6*(yards[0][0]/top))}" y1="{Y(deck+yards[0][0]+0.9)}" x2="{X(a+0.8)}" y2="{Y(rail+0.1)}" stroke="{INK}" stroke-width="1"/>')
# main boom and gaff + spanker
out.append(f'<polygon points="{X(main-0.8)},{Y(deck+11.5)} {X(main-10.5)},{Y(deck+13.2)} {X(-2.6)},{Y(deck+2.3)} {X(main-0.5)},{Y(deck+2.6)}" fill="{CANV}" stroke="{MUTED}" stroke-width="0.6" opacity="0.85"/>')
out.append(f'<line x1="{X(main-0.5)}" y1="{Y(deck+2.6)}" x2="{X(-3.0)}" y2="{Y(deck+2.25)}" stroke="{WOOD}" stroke-width="3"/>')
out.append(f'<line x1="{X(main-0.8)}" y1="{Y(deck+11.5)}" x2="{X(main-10.5)}" y2="{Y(deck+13.2)}" stroke="{WOOD}" stroke-width="2.5"/>')
# bowsprit & jibboom
bs_a=L+0.2; ang=math.radians(14)
bx=lambda d: bs_a-1.5+d*math.cos(ang); by=lambda d: sheer(L)-0.4+d*math.sin(ang)
out.append(f'<line x1="{X(bx(-4))}" y1="{Y(by(-4))}" x2="{X(bx(13))}" y2="{Y(by(13))}" stroke="{WOOD}" stroke-width="4"/>')
# headsails: fore topmast stay, jib, flying jib
fy=lambda h: (X(fore-0.6*(h/29.5)),Y(deck+h))
for d,h,op in [(6.5,19.0,0.9),(10.5,22.5,0.8),(13.0,26.0,0.7)]:
    tx,ty=fy(h); out.append(f'<polygon points="{tx},{ty} {X(bx(d))},{Y(by(d))} {X(bx(d)-4.5)},{Y(by(d-4))+4}" fill="{CANV}" stroke="{MUTED}" stroke-width="0.6" opacity="{op}"/>')
    out.append(f'<line x1="{tx}" y1="{ty}" x2="{X(bx(d))}" y2="{Y(by(d))}" stroke="{INK}" stroke-width="0.8"/>')
# hull outline
pts=[]
N=80
for i in range(N+1):
    a=i*L/N; pts.append((X(a),Y(sheer(a))))
for i in range(N,-1,-1):
    a=i*L/N; pts.append((X(a),Y(keel(a))))
out.append('<polygon points="'+" ".join(f"{x:.1f},{y:.1f}" for x,y in pts)+f'" fill="{HULL}"/>')
# copper below waterline
cp=[]
for k in range(N+1):
    a=k*L/N; cp.append((X(a),Y(0.15)))
for k in range(N,-1,-1):
    a=k*L/N; cp.append((X(a),Y(min(keel(a),0.15))))
out.append('<polygon points="'+" ".join(f"{x:.1f},{y:.1f}" for x,y in cp)+f'" fill="{COPPER}"/>')
# ochre band along the ports
band=[]
for i in range(N+1):
    a=i*L/N; band.append((X(a),Y(deck+0.45+ (sheer(a)-rail))))
for i in range(N,-1,-1):
    a=i*L/N; band.append((X(a),Y(deck+1.3+ (sheer(a)-rail))))
out.append('<polygon points="'+" ".join(f"{x:.1f},{y:.1f}" for x,y in band)+f'" fill="{BAND}"/>')
# gunports: 9 a side
ports=[4.6+i*2.45 for i in range(9)]
for i,a in enumerate(ports):
    off=sheer(a)-rail
    out.append(f'<rect x="{X(a-0.4)}" y="{Y(deck+1.25+off)}" width="{0.8*S}" height="{0.75*S}" fill="{HULL}"/>')
# decks dashed inside
for h,name in [(deck,"weather deck"),(low,"berth deck"),(hold,"hold floor")]:
    out.append(f'<line x1="{X(0.4)}" y1="{Y(h)}" x2="{X(L-0.8 if h>0 else 27.5)}" y2="{Y(h)}" stroke="#ffffff" stroke-width="1.2" stroke-dasharray="6 4" opacity="0.8"/>')
# platforms
for a0,a1 in [(0.8,5.5),(21.0,27.0)]:
    out.append(f'<line x1="{X(a0)}" y1="{Y(-1.5)}" x2="{X(a1)}" y2="{Y(-1.5)}" stroke="#ffffff" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.8"/>')
# waterline
out.append(f'<line x1="10" y1="{Y(0)}" x2="{W-10}" y2="{Y(0)}" stroke="{WATER}" stroke-width="1.5"/>')
out.append(txt(W-12,Y(0)-5,"waterline",11,"end",WATER))
# labels for levels
lab=[(deck,"weather deck: guns, helm, capstan, all sail handling"),(low,"berth deck: captain aft, officers, messes and hammocks, galley"),(-1.5,"platforms: bread room aft, magazine forward"),(hold+0.1,"hold: water casks on shingle ballast, well and pumps, shot locker")]
for h,s in lab:
    out.append(f'<line x1="{X(-2.5)}" y1="{Y(h)}" x2="{X(0.6)}" y2="{Y(h)}" stroke="{MUTED}" stroke-width="0.8"/>')
for i,(h,s) in enumerate(lab):
    out.append(txt(X(-2.6),Y(h)+4,s,11,"end"))
# mast labels & dims
out.append(txt(X(fore-0.6),Y(deck+29.5)-8,"foremast",11,"middle"))
out.append(txt(X(main-0.6),Y(deck+32.5)-8,"mainmast",11,"middle"))
out.append(txt(X(main-9),Y(deck+6.5),"main boom sail",11,"middle",MUTED))
out.append(txt(X(bx(9)),Y(by(9))+18,"bowsprit and jib-boom",11,"middle",MUTED))
# scale bar
sx=X(0); sy=1010
out.append(f'<line x1="{sx}" y1="{sy}" x2="{sx+10*S}" y2="{sy}" stroke="{INK}" stroke-width="2"/>')
for k in range(0,11,5): out.append(f'<line x1="{sx+k*S}" y1="{sy-5}" x2="{sx+k*S}" y2="{sy+5}" stroke="{INK}" stroke-width="1.5"/>')
out.append(txt(sx+10*S+8,sy+4,"10 m",11))
out.append(txt(X(0),Y(keel(0))+22,"stern",11,"middle",MUTED)); out.append(txt(X(L),Y(keel(L))+22,"bow",11,"middle",MUTED))
# left margin needs more room: shift by translating whole drawing
svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-420 0 {W+420} 1040" width="{W+420}" height="1040">'+f'<rect x="-420" y="0" width="420" height="1040" fill="#f7f4ee"/>'+"".join(out)+'</svg>'
open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'brig-profile.svg'),'w').write(svg)

# ---------- deck plans ----------
S2=26
def PX(a): return 40+a*S2
def half(a):
    if a<0: return 0
    t=a/L
    if t<0.42: return 3.05+ (4.65-3.05)*math.sin(t/0.42*math.pi/2)**0.8
    u=(t-0.42)/0.58
    return 4.65*math.sqrt(max(0,1-u**2.3))
def plan(oy, title, items, inner=0.25):
    o=[]
    top=[(PX(i*L/100),oy-half(i*L/100)*S2) for i in range(101)]
    bot=[(PX(i*L/100),oy+half(i*L/100)*S2) for i in range(100,-1,-1)]
    o.append('<polygon points="'+" ".join(f"{x:.1f},{y:.1f}" for x,y in top+bot)+f'" fill="#e8d9bf" stroke="{INK}" stroke-width="1.5"/>')
    o.append(txt(PX(0),oy-4.65*S2-16,title,14,weight="bold"))
    for kind,a0,a1,b0,b1,label,col in items:
        x0,x1=PX(a0),PX(a1); y0,y1=oy-b1*S2,oy-b0*S2
        if kind=="rect":
            o.append(f'<rect x="{x0:.1f}" y="{y0:.1f}" width="{x1-x0:.1f}" height="{y1-y0:.1f}" fill="{col}" stroke="{INK}" stroke-width="0.8" opacity="0.9"/>')
        elif kind=="circ":
            o.append(f'<circle cx="{(x0+x1)/2:.1f}" cy="{(y0+y1)/2:.1f}" r="{(x1-x0)/2:.1f}" fill="{col}" stroke="{INK}" stroke-width="0.8"/>')
        if label:
            o.append(txt((x0+x1)/2,(y0+y1)/2+4,label,10,"middle"))
    return o
GUN="#3b3b3b"; HATCH="#9c7a52"; FIT="#c9b08a"; ROOM="#f3ead8"
items=[]
for a in ports[:8]:
    for s in (1,-1):
        b=half(a)-0.95
        items.append(("rect",a-0.35,a+0.35,s*b-0.55 if s>0 else s*b-0.0-0.0- 0.55 ,s*b+0.55 if s>0 else s*b+0.55,"",GUN))
for s in (1,-1):
    a=ports[8]; b=half(a)-0.95
    items.append(("rect",a-0.3,a+0.3,s*b-0.45,s*b+0.45,"",'#6b6b6b'))
items+= [("circ",fore-0.35,fore+0.35,-0.35,0.35,"",WOOD),("circ",main-0.4,main+0.4,-0.4,0.4,"",WOOD),
 ("rect",2.8,3.6,-1.0,1.0,"wheel",FIT),("rect",1.6,2.3,-0.35,0.35,"",FIT),("rect",4.8,6.6,-0.9,0.9,"skylight",FIT),
 ("rect",7.2,8.2,1.0,2.0,"compan.",HATCH),("circ",9.4,10.6,-0.6,0.6,"capstan",FIT),
 ("rect",11.6,12.2,1.0,1.6,"",FIT),("rect",11.6,12.2,-1.6,-1.0,"",FIT),
 ("rect",14.4,16.6,-1.1,1.1,"main hatch",HATCH),("rect",17.2,19.2,-0.9,0.9,"",HATCH),("rect",19.6,20.6,-0.7,0.7,"",HATCH),("rect",23.6,24.4,-0.5,0.5,"",'#555'),("rect",25.0,25.6,-1.2,1.2,"bitts",FIT),("rect",21.9,23.3,-1.4,-1.1,"",'#cbb48c'),("rect",21.9,23.3,1.1,1.4,"",'#cbb48c')]
o=plan(1220,"Weather deck (flush, no raised quarterdeck or forecastle)",items)
o.append(txt(PX(3.2),1220+4.4*S2+14,"wheel and binnacle",10,"middle",MUTED))
o.append(txt(PX(11.9),1220+4.4*S2+14,"pumps",10,"middle",MUTED))
o.append(txt(PX(main),1220+4.4*S2+28,"mainmast",10,"middle",MUTED))
o.append(txt(PX(18.2),1220+4.4*S2+14,"hatches (boats stowed above on the skids)",10,"middle",MUTED))
o.append(txt(PX(fore),1220+4.4*S2+28,"foremast and fife rail",10,"middle",MUTED))
o.append(txt(PX(24),1220+4.4*S2+42,"galley chimney",10,"middle",MUTED))
o.append(txt(PX(14),1220+4.65*S2+62,"dark: 8 carronades a side (32-pounders on slides); grey: the long 6-pounders in the foremost ports",10,"middle",MUTED))
low_items=[("rect",0.6,5.2,-2.9,2.9,"captain's cabins",ROOM),("rect",5.4,10.2,1.0,3.9,"officers' cabins",ROOM),("rect",5.4,10.2,-3.9,-1.0,"officers' cabins",ROOM),
 ("rect",5.4,10.2,-0.8,0.8,"gunroom",ROOM),("rect",10.4,21.4,-3.9,3.9,"",'#efe3cb'),
 ("rect",11.6,12.2,-0.4,0.4,"",'#7a5c3a'),("rect",14.4,17.0,-1.1,1.1,"",HATCH),("rect",21.6,23.4,-1.0,1.0,"",'#777'),
 ("rect",23.6,27.5,-2.0,2.0,"bosun, sails",ROOM),("circ",fore-0.35,fore+0.35,-0.35,0.35,"",WOOD),("circ",main-0.4,main+0.4,-0.4,0.4,"",WOOD)]
o+=plan(1600,"Berth deck (about 1.7 m to the beams: a man stoops)",low_items)
o.append(txt(PX(18.5),1600-2.4*S2,"messes; hammocks slung at night",10,"middle"))
o.append(txt(PX(22.5),1600+1.0*S2+14,"galley stove",10,"middle",MUTED))
hold_items=[("rect",0.6,5.2,-2.4,2.4,"bread room (platform)",ROOM),("rect",5.4,11.2,-3.2,3.2,"casks on shingle",'#e2d2b0'),("rect",11.4,12.8,-0.9,0.9,"well",'#7d93a8'),
 ("rect",12.9,14.0,-0.8,0.8,"shot",'#555'),("rect",14.2,20.6,-3.4,3.4,"casks, cable tier above",'#e2d2b0'),("rect",20.8,26.5,-2.4,2.4,"magazine (platform)",'#c98b6b'),("rect",19.8,20.7,-1.0,1.0,"",'#e8c96a')]
o+=plan(1960,"Hold and platforms (lantern light only; the magazine lit through the glazed light room)",hold_items)
o.append(txt(PX(20.2),1960-1.3*S2,"light room",10,"middle",MUTED))
svg2=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 1050 {PX(L)+60} 1060" width="{PX(L)+60}" height="1060"><rect x="0" y="1050" width="{PX(L)+60}" height="1060" fill="#f7f4ee"/>'+"".join(o)+'</svg>'
open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'brig-decks.svg'),'w').write(svg2)
