// Métricas de Habemus Fieles: recibe eventos anónimos del juego y los guarda en D1.
// Eventos: inicio, sigue, acto {a}, pulso (cada minuto jugado), compartir {tipo}, fin, salida.
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
    if (url.pathname === '/resumen' && url.searchParams.get('clave') === env.CLAVE) {
      const q = s => env.DB.prepare(s).all().then(r => r.results);
      const r = {
        jugadores: await q("SELECT COUNT(DISTINCT jugador) n FROM eventos WHERE ev IN ('inicio','sigue')"),
        por_dia: await q("SELECT date(ts) dia, COUNT(DISTINCT jugador) jugadores FROM eventos GROUP BY dia ORDER BY dia DESC LIMIT 30"),
        minutos_promedio: await q("SELECT ROUND(AVG(m),1) promedio, MAX(m) maximo FROM (SELECT jugador, MAX(seg)/60.0 m FROM eventos GROUP BY jugador)"),
        llegaron_a_cada_acto: await q("SELECT extra acto, COUNT(DISTINCT jugador) jugadores FROM eventos WHERE ev='acto' GROUP BY extra ORDER BY CAST(extra AS INT)"),
        terminaron: await q("SELECT COUNT(DISTINCT jugador) n FROM eventos WHERE ev='fin'"),
        compartidos: await q("SELECT extra tipo, COUNT(*) veces, COUNT(DISTINCT jugador) jugadores FROM eventos WHERE ev='compartir' GROUP BY extra"),
        celular: await q("SELECT movil, COUNT(DISTINCT jugador) jugadores FROM eventos GROUP BY movil"),
        paises: await q("SELECT pais, COUNT(DISTINCT jugador) jugadores FROM eventos GROUP BY pais ORDER BY jugadores DESC LIMIT 10"),
      };
      return new Response(JSON.stringify(r, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8' } });
    }
    return new Response('Habemus Fieles · métricas', { headers: cors });
  },
};
