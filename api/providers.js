/*
 * /api/providers — memberi tahu aplikasi penyedia AI mana yang aktif.
 * Hanya status & nama penyedia yang dikirim; kunci asli TIDAK pernah ke browser.
 */
import { siapkan, json, pengamatanRate, BATAS_MAKS } from './_aman.js';
import { daftarProvider as daftarAI } from './_ai.js';

export const config = { runtime: 'edge' };

export default async function handler(request, env = {}) {
  const s = siapkan(request, env, { nama: 'providers', maks: 120 });
  if (s.jawab) return s.jawab;
  const p = daftarAI(env);
  return json({
    ok: true,
    ...p,
    keamanan: {
      /* apa saja yang dijaga di sisi server — dibaca apa adanya oleh halaman Setelan & Admin */
      batasPermintaan: { jendelaDetik: 60, umum: 60, pencarian: 30, gambar: 20, deploy: 10, penjadwal: 30 },
      batasUkuran: BATAS_MAKS,
      izinAsal: (env.ALLOWED_ORIGINS ? String(env.ALLOWED_ORIGINS).split(',').map(function (s) { return s.trim(); }).filter(Boolean) : ['sama-asal saja']),
      kunciDiServer: true,
      validasi: ['badan JSON diperiksa', 'tipe & ukuran berkas dibatasi', 'kode pratinjau jalan di iframe terisolasi'],
      catatan: 'Kunci hanya dibaca di server; browser cuma menerima status yang disamarkan.',
    },
    rateLimit: { jendelaDetik: 60, batasUmum: 60, batasPencarian: 30, batasGambar: 20, terpakai: pengamatanRate() },
  }, 200, s.tambahan);
}
