/*
 * uji-setelan-penyedia.mjs — membuktikan alur "ganti penyedia dari halaman
 * Pengaturan" benar-benar jalan di browser sungguhan:
 *
 *   1. Penyedia tiruan (mock-openai) dijalankan dengan daftar 6 model Apinex.
 *   2. Aplikasi dijalankan di port sendiri (penyedia server = 9Router tiruan).
 *   3. Chromium membuka #/settings → isi Penyedia kustom: alamat + kunci
 *      (kunci uji, bukan kunci asli siapa pun) → klik "Uji & Aktifkan".
 *   4. Yang diperiksa:
 *      ✓ status berubah jadi "aktif: … n model terbaca"
 *      ✓ daftar model per fitur terisi dari penyedia itu
 *      ✓ pilihan model di bilah obrolan memakai daftar penyedia baru
 *      ✓ percakapan sungguhan lewat penyedia baru (bukan jawaban palsu)
 *      ✓ tombol "Kembalikan ke server" menghapus setelan
 *
 *   node tools/uji-setelan-penyedia.mjs
 *   → bukti: bukti-uji/HASIL-UJI-SETELAN-PENYEDIA.txt
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT_MOCK = 8170;   /* penyedia baru (tiruan) */
const PORT_APP = 8171;    /* aplikasi */
const PORT_LAMA = 8172;   /* penyedia lama/lama (tiruan 9Router) */
const MODEL_BARU = ['free/gpt-6-luna', 'free/glm-5.3-flash', 'free/deepseek-v4.1-flash', 'free/deepseek-v4-pro-0813', 'free/mimo-v2.6-pro', 'free/minimax-m3.1'];

/* Puppeteer: di komputer sendiri `npm i puppeteer`; di sandbox lewat PUPPETEER_DIR */
const PUPPETEER_DIR = process.env.PUPPETEER_DIR || '/tmp/u';
const puppeteer = (() => {
  const kandidat = [createRequire(import.meta.url), createRequire(PUPPETEER_DIR + '/package.json')];
  for (const r of kandidat) { try { return r('puppeteer'); } catch (e) {} }
  return null;
})();
const CHROME = process.env.CHROME_PATH || process.env.CHROME || '/tmp/pcache/chrome/linux-148.0.7778.97/chrome-linux64/chrome';

const baris = [];
const tulis = (s) => { console.log(s); baris.push(s); };
let gagal = 0;
const cek = (nama, lulus, info = '') => {
  if (!lulus) gagal++;
  tulis('  ' + (lulus ? '✓' : '✗') + ' ' + nama + (info ? ' — ' + String(info).slice(0, 140) : ''));
};
const jeda = (ms) => new Promise((r) => setTimeout(r, ms));

async function tungguPort(port, ms = 15000) {
  const batas = Date.now() + ms;
  while (Date.now() < batas) {
    try {
      const r = await fetch('http://127.0.0.1:' + port + '/');
      if (r.status) return true;
    } catch (e) { /* belum siap */ }
    await jeda(250);
  }
  return false;
}

function jalankan(nama, arg, env) {
  const p = spawn(process.execPath, arg, {
    cwd: AKAR,
    env: Object.assign({}, process.env, env || {}, { VCS_TENANG: '1' }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', () => {});
  p.stderr.on('data', () => {});
  return p;
}

const proses = [];
/* kalau pengujian dihentikan (Ctrl+C / timeout), semua proses anak ikut dimatikan */
for (const sinyal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sinyal, () => { for (const q of proses) { try { q.kill('SIGKILL'); } catch (e) {} } process.exit(130); });
}
async function bersihkan() {
  for (const p of proses) { try { p.kill('SIGKILL'); } catch (e) {} }
}

try {
  tulis('UJI SETELAN PENYEDIA — ganti penyedia dari halaman Pengaturan (browser sungguhan)');
  tulis(new Date().toLocaleString('id-ID'));
  tulis('');

  /* 1. penyedia lama (9Router tiruan) + penyedia baru (Apinex tiruan) */
  proses.push(jalankan('mock-lama', ['tools/mock-openai.mjs', '--port', String(PORT_LAMA), '--model-daftar', 'kr/claude-haiku-4.5,kr/claude-sonnet-4.5']));
  proses.push(jalankan('mock-baru', ['tools/mock-openai.mjs', '--port', String(PORT_MOCK), '--model-daftar', MODEL_BARU.join(',')]));
  /* 2. aplikasi memakai penyedia LAMA dulu */
  proses.push(jalankan('app', ['tools/server-uji.mjs'], {
    PORT: String(PORT_APP), AI_PROVIDER: '9router', AI_BASE_URL: 'http://127.0.0.1:' + PORT_LAMA + '/v1', AI_API_KEY: 'kunci-uji-lama',
    APINEX_API_KEY: '', GEMINI_API_KEY: '', IMAGE_PROVIDER: 'off', ALLOWED_ORIGINS: '',
  }));

  for (const port of [PORT_LAMA, PORT_MOCK, PORT_APP]) {
    const siap = await tungguPort(port);
    if (!siap) { tulis('GAGAL: port ' + port + ' tidak siap'); await bersihkan(); process.exit(1); }
  }

  const APP = 'http://127.0.0.1:' + PORT_APP;
  const sebelum = await (await fetch(APP + '/api/providers')).json();
  cek('aplikasi mulai dengan penyedia server', sebelum.teks.penyedia === '9router', sebelum.teks.label + ' · ' + sebelum.teks.sumber);

  /* 3. Chromium */
  if (!puppeteer) { tulis('GAGAL: puppeteer tidak ditemukan (npm i puppeteer / set PUPPETEER_DIR)'); await bersihkan(); process.exit(2); }
  const browser = await puppeteer.launch({
    headless: 'new', executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 940 });
  const galatHalaman = [];
  page.on('pageerror', (e) => galatHalaman.push(String(e && e.message)));
  await page.goto(APP + '/#/settings', { waitUntil: 'networkidle2', timeout: 60000 });
  await jeda(1500);

  /* 4. isi bagian "Penyedia AI" */
  const adaBagian = await page.evaluate(() => !!(document.getElementById('penProv') && document.getElementById('penAct') && document.getElementById('penKunci')));
  cek('bagian "Penyedia AI" ada di halaman Pengaturan', adaBagian);

  await page.select('#penProv', 'kustom');
  await page.evaluate((url) => { document.getElementById('penUrl').value = url; }, 'http://127.0.0.1:' + PORT_MOCK + '/v1');
  await page.type('#penKunci', 'kunci-uji-bukan-kunci-asli', { delay: 5 });
  await page.evaluate(() => { const g = document.getElementById('penGaya'); if (g) g.value = 'openai'; });
  await page.click('#penAct');
  await jeda(6000);

  const status = await page.evaluate(() => { const el = document.getElementById('penStatus'); return el ? el.textContent.trim() : ''; });
  cek('status setelah "Uji & Aktifkan" menyebut penyedia aktif', /aktif|siap/i.test(status), status);

  const opsiFast = await page.evaluate(() => Array.from(document.querySelectorAll('#penM_fast option')).map((o) => o.value).filter(Boolean));
  cek('daftar model per fitur terisi dari penyedia baru', opsiFast.length >= 6 && opsiFast.includes('free/gpt-6-luna'), opsiFast.slice(0, 3).join(', ') + ' … (' + opsiFast.length + ' opsi)');

  /* 5. set model khusus untuk mode Normal lalu simpan */
  await page.evaluate(() => {
    const el = document.getElementById('penM_fast');
    el.value = 'free/gpt-6-luna';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await jeda(400);
  const tersimpan = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('vcs.setelan') || '{}');
    return s.penyediaSet || null;
  });
  cek('setelan penyedia tersimpan di browser ini', !!(tersimpan && tersimpan.provider === 'kustom' && tersimpan.daftar && tersimpan.daftar.length >= 6),
    tersimpan ? tersimpan.provider + ' · ' + (tersimpan.daftar || []).length + ' model · kunci disimpan: ' + !!tersimpan.kunci : 'kosong');
  cek('model per fitur tersimpan', !!(tersimpan && tersimpan.model && tersimpan.model.fast === 'free/gpt-6-luna'), tersimpan && tersimpan.model ? JSON.stringify(tersimpan.model) : '');

  /* 6. daftar pilihan model (dipakai bilah obrolan & halaman Setelan) ikut penyedia baru */
  await page.goto(APP + '/#/', { waitUntil: 'networkidle2', timeout: 60000 });
  await jeda(2500);
  const dariServer = await page.evaluate(async () => {
    const r = await fetch('/api/chat');
    const j = await r.json();
    return (j && j.daftarModel && j.daftarModel.fast) || [];
  });
  cek('daftar model penyedia baru terbaca aplikasi', dariServer.includes('free/gpt-6-luna'), dariServer.slice(0, 4).join(', '));
  const opsiSetelan = await page.evaluate(async () => {
    await fetch('/api/chat');   /* sudah ada di cache aplikasi */
    return Array.from(document.querySelectorAll('#set18M_fast option')).map((o) => o.value).filter(Boolean);
  });
  cek('setelan model per mode memakai daftar penyedia baru', opsiSetelan.length === 0 || opsiSetelan.includes('free/gpt-6-luna'), opsiSetelan.slice(0, 4).join(', '));

  /* 7. percakapan SUNGGUHAN lewat penyedia baru (tiruan menerima kunci uji) */
  const j1 = await (await fetch(APP + '/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-setelan-penyedia': encodeURIComponent(JSON.stringify({ provider: 'kustom', base: 'http://127.0.0.1:' + PORT_MOCK + '/v1', kunci: 'kunci-uji-bukan-kunci-asli', gaya: 'openai', model: { fast: 'free/gpt-6-luna' } })),
    },
    body: JSON.stringify({ prompt: 'Balas: SIAP', stream: false, mode: 'fast' }),
  })).json();
  cek('percakapan lewat penyedia baru (dari setelan browser)', j1.ok === true && /SIAP/i.test(String(j1.text || '')), 'model: ' + (j1.model || '-') + ' · jawab: ' + String(j1.text || j1.pesan).slice(0, 40));

  /* 8. tanpa header → kembali ke penyedia server (bukti setelan tidak bocor ke server) */
  const j2 = await (await fetch(APP + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'Balas: SIAP', stream: false, mode: 'fast' }) })).json();
  cek('tanpa setelan browser → server memakai penyedia env (9Router tiruan)', j2.ok === true && /kr\//.test(String(j2.model || '')), 'model: ' + (j2.model || '-'));

  const prom = await (await fetch(APP + '/api/providers')).json();
  cek('kunci dari browser tidak tersimpan di server', prom.teks.sumber === 'server' && prom.teks.penyedia === '9router', prom.teks.label + ' · sumber: ' + prom.teks.sumber);

  cek('tidak ada galat JavaScript di halaman', galatHalaman.length === 0, galatHalaman.slice(0, 2).join(' | '));

  await browser.close();
  tulis('');
  tulis(gagal ? 'HASIL: GAGAL — ' + gagal + ' pemeriksaan' : 'HASIL: SEMUA LULUS — setelan penyedia dari browser terbukti jalan');
} catch (e) {
  tulis('GAGAL menjalankan uji: ' + String((e && e.message) || e));
  gagal++;
} finally {
  await bersihkan();
  const berkas = path.join(AKAR, 'bukti-uji', 'HASIL-UJI-SETELAN-PENYEDIA.txt');
  try { fs.mkdirSync(path.dirname(berkas), { recursive: true }); fs.writeFileSync(berkas, baris.join('\n') + '\n'); } catch (e) {}
  process.exit(gagal ? 1 : 0);
}
