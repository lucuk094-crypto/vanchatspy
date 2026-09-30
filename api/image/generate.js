/*
 * /api/image/generate — pembuat gambar AI.
 *
 * BAWAAN: GRATIS tanpa kunci → Pollinations (IMAGE_PROVIDER dibiarkan kosong).
 * Pilihan lain lewat Environment Variable:
 *   IMAGE_PROVIDER = cloudflare (FLUX, satu akun Cloudflare gratis) | gemini | off
 *                    | nama penyedia sendiri (butuh IMAGE_BASE_URL + IMAGE_API_KEY)
 * (opsional: IMAGE_MODEL, IMAGE_BASE_URL)
 *
 * Kalau tidak ada penyedia yang siap, endpoint ini menjawab jujur dengan status
 * 501 dan penjelasan — bukan gambar palsu dan bukan tombol yang diam-diam mati.
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
        ? 'Pembuat gambar siap (' + status.penyedia + ' · ' + status.model + ').'
        : 'Pembuat gambar sedang dimatikan — biarkan IMAGE_PROVIDER kosong untuk memakai Pollinations (gratis), atau isi penyedia gambar sendiri.',
    }, 200, s.tambahan);
  }

  if (request.method !== 'POST') return json({ ok: false, pesan: 'metode tidak didukung' }, 405, s.tambahan);

  let badan = {};
  try { badan = await request.json(); } catch (e) { return json({ ok: false, pesan: 'badan permintaan bukan JSON' }, 400, s.tambahan); }

  const prompt = teksMasuk(badan.prompt, 2000).trim();
  if (!prompt) return json({ ok: false, pesan: 'prompt wajib diisi' }, 400, s.tambahan);
  /* nilai yang dikirim tetapi tidak dikenal → ditolak rapi (jangan diteruskan ke penyedia) */
  if (badan.rasio !== undefined && badan.rasio !== null && badan.rasio !== '' && !RASIO_SAH.includes(badan.rasio)) {
    return json({ ok: false, pesan: 'Rasio tidak dikenal: ' + String(badan.rasio).slice(0, 12) + '. Pilihan yang sah: ' + RASIO_SAH.join(', ') + '.' }, 400, s.tambahan);
  }
  if (badan.kualitas !== undefined && badan.kualitas !== null && badan.kualitas !== '' && !KUALITAS_SAH.includes(badan.kualitas)) {
    return json({ ok: false, pesan: 'Kualitas tidak dikenal: ' + String(badan.kualitas).slice(0, 12) + '. Pilihan yang sah: ' + KUALITAS_SAH.join(', ') + '.' }, 400, s.tambahan);
  }
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
        'Pembuat gambar sedang tidak aktif. Cara termudah: biarkan IMAGE_PROVIDER kosong — aplikasi memakai '
        + 'Pollinations (gratis, tanpa kunci, gambarnya bertanda air). Atau isi IMAGE_PROVIDER=cloudflare + '
        + 'IMAGE_API_KEY + IMAGE_BASE_URL (gratis 10.000 neuron/hari, tanpa tanda air). Tanpa itu saya tidak '
        + 'akan menampilkan gambar palsu; kamu tetap bisa membuat gambar sebagai kode SVG.',
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
