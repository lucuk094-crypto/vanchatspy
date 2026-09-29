/*
 * uji-ddns.mjs — menguji tools/cloudflare-ddns.mjs memakai tiruan API Cloudflare
 * (tanpa token sungguhan). Yang diperiksa:
 *   1. record A lama (IP berubah) → diperbarui ke IP publik baru
 *   2. IP tidak berubah → tidak ada permintaan PATCH sama sekali (hemat)
 *   3. record belum ada → dibuat baru (POST) dengan proxied=true
 *   4. nama zone ditemukan otomatis untuk subdomain multi-level (a.b.co.id)
 *   5. --dry-run benar-benar tidak mengubah apa pun
 *   6. token salah/zone tidak ada → pesan galat yang jelas
 *
 *   node tools/uji-ddns.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catatan = [];
const tulis = (s) => { console.log(s); catatan.push(s); };
let gagal = 0;
const cek = (nama, benar, ket) => {
  tulis((benar ? '  ✓ ' : '  ✗ ') + nama + (ket ? ' — ' + ket : ''));
  if (!benar) gagal++;
};

/* ── tiruan API Cloudflare ─────────────────────────────────────────── */
const zones = [
  { id: 'z-contoh', name: 'contoh.com' },
  { id: 'z-coid', name: 'b.co.id' },
];
let records = [
  { id: 'r1', type: 'A', name: 'router.contoh.com', content: '9.9.9.9', ttl: 1, proxied: true, zone: 'z-contoh' },
];
const panggilan = [];
const tokenSah = 'token-uji';

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const jwb = (status, isi) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(isi)); };
  if (String(req.headers.authorization || '') !== 'Bearer ' + tokenSah) return jwb(403, { success: false, errors: [{ message: 'Invalid API Token' }] });

  let badan = null;
  if (req.method !== 'GET') {
    const bagian = [];
    for await (const c of req) bagian.push(c);
    try { badan = JSON.parse(Buffer.concat(bagian).toString('utf8')); } catch (e) { badan = {}; }
  }
  panggilan.push({ metode: req.method, jalur: url.pathname + url.search, badan });

  if (url.pathname === '/client/v4/zones') {
    const nama = url.searchParams.get('name');
    const kena = zones.filter((z) => z.name === nama);
    return jwb(200, { success: true, result: kena, result_info: { count: kena.length } });
  }
  const cocokZone = url.pathname.match(/^\/client\/v4\/zones\/([^/]+)\/dns_records$/);
  if (cocokZone && req.method === 'GET') {
    const zid = cocokZone[1];
    const nama = url.searchParams.get('name');
    return jwb(200, { success: true, result: records.filter((r) => r.zone === zid && (!nama || r.name === nama)) });
  }
  if (cocokZone && req.method === 'POST') {
    const zid = cocokZone[1];
    const baru = { id: 'r-baru', ...badan, zone: zid };
    records.push(baru);
    return jwb(200, { success: true, result: baru });
  }
  const cocokRekod = url.pathname.match(/^\/client\/v4\/zones\/([^/]+)\/dns_records\/([^/]+)$/);
  if (cocokRekod && (req.method === 'PATCH' || req.method === 'PUT')) {
    const r = records.find((x) => x.id === cocokRekod[2]);
    if (!r) return jwb(404, { success: false, errors: [{ message: 'Record not found' }] });
    Object.assign(r, badan);
    return jwb(200, { success: true, result: r });
  }
  return jwb(404, { success: false, errors: [{ message: 'Not found: ' + url.pathname }] });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const API = 'http://127.0.0.1:' + PORT + '/client/v4';

/* ── jalankan skrip DDNS sebagai proses terpisah (seperti dipakai pengguna) ──
   Dipakai cara async supaya tiruan API Cloudflare di proses ini tetap bisa menjawab
   (kalau pakai execFileSync, event loop induk terblokir dan tiruannya mati kaku). */
const jalankan = (...argv) => new Promise((selesai) => {
  const p = spawn('node', [path.join(AKAR, 'tools', 'cloudflare-ddns.mjs'), ...argv], { cwd: AKAR });
  let keluaran = '';
  p.stdout.on('data', (d) => { keluaran += d; });
  p.stderr.on('data', (d) => { keluaran += d; });
  p.on('close', (kode) => selesai({ kode, keluaran }));
});

const berkasSetelan = path.join(AKAR, 'tools', 'cloudflare.json');
const setelanLama = fs.existsSync(berkasSetelan) ? fs.readFileSync(berkasSetelan, 'utf8') : null;

try {
  tulis('══ uji cloudflare-ddns (tiruan API Cloudflare) ══');

  /* 1. IP berubah → PATCH */
  let h = await jalankan('--api', API, '--token', tokenSah, '--domain', 'router.contoh.com', '--ip', '1.2.3.4');
  const patch1 = panggilan.filter((p) => p.metode === 'PATCH');
  tulis('   ' + h.keluaran.trim().split('\n').pop());
  cek('IP berubah → record A diperbarui', h.kode === 0 && patch1.length === 1 && patch1[0].badan.content === '1.2.3.4' && patch1[0].badan.proxied === true);
  cek('record di tiruan ikut berubah', records[0].content === '1.2.3.4');

  /* 2. IP sama → tanpa PATCH */
  panggilan.length = 0;
  h = await jalankan('--api', API, '--token', tokenSah, '--domain', 'router.contoh.com', '--ip', '1.2.3.4');
  tulis('   ' + h.keluaran.trim().split('\n').pop());
  cek('IP tidak berubah → tidak ada PATCH (tidak boros)', panggilan.filter((p) => p.metode === 'PATCH').length === 0 && /tidak ada yang perlu diubah/.test(h.keluaran));

  /* 3. record belum ada → POST */
  panggilan.length = 0;
  h = await jalankan('--api', API, '--token', tokenSah, '--domain', 'rumah.contoh.com', '--ip', '5.6.7.8');
  const post = panggilan.filter((p) => p.metode === 'POST');
  tulis('   ' + h.keluaran.trim().split('\n').pop());
  cek('record belum ada → dibuat (POST, proxied true)', h.kode === 0 && post.length === 1 && post[0].badan.name === 'rumah.contoh.com' && post[0].badan.proxied === true);

  /* 4. subdomain multi-level → zone ditemukan otomatis (b.co.id) */
  panggilan.length = 0;
  h = await jalankan('--api', API, '--token', tokenSah, '--domain', 'router.rumah.b.co.id', '--ip', '7.7.7.7');
  const zoneDicari = panggilan.filter((p) => p.jalur.startsWith('/client/v4/zones?'));
  tulis('   zone dicari berurutan: ' + zoneDicari.map((p) => decodeURIComponent(p.jalur.split('name=')[1].split('&')[0])).join(' → '));
  cek('zone diambil dari potongan domain yang benar', h.kode === 0 && zoneDicari.some((p) => p.jalur.includes('b.co.id')));

  /* 5. --dry-run tidak mengubah apa pun */
  panggilan.length = 0;
  h = await jalankan('--api', API, '--token', tokenSah, '--domain', 'router.contoh.com', '--ip', '8.8.8.8', '--dry-run');
  tulis('   ' + h.keluaran.trim().split('\n').pop());
  cek('--dry-run tidak mengirim PATCH/POST', h.kode === 0 && panggilan.filter((p) => p.metode !== 'GET').length === 0 && records[0].content === '1.2.3.4');

  /* 6. token salah → pesan jelas */
  h = await jalankan('--api', API, '--token', 'token-salah', '--domain', 'router.contoh.com', '--ip', '1.1.1.1');
  tulis('   ' + h.keluaran.trim().split('\n').pop());
  cek('token salah → pesan galat jelas + keluar kode 1', h.kode === 1 && /Invalid API Token/.test(h.keluaran));

  /* 7. setelan dari tools/cloudflare.json (tanpa --token/--domain) */
  fs.writeFileSync(berkasSetelan, JSON.stringify({ domain: 'router.contoh.com', token: tokenSah, proxied: true }, null, 2));
  panggilan.length = 0;
  h = await jalankan('--api', API, '--ip', '4.4.4.4');
  cek('setelan bisa dibaca dari tools/cloudflare.json', h.kode === 0 && records.find((r) => r.name === 'router.contoh.com').content === '4.4.4.4');
} catch (e) {
  gagal++;
  tulis('GAGAL: ' + e.message);
} finally {
  server.close();
  if (setelanLama === null) { try { fs.unlinkSync(berkasSetelan); } catch (e) {} }
  else fs.writeFileSync(berkasSetelan, setelanLama);
}

const kepala = 'UJI CLOUDFLARE DDNS (tiruan API)\n' + new Date().toLocaleString('id-ID') + '\n' + '─'.repeat(58) + '\n';
fs.writeFileSync(path.join(AKAR, 'bukti-uji', 'HASIL-UJI-DDNS.txt'), kepala + catatan.join('\n') + '\n\n'
  + (gagal ? 'HASIL: GAGAL — ' + gagal + ' pemeriksaan' : 'HASIL: SEMUA LULUS') + '\n');
console.log(gagal ? '\nHASIL: GAGAL — ' + gagal + ' pemeriksaan' : '\nHASIL: SEMUA LULUS');
process.exit(gagal ? 1 : 0);
