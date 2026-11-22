// Métricas de Habemus Fieles: recibe eventos anónimos del juego y los guarda en D1.
// Eventos: inicio, sigue, acto {a}, pulso (cada minuto jugado), compartir {tipo}, fin, salida.
// GET /resumen?clave=  → JSON con los totales.  El tablero se arma en la PC (taller: tablero/).
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
