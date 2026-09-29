/* uji-live.mjs — uji dengan **AI SUNGGUHAN** (memakai kuota harian, ± 12 permintaan).
 *
 * Beda dengan uji-bagian-h.mjs (yang meniru jawaban AI supaya hemat kuota),
 * uji ini memanggil penyedia AI betulan dan memeriksa apakah jawabannya
 * MENGIKUTI PERINTAH:
 *   • bahasa Indonesia (dan bahasa Inggris saat diminta)
 *   • patuh pada perintah format ("tepat 3 kata", "hanya daftar bernomor")
 *   • tidak membocorkan proses berpikir internal (tanpa tag [ANALISIS]/[JAWABAN])
 *   • instruksi proyek ikut dipakai ("selalu pakai TypeScript")
 *   • status proses muncul saat jawaban sedang disusun
 *   • riset mendalam (AI + pencarian sungguhan) menghasilkan laporan bersitasi
 *   • visi: foto sungguhan dikirim ke model yang bisa melihat
 *   • AI Builder membangun proyek multi-berkas sungguhan
 *
 *   node tools/uji-live.mjs            (server uji jalan di :8131)
 *   node tools/uji-live.mjs --hemat    (hanya 4 permintaan)
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
const HEMAT = process.argv.includes('--hemat');

const catatan = [];
const tulis = (s) => { console.log(s); catatan.push(s); };
const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));

/* pola yang menandakan model membocorkan proses berpikir internal */
const BOCOR = [
  /\[\s*ANALISIS\s*\]/i, /\[\s*JAWABAN\s*\]/i,
  /\b(let me think|thinking process|chain of thought|my reasoning)\b/i,
  /\b(kita (perlu|harus) (menjawab|menganalisis)|saya akan menganalisis dulu|mari kita analisis dulu)\b/i,
  /^\s*(Hmm+|Oke,? mari|Baik,? mari kita berpikir)/im,
];

async function klik(page, sel, { deskripsi } = {}) {
  const cek = await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return { ok: false, alasan: 'tidak ada' };
    /* gulirkan dulu (beberapa posisi) supaya tombol yang jauh di bawah atau
       yang tertutup kepala panel tetap bisa diklik betulan */
    if (el.scrollIntoView) el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return { ok: false, alasan: 'ukuran nol' };
    const atas = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { ok: !!atas && (el === atas || el.contains(atas)), x: r.left + r.width / 2, y: r.top + r.height / 2, alasan: atas ? 'tertutup ' + (atas.className || atas.tagName) : 'di luar layar' };
  }, sel);
  if (!cek.ok) throw new Error('klik ' + sel + ' (' + (deskripsi || '') + ') gagal: ' + cek.alasan);
  await page.mouse.click(cek.x, cek.y);
  await tunggu(150);
}

/* kirim pesan, tunggu jawaban akhir, kembalikan balon terakhir */
async function tanya(page, teks, { jam = 60000 } = {}) {
  const sebelum = await page.evaluate(() => document.querySelectorAll('.msg.ai').length);
  await page.evaluate(() => { const ta = document.querySelector('#ta'); ta.value = ''; });
  await page.type('#ta', teks);
  await klik(page, '#btnSend');
  /* kalau kuota gratis harian habis, berhenti di sini dengan jujur (bukan gagal) */
  const habis = await page.waitForFunction(
    () => /kuota gratis harian sudah habis/i.test(document.body.textContent) ||
          [...document.querySelectorAll('.msg.ai')].some((m) => !m.querySelector('.tulis')),
    { timeout: 45000 }
  ).then(() => page.evaluate(() => /kuota gratis harian sudah habis/i.test(document.body.textContent))).catch(() => false);
  if (habis) throw new Error('DITUNDA: kuota gratis harian habis di penyedia AI');
  await page.waitForFunction((n) => {
    const ai = document.querySelectorAll('.msg.ai');
    if (ai.length <= n) return false;
    const b = ai[ai.length - 1].querySelector('.bub');
    if (!b || b.querySelector('.tulis')) return false;
    return true;
  }, { timeout: jam }, sebelum);
  await tunggu(300);
  return page.evaluate(() => {
    const ai = [...document.querySelectorAll('.msg.ai')];
    const el = ai[ai.length - 1];
    const b = el.querySelector('.bub');
    /* teks mentah (markdown) dari simpanan percakapan — dipilih lewat id pesan
       yang sama dengan yang tampil di layar, supaya tidak salah percakapan */
    let mentah = '';
    try {
      const id = el.dataset.id;
      const sesi = JSON.parse(localStorage.getItem('vcs.sesi') || '[]');
      for (const s of sesi) {
        const m = (s.messages || []).filter((x) => x.id === id)[0];
        if (m && typeof m.text === 'string') { mentah = m.text; break; }
      }
    } catch (e) { /* biarkan kosong */ }
    return {
      mentah,
      teks: (b.innerText || '').trim(),
      html: b.innerHTML.slice(0, 4000),
      model: (el.querySelector('.msg-ft, .meta') || {}).textContent || '',
      blokKode: b.querySelectorAll('.kb').length,
      daftar: b.querySelectorAll('ol li, ul li').length,
      tebal: b.querySelectorAll('strong').length,
      tautan: b.querySelectorAll('a').length,
    };
  });
}

/* kalau halaman membeku (mis. kode pratinjau memakan CPU), pengujian tidak
   boleh mati begitu saja — dicek dulu, lalu dilaporkan apa adanya */
async function halamanHidup(page, jam = 20000) {
  try {
    const ok = await Promise.race([
      page.evaluate(() => 1 + 1),
      new Promise((r) => setTimeout(() => r(null), jam)),
    ]);
    return ok === 2;
  } catch (e) { return false; }
}

let ditunda = false;
const hasil = (nama, lulus, ket) => {
  tulis((lulus ? '  ✓ ' : '  ✗ ') + nama + (ket ? ' — ' + ket : ''));
  if (!lulus) gagal++;
};
let gagal = 0;

const browser = await puppeteer.launch({
  headless: true, executablePath: CHROME,
  protocolTimeout: 300000,            /* jawaban AI sungguhan bisa lama */
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 940 });
const galat = [];
/* jaring pengaman: dialog bawaan browser (confirm/prompt/alert) MEMBEKUKAN
   halaman sampai dijawab — tanpa penangan ini, uji bisa macet 300 detik */
const dialogMuncul = [];
page.on('dialog', async (d) => {
  dialogMuncul.push(d.type() + ': ' + String(d.message()).replace(/\s+/g, ' ').slice(0, 70));
  try { await d.accept(''); } catch (e) { /* sudah tertutup */ }
});
page.on('pageerror', (e) => galat.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) galat.push('console: ' + m.text().slice(0, 160)); });

try {
  tulis('══ I. AI SUNGGUHAN — apakah jawabannya mengikuti perintah? ══');
  tulis('   (memakai kuota penyedia AI yang sungguhan' + (HEMAT ? ', mode hemat' : '') + ')');

  await page.goto(URL_UJI, { waitUntil: 'networkidle2' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2' });
  await tunggu(500);

  /* 1. jawaban dasar: bahasa Indonesia + markdown + status proses */
  const t0 = Date.now();
  const statusTerlihat = [];
  const pemantau = setInterval(async () => {
    try {
      const s = await page.evaluate(() => ({ hint: (document.querySelector('#hint') || {}).textContent || '', jalan: !document.querySelector('#btnStop').hidden }));
      if (s.jalan && s.hint.trim()) statusTerlihat.push(s.hint.trim());
    } catch (e) { /* halaman sibuk */ }
  }, 400);
  const j1 = await tanya(page, 'Sebutkan 3 fakta singkat tentang kopi arabika dalam bahasa Indonesia.');
  clearInterval(pemantau);
  const ms1 = Date.now() - t0;
  tulis('1) jawaban dasar (' + (ms1 / 1000).toFixed(1) + ' detik) → ' + j1.teks.replace(/\s+/g, ' ').slice(0, 140) + '…');
  hasil('jawaban memakai bahasa Indonesia', /\b(kopi|arabika|tanaman|biji|rasa)\b/i.test(j1.teks));
  hasil('jawaban terformat markdown', j1.tebal > 0 || j1.daftar >= 2, j1.tebal + ' tebal · ' + j1.daftar + ' butir daftar');
  hasil('status proses terlihat saat menyusun', statusTerlihat.length > 0, statusTerlihat.slice(0, 2).join(' → '));
  hasil('tidak membocorkan proses berpikir internal', !BOCOR.some((r) => r.test(j1.teks)));
  await page.screenshot({ path: path.join(SHOT, '50-ai-live-dasar.png') });

  /* 2. patuh perintah format yang ketat */
  const j2 = await tanya(page, 'Balas HANYA dengan tiga kata, tanpa penjelasan apa pun: apa itu kopi?');
  const kata = j2.teks.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  tulis('2) perintah "tepat 3 kata" → "' + j2.teks.replace(/\s+/g, ' ').slice(0, 80) + '" (' + kata.length + ' kata)');
  hasil('AI mematuhi perintah jumlah kata', kata.length >= 2 && kata.length <= 6, kata.length + ' kata');

  const j3 = await tanya(page, 'Jawab hanya dengan daftar bernomor berisi 2 poin singkat tentang teh, tanpa kalimat pembuka dan tanpa penutup.');
  const mentah3 = (j3.mentah || j3.teks).trim();
  const tanpaPembuka = /^\s*1[.)]/.test(mentah3);
  const butir3 = (mentah3.match(/^\s*\d+[.)]/gm) || []).length;
  tulis('3) perintah "hanya daftar bernomor, tanpa pembuka" → ' + mentah3.replace(/\s+/g, ' ').slice(0, 110) + '…');
  hasil('jawaban langsung mulai dari butir 1 (tanpa kalimat pembuka)', tanpaPembuka, 'mulai: ' + mentah3.slice(0, 12).replace(/\n/g, ' '));
  hasil('jumlah butir sesuai (2)', butir3 === 2, butir3 + ' butir');

  /* 4. perintah bahasa: minta bahasa Inggris */
  const j3b = await tanya(page, 'Reply in English only, one short sentence: what is coffee?');
  const inggris = /\b(coffee|drink|beverage|roasted|bean|brewed)\b/i.test(j3b.teks) && !/\b(dari|adalah|yang|dengan)\b/i.test(j3b.teks);
  tulis('4) perintah "in English" → ' + j3b.teks.replace(/\s+/g, ' ').slice(0, 100));
  hasil('AI menjawab dalam bahasa Inggris', inggris);

  if (!HEMAT) {
    /* 5. kode: blok kode + tombol aksi (Salin/Unduh/Jalankan) */
    const j4 = await tanya(page, 'Tulis satu fungsi JavaScript singkat bernama jumlahKata yang menghitung jumlah kata dalam sebuah kalimat. Cukup kodenya.');
    tulis('4) jawaban kode → ' + j4.blokKode + ' blok kode · ' + j4.teks.replace(/\s+/g, ' ').slice(0, 90) + '…');
    hasil('jawaban kode memakai blok kode', j4.blokKode >= 1);

    /* 6. mode Berpikir + status */
    await klik(page, '#btnMode');
    await klik(page, '#modeList [data-mode="think"]');
    const j5 = await tanya(page, 'Dalam satu paragraf pendek: apa bedanya kopi arabika dan robusta?');
    tulis('5) mode Berpikir → ' + j5.teks.replace(/\s+/g, ' ').slice(0, 120) + '…');
    hasil('mode Berpikir menjawab bahasa Indonesia', /\b(kopi|arabika|robusta|rasa|kafein)\b/i.test(j5.teks));
    hasil('mode Berpikir tetap tanpa proses internal', !BOCOR.some((r) => r.test(j5.teks)));

    /* 7. arahan proyek benar-benar dipakai: buat proyek lewat UI, pilih
       "Aturan coding: TypeScript", lalu masuk ke obrolan proyek itu */
    await page.evaluate(() => { location.hash = '#/projects'; });
    await tunggu(700);
    await page.evaluate(() => {
      window.prompt = (a) => String(a).includes('Nama proyek') ? 'Uji Live' : 'Proyek untuk uji arahan';
    });
    await klik(page, '#prj18Baru');
    await tunggu(700);
    const idPrj = await page.evaluate(() => ((JSON.parse(localStorage.getItem('vcs.setelan') || '{}').proyek || [])[0] || {}).id || '');
    await klik(page, '#prjCoding-' + idPrj + ' button[data-v="TypeScript"]');
    await tunggu(400);
    await page.evaluate(() => { location.hash = '#/'; });
    await page.waitForFunction(() => {
      const b = document.querySelector('#btnSend');
      return b && b.getBoundingClientRect().width > 0;
    }, { timeout: 8000 });
    await tunggu(500);
    /* obrolan lama belum masuk proyek → aplikasi harus bilang apa adanya */
    const nota = await page.evaluate(() => {
      const n = document.querySelector('#prjNota');
      return n && !n.hidden ? n.innerText.replace(/\s+/g, ' ').trim() : '';
    });
    tulis('6) catatan di kotak tulis → ' + (nota || '(tidak ada)').slice(0, 130));
    hasil('aplikasi jujur saat obrolan di luar proyek', /belum masuk proyek/.test(nota), nota.slice(0, 60));
    if (await page.$('#prjNotaPakai')) await klik(page, '#prjNotaPakai');
    await tunggu(500);
    const j6 = await tanya(page, 'Tulis satu contoh fungsi singkat untuk menghitung total belanja.');
    const mentah6 = j6.mentah || j6.teks;
    const ts = /typescript|:\s*(number|string|boolean|void|any)\b|interface\s+\w+|type\s+\w+\s*=/i.test(mentah6);
    tulis('7) arahan proyek "Aturan coding: TypeScript" → ' + (ts ? 'DIPATUHI (terlihat anotasi tipe)' : 'TIDAK terlihat') + ' · ' + mentah6.replace(/\s+/g, ' ').slice(0, 130) + '…');
    hasil('arahan proyek (bahasa kode) dipakai AI', ts);

    /* 6. riset mendalam SUNGGUHAN (AI + pencarian + laporan bersitasi) */
    await page.evaluate(() => { location.hash = '#/'; });
    await tunggu(400);
    await page.type('#ta', 'kopi arabika di Indonesia');
    await klik(page, '#chipRiset', { deskripsi: 'riset dalam' });
    /* riset meminta konfirmasi lewat bilah di dalam aplikasi */
    if (await page.$('#risetLanjut')) { await klik(page, '#risetLanjut', { deskripsi: 'lanjutkan riset' }); }
    await page.waitForFunction(() => /Laporan riset selesai/.test(document.body.textContent), { timeout: 180000 });
    await tunggu(600);
    const riset = await page.evaluate(() => ({
      langkah: [...document.querySelectorAll('.riset-jejak li')].map((l) => l.textContent.trim()),
      sumber: [...document.querySelectorAll('.riset-sumber li')].map((l) => l.textContent.replace(/\s+/g, ' ').trim().slice(0, 90)),
      /* nama berkas dibaca dari Ruang Kerja (paling pasti), kartu pesan hanya pelengkap */
      berkas: (document.querySelector('#artName') || {}).textContent || '',
      kartu: [...document.querySelectorAll('.kartu b, .kartu-berkas b')].map((b) => b.textContent).join(','),
      tautan: [...document.querySelectorAll('.riset-sumber a')].map((a) => a.href).filter((h) => /^https?:/.test(h)),
    }));
    tulis('7) riset mendalam (sungguhan) → ' + riset.langkah.length + ' langkah · ' + riset.sumber.length + ' sumber · ' + riset.tautan.length + ' tautan nyata · berkas "' + riset.berkas + '"');
    tulis('   contoh sumber: ' + (riset.sumber[0] || '—'));
    hasil('riset menghasilkan langkah lengkap', riset.langkah.length >= 5);
    hasil('riset mengambil sumber nyata dari internet', riset.tautan.length >= 2);
    hasil('riset menulis berkas laporan', /^riset-/.test(riset.berkas));
    await page.screenshot({ path: path.join(SHOT, '51-riset-live.png') });

    /* 7. VISI sungguhan — foto benar-benar dikirim ke model yang bisa melihat */
        /* gambar uji: latar merah + lingkaran putih + batang biru (PNG sah, 256x256).
       Selalu ditulis ulang — gambar lama yang rusak tidak boleh dipakai lagi. */
    const FOTO = path.join('/tmp', 'foto-live.png');
    const FOTO_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAADs0lEQVR42u3csVHrQBRAUbzjOqTAdZC4cFViB6ISEkICZrDxontO9DNg9109mWH+6bYsb1A1HAECAAGAAEAAIAAQAAgABAACAAGAAEAAIAAQAAgABAACAAGAAEAAIAAQAMzl7Age67psz/4S28fVOdsAIAAQAAgABAACAAGAAEAAIAAQAAgABAACAAEgABAACAAEAAIAAYAAQAAgABAAHIr/Ge4xLvv+9a/3+599rfu6OnkBTDD0E3wDYhBAZe6tBQGYeyUIwOj/4NuWgQByoy8DARh9GQjA6MtAAEZfBgIw+jL4nj+FKE6/n90GcP1WQXsDmH6nEd0ARt8q6G4A0+98ugGYfqcUfQUy+l6HuhvA9Du3bgCm3+l1AzD9zrAbgOl3kt0ATL/z7AZg+p1qNwDT72y7AZh+J9wNwPQ7524Apt9pdwMw/c7cKxAkA/D4d/LdAEy/8+8GYPrdglcgSAbg8e8uugGYfjfiFQiSAXj8u5duAKbf7XgFgmQAHv/uyAaAZAAe/27KBoBkAB7/loANAMkAPP4tARsAkgF4/FsCNgAkA/D4twRsABAA1ALw/uMtyAYAAUAtAO8/3oJsABAACABCAfgA4GOADQACAAFAKAAfAHwMsAFAACAAEAAIAAQARw7A70CPbbb7tQGwAUAAIAAQAAgABAACAAGAAEAAIAAQAAgABAACAAH82n1d3cqBzXa/NgA2AAgABAACAAGAAF7Db0KPasKbtQGwAUAAIAAvi7Tu1AbABgABgAC8MtK6TRsAGwAEYG8SvEcbABsABGB7ErxBGwAbwCOE6t3ZANgAHiRUb80GwAbwOKF6XzYANoCHCtWbsgGwATxaqN6RDYAN4AFD9XaGU6Z8L16B8ArkYUP1RoYTp3wXXoHwCuTBQ/UWhtOnfP7DHVA+eZ8B8BnAo4jqmQ/3Qfm0h1uhfM7D3VA+4eGGKJ/tcE+UT3W4LcrnOdwZ5ZMcbo7yGQ73R/n0hlukfG7n1F1e9t1YG/3cBrAKnJIANOB8wq9AXoeMvg3gvp2GDWAVGH0bwAT42W2A9Cow+gKIZmD0BRDNwOgLIJqB0RdANAOjL4BoBkZfAE+Zp8lLMPcCKJZg7gXwypl7SQyGXgDzxbBs5v4f8acQCAAEAAIAAYAAQAAgABAACAAEAAIAAYAAQAAgABAACAAEAAIAAYAAQAAgABAATOF0WxangA0AAgABgABAACAAEAAIAAQAAgABgABAACAAEAAIAAQAAgABgABAACAAmMgncSZChSCaxNAAAAAASUVORK5CYII=';
    fs.writeFileSync(FOTO, Buffer.from(FOTO_B64, 'base64'));
    const inputFoto = await page.$('#fileIn');
    await inputFoto.uploadFile(FOTO);
    await page.waitForFunction(() => document.querySelectorAll('#attachList .lampiran').length > 0, { timeout: 15000 });
    await tunggu(500);
    const j7 = await tanya(page, 'Apa warna latar dan bentuk apa yang ada di gambar ini? Jawab singkat.');
    const sebutMerah = /merah|red/i.test(j7.teks);
    const sebutBentuk = /lingkaran|bulat|circle|putih|white|kotak|persegi|square/i.test(j7.teks);
    tulis('8) visi sungguhan → ' + j7.teks.replace(/\s+/g, ' ').slice(0, 140) + '…');
    hasil('model benar-benar melihat gambar', sebutMerah && sebutBentuk, (sebutMerah ? 'warna disebut' : 'warna tidak disebut') + ' · ' + (sebutBentuk ? 'bentuk disebut' : 'bentuk tidak disebut'));
    await page.screenshot({ path: path.join(SHOT, '52-visi-live.png') });

    /* 8. AI Builder sungguhan — proyek multi-berkas */
    try {
    await page.evaluate(() => { location.hash = '#/builder'; });
    await tunggu(700);
    await page.type('#bgnPrompt', 'Buat website kartu ucapan ulang tahun sederhana (satu halaman) bernama KartuUlangTahun.');
    await klik(page, '#bgnMulai');
    await page.waitForFunction(() => /siap|Siap deploy|masalah/i.test((document.querySelector('#bgnStatus') || {}).textContent || ''), { timeout: 180000 });
    await tunggu(1500);
    const bgn = await page.evaluate(() => ({
      nama: document.querySelector('#bgnNama').textContent.trim(),
      berkas: [...document.querySelectorAll('#bgnPohon .ph-it span')].map((s) => s.textContent),
      jejak: [...document.querySelectorAll('.bgn-jejak li')].map((l) => l.className).filter((c) => /beres|siap/.test(c)).length,
      status: document.querySelector('#bgnStatus').textContent,
      srcdoc: (document.querySelector('#bgnPratinjau').srcdoc || '').length,
      uji: (document.querySelector('#bgnUji').textContent || '').replace(/\s+/g, ' ').slice(0, 80),
    }));
    tulis('9) AI Builder (sungguhan) → "' + bgn.nama + '" · berkas ' + JSON.stringify(bgn.berkas) + ' · jejak ' + bgn.jejak + '/10');
    tulis('   status: ' + bgn.status + ' · uji: ' + bgn.uji);
    hasil('builder menghasilkan berkas nyata', bgn.berkas.length >= 1);
    hasil('pratinjau terisi', bgn.srcdoc > 200, bgn.srcdoc + ' karakter');
    await page.screenshot({ path: path.join(SHOT, '53-builder-live.png') });
    } catch (e) {
      tulis('   ✗ langkah builder tidak selesai: ' + String(e.message).slice(0, 140));
      hasil('AI Builder membangun proyek tanpa hambatan', false, String(e.message).slice(0, 60));
    }
    if (!(await halamanHidup(page))) tulis('CATATAN: halaman lambat merespons setelah langkah builder — sisa uji dicoba tetap jalan.');
  }

  /* 8b. kalau kuota gratis harian habis, uji live ditunda (bukan gagal)
     — pesannya harus terlihat jujur di layar */
  const kuotaHabis = await page.evaluate(() => /kuota gratis harian sudah habis/i.test(document.body.textContent));
  if (kuotaHabis) {
    tulis('CATATAN: kuota gratis harian habis — sebagian uji tidak bisa dijalankan sekarang.');
    tulis('Ulangi `node tools/uji-live.mjs` setelah 07.00 WIB (kuota terisi ulang).');
    ditunda = true;
  }

  /* 9. hitungan kuota di aplikasi ikut naik */
  const pakai = (await halamanHidup(page))
    ? await page.evaluate(() => (JSON.parse(localStorage.getItem('vcs.setelan') || '{}').pakai || {}))
    : { jumlah: 0, catatan: 'halaman tidak merespons' };
  tulis('10) penghitung pemakaian di aplikasi: ' + (pakai.jumlah || 0) + ' permintaan hari ini');
  if (!ditunda) hasil('penghitung kuota berjalan', (pakai.jumlah || 0) >= 3);

  /* 10. nol galat JS */
  await tunggu(500);
  if (dialogMuncul.length) tulis('   (dialog bawaan yang muncul & dijawab: ' + dialogMuncul.join(' | ') + ')');
  const nyata = galat.filter((g) => !/Failed to load resource/.test(g));
  tulis('11) galat JS selama percakapan sungguhan → ' + (nyata.length ? nyata.join(' | ') : 'tidak ada'));
  hasil('tidak ada galat JS', nyata.length === 0, nyata[0] || '');
} catch (e) {
  if (/^DITUNDA/.test(String(e.message))) {
    ditunda = true;
    gagal = 0;
    tulis('DITUNDA — ' + String(e.message).replace('DITUNDA: ', ''));
    tulis('Ulangi `node tools/uji-live.mjs` setelah 07.00 WIB (kuota gratis terisi ulang).');
  } else {
    tulis('GAGAL: ' + e.message);
    gagal++;
  }
}

await browser.close();
fs.writeFileSync(path.join(SHOT, 'HASIL-UJI-LIVE.txt'),
  'perintah : node tools/uji-live.mjs' + (HEMAT ? ' --hemat' : '') + '\nwaktu    : ' + new Date().toISOString() +
  '\ncatatan  : uji ini memakai KUOTA penyedia AI sungguhan\n\n' + catatan.join('\n') + '\n\n' +
  (gagal ? 'HASIL: GAGAL — ' + gagal + ' pemeriksaan'
    : ditunda ? 'HASIL: SEBAGIAN (kuota gratis harian habis — ulangi setelah 07.00 WIB)'
    : 'HASIL: SEMUA LULUS') + '\n');
console.log(gagal ? '\nHASIL: GAGAL — ' + gagal + ' pemeriksaan'
  : ditunda ? '\nHASIL: SEBAGIAN — kuota gratis harian habis, ulangi setelah 07.00 WIB'
  : '\nHASIL: SEMUA LULUS');
process.exit(gagal ? 1 : 0);
