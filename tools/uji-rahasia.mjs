/* uji-rahasia.mjs — uji keamanan: kunci & rahasia tidak boleh bocor keluar.
 *
 * Memeriksa hal-hal yang bisa diperiksa tanpa akun hosting:
 *   1. berkas publik (HTML/JS/CSS) tidak memuat kunci API
 *   2. jawaban /api/providers hanya berisi kunci yang disamarkan
 *   3. pesan galat tidak memuat kunci/kredensial
 *   4. asal (Origin) asing tidak diizinkan memakai API
 *   5. validasi masukan & batas ukuran berjalan (bukan 200 untuk data ngawur)
 *   6. rahasia hanya hidup di server (env AI_API_KEY atau berkas setelan lokal)
 *      tidak pernah ikut ke berkas yang disajikan ke browser
 *
 *   node tools/uji-rahasia.mjs            (server uji jalan di :8131)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.UJI_URL || 'http://127.0.0.1:8131';

let gagal = 0;
const ok = (t) => console.log('  ✓ ' + t);
const no = (t) => { gagal++; console.log('  ✗ ' + t); };

/* kumpulkan semua kunci yang sebenarnya ada di server */
const kunci = new Set();
for (const f of ['api/chat.js', 'api/_ai.js', 'api/_aman.js']) {
  const p = path.join(AKAR, f);
  if (!fs.existsSync(p)) continue;
  for (const m of fs.readFileSync(p, 'utf8').matchAll(/sk-[a-zA-Z0-9-]{16,}/g)) kunci.add(m[0]);
}
const berkasKunci = path.join(AKAR, 'tools/kunci-ai.txt');
if (fs.existsSync(berkasKunci)) for (const b of fs.readFileSync(berkasKunci, 'utf8').split('\n')) {
  const s = b.trim(); if (s.length > 20) kunci.add(s);
}
console.log('kunci yang harus dijaga: ' + kunci.size + (kunci.size ? ' (' + [...kunci][0].slice(0, 12) + '…)' : ''));

/* 1. berkas publik tidak boleh memuat kunci */
const publik = ['index.html', 'assets/app.js', 'assets/app.css', 'assets/icons.js', 'manifest.webmanifest'];
let bocor = [];
for (const f of publik) {
  const p = path.join(AKAR, f);
  if (!fs.existsSync(p)) continue;
  const isi = fs.readFileSync(p, 'utf8');
  for (const k of kunci) if (isi.indexOf(k) >= 0) bocor.push(f);
}
bocor.length ? no('kunci ditemukan di berkas publik: ' + bocor.join(', ')) : ok('berkas publik bersih dari kunci API');

/* 2. & 3. jawaban API */
const r1 = await fetch(BASE + '/api/providers');
const t1 = await r1.text();
let adaPenuh = false;
for (const k of kunci) if (t1.indexOf(k) >= 0) adaPenuh = true;
const samar = (t1.match(/sk-[a-zA-Z0-9-]{1,10}…[a-zA-Z0-9]{2,6}/g) || []).length;
adaPenuh ? no('kunci penuh muncul di /api/providers') : ok('/api/providers hanya mengirim kunci tersamar (' + samar + ' kunci disamarkan)');

const r2 = await fetch(BASE + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"prompt":""}' });
const t2 = await r2.text();
console.log('  · prompt kosong → ' + r2.status + ' ' + t2.slice(0, 70));
(r2.status === 400) ? ok('masukan kosong ditolak rapi (400)') : no('masukan kosong tidak ditolak (status ' + r2.status + ')');
for (const k of kunci) if (t2.indexOf(k) >= 0) no('pesan galat memuat kunci API');

const r3 = await fetch(BASE + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'bukan-json' });
(r3.status === 400) ? ok('JSON rusak ditolak (400)') : no('JSON rusak tidak ditolak (status ' + r3.status + ')');

/* 4. asal asing */
const r4 = await fetch(BASE + '/api/providers', { headers: { Origin: 'https://jahat.example' } });
const acao = r4.headers.get('access-control-allow-origin') || '';
const bolehAsing = acao === 'https://jahat.example' || acao === '*';
bolehAsing ? no('asal asing diizinkan mengakses API (ACAO: ' + acao + ')') : ok('asal asing tidak mendapat izin CORS (ACAO: "' + acao + '")');

/* 4b. POST dari asal asing harus ditolak (kuota AI tidak bisa dipakai situs lain) */
const r4b = await fetch(BASE + '/api/chat', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://jahat.example' },
  body: JSON.stringify({ prompt: 'pakai kuota orang lain' }),
});
(r4b.status === 403) ? ok('POST /api/chat dari asal asing ditolak (403)') : no('POST dari asal asing tidak ditolak (status ' + r4b.status + ')');

/* 5. batas ukuran & validasi */
const r5 = await fetch(BASE + '/api/search?q=' + 'a'.repeat(400));
(r5.status === 400 || r5.status === 414) ? ok('kueri terlalu panjang ditolak (' + r5.status + ')') : no('kueri panjang tidak ditolak (status ' + r5.status + ')');

const r6 = await fetch(BASE + '/api/image/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'x', rasio: '9:99' }) });
(r6.status === 400 || r6.status === 501) ? ok('rasio tidak sah ditolak/ditolak jujur (' + r6.status + ')') : no('rasio tidak sah diterima (status ' + r6.status + ')');

/* 6. rahasia tidak ikut ke halaman */
const html = await (await fetch(BASE + '/')).text();
const scr = await (await fetch(BASE + '/assets/app.js')).text();
(kunci.size && [...kunci].some((k) => html.indexOf(k) >= 0 || scr.indexOf(k) >= 0))
  ? no('kunci ikut terkirim ke browser')
  : ok('halaman & skrip yang disajikan tidak memuat kunci');

console.log(gagal ? '\nHASIL: GAGAL — ' + gagal + ' pemeriksaan keamanan bermasalah' : '\nHASIL: SEMUA LULUS — kunci tetap di server, masukan divalidasi, asal asing ditolak');
process.exit(gagal ? 1 : 0);
