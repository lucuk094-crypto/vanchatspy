# LAPORAN F19 — semua uji hijau & AI mengikuti perintah

Tanggal: 19 September 2026 (WIB) · Proyek: **Van Chat.SPY** (`/home/user/van-chat-spy`)
Server uji: `node tools/server-uji.mjs` → http://127.0.0.1:8131/ (hidup, pid 3580)
Akses publik (tunnel): `bash tools/buka-tunnel.sh` → link `*.trycloudflare.com` (tidak dijamin hidup)

---

## 1. Ringkasan satu paragraf

Seluruh rangkaian uji **deterministik** (tanpa memakai kuota AI) sudah
**SEMUA LULUS**, termasuk satu rangkaian baru yang khusus memeriksa janji
"respon AI sesuai apa yang diperintahkan". Tiga kebocoran kepatuhan yang
sebenarnya ditemukan dan diperbaiki di putaran ini: (a) arahan proyek yang
**terlihat** di halaman Proyek ternyata **tidak seluruhnya dikirim** ke AI,
(b) bahasa kode proyek (mis. TypeScript) hanya **diminta** lewat prompt, tidak
**diperiksa**, (c) kode berisi perulangan tanpa henti bisa **membekukan**
pratinjau di ruang kerja/Pustaka. Ketiganya kini ditutup, dan setiap kali
sebuah perintah tetap tidak bisa dipenuhi setelah perbaikan otomatis,
aplikasi **mengatakannya apa adanya** — tidak ada klaim palsu.

**Pembaruan:** setelah kuota terisi, uji dengan kuota AI sungguhan sudah
dijalankan dan **SEMUA LULUS** (`node tools/uji-live.mjs` → `HASIL: SEMUA
LULUS`, 10 permintaan, 0 galat JS) — termasuk dua butir yang dulu gagal:
**arahan proyek TypeScript dipatuhi** dan **AI Builder menyelesaikan proyek
3 berkas**. Pada uji yang sama ditemukan **tiga cacat baru** yang langsung
diperbaiki (butir 8–10 pada §2). Kuota harian sekarang habis lagi karena
pengetesan hari ini; terisi ulang 07.00 WIB (angka di `/api/v1/key` tidak
mencerminkan batas 50/hari itu — yang menentukan balasan `POST /api/chat`).

---

## 2. Yang diperbaiki di putaran ini

| # | Masalah nyata | Perbaikan | Berkas |
| --- | --- | --- | --- |
| 1 | Kolom "proyek" yang dikirim ke AI hanya berisi `Nama: arahan bebas`. Pilihan **Bahasa jawaban / Aturan coding / Gaya desain** di halaman Proyek **tidak ikut terkirim** — tampilan menjanjikan sesuatu yang tidak sampai ke AI | Sekarang yang dikirim = **persis** ringkasan arahan yang terlihat di halaman Proyek: `Proyek aktif: <nama>. Bahasa jawaban: … Aturan coding: … Gaya desain: … Arahan tambahan: …` (satu fungsi yang sama dipakai untuk menampilkan dan mengirim) | `assets/app.js` |
| 2 | Kalau proyek aktif tetapi obrolan yang dibuka **belum** masuk proyek, arahan tidak dipakai — dan pengguna tidak diberi tahu | **Catatan jujur di atas kotak tulis**: "Obrolan ini belum masuk proyek *X* — arahan proyek belum dikirim ke AI" + tombol **Pakai arahan proyek** (satu klik). Kalau sudah masuk: "Obrolan ini masuk proyek *X* — arahan proyek dikirim pada setiap pesan." | `index.html`, `assets/app.js`, `assets/app.css` (§23) |
| 3 | Aturan coding proyek hanya berupa permintaan di prompt; model kecil sering tetap membalas JavaScript walau proyek wajib TypeScript | **Pemeriksa bahasa kode di server**: contoh kode di jawaban diperiksa (`PENANDA` untuk TypeScript/JavaScript/Python/PHP/Go/Java/SQL/Rust). Tidak sesuai → model diminta memperbaiki (ikut jalur perbaikan sampai 3 putaran). Kalau pengguna sendiri meminta bahasa lain, permintaan pengguna menang; aturan "Bebas" tidak dipaksakan | `api/chat.js` |
| 4 | Kode hasil AI yang berisi `while(true)` bisa **membekukan** browser saat dipratinjau di ruang kerja/Pustaka (Builder sudah aman) | Pengaman diperluas ke **semua** pratinjau HTML: pratinjau **ditahan**, alasannya disebut berikut nomor baris, dan pengguna diberi dua pilihan aman: **Tampilkan tanpa skrip** / **Buka di tab baru** | `assets/app.js`, `assets/app.css` (§24) |
| 5 | Catatan ketika bentuk jawaban tetap tidak pas masih umum ("belum persis seperti yang diminta") | Catatan sekarang menyebut **alasannya**: "Jawaban belum persis seperti yang kamu minta (contoh kode tidak memakai TypeScript) — sudah dicoba tiga kali diperbaiki." | `api/chat.js`, `assets/app.js` |
| 6 | Pencarian web bisa menyebut sumber tanpa memberi tahu bahwa satu penyedia sedang menolak permintaan (Wikipedia sering menjawab 429 saat dipanggil beruntun) | `api/search.js` mencoba ulang sekali setelah jeda, lalu menuliskan apa adanya di `catatan`: "Penyedia yang membatasi permintaan sesaat ini: wikipedia (hasil dari penyedia lain tetap dipakai)" | `api/search.js` |
| 8 | Klik "Riset dalam" memunculkan **`confirm()` bawaan browser** — dialog itu membekukan seluruh halaman (dan menggantung pengujian otomatis 300 detik) sampai ditekan | Konfirmasi dipindah ke **bilah di dalam aplikasi** (Batal · Lanjutkan) tepat di atas kotak tulis; halaman tidak pernah membeku lagi, dan rangkaian uji klik "Lanjutkan" seperti manusia | `index.html`, `assets/app.js`, `assets/app.css` (§25) |
| 9 | Permintaan **internal** aplikasi (Builder, Riset, Perbaiki berkas) ikut kena pemeriksa perintah bentuk — "Balas HANYA JSON … tanpa pagar kode" dianggap "hanya kode", lalu dipaksa 3 putaran perbaikan yang **memakan ~180 detik** dan membuat builder tampak menggantung | Permintaan internal ditandai `internal: true` dari aplikasi dan **dilewati** oleh pemeriksa bentuk (jawabannya dipakai sebagai data). Builder sekarang selesai **± 40 detik** dengan 3 berkas | `assets/app.js`, `api/chat.js` |
| 10 | "**maksimal** 8 kata" diperlakukan sama seperti "**tepat** 8 kata" (dan "minimal" tidak dikenal) | Ketiganya dibedakan: `tepat` (harus pas) · `maks` (batas atas) · `min` (batas bawah); pesan perbaikan & pemilihan jawaban terdekat ikut menyesuaikan | `api/chat.js` |
| 11 | Antrean model visi berisi model yang **tidak menerima gambar**; gambar uji di rangkaian live ternyata **bukan PNG yang sah** | Antrean visi diisi hanya model yang benar-benar menerima gambar; gambar uji dibuat ulang (PNG sah, 256×256) dan selalu ditulis ulang sebelum diunggah — model menjawab benar: "latar merah, lingkaran putih, batang biru" | `api/chat.js`, `tools/uji-live.mjs` |
| 7 | Uji yang bergantung pada penyedia luar bisa "GAGAL" palsu, dan uji yang memakai kuota berhenti dengan pesan menyesatkan saat kuota habis | `uji-bentuk.mjs` & `uji-live.mjs` mengenali jalur **kuota habis → HASIL: SEBAGIAN (ditunda)**, bukan GAGAL; `uji-live` berhenti cepat (±3 detik) alih-alih menggantung 105 detik; langkah builder dibungkus agar satu hambatan tidak mematikan seluruh uji; klik uji mencoba beberapa posisi gulir | `tools/*.mjs` |

---

## 3. Rangkaian uji & hasil

Perintah dijalankan dari `/home/user/van-chat-spy` (server :8131 hidup).

| Rangkaian | Perintah | Hasil terakhir |
| --- | --- | --- |
| Asap halaman | `node tools/smoke-18.mjs` | **SEMUA LULUS** — 6 halaman (Builder, Proyek, Tugas, Pengaturan, Plugin, Admin) + Pustaka + palet `Ctrl+Shift+K` + studio gambar + 5 tombol suara + bagikan + **nol galat JS** |
| Arahan proyek | `node tools/uji-arahan-proyek.mjs` | **SEMUA LULUS** — 11 pemeriksaan (tanpa kuota, penyedia ditiru): arahan lengkap tersimpan, catatan jujur muncul, satu klik memasukkannya, dan permintaan ke `/api/chat` benar-benar membawa `Aturan coding: TypeScript` |
| Butir 15–53 | `node tools/uji-bagian-h.mjs` | **SEMUA LULUS** — termasuk pengaman sandbox (pratinjau ditahan) & jalur **kuota habis** |
| Tampilan A–G + ponsel | `node tools/uji-tampilan.mjs` | **SEMUA LULUS** — termasuk dua langkah baru: arahan proyek terkirim + **pratinjau berisiko ditahan** lalu "Tampilkan tanpa skrip" |
| Perintah bentuk AI | `node tools/uji-bentuk.mjs` | **SEMUA LULUS (lapis logika)** — 28 pemeriksaan, termasuk 10 pemeriksaan baru soal bahasa kode proyek. Lapis AI (4 permintaan nyata) **ditunda** karena kuota |
| Keamanan | `node tools/uji-rahasia.mjs` | **SEMUA LULUS** — kunci tetap di server, masukan divalidasi, asal asing 403 |
| Pencarian web | `node tools/uji-cari.mjs` | **SEMUA LULUS** — penyedia sungguhan, `catatan` pembatas disertakan |
| Kontrak endpoint | `node tools/uji-api.mjs` | **SEMUA LULUS** (tanpa kuota AI) |
| Impor endpoint | `node tools/cek-impor-api.mjs` | **SEMUA LULUS** — 8 endpoint + 2 pendukung |
| Ikon | `node tools/cek-ikon.mjs` | 115 tersedia · 90 dipakai · **0 hilang** |
| **AI sungguhan (kuota)** | `node tools/uji-live.mjs` | **SEMUA LULUS** — 10 permintaan kuota: 4 mode, perintah ketat, arahan proyek TypeScript, riset 7 langkah/7 sumber + berkas, visi, builder 3 berkas, nol galat JS |
| **Bentuk (lapis AI)** | `node tools/uji-bentuk.mjs --live` | **SEMUA LULUS** — "tepat 3 kata", "tepat 5 kata", daftar bernomor, dan hanya-kode semuanya dipatuhi (0–1 kali perbaikan) |

Bukti teks: `bukti-uji/HASIL-*.txt`. Tangkapan layar: 41 berkas PNG di
`bukti-uji/` — dua yang baru: **`55-catatan-proyek.png`** (catatan jujur di
kotak tulis) dan **`56-pratinjau-ditahan.png`** (pratinjau berisiko ditahan),
ditambah `41b-sandbox-ditahan.png` dan `54-kuota-habis.png` dari putaran
sebelumnya.

---

## 4. Uji AI sungguhan — apa yang sudah terbukti tanpa kuota

Karena kuota harian habis (batas 50/hari dari penyedia), kepatuhan AI dibuktikan
lewat lapisan yang tidak butuh kuota:

1. **Susunan prompt ke AI** (`uji-bentuk.mjs`, lapis 1) — memanggil `susunPesan`
   langsung dari `api/chat.js` dan memeriksa isi prompt sistem: arahan proyek
   ikut, aturan bahasa kode ditegaskan ("WAJIB untuk proyek ini…"), penegasan
   perintah ketat, larangan membocorkan proses berpikir, dan memori.
2. **Pemeriksa jawaban** — kalau model membalas blok JavaScript padahal proyek
   wajib TypeScript, `periksaJawaban` mengembalikan `gagal: "contoh kode tidak
   memakai TypeScript"` → memicu perbaikan; blok TypeScript lolos; jawaban tanpa
   kode tidak dianggap melanggar; permintaan "buat skrip Python" di proyek
   TypeScript **tidak** dipaksa.
3. **Rantai aplikasi → server** (`uji-arahan-proyek.mjs`) — merekam badan
   `POST /api/chat` sungguhan dari browser: `"proyek":"Proyek aktif: Uji Arahan.
   Bahasa jawaban: Indonesia\nAturan coding: TypeScript\nGaya desain: Clean
   Minimalist"`.

## 5. Uji kuota sungguhan (`tools/uji-live.mjs`) — status: **ditunda sampai 07.00 WIB**

```
node tools/uji-live.mjs          # ± 12–15 permintaan kuota
node tools/uji-live.mjs --hemat  # hanya 4 permintaan
```

Yang diperiksa (semua sudah pernah lulus pada putaran sebelumnya, kecuali dua
butir yang kini diperbaiki dan **sengaja** diuji ulang):

| Bagian | Keadaan di putaran terakhir |
| --- | --- |
| Bahasa Indonesia + markdown + status proses | ✓ lulus |
| "tepat 3 kata" → `Kopi adalah minuman.` (diperbaiki 1×) | ✓ lulus |
| Daftar bernomor tanpa kalimat pembuka | ✓ lulus (setelah perbaikan pada uji) |
| Perintah bahasa Inggris | ✓ lulus |
| Hanya blok kode (Python) | ✓ lulus |
| Mode Berpikir tanpa proses internal | ✓ lulus |
| **Arahan proyek "Aturan coding: TypeScript"** | ✓ **lulus** — `DIPATUHI (terlihat anotasi tipe)`, ```` ```typescript ```` dengan tipe pada parameter |
| **AI Builder nyata (proyek multi-berkas)** | ✓ **lulus** — "KartuUlangTahun" (app.js · index.html · styles.css), pratinjau terisi, selesai ± 40 detik |
| **Visi (foto)** | ✓ **lulus** — "warna disebut · bentuk disebut" (gambar uji sah; antrean model visi diperbaiki) |
| Riset mendalam | ✓ **lulus** — 7 langkah · 7 sumber · 7 tautan nyata · berkas `riset-*.html` |
| Kuota & galat JS | ✓ **lulus** — penghitung 10 permintaan, **0 galat JS** |

Pengetesan live hari ini menghabiskan kuota 50 permintaan/hari lagi
(`POST /api/chat` → `{"ok":false,"kuota":true,…}`; endpoint `/api/v1/key`
memang tidak menampilkan batas gratis ini). Kalau dijalankan sekarang,
rangkaian berhenti jujur dengan `HASIL: SEBAGIAN — kuota gratis harian habis,
ulangi setelah 07.00 WIB` dalam ± 3 detik, bukan menggantung.

---

## 6. Batas yang jujur

* Model gratis kadang perlu 1–3 kali ditegur sebelum bentuk jawaban pas. Aplikasi
  melakukannya otomatis; kalau tetap tidak pas, catatan muncul di balon jawaban.
* Pemeriksaan bahasa kode hanya untuk bahasa yang bisa dikenali andal
  (TypeScript, JavaScript, Python, PHP, Go, Java, SQL, Rust). Untuk framework
  (React/Vue/Next) tidak ada pemeriksaan otomatis — hanya arahan di prompt.
* Bila proyek memakai aturan coding dan pertanyaan meminta kode, jawaban dikirim
  **utuh** (bukan mengalir kata per kata) supaya bisa diperiksa & diperbaiki —
  mode streaming tetap dipakai untuk obrolan biasa.
* Kuota gratis: **50 permintaan/hari**; angka pemakaian di aplikasi mengikuti
  pemberitahuan penyedia (tidak menebak).
* Wikipedia kadang membatasi permintaan (HTTP 429) — aplikasi mencoba ulang,
  lalu menyebutkannya, dan memakai sumber dari penyedia lain.

---

## 7. Cara mengulang semuanya

```bash
cd /home/user/van-chat-spy
node tools/server-uji.mjs &                      # server uji :8131

export LD_LIBRARY_PATH=/tmp/libs/x/usr/lib/x86_64-linux-gnu:/tmp/libs/x/lib/x86_64-linux-gnu
export PUPPETEER_CACHE_DIR=/tmp/pcache
export CHROME=$(ls /tmp/pcache/chrome/*/chrome-linux64/chrome | head -1)
# (kalau /tmp dibersihkan: bash tools/siapkan-chromium.sh)

node tools/smoke-18.mjs
node tools/uji-arahan-proyek.mjs
node tools/uji-bagian-h.mjs
node tools/uji-tampilan.mjs
node tools/uji-bentuk.mjs                 # lapis logika (gratis)
node tools/uji-rahasia.mjs
node tools/uji-cari.mjs
node tools/uji-api.mjs

# setelah 07.00 WIB (kuota terisi ulang):
node tools/uji-bentuk.mjs --live          # 4 permintaan nyata
node tools/uji-live.mjs                   # ± 12–15 permintaan nyata
```
