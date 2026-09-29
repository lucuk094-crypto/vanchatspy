/*
 * cek-9router.mjs — memeriksa 9Router di komputer sendiri, lalu menyiapkan
 * pengaturan supaya Van Chat.SPY memakai AI dari 9Router.
 *
 * JALANKAN DI KOMPUTER KAMU (bukan di server), setelah 9Router jalan:
 *   1. buka CMD / terminal
 *   2. jalankan 9Router:        npx 9router        (atau: 9router)
 *      → dashboard terbuka di http://localhost:20128/dashboard
 *   3. ambil API key di dashboard (Settings → API Keys) — boleh dikosongkan
 *      kalau 9Router kamu tidak mewajibkan kunci (REQUIRE_API_KEY=false)
 *   4. jalankan:
 *        node tools/cek-9router.mjs
 *        node tools/cek-9router.mjs --key sk-xxxx --url http://localhost:20128/v1
 *
 * Yang diperiksa (apa adanya, tanpa menebak):
 *   • GET  /v1/models          → daftar model yang benar-benar terdaftar
 *   • POST /v1/chat/completions → jawaban biasa
 *   • POST /v1/chat/completions (stream) → jawaban mengalir (SSE)
 *   • POST dengan gambar       → apakah model bisa melihat gambar
 * Hasilnya ditulis ke tools/9router.json, yang otomatis dipakai
 * tools/server-uji.mjs pada saat dijalankan.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function ambilArg(nama, bawaan) {
  const i = process.argv.indexOf('--' + nama);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : bawaan;
}
const URL_DASAR = String(ambilArg('url', process.env.ROUTER_URL || 'http://localhost:20128/v1')).replace(/\/+$/, '');
const KUNCI = String(ambilArg('key', process.env.ROUTER_API_KEY || '')).trim();

const tulis = (s) => console.log(s);
const kepala = () => {
  const h = { 'Content-Type': 'application/json' };
  if (KUNCI) h.Authorization = 'Bearer ' + KUNCI;
  return h;
};
const waktu = (ms) => (ms / 1000).toFixed(1) + ' detik';

let gagal = 0;
const cek = (nama, benar, ket) => {
  tulis((benar ? '  ✓ ' : '  ✗ ') + nama + (ket ? ' — ' + ket : ''));
  if (!benar) gagal++;
};

/* gambar uji: latar merah + lingkaran putih + batang biru (PNG sah) */
const PNG_UJI = 'iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAADs0lEQVR42u3csVHrQBRAUbzjOqTAdZC4cFViB6ISEkICZrDxontO9DNg9109mWH+6bYsb1A1HAECAAGAAEAAIAAQAAgABAACAAGAAEAAIAAQAAgABAACAAGAAEAAIAAQAMzl7Age67psz/4S28fVOdsAIAAQAAgABAACAAGAAEAAIAAQAAgABAACAAEgABAACAAEAAIAAYAAQAAgABAAHIr/Ge4xLvv+9a/3+599rfu6OnkBTDD0E3wDYhBAZe6tBQGYeyUIwOj/4NuWgQByoy8DARh9GQjA6MtAAEZfBgIw+jL4nj+FKE6/n90GcP1WQXsDmH6nEd0ARt8q6G4A0+98ugGYfqcUfQUy+l6HuhvA9Du3bgCm3+l1AzD9zrAbgOl3kt0ATL/z7AZg+p1qNwDT72y7AZh+J9wNwPQ7524Apt9pdwMw/c7cKxAkA/D4d/LdAEy/8+8GYPrdglcgSAbg8e8uugGYfjfiFQiSAXj8u5duAKbf7XgFgmQAHv/uyAaAZAAe/27KBoBkAB7/loANAMkAPP4tARsAkgF4/FsCNgAkA/D4twRsABAA1ALw/uMtyAYAAUAtAO8/3oJsABAACABCAfgA4GOADQACAAFAKAAfAHwMsAFAACAAEAAIAAQARw7A70CPbbb7tQGwAUAAIAAQAAgABAACAAGAAEAAIAAQAAgABAACAAH82n1d3cqBzXa/NgA2AAgABAACAAGAAF7Db0KPasKbtQGwAUAAIAAvi7Tu1AbABgABgAC8MtK6TRsAGwAEYG8SvEcbABsABGB7ErxBGwAbwCOE6t3ZANgAHiRUb80GwAbwOKF6XzYANoCHCtWbsgGwATxaqN6RDYAN4AFD9XaGU6Z8L16B8ArkYUP1RoYTp3wXXoHwCuTBQ/UWhtOnfP7DHVA+eZ8B8BnAo4jqmQ/3Qfm0h1uhfM7D3VA+4eGGKJ/tcE+UT3W4LcrnOdwZ5ZMcbo7yGQ73R/n0hlukfG7n1F1e9t1YG/3cBrAKnJIANOB8wq9AXoeMvg3gvp2GDWAVGH0bwAT42W2A9Cow+gKIZmD0BRDNwOgLIJqB0RdANAOjL4BoBkZfAE+Zp8lLMPcCKJZg7gXwypl7SQyGXgDzxbBs5v4f8acQCAAEAAIAAYAAQAAgABAACAAEAAIAAYAAQAAgABAACAAEAAIAAYAAQAAgABAATOF0WxangA0AAgABgABAACAAEAAIAAQAAgABgABAACAAEAAIAAQAAgABgABAACAAmMgncSZChSCaxNAAAAAASUVORK5CYII=';

tulis('══ memeriksa 9Router ══');
tulis('  alamat : ' + URL_DASAR);
tulis('  kunci  : ' + (KUNCI ? KUNCI.slice(0, 6) + '…' + KUNCI.slice(-4) : '(tanpa kunci)'));

/* 1. daftar model */
let model = [];
try {
  const t0 = Date.now();
  const r = await fetch(URL_DASAR + '/models', { headers: kepala(), signal: AbortSignal.timeout(15000) });
  const j = await r.json();
  model = (j.data || j.models || []).map((m) => String((m && (m.id || m.name)) || '')).filter(Boolean);
  cek('daftar model terbaca (GET /v1/models)', r.ok && model.length > 0, r.status + ' · ' + model.length + ' model · ' + waktu(Date.now() - t0));
  if (model.length) {
    tulis('   contoh model: ' + model.slice(0, 6).join(', ') + (model.length > 6 ? ' …' : ''));
  }
} catch (e) {
  cek('daftar model terbaca (GET /v1/models)', false, String(e.message || e));
  tulis('');
  tulis('9Router-nya belum bisa dihubungi. Yang perlu dilakukan di CMD/terminal:');
  tulis('  1) npm install -g 9router      (sekali saja)');
  tulis('  2) 9router                     → tunggu "Server ready" + dashboard terbuka');
  tulis('  3) buka http://localhost:20128/dashboard → sambungkan penyedia (mis. Kiro/OpenCode gratis)');
  tulis('  4) jalankan ulang: node tools/cek-9router.mjs');
  process.exit(1);
}

/* 2. pilih model untuk tiap mode berdasarkan nama (sama seperti di aplikasi) */
const COCOK = {
  fast: /flash|mini|nano|haiku|sante|lightning|lite|turbo|small|instant/i,
  think: /think|reason|sonnet|glm|kimi|qwen|deepseek|pro|plus|large/i,
  deep: /pro|opus|sonnet|max|ultra|glm|kimi|deepseek|r1|o3|o4|gpt-5|gpt-4/i,
  expert: /opus|pro|max|ultra|o3|o4|gpt-5|gemini|claude|sonnet/i,
};
function pilih(mode) {
  const kena = model.filter((m) => COCOK[mode].test(m));
  return kena[0] || model[0];
}
const pilihan = { fast: pilih('fast'), think: pilih('think'), deep: pilih('deep'), expert: pilih('expert') };
const visiKandidat = model.filter((m) => /vl|vision|omni|multimodal|gemini|gpt-4|gpt-5|sonnet|claude|dots|qwen.*vl|llava|pixtral/i.test(m));
pilihan.visi = visiKandidat[0] || pilihan.think;
tulis('  pilihan model → kilat: ' + pilihan.fast + ' · berpikir: ' + pilihan.think + ' · mendalam: ' + pilihan.deep + ' · expert: ' + pilihan.expert);
if (visiKandidat.length) tulis('  model bisa melihat gambar: ' + visiKandidat.slice(0, 3).join(', '));

/* 3. percakapan biasa */
const minta = (isi, stream) => fetch(URL_DASAR + '/chat/completions', {
  method: 'POST', headers: kepala(),
  body: JSON.stringify(isi),
  signal: AbortSignal.timeout(120000),
});
try {
  const t0 = Date.now();
  const r = await minta({ model: pilihan.fast, messages: [{ role: 'user', content: 'Balas satu kata: siap' }], max_tokens: 20, stream: false });
  const j = await r.json();
  const teks = ((j.choices || [])[0] || {}).message ? j.choices[0].message.content : '';
  cek('jawaban biasa (POST /v1/chat/completions)', r.ok && !!String(teks).trim(), waktu(Date.now() - t0) + ' · "' + String(teks).trim().slice(0, 40) + '"');
} catch (e) {
  cek('jawaban biasa (POST /v1/chat/completions)', false, String(e.message || e));
}

/* 4. jawaban mengalir */
try {
  const t0 = Date.now();
  const r = await minta({ model: pilihan.fast, messages: [{ role: 'user', content: 'Hitung 2+3, jawab angkanya saja.' }], max_tokens: 30, stream: true });
  const teks = await r.text();
  const potongan = (teks.match(/^data: /gm) || []).length;
  cek('jawaban mengalir (stream SSE)', r.ok && potongan > 0, potongan + ' potongan · ' + waktu(Date.now() - t0));
} catch (e) {
  cek('jawaban mengalir (stream SSE)', false, String(e.message || e));
}

/* 5. melihat gambar (hanya kalau ada model yang mendukung) */
try {
  const r = await minta({
    model: pilihan.visi,
    max_tokens: 60,
    stream: false,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Sebutkan warna latar dan bentuk yang terlihat. Maksimal 12 kata.' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,' + PNG_UJI } },
      ],
    }],
  });
  const j = await r.json();
  const teks = String((((j.choices || [])[0] || {}).message || {}).content || '');
  const benar = /merah|red/i.test(teks);
  cek('melihat gambar (vision)', r.ok && benar, benar ? 'menyebut warna dengan benar' : (r.ok ? 'jawaban: ' + teks.slice(0, 60) : 'HTTP ' + r.status));
  if (!benar) tulis('   (kalau model ini tidak bisa melihat, pilih model lain di Setelan → Model AI; aplikasi tidak akan mengaku bisa melihat)');
} catch (e) {
  cek('melihat gambar (vision)', false, String(e.message || e));
}

/* 6. simpan pengaturan */
const berkas = path.join(AKAR, 'tools', '9router.json');
fs.writeFileSync(berkas, JSON.stringify({
  url: URL_DASAR,
  kunci: KUNCI,
  model: pilihan,
  jumlahModel: model.length,
  dicek: new Date().toLocaleString('id-ID'),
}, null, 2) + '\n');

tulis('');
tulis((gagal ? 'HASIL: ' + gagal + ' pemeriksaan gagal' : 'HASIL: SEMUA LULUS — 9Router siap dipakai') );
tulis('pengaturan disimpan di: tools/9router.json');
tulis('');
tulis('LANGKAH BERIKUTNYA — jalankan web-nya (masih di terminal yang sama):');
tulis('  node tools/server-uji.mjs');
tulis('  → buka http://127.0.0.1:8131/  ·  Setelan → Model AI untuk memilih model 9Router');
process.exit(gagal ? 1 : 0);
