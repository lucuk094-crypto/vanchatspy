/*
 * server-uji.mjs — menjalankan paket Van Chat.SPY di komputer sendiri
 * (untuk uji coba atau dibagikan lewat tunnel). Meniru perilaku hosting:
 *   • berkas statis  : index.html, assets/*
 *   • /api/chat · /api/builder · /api/health : berkas backend yang SAMA
 *     seperti yang nanti diunggah ke Vercel, tanpa perubahan.
 *
 *   node tools/server-uji.mjs              → http://127.0.0.1:8131/
 *   PORT=9000 node tools/server-uji.mjs    → port lain
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8131);

/* ── penyedia AI yang dipakai ────────────────────────────────────────────
   Bisa diatur lewat Environment Variable, atau lewat berkas tools/penyedia.json
   yang ditulis oleh `node tools/cek-penyedia.mjs --tulis` setelah penyedia
   terbukti jalan (berisi kunci → berkas itu tidak ikut repo/zip).

     AI_PROVIDER=bynara AI_API_KEY=sk-nry-xxxx node tools/server-uji.mjs

   Tanpa kunci, aplikasi tetap jalan tetapi setiap percakapan dijawab jujur
   "kunci NaraRouter belum dipasang" — bukan jawaban palsu.
*/
function muatPenyedia() {
  const env = { ...process.env };
  let catatan = 'NaraRouter (tanpa kunci — isi AI_API_KEY)';
  /* kalau penyedia sudah ditentukan lengkap lewat environment, pakai itu */
  if (process.env.AI_PROVIDER && process.env.AI_BASE_URL) {
    return { env, catatan: process.env.AI_PROVIDER + ' (dari environment)' };
  }
  /* setelan lokal (opsional): tools/penyedia.json — dibuat oleh tools/cek-penyedia.mjs
     (`--tulis`). Berisi kunci rahasia, jadi TIDAK ikut repo/zip. */
  let dariBerkas = null;
  const berkas = path.join(AKAR, 'tools', 'penyedia.json');
  try {
    if (fs.existsSync(berkas)) dariBerkas = JSON.parse(fs.readFileSync(berkas, 'utf8'));
  } catch (e) { dariBerkas = null; }
  if (dariBerkas && dariBerkas.url) {
    env.AI_PROVIDER = env.AI_PROVIDER || String(dariBerkas.nama || 'bynara');
    env.AI_BASE_URL = env.AI_BASE_URL || String(dariBerkas.url).replace(/\/+$/, '');
    if (!env.AI_API_KEY && dariBerkas.kunci) env.AI_API_KEY = dariBerkas.kunci;
    const m = dariBerkas.model || {};
    env.AI_MODEL_FAST = env.AI_MODEL_FAST || m.fast || '';
    env.AI_MODEL_THINK = env.AI_MODEL_THINK || m.think || '';
    catatan = String(dariBerkas.nama || 'penyedia') + ' (' + env.AI_BASE_URL + ')' + (dariBerkas.dicek ? ' · terperiksa ' + dariBerkas.dicek : '');
  }
  return { env, catatan };
}
const PENYEDIA = muatPenyedia();

const { default: chat } = await import(path.join(AKAR, 'api/chat.js'));
const { default: builder } = await import(path.join(AKAR, 'api/builder.js'));
const { default: health } = await import(path.join(AKAR, 'api/health.js'));
const { default: search } = await import(path.join(AKAR, 'api/search.js'));
const { default: providers } = await import(path.join(AKAR, 'api/providers.js'));
const { default: cron } = await import(path.join(AKAR, 'api/cron.js'));
const { default: gambar } = await import(path.join(AKAR, 'api/image/generate.js'));
const { default: deploy } = await import(path.join(AKAR, 'api/deploy.js'));
const { penyediaTeks } = await import(path.join(AKAR, 'api/_ai.js'));

const JENIS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.zip': 'application/zip',
};

/* peta endpoint, sama seperti yang dipakai di hosting (Vercel) */
const peta = {
  '/api/chat': chat, '/api/builder': builder, '/api/health': health, '/api/search': search,
  '/api/providers': providers, '/api/cron': cron, '/api/image/generate': gambar, '/api/deploy': deploy,
};

async function teruskan(res, webRes) {
  res.writeHead(webRes.status, Object.fromEntries(webRes.headers));
  if (!webRes.body) return res.end();
  const rd = webRes.body.getReader();
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    res.write(Buffer.from(value));
    if (typeof res.flush === 'function') res.flush();
  }
  res.end();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const api = peta[url.pathname];

  if (api) {
    try {
      let body;
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        body = await new Promise((selesai) => {
          const potongan = [];
          req.on('data', (c) => potongan.push(c));
          req.on('end', () => selesai(Buffer.concat(potongan)));
        });
      }
      const webReq = new Request(url, { method: req.method, headers: req.headers, body });
      const webRes = await api(webReq, PENYEDIA.env);
      if (webRes.body) return teruskan(res, webRes);
      res.writeHead(webRes.status, Object.fromEntries(webRes.headers));
      return res.end(await webRes.text());
    } catch (e) {
      console.error('[api]', url.pathname, e);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: false, pesan: String((e && e.message) || e) }));
    }
  }

  /* halaman /library dilayani oleh index.html (aplikasi satu halaman) */
  const permintaan = (url.pathname === '/' || url.pathname === '/library' || url.pathname === '/library/') ? '/index.html' : url.pathname;
  const berkas = path.join(AKAR, decodeURIComponent(permintaan));
  if (!berkas.startsWith(AKAR) || !fs.existsSync(berkas) || fs.statSync(berkas).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('berkas tidak ditemukan');
  }
  res.writeHead(200, {
    'Content-Type': JENIS[path.extname(berkas)] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(berkas).pipe(res);
});

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`  Van Chat.SPY — server uji`);
  console.log(`  folder   : ${AKAR}`);
  console.log(`  alamat   : http://127.0.0.1:${PORT}/`);
  console.log(`  endpoint : /api/chat (streaming) · /api/builder · /api/search · /api/health`);
  console.log(`             /api/providers · /api/cron · /api/image/generate · /api/deploy`);
  console.log(`  penyedia AI: ${PENYEDIA.catatan}`);

  /* kalau memakai penyedia lokal, beri tahu apa adanya apakah sudah terjangkau */
  const p = penyediaTeks(PENYEDIA.env);
  if (p.lokal) {
    const dasar = p.dasar;
    try {
      const h = { 'Content-Type': 'application/json' };
      if (p.kunci) h.Authorization = 'Bearer ' + p.kunci;
      const r = await fetch(dasar + '/models', { headers: h, signal: AbortSignal.timeout(4000) });
      const j = await r.json();
      const jumlah = ((j && (j.data || j.models)) || []).length;
      console.log(`  ✓ ${p.nama} terjangkau (${r.status}) — ${jumlah} model terdaftar`);
    } catch (e) {
      console.log(`  ✗ ${p.nama} BELUM terjangkau di ${dasar}`);
      console.log(`    → jalankan dulu di CMD/terminal, lalu buka dashboard ${dasar.replace('/v1', '/dashboard')}`);
    }
  }
});
