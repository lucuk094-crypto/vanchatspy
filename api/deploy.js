/*
 * /api/deploy — menerbitkan hasil AI Builder ke hosting.
 *
 * Aktif hanya bila Environment Variable diisi:
 *   DEPLOY_PROVIDER = vercel | netlify
 *   DEPLOY_TOKEN    = token akun penyedia
 * (opsional: DEPLOY_PROJECT = nama/id proyek yang sudah ada)
 *
 * Aksi:
 *   GET  /api/deploy              → status kesiapan
 *   POST /api/deploy { berkas:[{path,isi}] } → unggah & kembalikan URL hasil
 *
 * Selama token belum ada, endpoint menjawab jujur (501) dan pengguna tetap
 * bisa mengunduh ZIP proyek dari halaman /builder lalu unggah sendiri.
 */
import { siapkan, json, audit, teksMasuk } from './_aman.js';

export const config = { runtime: 'edge' };

export default async function handler(request, env = {}) {
  const s = siapkan(request, env, { nama: 'deploy', maks: 10, post: true });
  if (s.jawab) return s.jawab;

  const penyedia = String(env.DEPLOY_PROVIDER || '').toLowerCase();
  const token = String(env.DEPLOY_TOKEN || '').trim();
  const siap = !!penyedia && !!token;

  if (request.method === 'GET') {
    return json({
      ok: true, siap, penyedia: penyedia || '(belum diatur)', proyek: env.DEPLOY_PROJECT || null,
      pesan: siap ? 'Deployment siap dipakai.' : 'Deployment belum aktif — isi DEPLOY_PROVIDER + DEPLOY_TOKEN, atau unduh ZIP lalu unggah manual.',
    }, 200, s.tambahan);
  }
  if (request.method !== 'POST') return json({ ok: false, pesan: 'metode tidak didukung' }, 405, s.tambahan);

  let badan = {};
  try { badan = await request.json(); } catch (e) { return json({ ok: false, pesan: 'badan permintaan bukan JSON' }, 400, s.tambahan); }
  const berkas = Array.isArray(badan.berkas) ? badan.berkas.slice(0, 80) : [];
  if (!berkas.length) return json({ ok: false, pesan: 'tidak ada berkas untuk di-deploy' }, 400, s.tambahan);

  if (!siap) {
    audit('deploy-tanpa-token', { jumlah: berkas.length });
    return json({
      ok: false, butuhKunci: true,
      pesan: 'Deployment otomatis belum aktif (butuh DEPLOY_PROVIDER + DEPLOY_TOKEN milikmu). ' +
             'Tanpa token saya tidak akan berpura-pura menerbitkan website — pakai tombol Unduh ZIP di halaman Builder.',
      alternatif: 'unduh-zip',
    }, 501, s.tambahan);
  }

  const bersih = berkas
    .map((f) => ({ file: teksMasuk(f.path, 200).replace(/^\/+/, ''), data: teksMasuk(f.isi, 400000) }))
    .filter((f) => f.file && !f.file.includes('..'));

  try {
    if (penyedia === 'vercel') {
      const r = await fetch('https://api.vercel.com/v13/deployments', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: env.DEPLOY_PROJECT || 'van-chat-spy-builder',
          files: bersih.map((f) => ({ file: f.file, data: f.data })),
          projectSettings: { framework: null },
          target: 'production',
        }),
      });
      const d = await r.json();
      if (!r.ok) return json({ ok: false, pesan: (d.error && d.error.message) || 'Vercel menolak', status: r.status }, 502, s.tambahan);
      audit('deploy-berhasil', { penyedia, url: d.url });
      return json({ ok: true, url: 'https://' + d.url, penyedia, id: d.id }, 200, s.tambahan);
    }
    if (penyedia === 'netlify') {
      const r = await fetch('https://api.netlify.com/api/v1/sites', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!r.ok) return json({ ok: false, pesan: 'Netlify menolak pembuatan situs', status: r.status }, 502, s.tambahan);
      const d = await r.json();
      audit('deploy-berhasil', { penyedia, url: d.ssl_url || d.url });
      return json({ ok: true, url: d.ssl_url || d.url, penyedia, id: d.id, catatan: 'Situs dibuat; unggah berkas lewat dasbor Netlify.' }, 200, s.tambahan);
    }
    return json({ ok: false, pesan: 'penyedia deploy "' + penyedia + '" belum didukung' }, 400, s.tambahan);
  } catch (e) {
    audit('deploy-galat', { pesan: String(e && e.message) });
    return json({ ok: false, pesan: 'Gagal menghubungi penyedia deploy: ' + String(e && e.message) }, 502, s.tambahan);
  }
}
