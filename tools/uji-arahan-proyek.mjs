/* uji-arahan-proyek.mjs — uji "arahan proyek dikirim ke AI" TANPA memakai kuota
 * (penyedia AI ditiru di dalam browser).
 *
 * Yang diperiksa:
 *   1) pilihan "Aturan coding: TypeScript" di halaman Proyek benar-benar
 *      tersimpan dan tampil pada ringkasan arahan;
 *   2) kotak tulis memberi catatan jujur ketika obrolan yang dibuka belum
 *      masuk proyek ("arahan proyek belum dikirim ke AI");
 *   3) tombol "Pakai arahan proyek" memasukkan obrolan ke proyek itu;
 *   4) permintaan ke /api/chat benar-benar membawa seluruh arahan proyek
 *      (bahasa + aturan coding + gaya desain), dan tanpa proyek hanya bahasa;
 *   5) tidak ada galat JS.
 *
 *   node tools/uji-arahan-proyek.mjs      (server uji jalan di :8131)
 */
import fs from 'node:fs';
import path from 'node:path';
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
const URL_UJI = process.env.UJI_URL || 'http://127.0.0.1:8131/';
const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));

const catatan = [];
const tulis = (s) => { console.log(s); catatan.push(s); };
let gagal = 0;
const cek = (nama, benar, ket) => {
  tulis((benar ? '  ✓ ' : '  ✗ ') + nama + (ket ? ' — ' + ket : ''));
  if (!benar) gagal++;
};

const JAWABAN = 'Berikut fungsinya:\n\n```ts\ninterface Item { nama: string; harga: number }\nfunction total(items: Item[]): number { return items.length; }\n```';

const browser = await puppeteer.launch({ headless: true, executablePath: CHROME, protocolTimeout: 120000, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 940 });
const galat = [];
page.on('pageerror', (e) => galat.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) galat.push('console: ' + m.text().slice(0, 150)); });

const badan = [];
await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = req.url();
  if (u.includes('/api/chat')) {
    badan.push(req.postData() || '');
    return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, text: JAWABAN, model: 'uji/arahan' }) });
  }
  if (u.includes('/api/providers')) return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, teks: { penyedia: 'openrouter', adaKunci: true, kunci: 'sk-or-…uji' }, gambar: { siap: false }, suara: { stt: {}, tts: {} }, deploy: {}, penjadwal: {}, rateLimit: { terpakai: { total: 1, ditolak: 0 } } }) });
  req.continue();
});

try {
  tulis('══ uji arahan proyek (tanpa kuota AI) ══');
  await page.goto(URL_UJI, { waitUntil: 'networkidle2' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2' });
  await tunggu(500);

  /* 0. tanpa proyek: yang dikirim hanya aturan bahasa */
  await page.type('#ta', 'Halo, perkenalkan dirimu singkat.');
  await page.click('#btnSend');
  await page.waitForFunction(() => {
    const ai = document.querySelectorAll('.msg.ai');
    if (!ai.length) return false;
    const b = ai[ai.length - 1].querySelector('.bub');
    return b && !b.querySelector('.tulis');
  }, { timeout: 30000 });
  await tunggu(300);
  const tanpa = JSON.parse(badan[badan.length - 1] || '{}');
  cek('tanpa proyek: hanya aturan bahasa yang dikirim',
    /Jawab dalam bahasa Indonesia\./.test(String(tanpa.proyek)) && !/Aturan coding/.test(String(tanpa.proyek)),
    String(tanpa.proyek));

  /* 1. buat proyek + pilih Aturan coding: TypeScript lewat UI */
  await page.evaluate(() => { location.hash = '#/projects'; });
  await tunggu(700);
  await page.evaluate(() => { window.prompt = (a) => String(a).includes('Nama proyek') ? 'Uji Arahan' : 'Proyek untuk menguji arahan'; });
  await page.click('#prj18Baru');
  await tunggu(700);
  const idPrj = await page.evaluate(() => ((JSON.parse(localStorage.getItem('vcs.setelan') || '{}').proyek || [])[0] || {}).id || '');
  cek('proyek baru dibuat', !!idPrj, idPrj);

  await page.click('#prjCoding-' + idPrj + ' button[data-v="TypeScript"]');
  await tunggu(500);
  const sesudah = await page.evaluate((id) => {
    const set = JSON.parse(localStorage.getItem('vcs.setelan') || '{}');
    const pr = (set.proyek || []).filter((p) => p.id === id)[0] || {};
    return {
      coding: (pr.instruksiDetail || {}).coding,
      preview: ((document.querySelector('[data-prj="' + id + '"] .preview-ins') || {}).textContent || '').replace(/\n/g, ' · '),
      chipOn: ((document.querySelector('#prjCoding-' + id + ' button.on') || {}).textContent || '').trim(),
    };
  }, idPrj);
  tulis('   ringkasan arahan: ' + sesudah.preview);
  cek('pilihan "TypeScript" tersimpan', sesudah.coding === 'TypeScript' && sesudah.chipOn === 'TypeScript');
  cek('ringkasan arahan menampilkan aturan coding', /Aturan coding: TypeScript/.test(sesudah.preview));

  /* 2. catatan jujur di kotak tulis (obrolan lama belum masuk proyek) */
  await page.evaluate(() => { location.hash = '#/'; });
  await tunggu(700);
  const nota = await page.evaluate(() => {
    const n = document.querySelector('#prjNota');
    return { tampil: !n.hidden, kelas: n.className, teks: n.innerText.replace(/\s+/g, ' ').trim(), tombol: !!document.querySelector('#prjNotaPakai') };
  });
  tulis('   catatan: ' + nota.teks);
  cek('catatan jujur muncul saat obrolan di luar proyek', nota.tampil && /belum masuk proyek/.test(nota.teks) && /belum dikirim ke AI/.test(nota.teks) && nota.tombol);
  await page.screenshot({ path: path.join(SHOT, '55-catatan-proyek.png') });

  /* 3. satu klik memasukkan obrolan ke proyek */
  await page.click('#prjNotaPakai');
  await tunggu(500);
  const jadi = await page.evaluate(() => {
    const set = JSON.parse(localStorage.getItem('vcs.setelan') || '{}');
    const sesi = JSON.parse(localStorage.getItem('vcs.sesi') || '[]');
    const n = document.querySelector('#prjNota');
    return { kelas: n.className, teks: n.innerText.replace(/\s+/g, ' ').trim(), masuk: sesi[0] && sesi[0].proyekId === set.proyekAktif };
  });
  tulis('   setelah klik: ' + jadi.teks);
  cek('obrolan masuk proyek setelah klik', jadi.masuk && /masuk proyek/.test(jadi.teks) && jadi.kelas.indexOf('on') >= 0);

  /* 4. arahan lengkap benar-benar dikirim ke /api/chat */
  await page.evaluate(() => { document.querySelector('#ta').value = ''; });
  await page.type('#ta', 'Tulis satu contoh fungsi singkat untuk menghitung total belanja.');
  await page.click('#btnSend');
  await page.waitForFunction(() => {
    const ai = document.querySelectorAll('.msg.ai');
    if (!ai.length) return false;
    const b = ai[ai.length - 1].querySelector('.bub');
    return b && !b.querySelector('.tulis');
  }, { timeout: 30000 });
  await tunggu(400);
  const dengan = JSON.parse(badan[badan.length - 1] || '{}');
  const p = String(dengan.proyek || '');
  tulis('   proyek terkirim: ' + p.replace(/\n/g, ' · '));
  cek('permintaan membawa nama proyek', /Proyek aktif: Uji Arahan\./.test(p));
  cek('permintaan membawa aturan coding TypeScript', /Aturan coding: TypeScript/.test(p));
  cek('permintaan membawa bahasa + gaya desain', /Bahasa jawaban: Indonesia/.test(p) && /Gaya desain: Clean Minimalist/.test(p));
  cek('permintaan tetap memuat perintah pengguna apa adanya', /menghitung total belanja/.test(String(dengan.prompt || '')));

  const nyata = galat.filter((g) => !/Failed to load resource/.test(g));
  cek('tidak ada galat JS', nyata.length === 0, nyata[0] || '');
} catch (e) {
  gagal++;
  tulis('GAGAL: ' + e.message);
}
await browser.close();

const kepala = 'UJI ARAHAN PROYEK (tanpa kuota AI)\n' + new Date().toLocaleString('id-ID') + '\n' + '─'.repeat(58) + '\n';
fs.writeFileSync(path.join(SHOT, 'HASIL-UJI-ARAHAN-PROYEK.txt'),
  kepala + catatan.join('\n') + '\n\n' + (gagal ? 'HASIL: GAGAL — ' + gagal + ' pemeriksaan' : 'HASIL: SEMUA LULUS') + '\n');
console.log(gagal ? '\nHASIL: GAGAL — ' + gagal + ' pemeriksaan' : '\nHASIL: SEMUA LULUS');
process.exit(gagal ? 1 : 0);
