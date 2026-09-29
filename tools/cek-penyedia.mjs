/*
 * cek-penyedia.mjs — pemeriksa penyedia AI bergaya OpenAI-compatible
 * (9Router: https://rqacwx8.abc-tunnel.us/v1) sebelum dipakai aplikasi:
 * memeriksa daftar model, kunci, dan satu percakapan uji.
 *
 * Pakai:
 *   node tools/cek-penyedia.mjs --url https://rqacwx8.abc-tunnel.us/v1 --key sk-XXXX --nama 9router
 *   node tools/cek-penyedia.mjs --url ... --key ... --nama 9router --tulis
 *
 * --tulis menyimpan hasilnya ke tools/penyedia.json (dibaca otomatis oleh
 * tools/server-uji.mjs). Berkas itu berisi kunci rahasia → jangan dibagikan
 * dan jangan di-commit (sudah masuk .gitignore).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const simpul = path.join(AKAR, 'tools', 'penyedia.json');

function arg(nama, bawaan) {
  const i = process.argv.indexOf('--' + nama);
  if (i < 0) return bawaan;
  const nilai = process.argv[i + 1];
  return nilai && !nilai.startsWith('--') ? nilai : true;
}
const adaFlag = (nama) => process.argv.indexOf('--' + nama) >= 0;

const URL_P = String(arg('url', process.env.AI_BASE_URL || '')).replace(/\/+$/, '');
const KUNCI = String(arg('key', process.env.AI_API_KEY || '')).trim();
const NAMA = String(arg('nama', '')).trim();
const TULIS = adaFlag('tulis');

if (!URL_P) {
  console.error('Butuh --url, mis.  node tools/cek-penyedia.mjs --url https://rqacwx8.abc-tunnel.us/v1 --key sk-XXXX --nama 9router');
  process.exit(2);
}

const catatan = [];
const tulis = (s = '') => { console.log(s); catatan.push(s); };
let masalah = 0;
const cek = (nama, benar, ket) => {
  tulis((benar ? '  ✓ ' : '  ✗ ') + nama + (ket ? ' — ' + ket : ''));
  if (!benar) masalah++;
};

const kepala = { 'Content-Type': 'application/json', Accept: 'application/json', ...(KUNCI ? { Authorization: 'Bearer ' + KUNCI } : {}) };

async function ambil(url, opsi = {}) {
  try {
    const r = await fetch(url, { ...opsi, headers: { ...kepala, ...(opsi.headers || {}) }, signal: AbortSignal.timeout(20000) });
    const t = await r.text();
    return { ok: r.ok, status: r.status, t };
  } catch (e) {
    return { ok: false, status: 0, t: String(e.message || e) };
  }
}

const pesanUji = 'Balas satu kata saja: halo';

tulis('══ memeriksa penyedia AI (OpenAI-compatible) ══');
tulis('   alamat : ' + URL_P);
/* jangan pernah menulis kunci utuh ke layar/berkas bukti — cukup 4 huruf awal */
tulis('   kunci  : ' + (KUNCI ? KUNCI.slice(0, 4) + '…(' + KUNCI.length + ' karakter)' : '(tanpa kunci)'));
tulis('');

/* 1. daftar model */
const daftar = await ambil(URL_P + '/models');
let model = [];
if (daftar.ok) {
  try {
    const j = JSON.parse(daftar.t);
    model = (j.data || j.models || []).map((m) => String((m && (m.id || m.name)) || '').trim()).filter(Boolean);
  } catch (e) { /* bukan JSON */ }
}
cek('daftar model terbaca (GET /models)', daftar.ok && model.length > 0, 'HTTP ' + daftar.status + ' · ' + model.length + ' model');
if (model.length) tulis('   contoh: ' + model.slice(0, 6).join(', ') + (model.length > 6 ? ' …' : ''));
if (daftar.status === 401 || daftar.status === 403) {
  tulis('   catatan: kunci ditolak. Di 9Router, kunci harus berawalan sk- dan dibuat di halaman API keys dasbor.');
}

/* 2. percakapan uji
   Sebagian model di daftar 9Router tidak punya kredensial aktif atau menggantung,
   jadi satu model gagal BUKAN berarti penyedia mati. Alat ini mencoba beberapa
   kandidat: keluarga yang terbukti hidup lebih dulu. */
const PILIHAN_UTAMA = ['kr/claude-haiku-4.5', 'kr/claude-sonnet-4.5', 'kr/auto', 'FreeTiers'];
const kandidatUji = [].concat(
  process.env.MODEL_UJI ? [process.env.MODEL_UJI] : [],
  PILIHAN_UTAMA.filter((m) => model.includes(m)),
  model.filter((m) => /^kr\//.test(m) && !/-thinking|-agentic/.test(m)),
  model.filter((m) => /flash|mini|small|lite/i.test(m)),
  model,
).filter((m, i, a) => m && a.indexOf(m) === i).slice(0, 5);
let modelUji = kandidatUji[0] || 'model-uji';
async function coba(m) {
  const badan = { model: m, max_tokens: 24, messages: [{ role: 'user', content: pesanUji }] };
  const r = await ambil(URL_P + '/chat/completions', { method: 'POST', body: JSON.stringify(badan) });
  let teks = '';
  let galat = '';
  try {
    const j = JSON.parse(r.t);
    if (j && j.choices) teks = String((j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '');
    if (j && j.error) galat = typeof j.error === 'string' ? j.error : (j.error.message || '');
    if (!galat && j && j.type === 'error' && j.error) galat = j.error.message || '';
  } catch (e) { galat = String(r.t).slice(0, 120); }
  return { status: r.status, ok: r.ok, teks, galat, mentah: r.t.slice(0, 300) };
}

tulis('');
tulis('2) percakapan uji via POST /chat/completions (kandidat: ' + kandidatUji.slice(0, 3).join(', ') + ')');
let hasil = { ok: false, status: 0, teks: '', galat: '', mentah: '' };
const gagalModel = [];
for (const m of (kandidatUji.length ? kandidatUji : [modelUji])) {
  hasil = await coba(m);
  if (hasil.ok && String(hasil.teks).trim()) { modelUji = m; break; }
  gagalModel.push(m + ' → ' + String(hasil.galat || hasil.mentah || '').slice(0, 50));
  await new Promise((r) => setTimeout(r, 300));
}
if (gagalModel.length > 1 || (!hasil.ok && gagalModel.length)) tulis('   dicoba: ' + gagalModel.join(' | '));
if (hasil.ok && String(hasil.teks).trim()) {
  tulis('   jawaban: "' + String(hasil.teks).trim().slice(0, 80) + '"');
  cek('percakapan berhasil', true);
} else {
  tulis('   jawaban penyedia: HTTP ' + hasil.status + ' · ' + (hasil.galat || hasil.mentah).slice(0, 160));
  const saldo = /insufficient balance|insufficient credit|no credit|saldo|kredit habis|quota/i.test(hasil.galat + ' ' + hasil.mentah);
  const kunciSalah = hasil.status === 401 || hasil.status === 403;
  if (saldo) {
    cek('batas/saldo penyedia jadi penghalang — bukan salah setelan', false, 'tunggu batasnya lega atau naikkan paket di dasbor 9Router, lalu jalankan lagi');
  } else if (kunciSalah) {
    cek('kunci ditolak penyedia', false, 'periksa --key (HTTP ' + hasil.status + ') — di 9Router kunci berawalan sk-');
  } else {
    cek('percakapan berhasil', false, 'HTTP ' + hasil.status);
  }
}

/* 3. streaming (dipakai halaman chat) */
tulis('');
tulis('3) streaming (SSE) — yang dipakai halaman chat');
const str = await ambil(URL_P + '/chat/completions', {
  method: 'POST', body: JSON.stringify({ model: modelUji, max_tokens: 32, stream: true, messages: [{ role: 'user', content: 'Sebut satu fakta singkat tentang kopi.' }] }),
});
const potongan = (str.t.match(/data:\s*\{/g) || []).length;
cek('mengalir sebagai SSE (data: {...} + [DONE])', str.ok && potongan > 0 && /\[DONE\]/.test(str.t), 'HTTP ' + str.status + ' · ' + potongan + ' potongan');

tulis('');
tulis('4) kesimpulan');
if (masalah === 0) {
  tulis('   ✓ penyedia siap dipakai. Setelan untuk aplikasi:');
  tulis('     AI_PROVIDER = ' + (NAMA || '9router'));
  tulis('     AI_BASE_URL = ' + URL_P);
  tulis('     AI_API_KEY  = (kunci di atas)');
  if (TULIS) {
    const berkas = {
      nama: NAMA || '9router', url: URL_P, kunci: KUNCI,
      model: { fast: model.find((m) => /flash/i.test(m)) || model[0] || '', think: model.find((m) => /agnes|glm|deepseek/i.test(m)) || model[0] || '' },
      jumlahModel: model.length, dicek: new Date().toLocaleString('id-ID'),
    };
    fs.writeFileSync(simpul, JSON.stringify(berkas, null, 2) + '\n');
    tulis('   → disimpan ke tools/penyedia.json (berisi KUNCI RAHASIA — jangan dibagikan, jangan di-commit)');
  } else {
    tulis('   (tambahkan --tulis untuk menyimpannya ke tools/penyedia.json)');
  }
} else {
  tulis('   ✗ ada ' + masalah + ' masalah — perbaiki dulu sebelum dipakai di aplikasi.');
}

const kepalaBukti = 'HASIL CEK PENYEDIA AI (OpenAI-compatible)\n' + new Date().toLocaleString('id-ID') + '\n' + '─'.repeat(58) + '\n';
try {
  const namafile = 'HASIL-CEK-PENYEDIA' + (NAMA ? '-' + NAMA.replace(/[^a-z0-9-]/gi, '').toUpperCase() : '') + '.txt';
  fs.writeFileSync(path.join(AKAR, 'bukti-uji', namafile), kepalaBukti + catatan.join('\n') + '\n\n' + (masalah ? 'HASIL: ADA MASALAH' : 'HASIL: SEMUA BAIK') + '\n');
} catch (e) { /* abaikan */ }
process.exit(masalah ? 1 : 0);
