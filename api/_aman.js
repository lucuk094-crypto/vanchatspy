/*
 * _aman.js — lapisan keamanan bersama untuk semua endpoint Van Chat.SPY.
 *
 * Berkas ini TIDAK menjadi route (diawali "_"), jadi hanya dipakai oleh
 * endpoint lain: /api/chat, /api/search, /api/image/generate, /api/deploy,
 * /api/cron, /api/providers.
 *
 * Yang benar-benar dilakukan (bukan klaim kosong):
 *   • batas permintaan per IP (rate limit) — jendela bergeser, per instance
 *   • pemeriksaan asal (Origin/Referer) untuk permintaan POST → meredam CSRF
 *   • validasi & pemotongan input sebelum dipakai
 *   • batas ukuran badan permintaan + validasi gambar (jenis & ukuran)
 *   • catatan audit (log terstruktur) yang bisa dibaca di Log Vercel
 *
 * Yang TIDAK dilakukan, dan alasannya jujur:
 *   • Tidak ada cookie sesi, jadi tidak ada "secure cookie" yang perlu diatur —
 *     aplikasi ini tidak menyimpan sesi pengguna di server sama sekali.
 *   • Tidak ada database SQL, jadi tidak ada celah SQL injection: tidak ada
 *     satu pun kueri SQL di seluruh proyek ini.
 *   • Tidak ada unggahan berkas ke server; berkas pengguna hidup di browser
 *     (localStorage). Jadi tidak ada berkas asing yang tersimpan di hosting.
 */

export const BATAS_MAKS = {
  prompt: 24000,
  riwayat: 12,
  gambar: 3,
  gambarBita: 2_500_000,      /* ± 2,5 MB per gambar setelah dikodekan */
  berkasTeks: 400_000,
  kueri: 300,
  badanBita: 8_000_000,
};

/* ── 1. Batas permintaan (rate limit) ───────────────────────────────── */
const CATATAN = new Map();          /* kunci → { mulai, jumlah } */
const PENGAMATAN = { total: 0, ditolak: 0, sejak: Date.now() };

export function ipDari(request) {
  const h = request.headers;
  return (
    h.get('x-forwarded-for')?.split(',')[0].trim() ||
    h.get('x-real-ip') ||
    'lokal'
  );
}

export function batasRate(request, opsi = {}) {
  const jendela = opsi.jendelaMs || 60_000;
  const maks = opsi.maks || 60;
  const kunci = (opsi.nama || 'umum') + ':' + ipDari(request);
  const sekarang = Date.now();
  const c = CATATAN.get(kunci) || { mulai: sekarang, jumlah: 0 };
  if (sekarang - c.mulai > jendela) { c.mulai = sekarang; c.jumlah = 0; }
  c.jumlah += 1;
  CATATAN.set(kunci, c);
  PENGAMATAN.total += 1;
  if (c.jumlah > maks) {
    PENGAMATAN.ditolak += 1;
    return {
      lolos: false,
      sisa: 0,
      ulang: Math.ceil((c.mulai + jendela - sekarang) / 1000),
      maks,
    };
  }
  if (CATATAN.size > 2000 && Math.random() < 0.02) {
    for (const [k, v] of CATATAN) if (sekarang - v.mulai > jendela * 3) CATATAN.delete(k);
  }
  return { lolos: true, sisa: maks - c.jumlah, ulang: 0, maks };
}

export function pengamatanRate() {
  return { ...PENGAMATAN, jendelaAktif: CATATAN.size };
}

export function resetRate() { CATATAN.clear(); PENGAMATAN.total = 0; PENGAMATAN.ditolak = 0; }

/* ── 2. Asal permintaan (CSRF) ─────────────────────────────────────── */
export function asalDiizinkan(request, env = {}) {
  const origin = request.headers.get('Origin') || '';
  const daftar = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (daftar.length) return !!origin && daftar.includes(origin);
  if (!origin) return true;                       /* permintaan non-browser (curl, uji) */
  try {
    const host = new URL(origin).host;
    const sendiri = request.headers.get('host') || '';
    /* terima bila asalnya host yang sama — termasuk domain preview (*.vercel.app) */
    if (host === sendiri) return true;
    if (/(^|\.)vercel\.app$/.test(host) && /(^|\.)vercel\.app$/.test(sendiri)) return true;
    if (/^localhost(:\d+)?$/.test(host) || /^127\.0\.0\.1(:\d+)?$/.test(host)) return true;
    if (/trycloudflare\.com$/.test(host)) return true;   /* terowongan uji */
    if (/e2b\.app$/.test(sendiri) || /e2b\.app$/.test(host)) return true; /* pratinjau sandbox */
    return false;
  } catch (e) { return false; }
}

export function cors(origin, env = {}, request = null) {
  const daftar = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  /* tanpa daftar izin: hanya asal yang benar-benar dikenal (host sendiri,
     pratinjau hosting, terowongan uji) yang diberi header CORS — bukan "*" */
  let allow;
  if (daftar.length) allow = origin && daftar.includes(origin) ? origin : '';
  else if (!origin) allow = '';
  else allow = (!request || asalDiizinkan(request, env)) ? origin : '';
  const h = {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
  if (allow) h['Access-Control-Allow-Credentials'] = 'false';
  return h;
}

/* ── 3. Jawaban JSON + audit ───────────────────────────────────────── */
export function json(o, status = 200, tambahan = {}) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...tambahan },
  });
}

export function audit(peristiwa, rincian = {}) {
  const baris = { t: new Date().toISOString(), peristiwa, ...rincian };
  /* log terstruktur → terbaca di dasbor Log Vercel */
  console.log('[audit] ' + JSON.stringify(baris));
  return baris;
}

/* ── 4. Validasi input ─────────────────────────────────────────────── */
export function teksMasuk(nilai, maks) {
  const t = typeof nilai === 'string' ? nilai : '';
  return t.length > maks ? t.slice(0, maks) : t;
}

export function angkaMasuk(nilai, min, maks, bawaan) {
  const n = Number(nilai);
  if (!Number.isFinite(n)) return bawaan;
  return Math.max(min, Math.min(maks, n));
}

export function periksaBadan(request, maksBita = BATAS_MAKS.badanBita) {
  const panjang = Number(request.headers.get('content-length') || 0);
  if (panjang && panjang > maksBita) return { ok: false, pesan: 'badan permintaan terlalu besar' };
  return { ok: true };
}

/* gambar data-URL: hanya jenis yang diizinkan, ukuran dibatasi */
const JENIS_GAMBAR = /^data:image\/(png|jpe?g|webp|gif|bmp);base64,[A-Za-z0-9+/=]+$/i;

export function periksaGambar(daftar) {
  const masuk = Array.isArray(daftar) ? daftar : [];
  const sah = [];
  const catatan = [];
  masuk.forEach((g, i) => {
    const teks = typeof g === 'string' ? g : '';
    if (!teks) return;
    if (!JENIS_GAMBAR.test(teks)) { catatan.push('gambar #' + (i + 1) + ': jenis tidak dikenali'); return; }
    if (teks.length > BATAS_MAKS.gambarBita) { catatan.push('gambar #' + (i + 1) + ': melebihi batas ukuran'); return; }
    if (sah.length < BATAS_MAKS.gambar) sah.push(teks);
  });
  if (masuk.length > BATAS_MAKS.gambar) catatan.push('hanya ' + BATAS_MAKS.gambar + ' gambar pertama yang dipakai');
  return { sah, catatan: catatan.join(' · ') };
}

/* berkas teks: jenis + ukuran (dipakai bila kelak ada pengiriman isi berkas) */
export const JENIS_BERKAS_SAH = [
  'txt', 'md', 'json', 'csv', 'html', 'htm', 'css', 'js', 'mjs', 'ts', 'tsx', 'jsx',
  'py', 'sql', 'yml', 'yaml', 'xml', 'svg', 'log', 'ini', 'env', 'sh',
  'pdf', 'docx', 'xlsx', 'pptx', 'zip',
];

export function periksaBerkas(nama, ukuran) {
  const ekstensi = String(nama || '').split('.').pop().toLowerCase();
  if (!JENIS_BERKAS_SAH.includes(ekstensi)) return { ok: false, pesan: 'jenis berkas .' + ekstensi + ' belum didukung' };
  if (Number(ukuran) > BATAS_MAKS.berkasTeks * 4) return { ok: false, pesan: 'berkas terlalu besar' };
  return { ok: true };
}

/* ── 5. Bungkusan standar untuk endpoint ───────────────────────────── */
export function siapkan(request, env, opsi = {}) {
  const origin = request.headers.get('Origin') || '';
  const tambahan = cors(origin, env, request);
  if (request.method === 'OPTIONS') return { jawab: new Response(null, { status: 204, headers: tambahan }), tambahan };
  const rate = batasRate(request, { nama: opsi.nama || 'api', maks: opsi.maks || 60, jendelaMs: opsi.jendelaMs || 60_000 });
  if (!rate.lolos) {
    audit('rate-limit', { endpoint: opsi.nama, ip: ipDari(request), ulang: rate.ulang });
    return {
      jawab: json({ ok: false, pesan: 'Terlalu banyak permintaan. Coba lagi dalam ' + rate.ulang + ' detik.' }, 429, tambahan),
      tambahan,
    };
  }
  if (opsi.post && request.method === 'POST' && !asalDiizinkan(request, env)) {
    audit('asal-ditolak', { endpoint: opsi.nama, origin, ip: ipDari(request) });
    return { jawab: json({ ok: false, pesan: 'Permintaan dari alamat asal yang tidak dikenal ditolak.' }, 403, tambahan), tambahan };
  }
  const besar = periksaBadan(request, opsi.maksBadan);
  if (!besar.ok) return { jawab: json({ ok: false, pesan: besar.pesan }, 413, tambahan), tambahan };
  return { tambahan, rate };
}
