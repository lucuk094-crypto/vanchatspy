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
   Bisa diatur lewat Environment Variable (cara paling langsung), atau lewat
   berkas tools/9router.json yang ditulis oleh `node tools/cek-9router.mjs`
   setelah 9Router terbukti jalan. Contoh memakai 9Router (router AI lokal):

     AI_PROVIDER=9router AI_API_KEY=xxxx node tools/server-uji.mjs

   Tanpa pengaturan apa pun, aplikasi memakai kunci bawaan OpenRouter seperti
   sebelumnya — jadi tidak ada yang rusak kalau fitur ini tidak dipakai.
*/
function muatPenyedia() {
  const env = { ...process.env };
  let catatan = 'OpenRouter (kunci bawaan paket)';
  /* kalau pengguna sudah menentukan penyedia lewat environment, jangan ditimpa berkas */
  if (process.env.AI_PROVIDER && process.env.AI_BASE_URL) {
    return { env, catatan: process.env.AI_PROVIDER + ' (dari environment)' };
  }
  let dariBerkas = null;
  /* dua berkas setelan yang mungkin: penyedia.json (umum, mis. gateway Anthropic)
     dan 9router.json (khusus 9Router). penyedia.json diutamakan. */
  const berkasUmum = path.join(AKAR, 'tools', 'penyedia.json');
  const berkas9 = path.join(AKAR, 'tools', '9router.json');
  /* urutan berkas setelan bisa dipaksa lewat PENYEDIA_BERKAS=penyedia|9router
     (dipakai oleh rangkaian uji supaya tidak bergantung isi folder). */
  const pilihan = String(process.env.PENYEDIA_BERKAS || '').toLowerCase();
  const urutan = pilihan === '9router' ? [berkas9]
    : pilihan === 'penyedia' ? [berkasUmum]
    : [berkasUmum, berkas9];
  let berkas = urutan[0];
  try {
    for (const kandidat of urutan) {
      if (fs.existsSync(kandidat)) { dariBerkas = JSON.parse(fs.readFileSync(kandidat, 'utf8')); berkas = kandidat; break; }
    }
  } catch (e) { dariBerkas = null; }
  if (dariBerkas && dariBerkas.url && dariBerkas.nama) {
    /* berkas penyedia.json: nama + url + kunci + gaya (openai/anthropic) */
    env.AI_PROVIDER = env.AI_PROVIDER || String(dariBerkas.nama);
    env.AI_BASE_URL = env.AI_BASE_URL || String(dariBerkas.url).replace(/\/+$/, '');
    if (!env.AI_API_KEY && dariBerkas.kunci) env.AI_API_KEY = dariBerkas.kunci;
    if (!env.AI_GAYA && dariBerkas.gaya) env.AI_GAYA = String(dariBerkas.gaya);
    const m = dariBerkas.model || {};
    env.AI_MODEL_FAST = env.AI_MODEL_FAST || m.fast || '';
    env.AI_MODEL_THINK = env.AI_MODEL_THINK || m.think || '';
    catatan = dariBerkas.nama + ' (' + env.AI_BASE_URL + ')' + (dariBerkas.gaya === 'anthropic' ? ' · gaya Anthropic' : '') + (dariBerkas.dicek ? ' · terperiksa ' + dariBerkas.dicek : '');
  } else if (dariBerkas && dariBerkas.url) {
    env.AI_PROVIDER = env.AI_PROVIDER || '9router';
    env.AI_BASE_URL = env.AI_BASE_URL || String(dariBerkas.url).replace(/\/+$/, '');
    if (!env.AI_API_KEY && dariBerkas.kunci) env.AI_API_KEY = dariBerkas.kunci;
    const m = dariBerkas.model || {};
    env.AI_MODEL_FAST = env.AI_MODEL_FAST || m.fast || '';
    env.AI_MODEL_THINK = env.AI_MODEL_THINK || m.think || '';
    env.AI_MODEL_DEEP = env.AI_MODEL_DEEP || m.deep || '';
    env.AI_MODEL_EXPERT = env.AI_MODEL_EXPERT || m.expert || '';
    env.AI_MODEL_VISI = env.AI_MODEL_VISI || m.visi || '';
    catatan = '9Router lokal (' + env.AI_BASE_URL + ')' + (dariBerkas.dicek ? ' · terperiksa ' + dariBerkas.dicek : '');
  }
  if (env.AI_PROVIDER || env.AI_BASE_URL) {
    catatan = (env.AI_PROVIDER || 'penyedia sendiri') + ' → ' + (env.AI_BASE_URL || '(alamat bawaan)')
      + (env.AI_API_KEY ? ' · kunci dipasang' : ' · tanpa kunci');
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
