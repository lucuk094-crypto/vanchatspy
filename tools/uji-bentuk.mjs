/* uji-bentuk.mjs — menguji apakah jawaban AI MENGIKUTI PERINTAH BENTUK.
 *
 * Dua lapis:
 *   1. lapis logika (tanpa kuota AI): mengenali perintah ("tepat 3 kata",
 *      "hanya daftar bernomor", "hanya kode", "satu paragraf") dan menilai
 *      jawabannya benar/salah.
 *   2. lapis AI sungguhan (pakai kuota, 4 permintaan): perintah itu benar-benar
 *      dikirim ke model, lalu jawabannya diperiksa — termasuk apakah server
 *      perlu memperbaiki sekali.
 *
 *   node tools/uji-bentuk.mjs           # logika saja (gratis)
 *   node tools/uji-bentuk.mjs --live    # + AI sungguhan
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { perintahKetat, periksaJawaban, hitungKata, susunPesan, teknologiDiminta, instruksiPerbaikan } = await import(path.join(AKAR, 'api/chat.js'));
const BASE = process.env.UJI_URL || 'http://127.0.0.1:8131';
const LIVE = process.argv.includes('--live');
const catatan = [];
const tulis = (s) => { console.log(s); catatan.push(s); };
let gagal = 0;
let ditunda = false;
const cek = (nama, benar, ket) => { tulis((benar ? '  ✓ ' : '  ✗ ') + nama + (ket ? ' — ' + ket : '')); if (!benar) gagal++; };

tulis('══ J. kepatuhan AI pada perintah bentuk ══');
tulis('── lapis 1: pengenalan perintah (tanpa kuota) ──');
const tepat3 = perintahKetat('Balas tepat 3 kata: apa itu kopi?');
cek('"tepat 3 kata" dikenali', tepat3.length === 1 && tepat3[0].jenis === 'kata' && tepat3[0].n === 3 && tepat3[0].batas === 'tepat', JSON.stringify(tepat3));
cek('"hanya lima kata" dikenali', perintahKetat('Jawab hanya lima kata tentang teh')[0].n === 5);
cek('"hanya daftar bernomor" dikenali', perintahKetat('Jawab hanya daftar bernomor tentang madu').some((a) => a.jenis === 'daftar'));
cek('"hanya kode" dikenali', perintahKetat('Tulis hanya kode Python-nya').some((a) => a.jenis === 'kode'));
cek('"satu paragraf" dikenali', perintahKetat('Jelaskan dalam satu paragraf').some((a) => a.jenis === 'paragraf'));
cek('permintaan biasa tidak dianggap ketat', perintahKetat('Apa itu kopi?').length === 0);

tulis('── lapis 1: penilaian jawaban ──');
cek('3 kata dinilai benar', perkiraan('Minuman dari kopi.', [{ jenis: 'kata', n: 3 }]) === null);
cek('4 kata dinilai salah', !!perkiraan('Minuman dari biji kopi.', [{ jenis: 'kata', n: 3 }]));
cek('daftar bernomor tanpa pembuka dinilai benar', perkiraan('1. Satu\n2. Dua', [{ jenis: 'daftar' }]) === null);
cek('paragraf dengan pembuka dinilai salah', !!perkiraan('Berikut dua poin:\n\n1. A\n2. B', [{ jenis: 'daftar' }]));
cek('hanya kode dinilai benar', perkiraan('```python\nprint(1)\n```', [{ jenis: 'kode' }]) === null);
cek('kode + penjelasan panjang dinilai salah', !!perkiraan('```python\nprint(1)\n```\n\nSemoga membantu, kode ini menjumlahkan semua angka.', [{ jenis: 'kode' }]));
cek('penghitung kata mengabaikan blok kode', hitungKata('```js\nlet a = 1;\n```\ndua kata') === 2);

tulis('── lapis 1: susunan perintah ke AI ──');
const sistemProyek = susunPesan([], 'Tulis contoh fungsi menghitung total belanja', { proyek: 'Uji Live: Selalu pakai TypeScript' })[0].content;
cek('arahan proyek ikut ke prompt sistem', /PROYEK YANG SEDANG DIKERJAKAN[\s\S]*TypeScript/.test(sistemProyek));
cek('teknologi dari arahan proyek ditegaskan', /WAJIB untuk proyek ini[\s\S]*TypeScript/.test(sistemProyek));
const sistemKetat = susunPesan([], 'Balas HANYA dengan tiga kata: apa itu kopi?', {})[0].content;
cek('perintah ketat ditegaskan ke model', /PENEGASAN UNTUK PERMINTAAN INI[\s\S]*jumlah kata|PENEGASAN UNTUK PERMINTAAN INI[\s\S]*Jumlah/i.test(sistemKetat));
cek('aturan kepatuhan ada di prompt dasar', /Perintah pengguna MENANG atas gaya bawaanmu/.test(sistemKetat));
cek('larangan proses berpikir ada', /JANGAN menampilkan proses berpikirmu/.test(sistemKetat));
cek('memori ikut dikirim bila ada', /YANG KAMU KETAHUI TENTANG PENGGUNA[\s\S]*suka jawaban singkat/.test(
  susunPesan([], 'halo', { memori: ['Nama saya Rian, suka jawaban singkat'] })[0].content));

tulis('── lapis 1: tepat vs maksimal vs minimal ──');
const aturanMaks = perintahKetat('Jelaskan maksimal 5 kata: apa itu teh?');
const aturanMin = perintahKetat('Tulis minimal 6 kata tentang kopi');
const aturanTepat = perintahKetat('Balas HANYA dengan tiga kata: apa itu kopi?');
cek('"maksimal 5 kata" dibaca sebagai batas atas', aturanMaks.length === 1 && aturanMaks[0].n === 5 && aturanMaks[0].batas === 'maks', JSON.stringify(aturanMaks));
cek('"minimal 6 kata" dibaca sebagai batas bawah', aturanMin.length === 1 && aturanMin[0].n === 6 && aturanMin[0].batas === 'min', JSON.stringify(aturanMin));
cek('"tepat tiga kata" tetap pas (bukan batas atas)', aturanTepat.length === 1 && aturanTepat[0].n === 3 && aturanTepat[0].batas === 'tepat', JSON.stringify(aturanTepat));
cek('5 kata lulus untuk "maksimal 5 kata"', periksaJawaban('Teh minuman dari daun hijau.', aturanMaks).gagal === false);
cek('6 kata ditolak untuk "maksimal 5 kata"', /maksimal 5/.test(periksaJawaban('Teh adalah minuman dari daun hijau.', aturanMaks).alasan || ''));
cek('4 kata ditolak untuk "minimal 6 kata"', /minimal 6/.test(periksaJawaban('Kopi itu nikmat.', aturanMin).alasan || ''));
cek('arahan perbaikan menyebut "paling banyak" untuk batas atas', /paling banyak 5 kata/.test(instruksiPerbaikan(aturanMaks, { alasan: 'x' }, 0)));

tulis('── lapis 1: bahasa kode proyek diperiksa, bukan cuma diminta ──');
const ARAHAN_PROYEK = 'Proyek aktif: Uji Live. Bahasa jawaban: Indonesia\nAturan coding: TypeScript\nGaya desain: Clean Minimalist';
cek('arahan lengkap proyek masuk ke prompt sistem', /Aturan coding: TypeScript/.test(
  susunPesan([], 'tulis contoh fungsi', { proyek: ARAHAN_PROYEK })[0].content));
cek('bahasa kode proyek terbaca dari arahan', teknologiDiminta(ARAHAN_PROYEK, 'tulis contoh fungsi total belanja') === 'typescript');
cek('pengguna minta bahasa lain → permintaan pengguna menang', teknologiDiminta(ARAHAN_PROYEK, 'buat skrip Python untuk total belanja') === '');
cek('aturan coding "Bebas" tidak dipaksakan', teknologiDiminta('Aturan coding: Bebas', 'tulis kode') === '');
cek('tanpa proyek tidak ada pemeriksaan bahasa', teknologiDiminta('Jawab dalam bahasa Indonesia.', 'tulis kode') === '');
const blokJS = 'Berikut fungsinya:\n\n```js\nfunction total(items) { return items.length; }\n```';
const blokTS = 'Berikut fungsinya:\n\n```ts\nfunction total(items: Item[]): number { return items.length; }\n```';
cek('contoh kode JavaScript ditolak saat proyek wajib TypeScript',
  periksaJawaban(blokJS, [{ jenis: 'teknologi', nama: 'typescript' }]).gagal === true);
cek('contoh kode TypeScript diterima', periksaJawaban(blokTS, [{ jenis: 'teknologi', nama: 'typescript' }]).gagal === false);
cek('jawaban tanpa kode tidak dianggap melanggar', periksaJawaban('Kopi adalah minuman.', [{ jenis: 'teknologi', nama: 'typescript' }]).gagal === false);
cek('proyek JavaScript menolak blok TypeScript', periksaJawaban(blokTS, [{ jenis: 'teknologi', nama: 'javascript' }]).gagal === true);

function perkiraan(teks, aturan) {
  const h = periksaJawaban(teks, aturan);
  return h.gagal ? h.alasan : null;
}

if (LIVE) {
  tulis('── lapis 2: AI sungguhan (4 permintaan kuota) ──');
  const uji = [
    { prompt: 'Balas HANYA dengan tiga kata: apa itu kopi?', aturan: [{ jenis: 'kata', n: 3 }] },
    { prompt: 'Balas HANYA dengan lima kata: apa itu teh?', aturan: [{ jenis: 'kata', n: 5 }] },
    { prompt: 'Jawab hanya dengan daftar bernomor berisi 2 poin singkat tentang madu, tanpa kalimat pembuka dan tanpa penutup.', aturan: [{ jenis: 'daftar' }] },
    { prompt: 'Tulis hanya kode Python singkat untuk menjumlahkan 1 sampai 10, tanpa penjelasan.', aturan: [{ jenis: 'kode' }] },
  ];
  for (const u of uji) {
    const r = await fetch(BASE + '/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: u.prompt, mode: 'fast', stream: true }),
    });
    /* kalau permintaannya ternyata tidak dikenali sebagai ketat, jawabannya mengalir (SSE) */
    let j;
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('event-stream')) {
      const mentah = await r.text();
      let teks = '', model = '';
      for (const baris of mentah.split('\n')) {
        if (!baris.startsWith('data: ')) continue;
        try {
          const d = JSON.parse(baris.slice(6));
          if (d.model) model = d.model;
          if (typeof d.delta === 'string') teks += d.delta;
          else if (typeof d.text === 'string') teks += d.text;
          else if (d.choices && d.choices[0] && d.choices[0].delta && typeof d.choices[0].delta.content === 'string') teks += d.choices[0].delta.content;
        } catch (e) { /* baris [DONE] */ }
      }
      j = { ok: true, text: teks, model, mengalir: true };
    } else {
      j = await r.json();
    }
    if (j.kuota) {
      tulis('CATATAN: kuota gratis harian habis — lapis AI sungguhan ditunda (ulangi setelah 07.00 WIB).');
      tulis('Lapis logika di atas sudah lulus dan tetap berlaku.');
      ditunda = true;
      break;
    }
    const gagalPeriksa = j.ok ? periksaJawaban(j.text, u.aturan) : { gagal: true, alasan: j.pesan };
    const barang = String(j.text || '').trim().split('\n')[0].slice(0, 70);
    tulis('   · "' + u.prompt.slice(0, 52) + '…" → "' + barang + '"' + (j.diperbaiki ? ' (diperbaiki sekali)' : '') + (j.model ? ' [' + j.model.split('/')[0] + ']' : ''));
    cek('dipatuhi: ' + u.aturan[0].jenis + (u.aturan[0].n ? ' ' + u.aturan[0].n : ''), j.ok && !gagalPeriksa.gagal, gagalPeriksa.alasan || 'tepat');
  }
}

fs.writeFileSync(path.join(AKAR, 'bukti-uji', 'HASIL-UJI-BENTUK.txt'),
  'perintah : node tools/uji-bentuk.mjs' + (LIVE ? ' --live' : '') + '\nwaktu    : ' + new Date().toISOString() + '\n\n' +
  catatan.join('\n') + '\n\n' + (gagal ? 'HASIL: GAGAL — ' + gagal + ' pemeriksaan'
    : ditunda ? 'HASIL: LULUS (lapis logika) — lapis AI ditunda karena kuota harian habis'
    : 'HASIL: SEMUA LULUS') + '\n');
console.log(gagal ? '\nHASIL: GAGAL — ' + gagal + ' pemeriksaan'
  : ditunda ? '\nHASIL: LULUS (lapis logika) — lapis AI ditunda karena kuota harian habis'
  : '\nHASIL: SEMUA LULUS');
process.exit(gagal ? 1 : 0);
