# Los datos son de OpenStreetMap (ODbL): el juego muestra "Mapa: © OpenStreetMap".
# Convierte los datos de OpenStreetMap en dos imágenes de datos para el juego.
# R = tipo de suelo, G = detalle (bisel/id de edificio, luz del árbol, bit 128 = sombra), B = altura del edificio en metros
import json, math, sys, os
import numpy as np
from PIL import Image, ImageDraw
LAT, LON = -34.5749657, -58.4150562
O = (-11.0, 18.0)                      # centro de Libertador junto al monumento (m)
D = (math.cos(math.radians(-30.06)), math.sin(math.radians(-30.06)))   # dirección de Libertador hacia el sudeste
ABAJO = (-D[0], -D[1])                 # la gente se extiende hacia el noroeste (Belgrano)
DER = (D[1], -D[0])                    # a la derecha del que mira el escenario: la ciudad
CORRIDA = 260.0                        # el escenario va 260 m por Libertador hacia el noroeste del monumento, donde la avenida es recta
def EN(lat, lon): return ((lon - LON) * 111320 * math.cos(math.radians(LAT)), (lat - LAT) * 110540)   # metros este/norte
def G(x, y):
    x -= O[0]; y -= O[1]
    return (x * DER[0] + y * DER[1], x * ABAJO[0] + y * ABAJO[1] - CORRIDA)      # metros en el marco del juego
def P(lat, lon): return G(*EN(lat, lon))
T = dict(nada=0, pasto=1, bosque=2, agua=3, avenida=4, calle=5, sendero=6, edificio=7, cancha=8, via=9, pista=10, arena=11, vereda=12, arbol=13, plaza=14, rio=15)
def cargar(n): return json.load(open(n, encoding='utf-8'))['elements']
EL = cargar('lejos.json') + cargar('medio.json') + cargar('cerca.json') + sum((cargar(n) for n in ('ruta.json', 'calles_grande.json', 'lejos_grande.json') if os.path.exists(n)), [])
def anillos(e):
    if e['type'] == 'way' and e.get('geometry'): return [[P(g['lat'], g['lon']) for g in e['geometry']]], []
    if e['type'] == 'relation':
        out, inn = [], []
        for m in e.get('members', []):
            if m.get('geometry'): (inn if m.get('role') == 'inner' else out).append([P(g['lat'], g['lon']) for g in m['geometry']])
        # unir tramos sueltos de un mismo anillo
        unidos = []
        for seg in out:
            for u in unidos:
                if math.dist(u[-1], seg[0]) < 1: u.extend(seg[1:]); break
                if math.dist(u[-1], seg[-1]) < 1: u.extend(seg[::-1][1:]); break
            else: unidos.append(list(seg))
        return unidos, inn
    return [], []
def tipo_area(t):
    if t.get('natural') == 'coastline': return None
    if t.get('building'): return 'edificio'
    if t.get('natural') == 'water' or t.get('water'): return 'agua'
    if t.get('natural') in ('wood', 'scrub') or t.get('landuse') == 'forest': return 'bosque'
    if t.get('natural') in ('sand', 'beach'): return 'arena'
    if t.get('leisure') in ('pitch', 'track', 'stadium'): return 'cancha'
    if t.get('aeroway') in ('runway', 'taxiway', 'apron'): return 'pista'
    if t.get('aeroway') == 'aerodrome': return 'pasto'
    if t.get('place') == 'square' or (t.get('highway') == 'pedestrian' and t.get('area') == 'yes'): return 'plaza'
    if t.get('leisure') in ('park', 'garden', 'golf_course') or t.get('landuse') in ('grass', 'recreation_ground', 'meadow', 'cemetery'): return 'pasto'
    if t.get('landuse') == 'railway': return 'via'
    return None
ANCHO = dict(motorway=22, trunk=20, primary=16, secondary=13, tertiary=11, motorway_link=8, trunk_link=8, primary_link=8, secondary_link=8,
             residential=8, unclassified=8, living_street=6, pedestrian=6, service=4.5, footway=2.5, path=2.2, cycleway=2.5, steps=2.5, track=3, bridleway=2.5)
def tipo_linea(t):
    h = t.get('highway')
    if h in ('motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link'): return 'avenida', ANCHO[h]
    if h in ('residential', 'unclassified', 'living_street', 'service'): return 'calle', ANCHO[h]
    if h in ('pedestrian', 'footway', 'path', 'cycleway', 'steps', 'track', 'bridleway'):
        if t.get('footway') == 'crossing' or t.get('covered') in ('yes', 'colonnade') or t.get('indoor') == 'yes': return None, 0   # cruces y pasajes bajo techo: no se dibujan
        if t.get('footway') == 'sidewalk': return 'vereda', 3
        return 'sendero', ANCHO[h]
    if t.get('railway') in ('rail', 'light_rail', 'subway'): return 'via', 6
    if t.get('aeroway') in ('runway', 'taxiway'): return 'pista', 45 if t.get('aeroway') == 'runway' else 18
    return None, 0

def rasterizar(x0, y0, w, h, m, nombre, con_edificios):
    px = lambda p: ((p[0] - x0) / m, (p[1] - y0) / m)
    capas = {k: Image.new('L', (w, h), 0) for k in T}
    dib = {k: ImageDraw.Draw(v) for k, v in capas.items()}
    altura = Image.new('L', (w, h), 0); dalt = ImageDraw.Draw(altura)
    ident = Image.new('L', (w, h), 0); did = ImageDraw.Draw(ident)
    costa = Image.new('L', (w, h), 0); dcosta = ImageDraw.Draw(costa)
    lineas = []
    tramos_costa = []
    for e in EL:
        t = e.get('tags', {})
        if t.get('natural') == 'coastline' and e.get('geometry'):
            tramos_costa.append([EN(g['lat'], g['lon']) for g in e['geometry']])
            continue
        ta = tipo_area(t)
        cerrado = e['type'] == 'relation' or (e.get('geometry') and len(e['geometry']) > 3 and e['geometry'][0] == e['geometry'][-1])
        if ta and cerrado and not (t.get('highway') and ta != 'plaza'):
            if ta == 'edificio' and not con_edificios: continue
            out, inn = anillos(e)
            for r in out:
                if len(r) > 2:
                    pr = [px(p) for p in r]
                    sup = abs(sum(r[i][0] * r[i - 1][1] - r[i - 1][0] * r[i][1] for i in range(len(r)))) / 2
                    dib['rio' if ta == 'agua' and sup > 2e6 else ta].polygon(pr, fill=255)
                    if ta == 'edificio':
                        lv = t.get('building:levels') or ''; hh = t.get('height') or ''
                        try: alto = float(hh.split()[0]) if hh else float(lv) * 3.2 if lv else 9.0
                        except ValueError: alto = 9.0
                        dalt.polygon(pr, fill=int(max(3, min(250, alto))))
                        did.polygon(pr, fill=(e['id'] * 2654435761 >> 7) % 63 + 1)
            for r in inn:
                if len(r) > 2 and ta != 'edificio': dib[ta].polygon([px(p) for p in r], fill=0)
            continue
        tl, an = tipo_linea(t)
        if tl and e.get('geometry') and not (t.get('area') == 'yes'):
            if t.get('tunnel') in ('yes', 'building_passage') or t.get('layer', '0').startswith('-'): continue
            lineas.append((tl, an, [px(P(g['lat'], g['lon'])) for g in e['geometry']]))
        elif t.get('natural') == 'tree' and e['type'] == 'node':
            lineas.append(('arbol', 0, [px(P(e['lat'], e['lon']))]))
    # veredas debajo de las calles, después calles finas, avenidas, vías, pistas, senderos
    for tl, an, pts in lineas:
        if tl in ('calle', 'avenida'): dib['vereda'].line(pts, fill=255, width=max(1, round((an + 7) / m)), joint='curve')
        elif tl == 'vereda': dib['vereda'].line(pts, fill=255, width=max(1, round(an / m)), joint='curve')
    for orden in ('calle', 'avenida', 'via', 'pista', 'sendero'):
        for tl, an, pts in lineas:
            if tl == orden: dib[tl].line(pts, fill=255, width=max(1, round(an / m)), joint='curve')
    arboles = [pts[0] for tl, an, pts in lineas if tl == 'arbol']
    # río: la costa como barrera y relleno desde un punto en el agua
    if tramos_costa:
        # agua = a la derecha del tramo de costa más cercano (convención de OpenStreetMap), en una grilla de 40 m
        A = np.array([p for t in tramos_costa for p in t[:-1]]); B = np.array([p for t in tramos_costa for p in t[1:]])
        paso_g = 40.0; gw, gh = int(w * m / paso_g) + 1, int(h * m / paso_g) + 1
        gx = x0 + (np.arange(gw) + .5) * paso_g; gy = y0 + (np.arange(gh) + .5) * paso_g
        GX, GY = np.meshgrid(gx, gy); jx = GX.ravel(); jy = GY.ravel() + CORRIDA
        ex = jx * DER[0] + jy * ABAJO[0] + O[0]; ny_ = jx * DER[1] + jy * ABAJO[1] + O[1]     # vuelta a este/norte
        P_ = np.stack([ex, ny_], 1); agua_g = np.zeros(len(P_), bool); D_ = B - A; L2 = np.maximum((D_ ** 2).sum(1), 1e-9)
        for k in range(0, len(P_), 4000):
            q = P_[k:k + 4000, None, :]
            t = np.clip(((q - A) * D_).sum(2) / L2, 0, 1)
            cerca = A + t[..., None] * D_
            d2 = ((q - cerca) ** 2).sum(2); idx = d2.argmin(1)
            cr = D_[idx, 0] * (q[:, 0, 1] - A[idx, 1]) - D_[idx, 1] * (q[:, 0, 0] - A[idx, 0])
            agua_g[k:k + 4000] = cr < 0
        ag = agua_g.reshape(gh, gw)
        # el agua no puede quedar más al este que la costa a esa misma altura (la costa corre de arriba abajo)
        cg = np.array([G(*p) for t in tramos_costa for p in t])
        for r in range(gh):
            cerca_y = cg[np.abs(cg[:, 1] - gy[r]) < 400]
            lim = (cerca_y[:, 0].max() if len(cerca_y) else cg[:, 0].max()) + 60
            ag[r, gx > lim] = False
        def vec(x, f):
            r = x.copy()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1): r = f(r, np.roll(np.roll(x, dy, 0), dx, 1))
            return r
        for _ in range(2): ag = vec(ag, np.logical_and)    # sacar formas angostas (rayas de vértices)
        for _ in range(2): ag = vec(ag, np.logical_or)
        mg = Image.fromarray((ag * 128).astype(np.uint8)).resize((int(gw * paso_g / m), int(gh * paso_g / m)), Image.NEAREST).crop((0, 0, w, h))
        costa.paste(mg)
        print('costa: %d tramos, %.0f%% del mapa es agua' % (len(tramos_costa), agua_g.mean() * 100))
    if False:
        sx, sy = px(P(-34.540, -58.395))
        if 0 <= sx < w and 0 <= sy < h:
            ImageDraw.floodfill(costa, (int(sx), int(sy)), 128, thresh=0)
    A = {k: np.asarray(v) > 0 for k, v in capas.items()}
    tipo = np.zeros((h, w), np.uint8)
    tipo[(np.asarray(costa) == 128) | A['rio']] = T['rio']
    for k in ('pasto', 'bosque', 'cancha', 'arena', 'via', 'plaza', 'agua'):
        tipo[A[k]] = T[k]
    tipo[A['vereda'] & (tipo == 0)] = T['vereda']
    for k in ('calle', 'avenida', 'via', 'pista', 'sendero'):
        tipo[A[k]] = T[k]
    edif = A['edificio'] & (tipo != T['avenida']) & (tipo != T['calle'])
    tipo[edif] = T['edificio']
    alt = np.where(edif, np.asarray(altura), 0).astype(np.uint8)
    det = np.where(edif, np.asarray(ident), 0).astype(np.uint8)
    # bisel de techos: borde arriba/izquierda claro, abajo/derecha oscuro
    if edif.any():
        idn = np.asarray(ident).astype(np.int16)
        claro = edif & ((np.roll(idn, 1, 0) != idn) | (np.roll(idn, 1, 1) != idn))
        oscuro = edif & ((np.roll(idn, -1, 0) != idn) | (np.roll(idn, -1, 1) != idn))
        det = np.where(claro, (det & 63) | 64, det); det = np.where(oscuro & ~claro, (det & 63) | 128, det)
    # árboles reales: discos con luz desde arriba a la izquierda (G = luz 0..120)
    esp = np.zeros((h, w), np.uint8)
    if arboles and m <= 2:
        r = 4.5 / m
        for (ax, ay) in arboles:
            for yy in range(int(ay - r - 1), int(ay + r + 2)):
                for xx in range(int(ax - r - 1), int(ax + r + 2)):
                    if 0 <= xx < w and 0 <= yy < h and tipo[yy, xx] not in (T['edificio'], T['avenida'], T['calle'], T['agua'], T['rio']):
                        dx, dy = xx - ax, yy - ay; dd = math.hypot(dx, dy)
                        if dd < r:
                            tipo[yy, xx] = T['arbol']; det[yy, xx] = int(max(0, min(120, 60 - (dx + dy) / r * 40 + (1 - dd / r) * 25))); esp[yy, xx] = (int(ax * 7 + ay * 13) * 2654435761 >> 5) % 100
    # sombras proyectadas hacia abajo a la derecha (bit 128 de G en el suelo)
    som = np.zeros((h, w), bool); altm = alt.astype(np.float32) / m
    for k in range(1, int(min(40, 30 / m)) + 1):
        som |= (np.roll(np.roll(altm, k, 0), k, 1) * .7 >= k)
    arb = tipo == T['arbol']
    for k in range(1, max(2, int(3 / m)) + 1):
        som |= np.roll(np.roll(arb, k, 0), k, 1)
    suelo = (tipo != T['edificio']) & (tipo != T['arbol']) & (tipo != T['agua']) & (tipo != T['rio'])
    det = np.where(som & suelo, det | 128, det)
    alt = np.where(tipo == T['arbol'], esp, alt)
    img = np.dstack([tipo, det, alt]).astype(np.uint8)
    Image.fromarray(img, 'RGB').save(nombre, optimize=True)
    print(nombre, w, h, 'edificios', int(edif.sum()), 'árboles', len(arboles), os.path.getsize(nombre) // 1024, 'KB')

dest = sys.argv[1]
rasterizar(-450, -200, 1800, 4900, 0.5, os.path.join(dest, 'mapa_cerca.png'), True)
rasterizar(-7600, -7600, 3040, 3040, 5.0, os.path.join(dest, 'mapa_lejos.png'), True)
