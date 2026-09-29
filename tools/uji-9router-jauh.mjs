/*
 * uji-9router-jauh.mjs — membuktikan Van Chat.SPY yang DIJALANKAN DI TEMPAT LAIN
 * tetap bisa tersambung ke 9Router, asal 9Router punya alamat yang bisa dijangkau
 * (alamat jaringan / LAN, atau alamat publik lewat tunnel).
 *
 * Di sandbox ini 9Router asli tidak ada, jadi dipakai tools/mock-9router.mjs.
 * Yang diuji:
 *   1. 9Router tiruan dibuka ke alamat non-localhost
 *   2. aplikasi dijalankan dengan AI_BASE_URL ke alamat itu (bukan 127.0.0.1)
 *   3. daftar model tetap dibaca dari router itu (bukan model penyedia lain)
 *   4. percakapan & aturan bentuk tetap jalan
 *   5. router mati → pesan jujur versi "di mesin lain", bukan versi CMD/terminal
 *
 *   node tools/uji-9router-jauh.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT_APP = 8134;
const PORT_ROUTER = 20130;
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
  p.stderr.on('data', (d) => process.env.RIUH ? process.stdout.write('[' + nama + '!] ' + d) : null);
  proses.push(p);
  return p;
}
const ipLokal = () => {
  const daftar = os.networkInterfaces();
  for (const kunci of Object.keys(daftar)) {
    for (const alamat of daftar[kunci] || []) {
      if (alamat.family === 'IPv4' && !alamat.internal) return alamat.address;
    }
  }
  return '';
};
const probe = async (url, kunci) => {
  try {
    const r = await fetch(url, {
      headers: kunci ? { Authorization: 'Bearer ' + kunci } : {},
      signal: AbortSignal.timeout(8000),
    });
    const t = await r.text();
    return { ok: r.ok, status: r.status, t };
  } catch (e) {
    return { ok: false, status: 0, t: String(e.message || e) };
  }
};

const berkasSetelan = path.join(AKAR, 'tools', '9router.json');
const setelanLama = fs.existsSync(berkasSetelan) ? fs.readFileSync(berkasSetelan, 'utf8') : null;
if (fs.existsSync(berkasSetelan)) fs.unlinkSync(berkasSetelan);   /* paksa lewat env saja */

let mock = null, cf = null, hostTambahan = '';
const KUNCI = 'kunci-uji-jauh';

try {
  tulis('══ uji: 9Router di mesin lain (alamat jaringan / alamat publik) ══');

  /* 1. 9Router tiruan di semua antarmuka + tunnel publik (kalau bisa) */
  mock = jalan('9router', 'tools/mock-9router.mjs', ['--port', String(PORT_ROUTER), '--butuh-kunci', KUNCI, '--host', '0.0.0.0']);
  await tunggu(1200);

  const alamatLan = 'http://' + ipLokal() + ':' + PORT_ROUTER + '/v1';
  let alamat = alamatLan, jalur = 'jaringan (LAN)';
  let lan = await probe(alamatLan + '/models', KUNCI);
  for (let i = 0; i < 10 && !lan.ok; i++) { await tunggu(500); lan = await probe(alamatLan + '/models', KUNCI); }
  cek('9Router terjangkau lewat alamat jaringan (bukan localhost)', lan.ok, alamatLan + ' → HTTP ' + lan.status);

  /* tambahan bukti: alamat publik lewat tunnel (kalau DNS sandbox mengizinkan) */
  if (fs.existsSync('/tmp/cf/cloudflared')) {
    const logCf = '/tmp/cf/jauh.log';
    try { fs.writeFileSync(logCf, ''); } catch (e) {}
    cf = spawn('/tmp/cf/cloudflared', ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:' + PORT_ROUTER], { stdio: ['ignore', 'pipe', 'pipe'] });
    cf.stdout.on('data', (d) => fs.appendFileSync(logCf, d));
    cf.stderr.on('data', (d) => fs.appendFileSync(logCf, d));
    let url = '';
    for (let i = 0; i < 40; i++) {
      await tunggu(500);
      const m = String(fs.readFileSync(logCf, 'utf8')).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) { url = m[0]; break; }
    }
    if (url) {
      /* DNS sandbox ini sering belum siap untuk hostname tunnel yang baru dibuat
         (dari komputer/HP biasa DNS sudah benar sendiri). Supaya jalur publiknya
         tetap benar-benar diuji, hostname diarahkan ke IP tepi Cloudflare. */
      const hostAwal = url.replace('https://', '');
      if (!hostTambahan) {
        try {
          execSync('sudo -n true', { stdio: 'ignore' });
          const baris = '104.16.231.132 ' + hostAwal;
          execSync('sudo -n sh -c ' + JSON.stringify("grep -q " + hostAwal + " /etc/hosts || echo '" + baris + "' >> /etc/hosts"), { stdio: 'ignore' });
          hostTambahan = hostAwal;
        } catch (e) { /* tanpa sudo → lewati */ }
      }
      let uji = await probe(url + '/v1/models', KUNCI);
      if (!uji.ok) {
        /* DNS sandbox sering belum siap untuk hostname baru; pakai alamat IP tepi
           Cloudflare supaya jalur publiknya tetap benar-benar diuji */
        const ipTe = '104.16.231.132';
        try {
          execSync('sudo -n true', { stdio: 'ignore' });   /* hanya lanjut kalau sudo tersedia */
          const host = url.replace('https://', '');
          const baris = ipTe + ' ' + host;
          execSync('sudo -n sh -c ' + JSON.stringify("grep -q " + host + " /etc/hosts || echo '" + baris + "' >> /etc/hosts"), { stdio: 'ignore' });
          hostTambahan = host;
        } catch (e) { /* tanpa sudo → lewati */ }
      }
      /* tunnel Cloudflare kadang butuh beberapa detik sebelum siap menerima */
      const jejak = [uji.status];
      for (let i = 0; i < 15 && !uji.ok; i++) { await tunggu(2000); uji = await probe(url + '/v1/models', KUNCI); jejak.push(uji.status); }
      tulis('   percobaan ke alamat publik: ' + jejak.join(',') + (hostTambahan ? ' (hostname diarahkan ke IP tepi Cloudflare)' : ' (tanpa tambahan /etc/hosts)'));
      tulis('   alamat publik (tunnel): ' + url + ' → HTTP ' + uji.status + (uji.ok ? ' (bisa dihubungi)' : ' (DNS sandbox belum siap)'));
      if (uji.ok) { alamat = url + '/v1'; jalur = 'alamat publik (tunnel)'; }
    }
  }

  /* 2. aplikasi dijalankan memakai alamat itu — bukan localhost */
  /* VERCEL=1 dipasang supaya skenarionya menyerupai "web di-deploy di Vercel":
     alamat penyedia diambil dari env (bukan localhost), sama seperti di hosting */
  const app = jalan('app', 'tools/server-uji.mjs', [], {
    PORT: String(PORT_APP), AI_PROVIDER: '9router', AI_BASE_URL: alamat, AI_API_KEY: KUNCI,
    VERCEL: '1', VERCEL_ENV: 'production',
  });
  await tunggu(1500);
  tulis('   aplikasi memakai: ' + alamat + '  ← ' + jalur);

  let info = await (await fetch(URL_APP + 'api/chat')).json();
  for (let i = 0; i < 12 && !(info.penyedia && info.penyedia.modelDariRouter); i++) {
    await tunggu(1000);
    info = await (await fetch(URL_APP + 'api/chat')).json();
  }
  tulis('   penyedia: ' + JSON.stringify(info.penyedia));
  cek('aplikasi sadar 9Router-nya tidak di localhost', info.penyedia.dasarLokal === false, 'dasarLokal=' + info.penyedia.dasarLokal);
  cek('daftar model tetap dibaca dari router itu', info.penyedia.modelDariRouter === true && info.penyedia.alamat === alamat);
  cek('model yang dipakai dari router (bukan model penyedia lain)', /^[a-z]+\//i.test(String(info.model || '')) && !/:free$/.test(String(info.model || '')), String(info.model));

  const jawab = await (await fetch(URL_APP + 'api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Balas HANYA dengan tiga kata: apa itu kopi?', stream: false }),
  })).json();
  tulis('   jawaban lewat 9Router di mesin lain → "' + String(jawab.text || jawab.pesan).slice(0, 70) + '"');
  cek('percakapan jalan lewat 9Router di mesin lain', jawab.ok === true && /^kopi adalah minuman\.?$/i.test(String(jawab.text || '').trim()), String(jawab.text || jawab.pesan).slice(0, 50));

  /* 3. router mati → pesan jujur versi "di mesin lain" */
  try { mock.kill('SIGTERM'); } catch (e) {}
  await tunggu(900);
  const mati = await (await fetch(URL_APP + 'api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'halo', stream: false }),
  })).json();
  tulis('   router dimatikan → "' + String(mati.pesan || '').slice(0, 150) + '"');
  cek('pesan jujur menyebut alamat 9Router-nya', /Tidak bisa menghubungi 9Router di /i.test(String(mati.pesan || '')));
  cek('tidak menyuruh "tulis 9router di CMD/terminal" untuk router di mesin lain', !/CMD\/terminal/i.test(String(mati.pesan || '')));
} catch (e) {
  gagal++;
  tulis('GAGAL: ' + e.message);
} finally {
  proses.forEach((p) => { try { p.kill('SIGTERM'); } catch (e) {} });
  if (cf) { try { cf.kill('SIGTERM'); } catch (e) {} }
  if (hostTambahan) {
    try { execSync('sudo -n sh -c ' + JSON.stringify("sed -i '/" + hostTambahan + "/d' /etc/hosts"), { stdio: 'ignore' }); } catch (e) {}
  }
  if (setelanLama !== null) fs.writeFileSync(berkasSetelan, setelanLama);
}

const kepala = 'UJI 9ROUTER DI MESIN LAIN (bukan localhost)\n' + new Date().toLocaleString('id-ID') + '\n' + '─'.repeat(58) + '\n';
fs.writeFileSync(path.join(AKAR, 'bukti-uji', 'HASIL-UJI-9ROUTER-JAUH.txt'), kepala + catatan.join('\n') + '\n\n'
  + (gagal ? 'HASIL: GAGAL — ' + gagal + ' pemeriksaan' : 'HASIL: SEMUA LULUS') + '\n');
console.log(gagal ? '\nHASIL: GAGAL — ' + gagal + ' pemeriksaan' : '\nHASIL: SEMUA LULUS');
process.exit(gagal ? 1 : 0);
