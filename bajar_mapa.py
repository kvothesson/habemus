# Baja de OpenStreetMap (espejo Overpass de mail.ru) las calles, parques, agua y edificios alrededor del Monumento de los Españoles.
# Guarda lejos.json, medio.json y cerca.json en la carpeta actual; después correr raster.py con esa carpeta como actual.
import json, subprocess, sys, time
LAT, LON = -34.5749657, -58.4150562
URL = "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
def bbox(dlat, dlon): return f"{LAT-dlat},{LON-dlon},{LAT+dlat},{LON+dlon}"
LEJOS = bbox(.045, .055); MEDIO = bbox(.027, .033); CERCA = bbox(.011, .0135)
Q = {
 'lejos': f'''[out:json][timeout:180];(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|motorway_link|trunk_link|primary_link|secondary_link)$"]({LEJOS});
  way["railway"~"^(rail|light_rail|subway)$"]["tunnel"!="yes"]({LEJOS});
  nwr["leisure"~"^(park|garden|golf_course|pitch|stadium|track)$"]({LEJOS});
  nwr["natural"~"^(water|wood|scrub|sand|beach)$"]({LEJOS});
  nwr["landuse"~"^(grass|recreation_ground|forest|meadow|railway|cemetery)$"]({LEJOS});
  nwr["aeroway"~"^(aerodrome|runway|taxiway|apron)$"]({LEJOS});
  way["natural"="coastline"]({LEJOS});
 );out geom;''',
 'medio': f'''[out:json][timeout:180];(
  way["highway"~"^(residential|unclassified|living_street|pedestrian|service)$"]({MEDIO});
 );out geom;''',
 'cerca': f'''[out:json][timeout:180];(
  way["building"]({CERCA});
  way["highway"~"^(footway|path|cycleway|steps|track|bridleway)$"]({CERCA});
  nwr["place"="square"]({CERCA});
  nwr["amenity"="fountain"]({CERCA});
  node["natural"="tree"]({CERCA});
 );out geom;''',
}
for k in sys.argv[1:] or Q:
    for intento in range(4):
        r = subprocess.run(['curl','-s','-m','240','-G',URL,'--data-urlencode','data='+Q[k],'-o',k+'.json'])
        try:
            d = json.load(open(k+'.json', encoding='utf-8')); print(k, len(d['elements'])); break
        except Exception as e:
            print(k, 'falló, reintento', open(k+'.json','rb').read(120)); time.sleep(10)
