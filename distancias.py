# Distancia caminando desde el altar por calles, veredas, plazas y parques (mapa_lejos.png, 5 m por píxel).
# Sale mapa_dist.png (R*256+G = metros, 65535 = no se llega) y mapa_area.json (área caminable acumulada y
# caja de la multitud por cada 5 m de distancia). El juego llena la multitud a 2,5 personas por m².
import heapq, json, math, os, sys
import numpy as np
from PIL import Image
dest = sys.argv[1] if len(sys.argv) > 1 else '.'
a = np.asarray(Image.open(os.path.join(dest, 'mapa_lejos.png')))
tipo = a[..., 0]
X0, Y0, M = -7600, -7600, 5.0
h, w = tipo.shape
# caminable: pasto, bosque, avenida, calle, sendero, cancha, arena, vereda, árbol (debajo), plaza
CAMINABLE = {1, 2, 4, 5, 6, 8, 11, 12, 13, 14}
ok = np.isin(tipo, list(CAMINABLE))
ys = (np.arange(h) + .5) * M + Y0
ok[ys < -30, :] = False          # detrás del escenario está vallado
dist = np.full((h, w), np.inf)
sx, sy = int((0 - X0) / M), int((5 - Y0) / M)
assert ok[sy, sx], 'el frente del escenario no es caminable'
dist[sy, sx] = 0
cola = [(0.0, sy, sx)]
VEC = [(-1, 0, M), (1, 0, M), (0, -1, M), (0, 1, M), (-1, -1, M * 1.4142), (-1, 1, M * 1.4142), (1, -1, M * 1.4142), (1, 1, M * 1.4142)]
okl = ok.tolist(); dl = dist.tolist()
while cola:
    d, y, x = heapq.heappop(cola)
    if d > dl[y][x]: continue
    for dy, dx, c in VEC:
        ny, nx = y + dy, x + dx
        if 0 <= ny < h and 0 <= nx < w and okl[ny][nx]:
            nd = d + c
            if nd < dl[ny][nx]:
                dl[ny][nx] = nd; heapq.heappush(cola, (nd, ny, nx))
dist = np.array(dl)
fin = np.isfinite(dist)
d16 = np.where(fin, np.minimum(dist, 65000), 65535).astype(np.uint16)
img = np.dstack([(d16 >> 8).astype(np.uint8), (d16 & 255).astype(np.uint8), np.zeros_like(tipo)])
Image.fromarray(img, 'RGB').save(os.path.join(dest, 'mapa_dist.png'), optimize=True)
# área acumulada y caja por tramos de 5 m
PASO = 5.0
n = int(dist[fin].max() // PASO) + 1
area = np.zeros(n); minx = np.full(n, np.inf); maxx = np.full(n, -np.inf); maxy = np.full(n, -np.inf)
yy, xx = np.nonzero(fin)
b = (dist[fin] // PASO).astype(int)
np.add.at(area, b, M * M)
gx = (xx + .5) * M + X0; gy = (yy + .5) * M + Y0
np.minimum.at(minx, b, gx); np.maximum.at(maxx, b, gx); np.maximum.at(maxy, b, gy)
area = np.cumsum(area); minx = np.minimum.accumulate(minx); maxx = np.maximum.accumulate(maxx); maxy = np.maximum.accumulate(maxy)
json.dump({'paso': PASO, 'x0': X0, 'y0': Y0, 'm': M, 'w': w, 'h': h, 'densidad': 2.5,
           'area': [round(v) for v in area], 'minx': [round(v) for v in minx], 'maxx': [round(v) for v in maxx], 'maxy': [round(v) for v in maxy]},
          open(os.path.join(dest, 'mapa_area.json'), 'w'))
tot = area[-1]
print('caminable alcanzable %.1f km²  -> entran %.1f millones a 2,5/m²  distancia máx %.1f km' % (tot / 1e6, tot * 2.5 / 1e6, n * PASO / 1000))
for millones in (.001, .01, .1, 1, 2.5, 10, 46.044703):
    k = int(np.searchsorted(area, millones * 1e6 / 2.5))
    k = min(k, n - 1)
    print('%9.3f M -> hasta %5.0f m caminando, caja x[%5.0f, %5.0f] y hasta %5.0f m' % (millones, (k + 1) * PASO, minx[k], maxx[k], maxy[k]))
