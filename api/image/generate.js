/*
 * /api/image/generate — pembuat gambar AI.
 *
 * Siap dipakai begitu dua Environment Variable ini diisi di hosting:
 *   IMAGE_PROVIDER = bynara            (gambar lewat api-images.bynara.id)
 *   IMAGE_API_KEY  = kunci NaraRouter (sk-nry-…)
 * (opsional: IMAGE_MODEL, IMAGE_BASE_URL)
 *
 * Selama kunci belum diisi, endpoint ini menjawab jujur dengan status 501 dan
 * penjelasan — bukan gambar palsu dan bukan tombol yang diam-diam mati.
 */
import { siapkan, json, audit, teksMasuk, periksaGambar, BATAS_MAKS } from '../_aman.js';
import { generateImage, daftarProvider } from '../_ai.js';

export const config = { runtime: 'edge' };

const RASIO_SAH = ['1:1', '16:9', '9:16', '4:3'];
const KUALITAS_SAH = ['draft', 'standar', 'hd'];

export default async function handler(request, env = {}) {
  const s = siapkan(request, env, { nama: 'image', maks: 20, post: true });
  if (s.jawab) return s.jawab;

  const status = daftarProvider(env).gambar;

  if (request.method === 'GET') {
    return json({
      ok: true,
      siap: status.siap,
      penyedia: status.penyedia,
      model: status.model,
      rasio: RASIO_SAH,
      kualitas: KUALITAS_SAH,
      pesan: status.siap
        ? 'Pembuat gambar siap.'
        : 'Pembuat gambar belum aktif — isi IMAGE_PROVIDER=bynara dan IMAGE_API_KEY (kunci NaraRouter) di hosting.',
    }, 200, s.tambahan);
  }

  if (request.method !== 'POST') return json({ ok: false, pesan: 'metode tidak didukung' }, 405, s.tambahan);

  let badan = {};
  try { badan = await request.json(); } catch (e) { return json({ ok: false, pesan: 'badan permintaan bukan JSON' }, 400, s.tambahan); }

  const prompt = teksMasuk(badan.prompt, 2000).trim();
  if (!prompt) return json({ ok: false, pesan: 'prompt wajib diisi' }, 400, s.tambahan);
  const rasio = RASIO_SAH.includes(badan.rasio) ? badan.rasio : '1:1';
  const kualitas = KUALITAS_SAH.includes(badan.kualitas) ? badan.kualitas : 'standar';

  /* sekadar melindungi endpoint dari badan raksasa (tidak ada berkas diunggah) */
  periksaGambar(badan.acuan ? [badan.acuan] : []);

  if (!status.siap) {
    audit('gambar-tanpa-kunci', { prompt: prompt.slice(0, 80) });
    return json({
      ok: false,
      butuhKunci: true,
      pesan:
        'Pembuat gambar AI belum bisa dipakai: semua penyedia gambar mewajibkan kunci berbayar. ' +
        'Pasang IMAGE_PROVIDER + IMAGE_API_KEY lalu ulangi — tanpa itu saya tidak akan menampilkan gambar palsu. ' +
        'Sementara ini kamu tetap bisa membuat gambar sebagai kode SVG (vektor, bisa diunduh & masuk pustaka).',
      penyedia: status.penyedia,
    }, 501, s.tambahan);
  }

  const t0 = Date.now();
  try {
    const hasil = await generateImage({ env, prompt, rasio, kualitas });
    if (!hasil.ok) {
      audit('gambar-gagal', { status: hasil.status, pesan: hasil.pesan });
      return json({ ok: false, pesan: hasil.pesan || 'gagal membuat gambar', status: hasil.status }, 502, s.tambahan);
    }
    audit('gambar-berhasil', { penyedia: hasil.penyedia, model: hasil.model, ms: Date.now() - t0, rasio, kualitas });
    return json({
      ok: true,
      gambar: hasil.dataUrl,
      penyedia: hasil.penyedia,
      model: hasil.model,
      rasio, kualitas,
      ms: Date.now() - t0,
      catatan: 'Gambar dibuat penyedia AI sesuai prompt — periksa dulu sebelum dipakai resmi.',
    }, 200, s.tambahan);
  } catch (e) {
    audit('gambar-galat', { pesan: String(e && e.message) });
    return json({ ok: false, pesan: 'Gagal menghubungi penyedia gambar: ' + String(e && e.message) }, 502, s.tambahan);
  }
}

export const BATAS = BATAS_MAKS;
