/*
 * uji-9router.mjs — membuktikan Van Chat.SPY bisa berjalan DENGAN MENGANDALKAN
 * router AI lokal (9Router). Di sandbox ini 9Router asli tidak ada, jadi dipakai
 * tiruan (tools/mock-9router.mjs) yang berbicara protokol OpenAI-compatible
 * sama seperti 9Router: /v1/models + /v1/chat/completions (biasa & mengalir).
 *
 * Yang diperiksa:
 *   1. server uji memuat tools/9router.json dan melaporkan penyedia 9Router
 *   2. daftar model di Setelan berasal dari router (/v1/models), bukan dari OpenRouter
 *   3. percakapan mengalir lewat router dan jawabannya benar
 *   4. perintah bentuk ("tepat tiga kata") tetap dipatuhi
 *   5. jawaban kode (hanya kode) lewat router
 *   6. AI Builder menerima JSON proyek dari router
 *   7. foto benar-benar dikirim ke router dan model "melihatnya"
 *   8. kalau router mati → pesan jujur "Tidak bisa menghubungi 9Router …"
 *   9. nol galat JS
 *
 *   node tools/uji-9router.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

/* Puppeteer dipakai untuk uji di browser sungguhan.
   Di komputer sendiri cukup:  npm i puppeteer   (di folder proyek).
   Di sandbox uji, puppeteer bisa ada di /tmp/u — lewat PUPPETEER_DIR. */
const PUPPETEER_DIR = process.env.PUPPETEER_DIR || '/tmp/u';
const puppeteer = (() => {
  const kandidat = [createRequire(import.meta.url), createRequire(PUPPETEER_DIR + '/package.json')];
  for (const r of kandidat) { try { return r('puppeteer'); } catch (e) {} }
  console.error('Puppeteer tidak ditemukan. Pasang dulu:  npm i puppeteer   (di folder proyek ini)');
  process.exit(2);
})();

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOT = path.join(AKAR, 'bukti-uji');
const CHROME = process.env.CHROME || require('puppeteer').executablePath();
const PORT_APP = 8132;
const PORT_ROUTER = 20128;
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
function jalan(nama, berkas, arg = [], env = {}) {
  const p = spawn('node', [berkas, ...arg], { cwd: AKAR, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', (d) => process.env.RIUH ? process.stdout.write('[' + nama + '] ' + d) : null);
  p.stderr.on('data', (d) => process.stdout.write('[' + nama + '!] ' + d));
  proses.push(p);
  return p;
}

/* gambar uji: latar merah + lingkaran putih + batang biru (PNG sah) */
const PNG_UJI = 'iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAADs0lEQVR42u3csVHrQBRAUbzjOqTAdZC4cFViB6ISEkICZrDxontO9DNg9109mWH+6bYsb1A1HAECAAGAAEAAIAAQAAgABAACAAGAAEAAIAAQAAgABAACAAGAAEAAIAAQAMzl7Age67psz/4S28fVOdsAIAAQAAgABAACAAGAAEAAIAAQAAgABAACAAEgABAACAAEAAIAAYAAQAAgABAAHIr/Ge4xLvv+9a/3+599rfu6OnkBTDD0E3wDYhBAZe6tBQGYeyUIwOj/4NuWgQByoy8DARh9GQjA6MtAAEZfBgIw+jL4nj+FKE6/n90GcP1WQXsDmH6nEd0ARt8q6G4A0+98ugGYfqcUfQUy+l6HuhvA9Du3bgCm3+l1AzD9zrAbgOl3kt0ATL/z7AZg+p1qNwDT72y7AZh+J9wNwPQ7524Apt9pdwMw/c7cKxAkA/D4d/LdAEy/8+8GYPrdglcgSAbg8e8uugGYfjfiFQiSAXj8u5duAKbf7XgFgmQAHv/uyAaAZAAe/27KBoBkAB7/loANAMkAPP4tARsAkgF4/FsCNgAkA/D4twRsABAA1ALw/uMtyAYAAUAtAO8/3oJsABAACABCAfgA4GOADQACAAFAKAAfAHwMsAFAACAAEAAIAAQARw7A70CPbbb7tQGwAUAAIAAQAAgABAACAAGAAEAAIAAQAAgABAACAAH82n1d3cqBzXa/NgA2AAgABAACAAGAAF7Db0KPasKbtQGwAUAAIAAvi7Tu1AbABgABgAC8MtK6TRsAGwAEYG8SvEcbABsABGB7ErxBGwAbwCOE6t3ZANgAHiRUb80GwAbwOKF6XzYANoCHCtWbsgGwATxaqN6RDYAN4AFD9XaGU6Z8L16B8ArkYUP1RoYTp3wXXoHwCuTBQ/UWhtOnfP7DHVA+eZ8B8BnAo4jqmQ/3Qfm0h1uhfM7D3VA+4eGGKJ/tcE+UT3W4LcrnOdwZ5ZMcbo7yGQ73R/n0hlukfG7n1F1e9t1YG/3cBrAKnJIANOB8wq9AXoeMvg3gvp2GDWAVGH0bwAT42W2A9Cow+gKIZmD0BRDNwOgLIJqB0RdANAOjL4BoBkZfAE+Zp8lLMPcCKJZg7gXwypl7SQyGXgDzxbBs5v4f8acQCAAEAAIAAYAAQAAgABAACAAEAAIAAYAAQAAgABAACAAEAAIAAYAAQAAgABAATOF0WxangA0AAgABgABAACAAEAAIAAQAAgABgABAACAAEAAIAAQAAgABgABAACAAmMgncSZChSCaxNAAAAAASUVORK5CYII=';

/* ── siapkan: tulis tools/9router.json (seperti hasil cek-9router.mjs) ── */
const berkasSetelan = path.join(AKAR, 'tools', '9router.json');
const setelanLama = fs.existsSync(berkasSetelan) ? fs.readFileSync(berkasSetelan, 'utf8') : null;
fs.writeFileSync(berkasSetelan, JSON.stringify({
  url: 'http://127.0.0.1:' + PORT_ROUTER + '/v1',
  kunci: 'kunci-uji-9router',
  model: { fast: 'oc/opencode-flash', think: 'if/glm-4.7', deep: 'kr/claude-sonnet-4.5', expert: 'cc/claude-opus-4-7', visi: 'vertex/gemini-3-flash' },
  dicek: 'uji otomatis',
}, null, 2) + '\n');

try {
  tulis('══ uji: Van Chat.SPY memakai AI dari 9Router (tiruan) ══');

  /* 1. jalankan tiruan 9Router + server aplikasi */
  const mock = jalan('9router', 'tools/mock-9router.mjs', ['--port', String(PORT_ROUTER), '--butuh-kunci', 'kunci-uji-9router']);
  const app = jalan('app', 'tools/server-uji.mjs', [], { PORT: String(PORT_APP), PENYEDIA_BERKAS: '9router' });
  await tunggu(1500);

  const siapMock = await fetch('http://127.0.0.1:' + PORT_ROUTER + '/v1/models', { headers: { Authorization: 'Bearer kunci-uji-9router' } })
    .then((r) => r.ok).catch(() => false);
  cek('tiruan 9Router siap menerima permintaan', siapMock);
  const siapApp = await fetch(URL_APP + 'api/health').then((r) => r.ok).catch(() => false);
  cek('server aplikasi jalan dengan penyedia 9Router', siapApp);

  /* 2. lapisan server: GET /api/chat harus melaporkan model DARI ROUTER
        (kalau aplikasi sempat memeriksa router sebelum router siap, tunggu sebentar —
        aplikasi mencoba lagi tiap ±5 detik, jadi tidak perlu di-restart) */
  let info = await (await fetch(URL_APP + 'api/chat')).json();
  for (let i = 0; i < 12 && !(info.penyedia && info.penyedia.modelDariRouter); i++) {
    await tunggu(1000);
    info = await (await fetch(URL_APP + 'api/chat')).json();
  }
  const semuaModel = [].concat(info.daftarModel.fast, info.daftarModel.think, info.daftarModel.deep, info.daftarModel.expert);
  tulis('   penyedia: ' + JSON.stringify(info.penyedia));
  tulis('   model dari router: ' + [...new Set(semuaModel)].slice(0, 6).join(', '));
  cek('daftar model berasal dari /v1/models router', semuaModel.some((m) => /^oc\/|^if\/|^kr\/|^cc\/|^gh\/|^vertex\//.test(m)));
  cek('tidak ada lagi model OpenRouter saat memakai 9Router', !semuaModel.some((m) => /:free$/.test(m)));
  cek('model visi dari router dikenali', (info.daftarVisi || []).some((m) => /gemini|claude|gpt/i.test(m)), (info.daftarVisi || []).join(', '));

  /* 3. cek langsung ke router (tanpa browser): jawaban + penegakan aturan bentuk */
  const langsung = await (await fetch(URL_APP + 'api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Balas HANYA dengan tiga kata: apa itu kopi?', stream: false }),
  })).json();
  tulis('   "tepat tiga kata" lewat 9Router → "' + langsung.text + '" (' + langsung.diperbaiki + ' perbaikan)');
  cek('perintah bentuk "tepat tiga kata" dipatuhi lewat router', /^kopi adalah minuman\.?$/i.test(String(langsung.text).trim()), langsung.text);

  const kode = await (await fetch(URL_APP + 'api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Tulis hanya kode Python singkat untuk menyapa.', stream: false }),
  })).json();
  cek('jawaban "hanya kode" lewat router', /```/.test(String(kode.text)) && String(kode.text).replace(/```[\s\S]*?```/g, '').trim().length < 40, String(kode.text).slice(0, 40));

  /* 4. browser: percakapan mengalir, visi, dan builder — semua lewat router */
  const browser = await puppeteer.launch({ headless: true, executablePath: CHROME, protocolTimeout: 120000, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const galat = [];
  page.on('pageerror', (e) => galat.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) galat.push('console: ' + m.text().slice(0, 130)); });

  await page.goto(URL_APP, { waitUntil: 'networkidle2' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2' });
  await tunggu(600);

  /* 4a. jawaban mengalir */
  await page.type('#ta', 'Sebutkan satu fakta singkat tentang kopi.');
  await page.click('#btnSend');
  await page.waitForFunction(() => {
    const ai = document.querySelectorAll('.msg.ai');
    if (!ai.length) return false;
    const b = ai[ai.length - 1].querySelector('.bub');
    return b && !b.querySelector('.tulis');
  }, { timeout: 60000 });
  const j1 = await page.evaluate(() => [...document.querySelectorAll('.msg.ai')].pop().querySelector('.bub').innerText.trim());
  tulis('   jawaban lewat router → "' + j1.slice(0, 80) + '"');
  cek('percakapan berjalan lewat 9Router', j1.length > 5);

  /* 4b. daftar model di Setelan berasal dari router */
  await page.evaluate(() => { location.hash = '#/settings'; });
  await tunggu(900);
  const opsi = await page.evaluate(() => [...document.querySelectorAll('#set18M_fast option')].map((o) => o.value).filter(Boolean));
  tulis('   pilihan model di Setelan: ' + opsi.slice(0, 6).join(', ') + (opsi.length > 6 ? ' …' : ''));
  cek('Setelan menawarkan model 9Router', opsi.some((v) => /^oc\/|^if\/|^kr\/|^cc\/|^gh\/|^vertex\//.test(v)), opsi.length + ' pilihan');

  /* 4c. visi: foto dikirim ke router */
  await page.evaluate(() => { location.hash = '#/'; });
  await tunggu(500);
  const FOTO = '/tmp/foto-9router.png';
  fs.writeFileSync(FOTO, Buffer.from(PNG_UJI, 'base64'));
  const input = await page.$('#fileIn');
  await input.uploadFile(FOTO);
  await page.waitForFunction(() => document.querySelectorAll('#attachList .lampiran').length > 0, { timeout: 15000 });
  await page.evaluate(() => { document.querySelector('#ta').value = ''; });
  await page.type('#ta', 'Apa warna latar dan bentuk apa yang ada di gambar ini? Jawab singkat.');
  await page.click('#btnSend');
  await page.waitForFunction(() => {
    const ai = document.querySelectorAll('.msg.ai');
    if (ai.length < 2) return false;
    const b = ai[ai.length - 1].querySelector('.bub');
    return b && !b.querySelector('.tulis');
  }, { timeout: 60000 });
  const jVisi = await page.evaluate(() => [...document.querySelectorAll('.msg.ai')].pop().querySelector('.bub').innerText.trim());
  tulis('   visi lewat router → "' + jVisi.slice(0, 90) + '"');
  cek('model melihat gambar lewat 9Router', /merah|red/i.test(jVisi) && /lingkaran|putih|circle|batang|biru/i.test(jVisi), jVisi.slice(0, 50));
  await page.screenshot({ path: path.join(SHOT, '57-9router-visi.png') });

  /* 4d. AI Builder memakai JSON dari router */
  await page.evaluate(() => { location.hash = '#/builder'; });
  await tunggu(800);
  await page.type('#bgnPrompt', 'Buat halaman kartu ulang tahun sederhana bernama KartuUlangTahun.');
  await page.click('#bgnMulai');
  await page.waitForFunction(() => /Siap deploy|masalah|gagal/i.test((document.querySelector('#bgnStatus') || {}).textContent || ''), { timeout: 90000 });
  await tunggu(800);
  const bgn = await page.evaluate(() => ({
    nama: document.querySelector('#bgnNama').textContent.trim(),
    berkas: [...document.querySelectorAll('#bgnPohon .ph-it span')].map((s) => s.textContent),
    status: document.querySelector('#bgnStatus').textContent.trim(),
    pratinjau: String((document.querySelector('#bgnPratinjau') || {}).srcdoc || '').length,
  }));
  tulis('   builder lewat router → "' + bgn.nama + '" · berkas ' + JSON.stringify(bgn.berkas) + ' · pratinjau ' + bgn.pratinjau + ' bita');
  cek('AI Builder menerima proyek dari 9Router', bgn.berkas.length >= 3 && bgn.pratinjau > 200, bgn.status.slice(0, 60));
  await page.screenshot({ path: path.join(SHOT, '58-9router-builder.png') });

  cek('tidak ada galat JS sepanjang uji', galat.length === 0, galat[0] || '');
  await browser.close();

  /* 5. router dimatikan (aplikasi tetap jalan) → pesan harus jujur */
  try { mock.kill('SIGTERM'); } catch (e) {}
  await tunggu(900);
  const appMati = await fetch(URL_APP + 'api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'halo', stream: false }),
  }).then((r) => r.json()).catch((e) => ({ pesan: String(e.message || e) }));
  tulis('   router dimatikan → pesan server: "' + String(appMati.pesan || '').slice(0, 140) + '"');
  cek('pesan jujur saat 9Router tidak jalan', /Tidak bisa menghubungi 9Router/i.test(String(appMati.pesan || '')) && /9router/i.test(String(appMati.pesan || '')), String(appMati.pesan || '').slice(0, 60));
} catch (e) {
  gagal++;
  tulis('GAGAL: ' + e.message);
} finally {
  proses.forEach((p) => { try { p.kill('SIGTERM'); } catch (e) {} });
  if (setelanLama === null) { try { fs.unlinkSync(berkasSetelan); } catch (e) {} }
  else fs.writeFileSync(berkasSetelan, setelanLama);
}

const kepala = 'UJI 9ROUTER (router AI lokal, tiruan untuk sandbox)\n' + new Date().toLocaleString('id-ID') + '\n' + '─'.repeat(58) + '\n';
fs.writeFileSync(path.join(SHOT, 'HASIL-UJI-9ROUTER.txt'), kepala + catatan.join('\n') + '\n\n'
  + (gagal ? 'HASIL: GAGAL — ' + gagal + ' pemeriksaan' : 'HASIL: SEMUA LULUS') + '\n');
console.log(gagal ? '\nHASIL: GAGAL — ' + gagal + ' pemeriksaan' : '\nHASIL: SEMUA LULUS');
process.exit(gagal ? 1 : 0);
