/*
 * /api/cron — penjadwal tugas sisi-server.
 *
 * Supaya tugas benar-benar berjalan saat halaman ditutup, daftar tugas perlu
 * disimpan di luar browser. Endpoint ini memakai penyimpanan KV berbasis REST
 * (Vercel KV / Upstash) dan dijalankan oleh cron hosting:
 *
 *   Environment:  KV_REST_API_URL + KV_REST_API_TOKEN
 *                 (atau UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)
 *                 CRON_SECRET (opsional, pengaman pemanggilan)
 *
 *   GET  /api/cron                    → daftar tugas tersimpan
 *   POST /api/cron {aksi:"simpan"|"hapus"|"jalankan", tugas:{...}}
 *
 * Tanpa KV, endpoint menjawab jujur (501): penjadwal sisi-server tidak bisa
 * dibuat tanpa tempat menyimpan tugas, dan saya tidak akan berpura-pura.
 * Aplikasi tetap menjalankan tugas selama halaman terbuka (lihat /scheduled).
 */
import { siapkan, json, audit, teksMasuk, angkaMasuk } from './_aman.js';

export const config = { runtime: 'edge' };

function kv(env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL || '';
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || '';
  return { url: String(url).replace(/\/+$/, ''), token, siap: !!url && !!token };
}

async function kvAksi(env, perintah) {
  const k = kv(env);
  const r = await fetch(k.url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + k.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(perintah),
  });
  if (!r.ok) throw new Error('KV menolak (' + r.status + ')');
  const d = await r.json();
  return d.result;
}

const KUNCI = 'vcs:tugas';

async function bacaSemua(env) {
  const mentah = await kvAksi(env, ['GET', KUNCI]);
  if (!mentah) return [];
  try { return JSON.parse(mentah); } catch (e) { return []; }
}
async function tulisSemua(env, daftar) {
  await kvAksi(env, ['SET', KUNCI, JSON.stringify(daftar.slice(0, 200))]);
}

export default async function handler(request, env = {}) {
  const s = siapkan(request, env, { nama: 'cron', maks: 30, post: true });
  if (s.jawab) return s.jawab;
  const k = kv(env);

  if (request.headers.get('x-cron-secret') && env.CRON_SECRET && request.headers.get('x-cron-secret') !== env.CRON_SECRET) {
    return json({ ok: false, pesan: 'kunci penjadwal salah' }, 401, s.tambahan);
  }

  if (!k.siap) {
    return json({
      ok: false, butuhKunci: true,
      pesan: 'Penjadwal sisi-server belum aktif: butuh penyimpanan KV (KV_REST_API_URL + KV_REST_API_TOKEN). ' +
             'Selama belum ada, tugas tetap berjalan di browser selama halaman terbuka.',
    }, 501, s.tambahan);
  }

  if (request.method === 'GET') {
    const daftar = await bacaSemua(env);
    return json({ ok: true, jumlah: daftar.length, tugas: daftar, sumber: 'penyimpanan KV' }, 200, s.tambahan);
  }
  if (request.method !== 'POST') return json({ ok: false, pesan: 'metode tidak didukung' }, 405, s.tambahan);

  let badan = {};
  try { badan = await request.json(); } catch (e) { return json({ ok: false, pesan: 'badan permintaan bukan JSON' }, 400, s.tambahan); }
  const aksi = String(badan.aksi || 'simpan');
  const daftar = await bacaSemua(env);

  if (aksi === 'simpan') {
    const t = badan.tugas || {};
    const rapi = {
      id: teksMasuk(t.id, 40) || 't' + Date.now(),
      nama: teksMasuk(t.nama, 80),
      prompt: teksMasuk(t.prompt, 800),
      jadwal: ['sekali', 'harian', 'mingguan'].includes(t.jadwal) ? t.jadwal : 'sekali',
      zona: teksMasuk(t.zona, 40) || 'Asia/Jakarta',
      aktif: t.aktif !== false,
      berikutnya: angkaMasuk(t.berikutnya, 0, 4102444800000, Date.now()),
      terakhir: angkaMasuk(t.terakhir, 0, 4102444800000, 0),
    };
    if (!rapi.nama || !rapi.prompt) return json({ ok: false, pesan: 'nama & prompt wajib' }, 400, s.tambahan);
    const lain = daftar.filter((x) => x.id !== rapi.id);
    lain.unshift(rapi);
    await tulisSemua(env, lain);
    audit('cron-simpan', { id: rapi.id, jadwal: rapi.jadwal });
    return json({ ok: true, tugas: rapi, jumlah: lain.length }, 200, s.tambahan);
  }

  if (aksi === 'hapus') {
    const id = teksMasuk(badan.id, 40);
    const lain = daftar.filter((x) => x.id !== id);
    await tulisSemua(env, lain);
    audit('cron-hapus', { id });
    return json({ ok: true, jumlah: lain.length }, 200, s.tambahan);
  }

  if (aksi === 'jalankan') {
    /* dipanggil oleh cron hosting: cari tugas yang jatuh tempo */
    const kini = Date.now();
    const jatuh = daftar.filter((t) => t.aktif && t.berikutnya && t.berikutnya <= kini);
    jatuh.forEach((t) => {
      t.terakhir = kini;
      t.berikutnya = t.jadwal === 'harian' ? kini + 86400000 : t.jadwal === 'mingguan' ? kini + 604800000 : 0;
      if (t.jadwal === 'sekali') t.aktif = false;
    });
    await tulisSemua(env, daftar);
    audit('cron-jalan', { jumlah: jatuh.length });
    return json({ ok: true, dijalankan: jatuh.map((t) => ({ id: t.id, nama: t.nama, prompt: t.prompt })), jumlah: jatuh.length }, 200, s.tambahan);
  }

  return json({ ok: false, pesan: 'aksi tidak dikenal: ' + aksi }, 400, s.tambahan);
}
