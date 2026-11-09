CREATE TABLE IF NOT EXISTS eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT DEFAULT (datetime('now')),
  ev TEXT NOT NULL,          -- inicio, sigue, acto, pulso, compartir, fin, salida
  jugador TEXT NOT NULL,     -- número al azar guardado en el navegador, sin datos personales
  seg INTEGER,               -- segundos jugados en esa partida
  acto INTEGER,              -- momento de la misa (0 previa ... 5 bendición)
  fieles INTEGER,            -- fieles convertidos
  movil INTEGER,             -- 1 si es pantalla de celular
  extra TEXT,                -- tipo de compartido o número de acto
  pais TEXT                  -- país según Cloudflare
);
CREATE INDEX IF NOT EXISTS ev_idx ON eventos(ev);
CREATE INDEX IF NOT EXISTS jug_idx ON eventos(jugador);
