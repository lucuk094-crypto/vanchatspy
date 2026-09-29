/*
 * cek-domain-9router.mjs — memeriksa apakah 9Router sudah benar-benar bisa dihubungi
 * lewat DOMAIN sendiri (Cloudflare proxied + port forward, tanpa tunnel) sebelum
 * alamatnya dipasang di Vercel.
 *
 * Pakai:
 *   node tools/cek-domain-9router.mjs --domain router.contoh.com --port 8443 --key KUNCI
 *   node tools/cek-domain-9router.mjs --domain router.contoh.com --wan 100.64.1.5   (cek indikasi CGNAT)
 *
 * Yang diperiksa:
 *   1. domain menunjuk ke IP Cloudflare (proxy aktif) — bukan IP publik rumah terbuka
 *   2. IP publik terlihat dari internet vs IP WAN di router → indikasi CGNAT/double NAT
 *   3. https://domain[:port]/v1/models tanpa kunci → harus 401/403 (kunci memang wajib)
 *   4. dengan kunci → harus 200 + daftar model dari 9Router
 *   5. ringkasan langkah berikutnya (nilai env untuk Vercel)
 */
import dns from 'node:dns/promises';

function arg(nama, bawaan) {
  const i = process.argv.indexOf('--' + nama);
  if (i < 0) return bawaan;
  const nilai = process.argv[i + 1];
  return nilai && !nilai.startsWith('--') ? nilai : true;
}

const DOMAIN = String(arg('domain', '')).trim();
const PORT = String(arg('port', arg('porta', ''))).trim();
const KUNCI = String(arg('key', process.env.AI_API_KEY || '')).trim();
const WAN = String(arg('wan', '')).trim();
const PUBLIK_PAKSA = String(arg('publik', '')).trim();
const JALUR = String(arg('path', '/v1')).replace(/\/+$/, '');
const IP_LITERAL = /^\d{1,3}(\.\d{1,3}){3}$/.test(DOMAIN) || DOMAIN.includes(':');

if (!DOMAIN) {
  console.error('Butuh --domain, mis.  node tools/cek-domain-9router.mjs --domain router.contoh.com --port 8443 --key KUNCI');
  process.exit(2);
}

const catatan = [];
const tulis = (s = '') => { console.log(s); catatan.push(s); };
let gagal = 0;
const cek = (nama, benar, ket) => {
  tulis((benar ? '  ✓ ' : '  ✗ ') + nama + (ket ? ' — ' + ket : ''));
  if (!benar) gagal++;
};

const CF_RENTANG = [/^104\.1[6-9]\./, /^104\.2[0-7]\./, /^172\.6[4-9]\./, /^172\.7[01]\./, /^188\.114\./, /^162\.15[89]\./, /^173\.245\./, /^103\.2[1-9]\./, /^141\.101\./];
const PRIVAT = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];
/* alamat IP lokal (untuk uji di komputer sendiri) otomatis pakai http://,
   domain biasa pakai https://. Bisa dipaksa dengan --skema http|https */
const SKEMA = String(arg('skema', IP_LITERAL ? 'http' : 'https')).toLowerCase() === 'http' ? 'http' : 'https';
const alamatBase = SKEMA + '://' + DOMAIN + (PORT ? ':' + PORT : '') + JALUR;

async function ambil(url, kunci, metode = 'GET') {
  try {
    const r = await fetch(url, {
      method: metode,
      headers: kunci ? { Authorization: 'Bearer ' + kunci, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    const t = await r.text();
    return { ok: r.ok, status: r.status, t, server: r.headers.get('server') || '' };
  } catch (e) {
    return { ok: false, status: 0, t: String(e.message || e), server: '' };
  }
}

tulis('══ memeriksa alamat publik 9Router (tanpa tunnel) ══');
tulis('   alamat diuji: ' + alamatBase + '/models');
tulis('');

/* 1. DNS */
try {
  const ip = IP_LITERAL ? DOMAIN : (await dns.resolve4(DOMAIN))[0];
  const cf = CF_RENTANG.some((rx) => rx.test(ip));
  tulis('1) DNS  : ' + DOMAIN + ' → ' + ip + (cf ? '  (IP Cloudflare — proxy ON ✓)' : '  (bukan IP Cloudflare)'));
  if (!IP_LITERAL) {
    cek('domain menunjuk ke Cloudflare (proxy aktif)', cf, ip);
    cek('IP rumah sendiri tidak terbuka langsung', !PRIVAT.some((rx) => rx.test(ip)), ip);
  }
} catch (e) {
  cek('domain bisa di-resolve', false, String(e.message || e));
}

/* 2. IP publik vs WAN (indikasi CGNAT / double NAT) */
let publik = PUBLIK_PAKSA;
if (!publik) {
  try {
    const r = await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(8000) });
    if (r.ok) publik = (await r.text()).trim();
  } catch (e) { /* offline */ }
}
if (publik) {
  tulis('2) IP publik (terlihat dari internet): ' + publik);
  if (WAN) {
    const sama = WAN === publik;
    tulis('   IP WAN di router: ' + WAN + (sama ? '  → sama ✓' : '  → BEDA'));
    if (!sama) {
      cek('IP WAN router = IP publik (tidak di belakang CGNAT)', false,
        PRIVAT.some((rx) => rx.test(WAN))
          ? 'IP WAN di rentang privat/CGNAT → port forward TIDAK akan jalan'
          : 'beda → kemungkinan CGNAT/double NAT; port forward kemungkinan gagal');
    } else cek('IP WAN router = IP publik (siap port forward)', true, publik);
  } else {
    tulis('   (isi --wan <IP di halaman admin router> untuk memastikan tidak kena CGNAT)');
  }
} else {
  tulis('2) IP publik: tidak bisa dibaca (offline?)');
}

/* 3 & 4. jangkauan endpoint */
const tanpaKunci = await ambil(alamatBase + '/models');
tulis('');
tulis('3) tanpa kunci → HTTP ' + tanpaKunci.status + (tanpaKunci.server ? ' · server: ' + tanpaKunci.server : ''));
if (tanpaKunci.status === 0) {
  cek('alamat bisa dijangkau dari internet', false, String(tanpaKunci.t).slice(0, 120));
} else {
  cek('alamat bisa dijangkau', true, 'HTTP ' + tanpaKunci.status);
  cek('kunci memang diwajibkan (401/403)', tanpaKunci.status === 401 || tanpaKunci.status === 403,
    tanpaKunci.status === 200 ? 'tanpa kunci pun bisa diakses — WAJIB set REQUIRE_API_KEY=true di 9Router!' : 'HTTP ' + tanpaKunci.status);
}

if (KUNCI) {
  const pakaiKunci = await ambil(alamatBase + '/models', KUNCI);
  let jumlah = 0, contoh = [];
  try {
    const j = JSON.parse(pakaiKunci.t);
    const daftar = j.data || j.models || [];
    jumlah = daftar.length;
    contoh = daftar.slice(0, 5).map((m) => m.id || m.name);
  } catch (e) { /* bukan JSON */ }
  tulis('4) dengan kunci  → HTTP ' + pakaiKunci.status + ' · ' + jumlah + ' model');
  if (contoh.length) tulis('   contoh model: ' + contoh.join(', '));
  cek('dengan kunci → 200 + daftar model', pakaiKunci.ok && jumlah > 0, 'HTTP ' + pakaiKunci.status);
} else {
  tulis('4) dengan kunci  → dilewati (tidak ada --key)');
}

tulis('');
tulis('LANGKAH BERIKUTNYA — tempel di Vercel → Settings → Environment Variables, lalu Redeploy:');
tulis('  AI_PROVIDER = 9router');
tulis('  AI_BASE_URL = ' + alamatBase);
tulis('  AI_API_KEY  = ' + (KUNCI ? '(kunci yang kamu pakai di atas)' : '<kunci dari dashboard 9Router>'));
if (PORT && PORT !== '443') {
  tulis('');
  tulis('Catatan: port ' + PORT + ' harus port yang didukung proxy Cloudflare (443, 2053, 2083, 2087, 2096, 8443).');
  tulis('Mau tanpa ":port" di URL? Pakai Origin Rules di Cloudflare: hostname ' + DOMAIN + ' → Destination Port ' + PORT + '.');
}

const judul = 'HASIL CEK ALAMAT PUBLIK 9ROUTER\n' + new Date().toLocaleString('id-ID') + '\n' + '─'.repeat(58) + '\n';
try {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const akar = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  fs.writeFileSync(path.join(akar, 'bukti-uji', 'HASIL-CEK-DOMAIN.txt'), judul + catatan.join('\n') + '\n\n'
    + (gagal ? 'HASIL: ADA ' + gagal + ' MASALAH' : 'HASIL: SEMUA BAIK') + '\n');
} catch (e) { /* abaikan */ }

console.log(gagal ? '\nHASIL: ADA ' + gagal + ' MASALAH — lihat baris ✗ di atas' : '\nHASIL: SEMUA BAIK');
process.exit(gagal ? 1 : 0);
