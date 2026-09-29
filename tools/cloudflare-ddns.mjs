/*
 * cloudflare-ddns.mjs — menjaga record DNS (A) di Cloudflare tetap menunjuk
 * ke IP publik rumahmu yang berubah-ubah (DDNS), tanpa tunnel.
 *
 * Dipakai untuk rencana: 9Router di PC → domain Cloudflare (proxied) → web di Vercel.
 *
 * Pakai:
 *   node tools/cloudflare-ddns.mjs --domain router.contoh.com --token CF_API_TOKEN
 *   node tools/cloudflare-ddns.mjs --domain router.contoh.com --loop 300
 *   node tools/cloudflare-ddns.mjs --domain router.contoh.com --dry-run
 *
 * Setelan bisa disimpan sekali di tools/cloudflare.json:
 *   { "domain": "router.contoh.com", "token": "…", "proxied": true }
 *
 * Token API (buat di dash.cloudflare.com → My Profile → API Tokens):
 *   template "Edit zone DNS" → Zone Resources: satu zone (domainmu) → Create.
 *   Jangan pakai Global API Key.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BERKAS = path.join(AKAR, 'tools', 'cloudflare.json');

function arg(nama, bawaan) {
  const i = process.argv.indexOf('--' + nama);
  if (i < 0) return bawaan;
  const nilai = process.argv[i + 1];
  return nilai && !nilai.startsWith('--') ? nilai : true;
}
const adaFlag = (nama) => process.argv.indexOf('--' + nama) >= 0;

let setelan = {};
try { if (fs.existsSync(BERKAS)) setelan = JSON.parse(fs.readFileSync(BERKAS, 'utf8')); } catch (e) { setelan = {}; }

const DOMAIN = String(arg('domain', setelan.domain || process.env.CF_DOMAIN || '')).trim().toLowerCase();
const TOKEN = String(arg('token', setelan.token || process.env.CF_API_TOKEN || '')).trim();
const API = String(arg('api', process.env.CF_API || 'https://api.cloudflare.com/client/v4')).replace(/\/+$/, '');
const PROXIED = arg('proxied', setelan.proxied === undefined ? true : setelan.proxied) !== false && String(arg('proxied', setelan.proxied ?? true)) !== 'false';
const TTL = Number(arg('ttl', 1));                       /* 1 = otomatis */
const LOOP = Number(adaFlag('loop') ? (arg('loop', 300) || 300) : 0);
const KERING = adaFlag('dry-run');
const IP_PAKSA = String(arg('ip', '')).trim();

const jam = () => new Date().toLocaleTimeString('id-ID');

async function ipPublik() {
  if (IP_PAKSA) return IP_PAKSA;
  for (const sumber of ['https://api.ipify.org', 'https://www.cloudflare.com/cdn-cgi/trace']) {
    try {
      const r = await fetch(sumber, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const t = await r.text();
      const m = sumber.includes('trace') ? t.match(/^ip=(.+)$/m) : [null, t.trim()];
      if (m && m[1]) return String(m[1]).trim();
    } catch (e) { /* coba sumber berikutnya */ }
  }
  throw new Error('tidak bisa membaca IP publik (cek koneksi internet)');
}

async function cf(jalur, opsi = {}) {
  const r = await fetch(API + jalur, {
    ...opsi,
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(opsi.headers || {}) },
    signal: AbortSignal.timeout(15000),
  });
  let j = null;
  try { j = await r.json(); } catch (e) { /* bukan JSON */ }
  if (!r.ok || (j && j.success === false)) {
    const pesan = (j && j.errors && j.errors[0] && j.errors[0].message) || ('HTTP ' + r.status);
    throw new Error('Cloudflare API: ' + pesan);
  }
  return j;
}

/* cari zone: coba domain apa adanya lalu potong dari depan (a.b.co.id → b.co.id → co.id) */
async function cariZone(domain) {
  const bagian = domain.split('.');
  for (let i = 0; i < bagian.length - 1; i++) {
    const calon = bagian.slice(i).join('.');
    const j = await cf('/zones?name=' + encodeURIComponent(calon) + '&status=active&per_page=1');
    if (j.result && j.result.length) return { id: j.result[0].id, nama: j.result[0].name };
  }
  throw new Error('zone untuk "' + domain + '" tidak ditemukan di akun Cloudflare ini');
}

async function sekali() {
  const ip = await ipPublik();
  const zone = await cariZone(DOMAIN);
  const j = await cf('/zones/' + zone.id + '/dns_records?type=A&name=' + encodeURIComponent(DOMAIN));
  const rekod = (j.result || [])[0];
  const inginProxied = PROXIED === true || String(PROXIED) === 'true';

  if (!rekod) {
    console.log('  ' + jam() + '  zone ' + zone.nama + ' · record A ' + DOMAIN + ' belum ada → dibuat → ' + ip + (inginProxied ? ' (proxied)' : ' (DNS only)'));
    if (KERING) return { aksi: 'buat (dry-run)' };
    await cf('/zones/' + zone.id + '/dns_records', {
      method: 'POST',
      body: JSON.stringify({ type: 'A', name: DOMAIN, content: ip, ttl: TTL, proxied: inginProxied }),
    });
    return { aksi: 'dibuat', ip };
  }

  if (rekod.content === ip) {
    console.log('  ' + jam() + '  zone ' + zone.nama + ' · ' + DOMAIN + ' sudah menunjuk ' + ip + ' — tidak ada yang perlu diubah');
    return { aksi: 'tetap', ip };
  }

  console.log('  ' + jam() + '  IP berubah: ' + rekod.content + ' → ' + ip + ' — memperbarui record A ' + DOMAIN);
  if (KERING) return { aksi: 'perbarui (dry-run)', ip };
  await cf('/zones/' + zone.id + '/dns_records/' + rekod.id, {
    method: 'PATCH',
    body: JSON.stringify({ content: ip, ttl: TTL, proxied: inginProxied }),
  });
  return { aksi: 'diperbarui', ip };
}

if (!DOMAIN) {
  console.error('Butuh --domain, mis.  node tools/cloudflare-ddns.mjs --domain router.contoh.com --token XXX');
  process.exit(2);
}
if (!TOKEN) {
  console.error('Butuh token Cloudflare (--token atau CF_API_TOKEN, boleh disimpan di tools/cloudflare.json).');
  process.exit(2);
}
if (KERING) console.log('  (mode --dry-run: hanya menampilkan rencana, tidak mengubah apa pun)');

try {
  if (!LOOP) {
    const hasil = await sekali();
    console.log('  selesai: ' + hasil.aksi);
  } else {
    console.log('  memantau IP publik setiap ' + LOOP + ' detik (Ctrl+C untuk berhenti)…');
    let terakhirGagal = 0;
    for (;;) {
      try { await sekali(); terakhirGagal = 0; }
      catch (e) {
        terakhirGagal++;
        console.error('  ' + jam() + '  gagal: ' + e.message + (terakhirGagal >= 3 ? '  (cek token & nama domain)' : ''));
      }
      await new Promise((r) => setTimeout(r, Math.max(30, LOOP) * 1000));
    }
  }
} catch (e) {
  console.error('  gagal: ' + e.message);
  process.exit(1);
}
