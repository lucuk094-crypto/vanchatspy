/*
 * uji-proxy-caddy.mjs — membuktikan Van Chat.SPY tetap jalan saat 9Router berada
 * DI BELAKANG REVERSE PROXY (bentuk yang dipakai di panduan domain Cloudflare:
 * Cloudflare → router rumah → Caddy → 9Router).
 *
 * Yang diuji dengan Caddy sungguhan:
 *   1. Caddy melayani HTTPS (sertifikat internal) di port 8443 dan meneruskan /v1/* ke 9Router
 *   2. jalur lain (mis. /dashboard) DITOLAK 403 — dashboard tidak terbuka ke internet
 *   3. aplikasi (AI_BASE_URL=https://localhost:8443/v1) bisa membaca daftar model lewat proxy
 *   4. percakapan + aturan bentuk tetap jalan lewat proxy
 *   5. proxy mati → pesan jujur "Tidak bisa menghubungi 9Router di https://…"
 *
 * Butuh: caddy (unduh sekali: https://caddyserver.com/download — linux amd64)
 * Jalankan: node tools/uji-proxy-caddy.mjs [--caddy /path/ke/caddy]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT_APP = 8135;
const PORT_ROUTER = 20132;
const PORT_PROXY = 8443;
const KUNCI = 'kunci-uji-proxy';
const URL_APP = 'http://127.0.0.1:' + PORT_APP + '/';
const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));

const catatan = [];
const tulis = (s) => { console.log(s); catatan.push(s); };
let gagal = 0;
const cek = (nama, benar, ket) => {
  tulis((benar ? '  ✓ ' : '  ✗ ') + nama + (ket ? ' — ' + ket : ''));
  if (!benar) gagal++;
};

function arg(nama, bawaan) {
  const i = process.argv.indexOf('--' + nama);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : bawaan;
}

const kandidatCaddy = [arg('caddy', ''), process.env.CADDY, '/tmp/caddy', '/usr/local/bin/caddy', '/usr/bin/caddy'].filter(Boolean);
const CADDY = kandidatCaddy.find((c) => { try { return fs.existsSync(c) && fs.statSync(c).isFile(); } catch (e) { return false; } });
if (!CADDY) {
  console.log('CADDY tidak ditemukan — unduh dulu:');
  console.log('  curl -sL https://github.com/caddyserver/caddy/releases/latest/download/caddy_linux_amd64 -o /tmp/caddy && chmod +x /tmp/caddy');
  process.exit(3);
}

const proses = [];
/* jalankan berkas .mjs di repo ini; argv[0] = nama berkas relatif terhadap folder proyek */
function jalanNode(nama, argv, env = {}) {
  const p = spawn('node', [path.join(AKAR, argv[0]), ...argv.slice(1)], {
    cwd: AKAR, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const alir = (d) => { if (process.env.RIUH) process.stdout.write('[' + nama + '] ' + d); };
  p.stdout.on('data', alir);
  p.stderr.on('data', alir);
  proses.push(p);
  return p;
}

const DOMAIN = 'router.contoh.com';          /* nama domain contoh (diarahkan ke 127.0.0.1 lewat /etc/hosts) */
const CADDYFILE = '/tmp/Caddyfile.uji';
const AKAR_CADDY = path.join(os.homedir(), '.local/share/caddy');
fs.writeFileSync(CADDYFILE, `{
	admin off
	auto_https disable_redirects
}
https://${DOMAIN}:${PORT_PROXY} {
	tls internal
	@bukanv1 not path /v1/*
	respond @bukanv1 403
	reverse_proxy 127.0.0.1:${PORT_ROUTER}
}
`);

const berkasSetelan = path.join(AKAR, 'tools', '9router.json');
const setelanLama = fs.existsSync(berkasSetelan) ? fs.readFileSync(berkasSetelan, 'utf8') : null;
if (fs.existsSync(berkasSetelan)) fs.unlinkSync(berkasSetelan);

/* probe HTTPS yang memakai CA internal Caddy (seperti browser/klien yang sudah percaya) */
const probeHttps = (jalur, kunci, ca) => new Promise((selesai) => {
  const req = https.request({
    host: DOMAIN, port: PORT_PROXY, path: jalur, method: 'GET',
    ca: fs.readFileSync(ca),
    headers: kunci ? { Authorization: 'Bearer ' + kunci } : {},
  }, (res) => {
    let t = '';
    res.on('data', (d) => { t += d; });
    res.on('end', () => selesai({ status: res.statusCode || 0, t }));
  });
  req.on('error', (e) => selesai({ status: 0, t: String(e.message) }));
  req.setTimeout(8000, () => { req.destroy(new Error('timeout')); });
  req.end();
});

try {
  tulis('══ uji: 9Router di belakang reverse proxy (Caddy) ══');
  tulis('   alamat uji: https://' + DOMAIN + ':' + PORT_PROXY + '/v1  (nama domain diarahkan ke PC ini)');
  /* arahkan nama domain contoh ke komputer ini (meniru DNS Cloudflare yang sudah benar) */
  try {
    execSync('sudo -n sh -c ' + JSON.stringify("grep -q " + DOMAIN + " /etc/hosts || echo '127.0.0.1 " + DOMAIN + "' >> /etc/hosts"), { stdio: 'ignore' });
    tulis('   /etc/hosts: ' + DOMAIN + ' → 127.0.0.1');
  } catch (e) { tulis('   (tanpa sudo: memakai /etc/hosts yang ada)'); }
  tulis('   caddy: ' + CADDY);

  const router = jalanNode('9router', ['tools/mock-9router.mjs', '--port', String(PORT_ROUTER), '--butuh-kunci', KUNCI]);
  await tunggu(1200);

  const caddy = spawn(CADDY, ['run', '--config', CADDYFILE], { stdio: ['ignore', 'pipe', 'pipe'] });
  proses.push(caddy);
  const logCaddy = [];
  caddy.stdout.on('data', (d) => logCaddy.push(String(d)));
  caddy.stderr.on('data', (d) => logCaddy.push(String(d)));
  await tunggu(2500);

  /* sertifikat internal Caddy dipakai aplikasi lewat NODE_EXTRA_CA_CERTS */
  const ca = path.join(AKAR_CADDY, 'pki/authorities/local/root.crt');
  cek('sertifikat internal Caddy tersedia', fs.existsSync(ca), ca);
  if (!fs.existsSync(ca)) throw new Error('root CA Caddy tidak ada — caddy gagal start? ' + logCaddy.join('').slice(-200));

  /* 1 & 2. jalur proxy: /v1 diteruskan, jalur lain ditolak */
  const tanpaKunci = await probeHttps('/v1/models', '', ca);
  tulis('   https://' + DOMAIN + ':' + PORT_PROXY + '/v1/models tanpa kunci → HTTP ' + tanpaKunci.status);
  cek('Caddy meneruskan /v1 ke 9Router (401 = sampai ke router, kunci diwajibkan)', tanpaKunci.status === 401, 'HTTP ' + tanpaKunci.status);

  const dash = await probeHttps('/dashboard', '', ca);
  tulis('   https://' + DOMAIN + ':' + PORT_PROXY + '/dashboard → HTTP ' + dash.status);
  cek('jalur non-/v1 ditolak proxy (dashboard tidak terbuka)', dash.status === 403, 'HTTP ' + dash.status);

  /* 3 & 4. aplikasi memakai proxy sebagai penyedia */
  const app = jalanNode('app', ['tools/server-uji.mjs'], {
    PORT: String(PORT_APP), AI_PROVIDER: '9router', AI_BASE_URL: 'https://' + DOMAIN + ':' + PORT_PROXY + '/v1',
    AI_API_KEY: KUNCI, NODE_EXTRA_CA_CERTS: ca, VERCEL: '1',
  });
  await tunggu(1800);

  let info = await (await fetch(URL_APP + 'api/chat')).json();
  for (let i = 0; i < 12 && !(info.penyedia && info.penyedia.modelDariRouter); i++) {
    await tunggu(1000);
    info = await (await fetch(URL_APP + 'api/chat')).json();
  }
  tulis('   penyedia: ' + JSON.stringify(info.penyedia));
  cek('daftar model terbaca lewat proxy (alamat domain, bukan localhost)', info.penyedia.modelDariRouter === true && info.penyedia.alamat === 'https://' + DOMAIN + ':' + PORT_PROXY + '/v1' && info.penyedia.dasarLokal === false);

  const jawab = await (await fetch(URL_APP + 'api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Balas HANYA dengan tiga kata: apa itu kopi?', stream: false }),
  })).json();
  tulis('   jawaban lewat proxy → "' + String(jawab.text || jawab.pesan).slice(0, 70) + '"');
  cek('percakapan + aturan bentuk jalan lewat proxy', jawab.ok === true && /^kopi adalah minuman\.?$/i.test(String(jawab.text || '').trim()), String(jawab.text || jawab.pesan).slice(0, 50));

  /* 5. proxy mati → pesan jujur */
  try { caddy.kill('SIGTERM'); } catch (e) {}
  await tunggu(1200);
  const mati = await (await fetch(URL_APP + 'api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'halo', stream: false }),
  })).json();
  tulis('   proxy dimatikan → "' + String(mati.pesan || '').slice(0, 120) + '"');
  cek('proxy mati → pesan jujur (bukan jawaban palsu)', /Tidak bisa menghubungi 9Router di https:\/\/router\.contoh\.com/i.test(String(mati.pesan || '')));
} catch (e) {
  gagal++;
  tulis('GAGAL: ' + e.message);
} finally {
  proses.forEach((p) => { try { p.kill('SIGTERM'); } catch (e) {} });
  try { execSync('sudo -n sh -c ' + JSON.stringify("sed -i '/" + DOMAIN + "/d' /etc/hosts"), { stdio: 'ignore' }); } catch (e) {}
  if (setelanLama !== null) fs.writeFileSync(berkasSetelan, setelanLama);
}

const kepala = 'UJI 9ROUTER DI BELAKANG REVERSE PROXY (Caddy sungguhan)\n' + new Date().toLocaleString('id-ID') + '\n' + '─'.repeat(58) + '\n';
fs.writeFileSync(path.join(AKAR, 'bukti-uji', 'HASIL-UJI-PROXY-CADDY.txt'), kepala + catatan.join('\n') + '\n\n'
  + (gagal ? 'HASIL: GAGAL — ' + gagal + ' pemeriksaan' : 'HASIL: SEMUA LULUS') + '\n');
console.log(gagal ? '\nHASIL: GAGAL — ' + gagal + ' pemeriksaan' : '\nHASIL: SEMUA LULUS');
process.exit(gagal ? 1 : 0);
