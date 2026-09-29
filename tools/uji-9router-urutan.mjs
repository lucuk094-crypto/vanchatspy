/*
 * uji-9router-urutan.mjs — menjawab pertanyaan: "harus buka 9Router dulu baru webnya?"
 *
 * Yang dibuktikan:
 *   1. web dibuka DULU (9Router belum jalan) → status jujur "belum bisa dihubungi"
 *      dan pesan chat juga jujur (bukan jawaban palsu, bukan lari ke penyedia lain)
 *   2. 9Router dinyalakan BELAKANGAN → dalam ± 5 detik web langsung bisa dipakai,
 *      TANPA perlu me-restart web-nya
 *
 *   node tools/uji-9router-urutan.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT_APP = 8133;
const PORT_ROUTER = 20129;
const URL_APP = 'http://127.0.0.1:' + PORT_APP + '/';
const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));

const catatan = [];
const tulis = (s) => { console.log(s); catatan.push(s); };
let gagal = 0;
const cek = (nama, benar, ket) => {
  tulis((benar ? '  ✓ ' : '  ✗ ') + nama + (ket ? ' — ' + ket : ''));
  if (!benar) gagal++;
};
const proses = [];
function jalan(nama, berkas, arg = [], env = {}) {
  const p = spawn('node', [berkas, ...arg], { cwd: AKAR, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', (d) => process.env.RIUH ? process.stdout.write('[' + nama + '] ' + d) : null);
  p.stderr.on('data', (d) => process.stdout.write('[' + nama + '!] ' + d));
  proses.push(p);
  return p;
}
const kirim = (prompt) => fetch(URL_APP + 'api/chat', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt, stream: false }),
}).then((r) => r.json()).catch((e) => ({ pesan: 'gagal: ' + String(e.message || e) }));

const berkasSetelan = path.join(AKAR, 'tools', '9router.json');
const setelanLama = fs.existsSync(berkasSetelan) ? fs.readFileSync(berkasSetelan, 'utf8') : null;
fs.writeFileSync(berkasSetelan, JSON.stringify({
  url: 'http://127.0.0.1:' + PORT_ROUTER + '/v1',
  kunci: 'kunci-uji-urutan',
  dicek: 'uji urutan',
}, null, 2) + '\n');

let mock = null;
try {
  tulis('══ uji: urutan "9Router dulu, atau web dulu?" ══');

  /* 1. web dulu — 9Router belum jalan */
  jalan('app', 'tools/server-uji.mjs', [], { PORT: String(PORT_APP), PENYEDIA_BERKAS: '9router' });
  await tunggu(1500);
  const info = await (await fetch(URL_APP + 'api/chat')).json();
  tulis('   status di aplikasi: "' + String(info.pesan).slice(0, 110) + '"');
  cek('dibuka sebelum 9Router jalan → aplikasi jujur belum siap', info.penyedia.lokal === true && info.penyedia.modelDariRouter === false && /belum bisa dihubungi/i.test(String(info.pesan)));

  const pra = await kirim('halo, kamu aktif?');
  tulis('   kirim pesan sebelum router hidup → "' + String(pra.pesan || pra.text).slice(0, 110) + '"');
  cek('pesan sebelum router hidup dijawab jujur (tanpa jawaban palsu)', /Tidak bisa menghubungi 9Router/i.test(String(pra.pesan || '')), String(pra.pesan || pra.text).slice(0, 60));

  /* 2. 9Router dinyalakan belakangan */
  tulis('   …menyalakan 9Router sekarang…');
  mock = jalan('9router', 'tools/mock-9router.mjs', ['--port', String(PORT_ROUTER), '--butuh-kunci', 'kunci-uji-urutan']);

  const t0 = Date.now();
  let siap = false;
  for (let i = 0; i < 12; i++) {           /* beri waktu sampai 12 detik */
    await tunggu(1000);
    const j = await kirim('Sebut satu fakta singkat tentang kopi.');
    if (j && j.ok && String(j.text || '').length > 5) { siap = true; break; }
  }
  const detik = ((Date.now() - t0) / 1000).toFixed(1);
  tulis('   setelah 9Router hidup → web jalan dalam ' + detik + ' detik (tanpa restart)');
  cek('web langsung aktif tanpa di-restart', siap, detik + ' detik');

  const info2 = await (await fetch(URL_APP + 'api/chat')).json();
  tulis('   status terbaru: modelDariRouter=' + info2.penyedia.modelDariRouter + ' · model "' + String(info2.model).slice(0, 40) + '"');
  cek('daftar model ikut terisi otomatis setelah router hidup', info2.penyedia.modelDariRouter === true);
  cek('yang dipakai benar-benar model dari router (bukan nama model penyedia lain)', /^[a-z]+\//i.test(String(info2.model || '')) && !/:free$/.test(String(info2.model || '')), String(info2.model));
  /* 3. tiruan "di Vercel": alamat localhost tidak mungkin dijangkau dari hosting */
  try { mock.kill('SIGTERM'); } catch (e) {}
  await tunggu(900);
  const appVercel = jalan('app-vercel', 'tools/server-uji.mjs', [], { PORT: String(PORT_APP + 2), VERCEL: '1', VERCEL_ENV: 'production', AI_PROVIDER: '9router', PENYEDIA_BERKAS: '9router' });
  await tunggu(1600);
  const vc = await fetch('http://127.0.0.1:' + (PORT_APP + 2) + '/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'halo', stream: false }),
  }).then((r) => r.json()).catch((e) => ({ pesan: 'gagal: ' + String(e.message || e) }));
  tulis('   di Vercel (VERCEL=1) + alamat localhost → "' + String(vc.pesan || '').slice(0, 175) + '"');
  cek('pesan di Vercel menjelaskan localhost tidak bisa dipakai', /tidak bisa dipakai dari hosting \(Vercel\)/i.test(String(vc.pesan || '')));
  cek('pesan menyuruh memakai alamat publik 9Router (tunnel/VPS)', /AI_BASE_URL=https:\/\/|tunnel|VPS/i.test(String(vc.pesan || '')));
  try { appVercel.kill('SIGTERM'); } catch (e) {}
} catch (e) {
  gagal++;
  tulis('GAGAL: ' + e.message);
} finally {
  proses.forEach((p) => { try { p.kill('SIGTERM'); } catch (e) {} });
  if (setelanLama === null) { try { fs.unlinkSync(berkasSetelan); } catch (e) {} }
  else fs.writeFileSync(berkasSetelan, setelanLama);
}

const kepala = 'UJI URUTAN 9ROUTER (web dulu, router belakangan)\n' + new Date().toLocaleString('id-ID') + '\n' + '─'.repeat(58) + '\n';
fs.writeFileSync(path.join(AKAR, 'bukti-uji', 'HASIL-UJI-9ROUTER-URUTAN.txt'), kepala + catatan.join('\n') + '\n\n'
  + (gagal ? 'HASIL: GAGAL — ' + gagal + ' pemeriksaan' : 'HASIL: SEMUA LULUS') + '\n');
console.log(gagal ? '\nHASIL: GAGAL — ' + gagal + ' pemeriksaan' : '\nHASIL: SEMUA LULUS');
process.exit(gagal ? 1 : 0);
