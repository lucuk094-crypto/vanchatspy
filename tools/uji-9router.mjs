/*
 * uji-9router.mjs — membuktikan Van Chat.SPY bisa memakai 9Router
 * (https://rqacwx8.abc-tunnel.us — gateway multi-model, protokol OpenAI-compatible).
 *
 * Contoh panggilan resmi penyedianya:
 *   curl https://rqacwx8.abc-tunnel.us/v1/chat/completions \
 *     -H "Authorization: Bearer $NINE_API_KEY" -H "Content-Type: application/json" \
 *     -d '{"model":"kr/claude-haiku-4.5","messages":[{"role":"user","content":"Hello"}]}'
 *
 * Yang diperiksa (tanpa kuota — gateway ditiru oleh tools/mock-openai.mjs):
 *   1. nama penyedia "9router" sudah kenal alamat bawaannya (tanpa AI_BASE_URL)
 *   2. daftar model dibaca dari penyedia itu sendiri (agnes-*, bukan daftar bawaan)
 *   3. percakapan biasa lewat /v1/chat/completions
 *   4. perintah bentuk ("tepat tiga kata") tetap dipatuhi
 *   5. jawaban mengalir (SSE) bekerja
 *   6. foto benar-benar terkirim dan "dilihat"
 *   7. AI Builder menerima halaman dari penyedia yang sama
 *   8. kunci salah/kosong → jawaban jujur "kunci ditolak" (401 kunci:true), bukan "sibuk"
 *   9. penyedia menyala BELAKANGAN → web aktif sendiri tanpa di-restart
 *
 *   node tools/uji-9router.mjs          (RIUH=1 untuk melihat log anak proses)
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { penyediaTeks } from '../api/_ai.js';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT_APP = 8137;
const PORT_APP_SALAH = 8138;
const PORT_PENYEDIA = 20150;
const KUNCI = 'kunci-9router-uji';
const URL_APP = 'http://127.0.0.1:' + PORT_APP + '/';
const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));

const catatan = [];
const tulis = (s) => { console.log(s); catatan.push(s); };
let gagal = 0;
const cek = (nama, benar, ket) => {
  tulis((benar ? '  ✓ ' : '  ✗ ') + nama + (ket ? ' — ' + ket : ''));
  if (!benar) gagal++;
};

const proses = [];
function jalankan(nama, argv, env = {}) {
  const p = spawn('node', [path.join(AKAR, argv[0]), ...argv.slice(1)], { cwd: AKAR, env: { ...process.env, ...env } });
  const alir = (d) => { if (process.env.RIUH) process.stdout.write('[' + nama + '] ' + d); };
  p.stdout.on('data', alir); p.stderr.on('data', alir);
  proses.push(p);
  return p;
}

/* PNG kecil: latar merah, lingkaran putih, batang biru */
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAADs0lEQVR42u3csVHrQBRAUbzjOqTAdZC4cFViB6ISEkICZrDxontO9DNg9109mWH+6bYsb1A1HAECAAGAAEAAIAAQAAgABAACAAGAAEAAIAAQAAgABAACAAGAAEAAIAAQAMzl7Age67psz/4S28fVOdsAIAAQAAgABAACAAGAAEAAIAAQAAgABAACAAEgABAACAAEAAIAAYAAQAAgABAAHIr/Ge4xLvv+9a/3+599rfu6OnkBTDD0E3wDYhBAZe6tBQGYeyUIwOj/4NuWgQByoy8DARh9GQjA6MtAAEZfBgIw+jL4nj+FKE6/n90GcP1WQXsDmH6nEd0ARt8q6G4A0+98ugGYfqcUfQUy+l6HuhvA9Du3bgCm3+l1AzD9zrAbgOl3kt0ATL/z7AZg+p1qNwDT72y7AZh+J9wNwPQ7524Apt9pdwMw/c7cKxAkA/D4d/LdAEy/8+8GYPrdglcgSAbg8e8uugGYfjfiFQiSAXj8u5duAKbf7XgFgmQAHv/uyAaAZAAe/27KBoBkAB7/loANAMkAPP4tARsAkgF4/FsCNgAkA/D4twRsABAA1ALw/uMtyAYAAUAtAO8/3oJsABAACABCAfgA4GOADQACAAFAKAAfAHwMsAFAACAAEAAIAAQARw7A70CPbbb7tQGwAUAAIAAQAAgABAACAAGAAEAAIAAQAAgABAACAAH82n1d3cqBzXa/NgA2AAgABAACAAGAAF7Db0KPasKbtQGwAUAAIAAvi7Tu1AbABgABgAC8MtK6TRsAGwAEYG8SvEcbABsABGB7ErxBGwAbwCOE6t3ZANgAHiRUb80GwAbwOKF6XzYANoCHCtWbsgGwATxaqN6RDYAN4AFD9XaGU6Z8L16B8ArkYUP1RoYTp3wXXoHwCuTBQ/UWhtOnfP7DHVA+eZ8B8BnAo4jqmQ/3Qfm0h1uhfM7D3VA+4eGGKJ/tcE+UT3W4LcrnOdwZ5ZMcbo7yGQ73R/n0hlukfG7n1F1e9t1YG/3cBrAKnJIANOB8wq9AXoeMvg3gvp2GDWAVGH0bwAT42W2A9Cow+gKIZmD0BRDNwOgLIJqB0RdANAOjL4BoBkZfAE+Zp8lLMPcCKJZg7gXwypl7SQyGXgDzxbBs5v4f8acQCAAEAAIAAYAAQAAgABAACAAEAAIAAYAAQAAgABAACAAEAAIAAYAAQAAgABAATOF0WxangA0AAgABgABAACAAEAAIAAQAAgABgABAACAAEAAIAAQAAgABgABAACAAmMgncSZChSCaxNAAAAAASUVORK5CYII=';

/* model tiruan bergaya 9Router (keluarga yang benar-benar ada di router itu) */
const MODEL_9ROUTER = [
  'kr/claude-haiku-4.5',
  'kr/claude-sonnet-4.5',
  'kr/claude-sonnet-4.5-agentic',
  'kr/auto',
  'cx/gpt-6-sol',
  'FreeTiers',
];

try {
  tulis('══ uji: Van Chat.SPY memakai 9Router (rqacwx8.abc-tunnel.us) ══');

  /* 1. nama penyedia dikenali + alamat bawaan benar (tanpa AI_BASE_URL) */
  const p = penyediaTeks({ AI_PROVIDER: '9router' });
  tulis('   penyediaTeks({AI_PROVIDER:"9router"}) → ' + JSON.stringify({ dasar: p.dasar, gaya: p.gaya, router: p.router }));
  cek('alamat bawaan 9Router sudah dikenal', p.dasar === 'https://rqacwx8.abc-tunnel.us/v1', p.dasar);
  cek('gaya protokol = openai (Authorization: Bearer)', p.gaya === 'openai');
  cek('daftar model diambil dari penyedia itu sendiri', p.router === true);

  /* 2. jalankan tiruan 9Router + server aplikasi */
  jalankan('9router', ['tools/mock-openai.mjs', '--port', String(PORT_PENYEDIA), '--butuh-kunci', KUNCI,
    '--model-daftar', MODEL_9ROUTER.join(',')]);
  jalankan('app', ['tools/server-uji.mjs'], {
    PORT: String(PORT_APP), AI_PROVIDER: '9router',
    AI_BASE_URL: 'http://127.0.0.1:' + PORT_PENYEDIA + '/v1', AI_API_KEY: KUNCI,
  });
  await tunggu(1700);

  let info = await (await fetch(URL_APP + 'api/chat')).json();
  for (let i = 0; i < 12 && !(info.penyedia && info.penyedia.modelDariRouter); i++) {
    await tunggu(1000);
    info = await (await fetch(URL_APP + 'api/chat')).json();
  }
  tulis('   penyedia: ' + JSON.stringify(info.penyedia));
  const semuaModel = [].concat(info.daftarModel.fast, info.daftarModel.think, info.daftarModel.deep, info.daftarModel.expert);
  tulis('   model dari penyedia: ' + [...new Set(semuaModel)].slice(0, 6).join(', '));
  cek('penyedia dilaporkan sebagai 9router', info.penyedia.nama === '9router');
  cek('daftar model berasal dari penyedia itu (kr/*)', semuaModel.some((m) => /^kr\//.test(m)), semuaModel.slice(0, 3).join(','));
  cek('tidak ada model penyedia lain yang nyasar', !semuaModel.some((m) => /^(openrouter|agnes|gpt-6-luna)/i.test(m)), semuaModel.slice(0, 3).join(','));

  const kirim = (body) => fetch(URL_APP + 'api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  /* 3 & 4. percakapan + perintah bentuk */
  const j1 = await (await kirim({ prompt: 'Balas HANYA dengan tiga kata: apa itu kopi?', stream: false })).json();
  tulis('   jawaban: "' + String(j1.text || j1.pesan).slice(0, 70) + '"');
  cek('percakapan lewat /v1/chat/completions', j1.ok === true);
  cek('perintah bentuk "tepat tiga kata" dipatuhi', /^kopi adalah minuman\.?$/i.test(String(j1.text || '').trim()), String(j1.text || j1.pesan).slice(0, 50));

  /* 5. jawaban mengalir */
  const rStream = await kirim({ prompt: 'Sebut satu fakta singkat tentang kopi.', stream: true });
  const sse = await rStream.text();
  const potongan = sse.split('\n\n').filter((b) => b.startsWith('data: ') && !b.includes('[DONE]'));
  const isi = potongan.map((b) => { try { return JSON.parse(b.slice(6)); } catch { return null; } })
    .filter(Boolean).map((x) => (x.choices && x.choices[0] && x.choices[0].delta && x.choices[0].delta.content) || '').join('');
  tulis('   aliran: ' + potongan.length + ' potongan → "' + isi.slice(0, 55) + '"');
  cek('jawaban mengalir (SSE) bekerja', rStream.ok && isi.length > 5 && /\[DONE\]/.test(sse));

  /* 6. visi */
  const j2 = await (await kirim({ prompt: 'Apa warna latar dan bentuk apa yang ada di gambar ini? Jawab singkat.', stream: false, gambar: ['data:image/png;base64,' + PNG] })).json();
  tulis('   visi: "' + String(j2.text || j2.pesan).slice(0, 85) + '"');
  cek('foto terkirim & "dilihat"', /merah/i.test(String(j2.text || '')) && /lingkaran|batang|biru/i.test(String(j2.text || '')));

  /* 7. AI Builder */
  const bgn = await (await fetch(URL_APP + 'api/builder', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Buat halaman sambutan sederhana.', mode: 'think' }),
  })).json();
  tulis('   builder: ' + (bgn.ok ? bgn.bytes + ' bita dari ' + bgn.model : 'gagal — ' + String(bgn.pesan).slice(0, 60)));
  cek('AI Builder jalan lewat penyedia yang sama', bgn.ok === true && /<!DOCTYPE html/i.test(String(bgn.html || '')));

  /* 8b. penyedia menyala belakangan → web pulih sendiri tanpa restart */
  {
    const appLambat = 'http://127.0.0.1:' + (PORT_APP + 3) + '/api/chat';
    jalankan('app-tanpa-penyedia', ['tools/server-uji.mjs'], {
      PORT: String(PORT_APP + 3), AI_PROVIDER: '9router',
      AI_BASE_URL: 'http://127.0.0.1:' + (PORT_PENYEDIA + 1) + '/v1', AI_API_KEY: KUNCI,
    });
    await tunggu(1700);
    const pra = await (await fetch(appLambat, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'halo', stream: false }),
    })).json();
    tulis('   sebelum penyedia hidup → "' + String(pra.pesan || '').slice(0, 90) + '"');
    cek('sebelum hidup dijawab jujur (bukan jawaban palsu)', pra.ok === false && /Tidak bisa menghubungi penyedia AI/i.test(String(pra.pesan || '')));

    jalankan('9router-susulan', ['tools/mock-openai.mjs', '--port', String(PORT_PENYEDIA + 1), '--butuh-kunci', KUNCI,
      '--model-daftar', MODEL_9ROUTER.join(',')]);
    const t0 = Date.now();
    let siap = false;
    for (let i = 0; i < 15; i++) {
      await tunggu(1000);
      const j = await (await fetch(appLambat, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Sebut satu fakta singkat tentang kopi.', stream: false }),
      })).json();
      if (j && j.ok && String(j.text || '').length > 5) { siap = true; break; }
    }
    tulis('   setelah penyedia hidup → web jalan dalam ' + ((Date.now() - t0) / 1000).toFixed(1) + ' detik (tanpa restart)');
    cek('web aktif sendiri tanpa di-restart setelah penyedia normal', siap);
  }

  /* 8. kunci salah → jujur "kunci ditolak", bukan "sibuk" */
  jalankan('app-kunci-salah', ['tools/server-uji.mjs'], {
    PORT: String(PORT_APP_SALAH), AI_PROVIDER: '9router',
    AI_BASE_URL: 'http://127.0.0.1:' + PORT_PENYEDIA + '/v1', AI_API_KEY: 'sk-salah',
  });
  await tunggu(1700);
  const j3 = await (await fetch('http://127.0.0.1:' + PORT_APP_SALAH + '/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'halo', stream: false }),
  })).json();
  tulis('   kunci salah → HTTP pesan: "' + String(j3.pesan || '').slice(0, 120) + '"');
  cek('kunci salah dijawab jujur (bukan "semua model sibuk")', j3.ok === false && j3.kunci === true && /kunci.*ditolak/i.test(String(j3.pesan || '')));
} catch (e) {
  gagal++;
  tulis('GAGAL: ' + e.message);
} finally {
  proses.forEach((p) => { try { p.kill('SIGTERM'); } catch (e) {} });
}

const kepala = 'UJI PENYEDIA 9ROUTER — alur aplikasi lewat router tiruan\n' + new Date().toLocaleString('id-ID') + '\n' + '─'.repeat(58) + '\n';
fs.writeFileSync(path.join(AKAR, 'bukti-uji', 'HASIL-UJI-9ROUTER.txt'), kepala + catatan.join('\n') + '\n\n'
  + (gagal ? 'HASIL: GAGAL — ' + gagal + ' pemeriksaan' : 'HASIL: SEMUA LULUS') + '\n');
console.log(gagal ? '\nHASIL: GAGAL — ' + gagal + ' pemeriksaan' : '\nHASIL: SEMUA LULUS');
process.exit(gagal ? 1 : 0);
