/*
 * cek-penyedia.mjs — pemeriksa PENYEDIA AI APA PUN (OpenAI-compatible atau
 * bergaya Anthropic), sebelum dipakai aplikasi. Mirip cek-9router.mjs, tapi
 * tidak terbatas pada router lokal.
 *
 * Pakai:
 *   node tools/cek-penyedia.mjs --url https://cc.freemodel.dev/v1 --key KUNCI
 *   node tools/cek-penyedia.mjs --url ... --key ... --nama freemodel --gaya anthropic --tulis
 *   node tools/cek-penyedia.mjs --url ... --key ... --openai      (paksa gaya openai)
 *
 * --tulis menyimpan hasilnya ke tools/penyedia.json (dibaca otomatis oleh
 * tools/server-uji.mjs). Berkas itu berisi kunci rahasia → jangan dibagikan.
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
const GAYA_PAKSA = adaFlag('openai') ? 'openai' : adaFlag('anthropic') ? 'anthropic' : String(arg('gaya', 'auto')).toLowerCase();

if (!URL_P) {
  console.error('Butuh --url, mis.  node tools/cek-penyedia.mjs --url https://contoh.com/v1 --key KUNCI');
  process.exit(2);
}

const catatan = [];
const tulis = (s = '') => { console.log(s); catatan.push(s); };
let masalah = 0;
const cek = (nama, benar, ket) => {
  tulis((benar ? '  ✓ ' : '  ✗ ') + nama + (ket ? ' — ' + ket : ''));
  if (!benar) masalah++;
};

const kepalaUntuk = (gaya) => (gaya === 'anthropic'
  ? { 'Content-Type': 'application/json', 'x-api-key': KUNCI, 'anthropic-version': '2023-06-01' }
  : { 'Content-Type': 'application/json', ...(KUNCI ? { Authorization: 'Bearer ' + KUNCI } : {}) });

async function ambil(url, opsi = {}) {
  try {
    const r = await fetch(url, { ...opsi, headers: { ...kepalaUntuk(opsi.gaya || 'openai'), ...(opsi.headers || {}) }, signal: AbortSignal.timeout(20000) });
    const t = await r.text();
    return { ok: r.ok, status: r.status, t };
  } catch (e) {
    return { ok: false, status: 0, t: String(e.message || e) };
  }
}

const pesanUji = 'Balas satu kata saja: halo';

async function kirimUji(gaya) {
  const badan = gaya === 'anthropic'
    ? { model: '', max_tokens: 24, messages: [{ role: 'user', content: pesanUji }] }
    : { model: '', max_tokens: 24, messages: [{ role: 'user', content: pesanUji }] };
  return badan;   /* model diisi setelah daftar model terbaca */
}

tulis('══ memeriksa penyedia AI ══');
tulis('   alamat : ' + URL_P);
/* jangan pernah menulis kunci utuh ke layar/berkas bukti — cukup 4 huruf awal */
tulis('   kunci  : ' + (KUNCI ? KUNCI.slice(0, 4) + '…(' + KUNCI.length + ' karakter)' : '(tanpa kunci)'));
tulis('');

/* 1. daftar model — dicoba kedua gaya header kalau perlu */
let gaya = GAYA_PAKSA === 'openai' ? 'openai' : GAYA_PAKSA === 'anthropic' ? 'anthropic' : 'openai';
let daftar = await ambil(URL_P + '/models', { gaya });
let model = [];
if (daftar.ok) {
  try {
    const j = JSON.parse(daftar.t);
    model = (j.data || j.models || []).map((m) => String((m && (m.id || m.name)) || '').trim()).filter(Boolean);
  } catch (e) { /* bukan JSON */ }
}
cek('daftar model terbaca (GET /models)', daftar.ok && model.length > 0, 'HTTP ' + daftar.status + ' · ' + model.length + ' model');
if (model.length) tulis('   contoh: ' + model.slice(0, 6).join(', ') + (model.length > 6 ? ' …' : ''));

/* 2. deteksi gaya: coba satu permintaan kecil di gaya yang dipilih, lalu gaya lain */
const modelUji = model.find((m) => /haiku|mini|flash|small|lite/i.test(m)) || model[0] || 'model-uji';
async function coba(g) {
  const badan = g === 'anthropic'
    ? { model: modelUji, max_tokens: 24, messages: [{ role: 'user', content: pesanUji }] }
    : { model: modelUji, max_tokens: 24, messages: [{ role: 'user', content: pesanUji }] };
  const jalur = g === 'anthropic' ? '/messages' : '/chat/completions';
  const r = await ambil(URL_P + jalur, { method: 'POST', gaya: g, body: JSON.stringify(badan) });
  let teks = '';
  let galat = '';
  try {
    const j = JSON.parse(r.t);
    if (j && j.content) teks = (Array.isArray(j.content) ? j.content : []).filter((b) => b && b.type === 'text').map((b) => b.text).join('');
    else if (j && j.choices) teks = String((j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '');
    if (j && j.error) galat = typeof j.error === 'string' ? j.error : (j.error.message || '');
    if (!galat && j && j.type === 'error' && j.error) galat = j.error.message || '';
  } catch (e) { galat = String(r.t).slice(0, 120); }
  return { gaya: g, status: r.status, ok: r.ok, teks, galat, mentah: r.t.slice(0, 300) };
}

let hasil = await coba(gaya);
if (!hasil.ok && (hasil.status === 400 || hasil.status === 404 || hasil.status === 405) && GAYA_PAKSA === 'auto') {
  const gayaLain = gaya === 'openai' ? 'anthropic' : 'openai';
  tulis('   gaya ' + gaya + ' ditolak (HTTP ' + hasil.status + ') → mencoba gaya ' + gayaLain + '…');
  const kedua = await coba(gayaLain);
  if (kedua.ok || kedua.galat) { hasil = kedua; gaya = gayaLain; }
}

tulis('');
tulis('2) percakapan uji via ' + (gaya === 'anthropic' ? 'POST /messages (gaya Anthropic)' : 'POST /chat/completions (gaya OpenAI)'));
if (hasil.ok && String(hasil.teks).trim()) {
  tulis('   jawaban: "' + String(hasil.teks).trim().slice(0, 80) + '"');
  cek('percakapan berhasil', true);
} else {
  tulis('   jawaban penyedia: HTTP ' + hasil.status + ' · ' + (hasil.galat || hasil.mentah).slice(0, 160));
  const saldo = /insufficient balance|insufficient credit|no credit|saldo|kredit habis/i.test(hasil.galat + ' ' + hasil.mentah);
  const kunciSalah = hasil.status === 401 || hasil.status === 403;
  if (saldo) {
    cek('saldo/kredit penyedia habis — bukan salah setelan', false, 'isi ulang saldo di dasbor penyedia, lalu jalankan lagi');
  } else if (kunciSalah) {
    cek('kunci ditolak penyedia', false, 'periksa --key (HTTP ' + hasil.status + ')');
  } else {
    cek('percakapan berhasil', false, 'HTTP ' + hasil.status);
  }
}

tulis('');
tulis('3) kesimpulan');
if (masalah === 0) {
  tulis('   ✓ penyedia siap dipakai. Setelan untuk aplikasi:');
  tulis('     AI_PROVIDER = ' + (NAMA || 'penyedia'));
  tulis('     AI_BASE_URL = ' + URL_P);
  tulis('     AI_API_KEY  = (kunci di atas)');
  if (gaya === 'anthropic') tulis('     AI_GAYA     = anthropic      ← penyedia ini memakai protokol Anthropic');
  if (TULIS) {
    const berkas = {
      nama: NAMA || 'penyedia', url: URL_P, kunci: KUNCI, gaya,
      model: { fast: model.find((m) => /haiku|mini|flash/i.test(m)) || model[0] || '', think: model.find((m) => /sonnet|glm|qwen/i.test(m)) || model[0] || '' },
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

const kepala = 'HASIL CEK PENYEDIA AI\n' + new Date().toLocaleString('id-ID') + '\n' + '─'.repeat(58) + '\n';
try {
  const namafile = 'HASIL-CEK-PENYEDIA' + (NAMA ? '-' + NAMA.replace(/[^a-z0-9-]/gi, '').toUpperCase() : '') + '.txt';
  fs.writeFileSync(path.join(AKAR, 'bukti-uji', namafile), kepala + catatan.join('\n') + '\n\n' + (masalah ? 'HASIL: ADA MASALAH' : 'HASIL: SEMUA BAIK') + '\n');
} catch (e) { /* abaikan */ }
process.exit(masalah ? 1 : 0);
