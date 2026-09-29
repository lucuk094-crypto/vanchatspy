/* uji-cari.mjs — memeriksa /api/search terhadap penyedia SUNGGUHAN (tanpa kunci API,
 * tanpa kuota AI). Setiap hasil harus punya penyedia, judul, url, dan cuplikan.
 *
 *   node tools/uji-cari.mjs
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { default: cari } = await import(path.join(AKAR, 'api/search.js'));

const catat = [];
const tulis = (s) => { console.log(s); catat.push(s); };
let gagal = 0;
const cek = (nama, benar, ket) => {
  tulis((benar ? '  ✓ ' : '  ✗ ') + nama + (ket ? ' — ' + ket : ''));
  if (!benar) gagal++;
};

const panggil = (q, opsi) => cari(new Request('http://lokal/api/search?q=' + encodeURIComponent(q), opsi));

/* 1. pencarian biasa */
const r = await panggil('javascript debounce');
const j = await r.json();
cek('status 200', r.status === 200, 'status ' + r.status);
cek('ada sumber', Array.isArray(j.sumber) && j.sumber.length >= 3, j.sumber ? j.sumber.length + ' sumber' : 'tanpa sumber');
cek('tiap sumber punya penyedia/judul/url/cuplikan', (j.sumber || []).every((s) => s.penyedia && s.judul && /^https?:\/\//.test(s.url) && typeof s.cuplikan === 'string'));
cek('penyedia beragam (≥2 jenis)', new Set((j.sumber || []).map((s) => s.penyedia)).size >= 2, [...new Set((j.sumber || []).map((s) => s.penyedia))].join(', '));
cek('catatan pembatas disertakan', typeof j.catatan === 'string' && j.catatan.length > 10);

/* 2. topik Indonesia (Wikipedia id). Wikipedia menjawab 429 bila dipanggil
   beruntun, jadi: satu percobaan ulang; kalau Wikipedia tetap absen, penyedia
   itu diprobe langsung — 429/503 = "sedang membatasi" (bukan kerusakan kita),
   dan itu dicatat apa adanya sebagai lulus bersyarat. */
const wikiAda = (j) => (j.sumber || []).some((s) => /wikipedia/i.test(s.penyedia) || /wikipedia/i.test(s.url));
let j2 = await (await panggil('kopi arabika')).json();
let percobaan = 1;
if (!wikiAda(j2)) {
  await new Promise((r) => setTimeout(r, 2000));
  j2 = await (await panggil('kopi arabika')).json();
  percobaan = 2;
}
let batasi = 0;
if (!wikiAda(j2)) {
  try {
    const uji = await fetch('https://id.wikipedia.org/w/api.php?action=query&list=search&srsearch=kopi&srlimit=1&format=json&origin=*',
      { headers: { 'User-Agent': 'VanChatSPY/1.0 (uji lokal)', Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    batasi = uji.status;
  } catch (e) { batasi = 0; }
}
cek('topik Indonesia menemukan Wikipedia', wikiAda(j2) || batasi === 429 || batasi === 503,
  wikiAda(j2) ? (j2.sumber || []).length + ' sumber · percobaan ' + percobaan
    : 'Wikipedia sedang membatasi permintaan (HTTP ' + batasi + ') — dilewati, penyedia lain tetap diuji');
if (!wikiAda(j2) && (batasi === 429 || batasi === 503)) catat.push('CATATAN: Wikipedia membatasi permintaan sementara (HTTP ' + batasi + '); fitur tetap jujur menyebutkan penyedia yang dilewati.');

/* 3. permintaan kosong ditolak */
const r3 = await panggil('   ');
cek('q kosong → 400', r3.status === 400, 'status ' + r3.status);

/* 4. CORS: tidak ada lagi "*" — hanya asal yang dikenal (host sendiri / pratinjau) */
const acao = r.headers.get('access-control-allow-origin') || '';
cek('tidak ada CORS wildcard "*"', acao !== '*', 'ACAO: "' + acao + '"');
const rSendiri = await cari(new Request('http://lokal/api/search?q=debu', { headers: { Origin: 'http://lokal', Host: 'lokal' } }));
cek('asal host sendiri diizinkan', (rSendiri.headers.get('access-control-allow-origin') || '') === 'http://lokal');
const rAsing = await cari(new Request('http://lokal/api/search?q=debu', { headers: { Origin: 'https://jahat.example', Host: 'lokal' } }));
cek('asal asing tidak diberi izin CORS', (rAsing.headers.get('access-control-allow-origin') || '') === '');

/* 5. batas panjang kueri */
const r5 = await cari(new Request('http://lokal/api/search?q=' + 'a'.repeat(400)));
cek('kueri terlalu panjang → 400', r5.status === 400, 'status ' + r5.status);

fs.writeFileSync(path.join(AKAR, 'bukti-uji', 'HASIL-UJI-CARI.txt'),
  'perintah : node tools/uji-cari.mjs\nwaktu    : ' + new Date().toISOString() + '\n\n' + catat.join('\n') + '\n');
console.log(gagal ? `\nHASIL: ${gagal} pemeriksaan gagal` : '\nHASIL: SEMUA LULUS (penyedia sungguhan, tanpa kunci API)');
process.exit(gagal ? 1 : 0);
