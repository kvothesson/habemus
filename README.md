# Habemus Fieles

Juego incremental: el Papa llega en papamóvil por Avenida del Libertador y hay que convertir a los 46.044.703 argentinos del Censo 2022 mientras transcurre la misa en Palermo. Pixel art hecho por código, un solo `index.html` sin dependencias.

Se juega en **https://kvothesson.com/habemus/**. En la compu: `abrir.cmd` (servidor local en el puerto 5371).

## Cómo está hecho

- **Mapa real.** `bajar_mapa.py` baja calles, parques, agua, edificios y árboles de OpenStreetMap; `raster.py` los convierte en `mapa_cerca.png` (0,5 m) y `mapa_lejos.png` (5 m), con tipo de suelo, bisel de techos, sombras y altura.
- **Gente a escala real.** `distancias.py` calcula la distancia caminando desde el altar por todo lo transitable (`mapa_dist.png`, `mapa_area.json`). La multitud ocupa 2,5 personas por m² en orden de distancia.
- **Coro.** `gregoriano.py` traduce partituras de GregoBase (Misa VIII de Ángeles y Salve Regina, dominio público) a notas para el sintetizador.
- **Métricas.** `metricas/` tiene un Worker de Cloudflare con D1 que recibe eventos anónimos (sin datos personales). En el juego se activan completando `METRICAS_URL`.

Mapa: © colaboradores de OpenStreetMap, licencia ODbL.
