/*
 * /api/providers — memberi tahu aplikasi penyedia AI mana yang aktif.
 * Hanya status & nama penyedia yang dikirim; kunci asli TIDAK pernah ke browser.
 */
import { siapkan, json, pengamatanRate, BATAS_MAKS } from './_aman.js';
import {
  daftarProvider as daftarAI, penyediaTeks, envPermintaan, envDenganSetelan,
  daftarModelGemini, panggilGemini,
} from './_ai.js';

export const config = { runtime: 'edge' };

/* Samarkan supaya halaman Pengaturan bisa menunjukkan "kunci ini yang dipakai"
   tanpa pernah mengirim kuncinya kembali. */
const samar = (k) => (k ? String(k).slice(0, 5) + '…' + String(k).slice(-3) : '');

function ambil(j, jalur) {
  let v = j;
  for (const k of String(jalur).split('.')) { if (v == null) return undefined; v = v[k]; }
  return v;
}

/* Satu percakapan kecil ke penyedia — membuktikan kunci & model benar-benar jalan. */
async function ujiKecil(env, model) {
  const p = penyediaTeks(env);
  const pesan = [{ role: 'user', content: 'Balas tepat satu kata: SIAP' }];
  if (p.gaya === 'gemini') {
    const r = await panggilGemini({ dasar: p.dasar, model, kunci: p.kunci, pesan, stream: false, signal: AbortSignal.timeout(30000) });
    const d = await r.json();
    const teks = d && d.choices && d.choices[0] && d.choices[0].message ? String(d.choices[0].message.content || '') : '';
    if (!r.ok || !teks) throw Object.assign(new Error(ambil(d, 'error.message') || ('HTTP ' + r.status)), { status: r.status });
    return teks;
  }
  const r = await fetch(p.dasar + '/chat/completions', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, p.kunci ? { Authorization: 'Bearer ' + p.kunci } : {}),
    body: JSON.stringify({ model, messages: pesan, max_tokens: 20, stream: false }),
    signal: AbortSignal.timeout(40000),
  });
  const d = await r.json().catch(() => null);
  const teks = d && d.choices && d.choices[0] && d.choices[0].message ? String(d.choices[0].message.content || '') : '';
  if (!r.ok || !teks) {
    const g = (d && d.error && (d.error.message || d.error)) || ('HTTP ' + r.status);
    throw Object.assign(new Error(String(g).slice(0, 200)), { status: r.status });
  }
  return teks;
}

/* POST /api/providers — dipakai tombol "Uji & Aktifkan" di halaman Pengaturan.
   Kunci yang dikirim hanya dipakai selama pengujian ini: tidak disimpan, tidak
   ditulis ke log, dan jawabannya tidak memuat kunci (hanya versi tersamar). */
async function ujiSetelan(request, env, s) {
  let badan = {};
  try { badan = await request.json(); } catch { return json({ ok: false, pesan: 'badan permintaan bukan JSON' }, 400, s.tambahan); }
  const t = (v, n) => String(v == null ? '' : v).slice(0, n).trim();
  const setelan = {
    provider: t(badan.provider, 40), base: t(badan.base, 300), kunci: t(badan.kunci, 300), gaya: t(badan.gaya, 20),
    model: {}, gambar: {},
  };
  if (!setelan.provider && !setelan.base) return json({ ok: false, pesan: 'Pilih penyedia dan isi alamatnya dulu.' }, 400, s.tambahan);
  const envUji = envDenganSetelan(env, setelan);
  const p = penyediaTeks(envUji);
  const mulai = Date.now();
  const hasil = {
    ok: false, provider: p.nama, label: p.label, alamat: p.dasar, protokol: p.gaya,
    adaKunci: !!p.kunci, kunciTersamar: samar(setelan.kunci || p.kunci), model: [],
    kemampuan: { lihatGambar: p.visi !== false, streaming: p.stream !== false, gratis: !!p.gratis },
    catatanPenyedia: p.catatanPenyedia || '',
  };
  try {
    if (p.gaya === 'gemini') {
      hasil.model = await daftarModelGemini({ dasar: p.dasar, kunci: p.kunci, signal: AbortSignal.timeout(20000) });
    } else {
      const r = await fetch(p.dasar + '/models', {
        headers: p.kunci ? { Authorization: 'Bearer ' + p.kunci } : {},
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { status: r.status });
      const j = await r.json();
      hasil.model = (j.data || j.models || []).map((m) => String((m && (m.id || m.name)) || '').trim()).filter(Boolean).slice(0, 400);
    }
    hasil.modelSiap = hasil.model.length > 0;
  } catch (e) {
    hasil.modelSiap = false;
    hasil.modelGalat = String((e && e.message) || e).slice(0, 200);
  }
  /* uji percakapan (bisa dimatikan dengan uji:false supaya kuota gratis tidak habis) */
  if (badan.uji !== false && hasil.modelSiap) {
    /* model uji: utamakan model yang memang dipakai fitur ini, lalu model
       gratis, baru model pertama daftar — supaya akun tanpa saldo tetap
       teruji dengan benar (mis. Apinex: claude-* butuh top-up, free/* tidak) */
    const petaUji = (p.petaModel && p.petaModel.fast) || [];
    const pilihanUji = [].concat(petaUji, hasil.model.filter((m) => /^free\//.test(m)), hasil.model).filter(Boolean);
    const daftarUji = (t(badan.contoh, 120) ? [t(badan.contoh, 120)] : pilihanUji).slice(0, 3);
    const t0 = Date.now();
    let pesanTerakhir = "";
    for (const contoh of daftarUji) {
      if (!contoh) continue;
      try {
        const jawab = await ujiKecil(envUji, contoh);
        hasil.uji = { ok: true, model: contoh, ms: Date.now() - t0, jawaban: String(jawab).slice(0, 120) };
        break;
      } catch (e) {
        pesanTerakhir = String((e && e.message) || e).slice(0, 200);
        hasil.uji = { ok: false, model: contoh, ms: Date.now() - t0, pesan: pesanTerakhir };
      }
    }
    if (hasil.uji && hasil.uji.ok === false && hasil.model.length > daftarUji.length) {
      hasil.uji.pesan = pesanTerakhir + ' (sudah dicoba: ' + daftarUji.join(', ') + ')';
    }
  }
  hasil.ms = Date.now() - mulai;
  hasil.ok = !!(hasil.modelSiap && (!hasil.uji || hasil.uji.ok));
  hasil.pesan = hasil.ok
    ? 'Siap dipakai — ' + hasil.model.length + ' model terbaca' + (hasil.uji ? ' dan percakapan uji berhasil' : '') + '.'
    : (hasil.modelGalat || (hasil.uji && hasil.uji.pesan) || 'penyedia belum bisa dipakai');
  return json(hasil, 200, s.tambahan);
}

export default async function handler(request, env = {}) {
  const s = siapkan(request, env, { nama: 'providers', maks: 120, post: true });
  if (s.jawab) return s.jawab;
  /* penyedia aktif = env hosting + setelan dari halaman Pengaturan */
  if (request.method === 'POST') return ujiSetelan(request, env, s);
  if (request.method !== 'GET') return json({ ok: false, pesan: 'Gunakan GET atau POST' }, 405, s.tambahan);
  const p = daftarAI(envPermintaan(request, env));
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
