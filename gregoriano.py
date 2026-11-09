# Traduce partituras gregorianas en GABC (GregoBase, dominio público) a la lista de notas del coro del juego.
# Cada neuma vale una corchea; punto = doble; episema = una y media; las barras son pausas.
import re, sys, json, os
LETRAS = 'abcdefghijklm'
ESCALA = [0, 2, 4, 5, 7, 9, 11]   # do re mi fa sol la si

def traducir(gabc, do_clave=72):
    cuerpo = gabc.split('%%', 1)[1]
    notas = []
    clave = ('c', 4)
    bemoles = set()
    for grupo in re.findall(r'\(([^)]*)\)', cuerpo):
        g = grupo.strip()
        m = re.fullmatch(r'([cf])b?([1-4])', g)
        if m: clave = (m.group(1), int(m.group(2))); continue
        if g in (',', "'", '`'): notas.append([None, 1]); bemoles.clear(); continue
        if g in (';',): notas.append([None, 1.5]); bemoles.clear(); continue
        if g in (':', '::', ':?'): notas.append([None, 2 if g == ':' else 3]); bemoles.clear(); continue
        # nota de referencia de la clave: c en la línea n -> letra d,f,h,j para líneas 1..4
        linea_letra = 'dfhj'[clave[1] - 1]
        base = LETRAS.index(linea_letra)
        grado_base = 0 if clave[0] == 'c' else 3   # do o fa
        i = 0
        while i < len(g):
            ch = g[i]
            if ch.lower() in LETRAS and ch.isalpha():
                nxt = g[i + 1] if i + 1 < len(g) else ''
                if nxt in 'xy':   # alteración, no es nota
                    (bemoles.add if nxt == 'x' else bemoles.discard)(ch.lower()); i += 2; continue
                paso = LETRAS.index(ch.lower()) - base + grado_base
                octava, grado = divmod(paso, 7)
                midi = do_clave + 12 * octava + ESCALA[grado] - (1 if ch.lower() in bemoles else 0)
                dur = 1
                j = i + 1
                while j < len(g) and g[j] in "vVwos~<>'._0123456789":
                    if g[j] == '.': dur = 2
                    if g[j] == '_' and dur < 1.5: dur = 1.5
                    j += 1
                notas.append([midi, dur]); i = j; continue
            i += 1
    # juntar pausas seguidas y sacar la del principio
    out = []
    for n in notas:
        if n[0] is None and (not out or out[-1][0] is None): continue
        out.append(n)
    return out

if __name__ == '__main__':
    carpeta = sys.argv[1]
    piezas = [('Kyrie de Ángeles', '1184.gabc', 1), ('Gloria de Ángeles', '961.gabc', 1), ('Sanctus de Ángeles', '1384.gabc', 4),
              ('Agnus Dei de Ángeles', '2760.gabc', 4), ('Salve Regina', '2715.gabc', 5)]
    res = []
    for nom, f, acto in piezas:
        n = traducir(open(os.path.join(carpeta, f), encoding='utf-8').read())
        res.append({'nom': nom, 'acto': acto, 'n': ' '.join(('R' if m is None else str(m)) + ':' + ('%g' % d) for m, d in n)})
        alto = [m for m, d in n if m]
        print(nom, len(n), 'notas, rango', min(alto), max(alto))
    print('const GREGORIANO=' + json.dumps(res, ensure_ascii=False) + ';', file=open(os.path.join(carpeta, 'gregoriano.js'), 'w', encoding='utf-8'))
