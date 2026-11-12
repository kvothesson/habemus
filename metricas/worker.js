// Métricas de Habemus Fieles: recibe eventos anónimos del juego y los guarda en D1.
// Eventos: inicio, sigue, acto {a}, pulso (cada minuto jugado), compartir {tipo}, fin, salida.
// GET /resumen?clave=  → JSON con los totales.  GET /panel?clave=  → tablero para mirar en el navegador.
// Las fechas se muestran en hora argentina (UTC-3); D1 guarda en UTC.
export default {
  async fetch(req, env) {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(req.url);
    if (req.method === 'POST' && url.pathname === '/evento') {
      let d;
      try { d = JSON.parse(await req.text()); } catch { return new Response('mal', { status: 400, headers: cors }); }
      const ok = ['inicio', 'sigue', 'acto', 'pulso', 'compartir', 'fin', 'salida'];
      if (!ok.includes(d.ev) || typeof d.id !== 'string' || d.id.length > 40) return new Response('mal', { status: 400, headers: cors });
      await env.DB.prepare('INSERT INTO eventos (ev, jugador, seg, acto, fieles, movil, extra, pais) VALUES (?,?,?,?,?,?,?,?)')
        .bind(d.ev, d.id, d.seg | 0, d.acto | 0, Math.min(Number(d.fieles) || 0, 1e9), d.movil ? 1 : 0, String(d.tipo ?? d.a ?? '').slice(0, 20), req.cf?.country || '')
        .run();
      return new Response('ok', { headers: cors });
    }
    const conClave = url.searchParams.get('clave') === env.CLAVE;
    if (url.pathname === '/resumen' && conClave) {
      return new Response(JSON.stringify(await resumen(env), null, 2), { headers: { 'content-type': 'application/json; charset=utf-8' } });
    }
    if (url.pathname === '/panel' && conClave) {
      return new Response(panel(await resumen(env), Date.now()), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
    }
    return new Response('Habemus Fieles · métricas', { headers: cors });
  },
};

const AR = "'-3 hours'";
async function resumen(env) {
  const q = s => env.DB.prepare(s).all().then(r => r.results);
  return {
    jugadores: await q("SELECT COUNT(DISTINCT jugador) n FROM eventos WHERE ev IN ('inicio','sigue')"),
    por_dia: await q(`SELECT date(ts, ${AR}) dia, COUNT(DISTINCT jugador) jugadores, COUNT(DISTINCT CASE WHEN ev='fin' THEN jugador END) terminaron FROM eventos GROUP BY dia ORDER BY dia DESC LIMIT 30`),
    por_hora: await q(`SELECT strftime('%Y-%m-%d %H', ts, ${AR}) hora, COUNT(DISTINCT jugador) jugadores, COUNT(DISTINCT CASE WHEN movil=1 THEN jugador END) celu FROM eventos WHERE ts >= datetime('now','-48 hours') GROUP BY hora ORDER BY hora`),
    minutos_promedio: await q("SELECT ROUND(AVG(m),1) promedio, ROUND(MAX(m),1) maximo FROM (SELECT jugador, MAX(seg)/60.0 m FROM eventos GROUP BY jugador)"),
    llegaron_a_cada_acto: await q("SELECT extra acto, COUNT(DISTINCT jugador) jugadores FROM eventos WHERE ev='acto' GROUP BY extra ORDER BY CAST(extra AS INT)"),
    terminaron: await q("SELECT COUNT(DISTINCT jugador) n FROM eventos WHERE ev='fin'"),
    compartidos: await q("SELECT extra tipo, COUNT(*) veces, COUNT(DISTINCT jugador) jugadores FROM eventos WHERE ev='compartir' GROUP BY extra ORDER BY veces DESC"),
    celular: await q("SELECT movil, COUNT(DISTINCT jugador) jugadores FROM eventos GROUP BY movil"),
    paises: await q("SELECT pais, COUNT(DISTINCT jugador) jugadores FROM eventos GROUP BY pais ORDER BY jugadores DESC LIMIT 10"),
    ultimo: await q(`SELECT datetime(MAX(ts), ${AR}) ts FROM eventos`),
  };
}

// ---------- tablero ----------
const ACTOS = ['Previa', 'I · Ritos', 'II · Palabra', 'III · Homilía', 'IV · Eucaristía', 'V · Bendición'];
const TIPOS = {
  'momento': 'Compartir un momento', 'foto': 'Botón Compartir', 'estampita': 'Estampita del final',
  'vista-celu': 'Vio la foto (celu)', 'envio-celu': 'Mandó desde el celu', 'cancelo-celu': 'Canceló el menú del celu',
  'cerro-vista': 'Cerró la foto sin mandar', 'mas-opciones': 'Fue a "Más opciones"', 'llego-por-link': 'Entró por un link',
  'menu-whatsapp': 'Menú · WhatsApp', 'menu-telegram': 'Menú · Telegram', 'menu-gmail': 'Menú · Gmail', 'menu-x': 'Menú · X',
  'menu-facebook': 'Menú · Facebook', 'menu-copiar': 'Menú · copiar texto', 'menu-img': 'Menú · copiar imagen', 'menu-bajar': 'Menú · descargar',
};
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n = x => Number(x || 0).toLocaleString('es-AR');
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
const fechaAR = ms => new Date(ms - 3 * 3600e3).toISOString();

function delta(hoy, ayer) {
  if (!ayer) return hoy ? '<span class="d up">nuevo</span>' : '';
  const p = Math.round((hoy - ayer) / ayer * 100);
  return `<span class="d ${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p)}% vs ayer</span>`;
}

// línea de tiempo con área, grilla y ejes, como un widget de series
function serie(puntos, ancho, alto, conEjes) {
  const max = Math.max(1, ...puntos.map(p => p.v)), techo = Math.max(2, Math.ceil(max / 2) * 2);
  const L = conEjes ? 28 : 0, B = conEjes ? 18 : 0, w = ancho - L, h = alto - B, k = puntos.length;
  const x = i => L + (k <= 1 ? w / 2 : i / (k - 1) * w), y = v => h - v / techo * (h - 4);
  const linea = (campo) => puntos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[campo]).toFixed(1)}`).join('');
  let g = '';
  if (conEjes) {
    for (let t = 0; t <= 4; t++) { const v = techo * t / 4, yy = y(v).toFixed(1); g += `<line x1="${L}" x2="${ancho}" y1="${yy}" y2="${yy}" class="grilla"/><text x="${L - 6}" y="${+yy + 4}" class="eje" text-anchor="end">${Math.round(v)}</text>`; }
    puntos.forEach((p, i) => { if (p.h % 6 == 0) g += `<line x1="${x(i)}" x2="${x(i)}" y1="0" y2="${h}" class="grilla v"/><text x="${x(i)}" y="${alto - 3}" class="eje" text-anchor="middle">${p.et}</text>`; });
  }
  const area = linea('v') + `L${x(k - 1).toFixed(1)},${h}L${x(0).toFixed(1)},${h}Z`;
  const puntosHover = conEjes ? puntos.map((p, i) => `<rect x="${(x(i) - w / k / 2).toFixed(1)}" y="0" width="${(w / k).toFixed(1)}" height="${h}" class="hov"><title>${esc(p.tt)}: ${p.v} personas${p.c != null ? ` (${p.c} en celu)` : ''}</title></rect>`).join('') : '';
  const celu = conEjes && puntos[0].c != null ? `<path d="${linea('c')}" class="l2"/>` : '';
  return `<svg viewBox="0 0 ${ancho} ${alto}" preserveAspectRatio="none" class="serie">${g}<path d="${area}" class="area"/><path d="${linea('v')}" class="l1"/>${celu}${puntosHover}</svg>`;
}

function lista(filas) {
  const max = Math.max(1, ...filas.map(f => f.v));
  return filas.map(f => `<div class="tl"><span class="tn">${f.et}</span><span class="tb"><i style="width:${Math.max(1, f.v / max * 100)}%;${f.col ? 'background:' + f.col : ''}"></i></span><span class="tv">${n(f.v)}${f.s ? `<small>${f.s}</small>` : ''}</span></div>`).join('') || '<div class="vacio">Sin datos todavía</div>';
}

function panel(r, ahora) {
  const hoyStr = fechaAR(ahora).slice(0, 10), ayerStr = fechaAR(ahora - 864e5).slice(0, 10);
  const dia = s => r.por_dia.find(d => d.dia == s) || { jugadores: 0, terminaron: 0 };
  const hoy = dia(hoyStr), ayer = dia(ayerStr);
  const total = r.jugadores[0]?.n || 0, fin = r.terminaron[0]?.n || 0;
  const cel = r.celular.find(c => c.movil == 1)?.jugadores || 0, pc = r.celular.find(c => c.movil == 0)?.jugadores || 0;
  const actos = ACTOS.map((t, a) => ({ t, v: r.llegaron_a_cada_acto.find(x => x.acto == String(a))?.jugadores || 0 }));
  const base = actos[0].v || 1;
  const cmp = t => r.compartidos.find(c => c.tipo == t)?.veces || 0;
  const env = cmp('envio-celu'), canc = cmp('cancelo-celu'), vistas = cmp('vista-celu'), llegaron = cmp('llego-por-link');

  // 48 horas completas, aunque alguna no tenga datos
  const horas = [];
  for (let i = 47; i >= 0; i--) {
    const iso = fechaAR(ahora - i * 3600e3), clave = iso.slice(0, 10) + ' ' + iso.slice(11, 13), f = r.por_hora.find(h => h.hora == clave);
    horas.push({ v: f?.jugadores || 0, c: f?.celu || 0, h: +iso.slice(11, 13), et: iso.slice(11, 13) + 'h', tt: iso.slice(8, 10) + '/' + iso.slice(5, 7) + ' ' + iso.slice(11, 13) + 'h' });
  }
  const ult24 = horas.slice(24).reduce((s, p) => s + p.v, 0);
  const dias = r.por_dia.slice(0, 14).reverse();
  const actualizado = fechaAR(ahora).slice(11, 16);
  const estado = r.ultimo[0]?.ts && (ahora - Date.parse(r.ultimo[0].ts.replace(' ', 'T') + '-03:00')) < 3600e3;

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><meta http-equiv="refresh" content="60"><title>Habemus · métricas</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=VT323&display=swap" rel="stylesheet">
<style>
:root{--fondo:#0d0915;--widget:#171024;--borde:#2a1f3d;--texto:#f6efe0;--suave:#9a8bb8;--tenue:#5e5277;--oro:#ffd35a;--cel:#6ab0e8;--verde:#5fd38a;--rojo:#ff6b6b;--violeta:#7a3dc8}
*{box-sizing:border-box}html{background:var(--fondo)}body{margin:0;color:var(--texto);font:13px/1.35 ui-sans-serif,system-ui,sans-serif}
.top{display:flex;align-items:center;gap:12px;padding:10px 16px;background:#120c1c;border-bottom:1px solid var(--borde);position:sticky;top:0;z-index:2}
.logo{font:28px/1 VT323,monospace;color:var(--oro);letter-spacing:.5px}.logo span{color:var(--suave)}
.punto{width:8px;height:8px;border-radius:50%;background:${estado ? 'var(--verde)' : 'var(--tenue)'};box-shadow:0 0 0 3px ${estado ? '#5fd38a33' : 'transparent'}}
.top .meta{color:var(--suave);font-size:12px}.top .der{margin-left:auto;display:flex;gap:6px}
.chip{border:1px solid var(--borde);background:var(--widget);color:var(--suave);padding:3px 8px;border-radius:4px;font-size:12px;text-decoration:none}a.chip:hover{color:var(--texto);border-color:var(--tenue)}
.grid{display:grid;grid-template-columns:repeat(12,1fr);gap:10px;padding:12px 16px 24px;max-width:1400px;margin:0 auto}
.w{background:var(--widget);border:1px solid var(--borde);border-radius:6px;padding:10px 12px;min-width:0}
.w h3{margin:0 0 8px;font-size:12px;font-weight:600;color:var(--suave);display:flex;justify-content:space-between;gap:8px}.w h3 em{font-style:normal;color:var(--tenue);font-weight:400}
.c2{grid-column:span 2}.c3{grid-column:span 3}.c4{grid-column:span 4}.c5{grid-column:span 5}.c6{grid-column:span 6}.c7{grid-column:span 7}.c8{grid-column:span 8}.c12{grid-column:span 12}
.qv b{display:block;font:44px/1 VT323,monospace;font-variant-numeric:tabular-nums;margin:2px 0 4px}.qv .s{color:var(--suave);font-size:12px}
.qv.oro b{color:var(--oro)}.qv.cel b{color:var(--cel)}.qv.verde b{color:var(--verde)}
.d{font-size:11px;padding:1px 5px;border-radius:3px;margin-left:4px}.d.up{color:var(--verde);background:#5fd38a1a}.d.down{color:var(--rojo);background:#ff6b6b1a}
.spark{height:28px;margin-top:6px}
.serie{width:100%;height:100%;display:block;overflow:visible}.grande{height:210px}
.grilla{stroke:var(--borde);stroke-width:1}.grilla.v{stroke-dasharray:2 3}.eje{fill:var(--tenue);font-size:10px;font-family:ui-monospace,monospace}
.area{fill:url(#ga)}.l1{fill:none;stroke:var(--oro);stroke-width:1.6;vector-effect:non-scaling-stroke}.l2{fill:none;stroke:var(--cel);stroke-width:1.2;stroke-dasharray:3 2;vector-effect:non-scaling-stroke}
.hov{fill:transparent}.hov:hover{fill:#ffffff10}
.ley{display:flex;gap:14px;color:var(--suave);font-size:11px;margin-top:6px}.ley i{display:inline-block;width:12px;height:2px;vertical-align:middle;margin-right:5px}
.tl{display:grid;grid-template-columns:minmax(90px,42%) 1fr auto;gap:8px;align-items:center;padding:4px 0;border-bottom:1px solid #ffffff08}
.tn{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tb{height:8px;background:#ffffff0a;border-radius:2px;overflow:hidden}.tb i{display:block;height:100%;background:var(--oro);border-radius:2px}
.tv{font-family:ui-monospace,monospace;font-variant-numeric:tabular-nums;text-align:right;min-width:58px}.tv small{color:var(--tenue);margin-left:6px}
.embudo .tb i{background:linear-gradient(90deg,var(--violeta),var(--oro))}
.dias{display:flex;align-items:flex-end;gap:4px;height:130px}.dias div{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:3px;min-width:0}
.dias b{width:100%;background:var(--violeta);border-radius:2px 2px 0 0;position:relative}.dias b i{position:absolute;left:0;right:0;bottom:0;background:var(--oro);border-radius:2px 2px 0 0}
.dias span{font-size:10px;color:var(--tenue);font-family:ui-monospace,monospace}.dias em{font-style:normal;font-size:11px;color:var(--suave)}
.nota{color:var(--tenue);font-size:11px;margin-top:8px}.vacio{color:var(--tenue);padding:10px 0}
@media (max-width:900px){.c2,.c3{grid-column:span 6}.c4,.c5,.c6,.c7,.c8{grid-column:span 12}.grid{padding:10px}.top .meta,.top .der .chip:first-child{display:none}}
@media (max-width:420px){.qv b{font-size:38px}}
</style></head><body>
<svg width="0" height="0" style="position:absolute"><defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd35a" stop-opacity=".35"/><stop offset="1" stop-color="#ffd35a" stop-opacity="0"/></linearGradient></defs></svg>
<div class="top"><span class="punto" title="${estado ? 'Hubo actividad en la última hora' : 'Sin actividad en la última hora'}"></span><span class="logo">HABEMUS <span>· métricas</span></span>
<span class="meta">último evento ${esc(r.ultimo[0]?.ts?.slice(5, 16) || '-')} · hora argentina</span>
<span class="der"><span class="chip">${actualizado} · se actualiza solo</span><a class="chip" href="https://kvothesson.com/habemus/" target="_blank" rel="noopener">abrir juego ↗</a></span></div>
<div class="grid">
<div class="w qv oro c2"><h3>Personas hoy</h3><b>${n(hoy.jugadores)}</b><div class="s">${delta(hoy.jugadores, ayer.jugadores)}</div><div class="spark">${serie(horas.slice(24), 200, 28, false)}</div></div>
<div class="w qv c2"><h3>Últimas 24 h</h3><b>${n(ult24)}</b><div class="s">personas, sumando hora por hora</div></div>
<div class="w qv c2"><h3>Total</h3><b>${n(total)}</b><div class="s">personas que jugaron</div></div>
<div class="w qv verde c2"><h3>Terminaron</h3><b>${n(fin)}</b><div class="s">${pct(fin, total)}% del total · ${n(hoy.terminaron)} hoy</div></div>
<div class="w qv c2"><h3>Tiempo</h3><b>${esc(r.minutos_promedio[0]?.promedio ?? 0)}<small style="font-size:22px"> min</small></b><div class="s">promedio · máx ${esc(r.minutos_promedio[0]?.maximo ?? 0)} min</div></div>
<div class="w qv cel c2"><h3>Celular</h3><b>${pct(cel, cel + pc)}%</b><div class="s">${n(cel)} en celu · ${n(pc)} en compu</div></div>

<div class="w c8"><h3>Personas por hora <em>últimas 48 h</em></h3><div class="grande">${serie(horas, 800, 210, true)}</div>
<div class="ley"><span><i style="background:var(--oro)"></i>todas</span><span><i style="background:var(--cel)"></i>en celu</span></div></div>
<div class="w c4 embudo"><h3>Hasta dónde llegan <em>de ${n(base)} que arrancaron</em></h3>${lista([...actos.map(a => ({ et: a.t, v: a.v, s: pct(a.v, base) + '%' })), { et: 'Terminaron', v: fin, s: pct(fin, base) + '%', col: 'var(--verde)' }])}</div>

<div class="w c5"><h3>Compartir <em>veces · personas</em></h3>${lista(r.compartidos.map(c => ({ et: esc(TIPOS[c.tipo] || c.tipo), v: c.veces, s: c.jugadores + ' p', col: c.tipo == 'envio-celu' || c.tipo == 'llego-por-link' ? 'var(--verde)' : c.tipo.startsWith('cancelo') || c.tipo.startsWith('cerro') ? 'var(--rojo)' : '' })))}
<div class="nota">Las pruebas en local también cuentan acá.</div></div>
<div class="w qv c3"><h3>Envíos desde el celu</h3><b>${n(env)}</b><div class="s">${vistas ? `de ${n(vistas)} que vieron la foto (${pct(env, vistas)}%)` : `${n(canc)} cancelados`}</div>
<h3 style="margin-top:16px">Entraron por un link</h3><b style="color:var(--verde)">${n(llegaron)}</b><div class="s">personas que llegaron por algo compartido</div></div>
<div class="w c4"><h3>Países</h3>${lista(r.paises.map(p => ({ et: esc(p.pais || '?'), v: p.jugadores, col: 'var(--cel)' })))}</div>

<div class="w c12"><h3>Personas por día <em>últimos 14 días · amarillo: terminaron</em></h3><div class="dias">${dias.map(d => {
    const m = Math.max(1, ...dias.map(x => x.jugadores));
    return `<div title="${esc(d.dia)}: ${d.jugadores} personas, ${d.terminaron} terminaron"><em>${d.jugadores}</em><b style="height:${d.jugadores / m * 100}%"><i style="height:${d.jugadores ? d.terminaron / d.jugadores * 100 : 0}%"></i></b><span>${esc(d.dia.slice(8, 10) + '/' + d.dia.slice(5, 7))}</span></div>`;
  }).join('')}</div></div>
</div></body></html>`;
}
