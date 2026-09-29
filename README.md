# Van Chat.SPY — ruang kerja AI

Aplikasi satu halaman: **kolom riwayat · kolom percakapan · ruang kerja**.
Jawaban AI mengalir (streaming), kode diwarnai, dan setiap berkas hasil
(halaman web, SVG, skrip) muncul di ruang kerja — bisa dipratinjau, dicoba di
berbagai ukuran layar, dan diunduh tanpa keluar dari percakapan.

```
van-chat-spy/
├─ index.html            satu halaman aplikasi (kerangka 3 kolom)
├─ manifest.webmanifest  agar bisa dipasang sebagai aplikasi (Android/desktop)
├─ assets/
│  ├─ app.css            tata rupa: token warna, tema gelap/terang, responsif
│  ├─ app.js             mesin: percakapan, streaming, markdown, ruang kerja, riwayat, referensi
│  ├─ icons.js           115 ikon SVG garis (tanpa emoji) — window.IC
│  ├─ logo.png           logo Van Chat.SPY (PNG transparan 512 px) + logo-192/1024, favicon-64
├─ api/                  fungsi backend untuk Vercel (Edge)
│  ├─ chat.js            percakapan + streaming + kuota + pilihan model per mode
│  ├─ builder.js         pembuat satu berkas HTML utuh (halaman/website)
│  ├─ search.js          pencarian web + sitasi (5 penyedia tanpa kunci)
│  ├─ providers.js       status penyedia (kunci hanya tersamar) + aturan keamanan
│  ├─ image/generate.js  pembuat gambar (IMAGE_PROVIDER + IMAGE_API_KEY)
│  ├─ deploy.js          deploy otomatis (DEPLOY_PROVIDER + DEPLOY_TOKEN)
│  ├─ cron.js            penjadwal tugas sisi-server (penyimpanan KV)
│  ├─ _ai.js             lapisan penyedia: generateText/streamText/analyzeImage/generateImage/STT/TTS
│  ├─ _aman.js           pengaman bersama: batas permintaan, validasi, asal, audit
│  └─ health.js          status kesiapan (dipakai panel kiri bawah)
└─ tools/                (tidak ikut terunggah — lihat .vercelignore)
   ├─ server-uji.mjs     server lokal yang meniru hosting (port 8131)
   ├─ siapkan-chromium.sh  menyiapkan Chromium + pustaka sistem di /tmp (sekali per sesi)
   ├─ smoke-18.mjs       asap cepat: semua halaman utama terbuka, tombol kunci ada, nol galat JS
   ├─ uji-tampilan.mjs   uji nyata di Chromium (tampilan A–G)
   ├─ uji-bagian-h.mjs   uji butir 15–53 (riset, builder, editor, gambar, suara, halaman baru)
   ├─ uji-rahasia.mjs    uji keamanan: kunci tidak bocor, asal asing ditolak, masukan divalidasi
   ├─ uji-api.mjs        uji backend tanpa memakai kuota AI (badan permintaan diperiksa)
   ├─ uji-cari.mjs       uji /api/search pada penyedia sungguhan
   ├─ uji-bentuk.mjs     "respon AI sesuai perintah": lapis logika (tanpa kuota) + lapis AI sungguhan (--live)
   ├─ uji-arahan-proyek.mjs  arahan proyek benar-benar terkirim ke AI (tanpa kuota, penyedia ditiru)
   ├─ uji-live.mjs       uji dengan KUOTA sungguhan: bahasa, format ketat, visi, riset, builder
   ├─ uji-bynara.mjs     uji alur NaraRouter (tiruan): model, streaming, foto, builder, kunci salah, pulih tanpa restart
   ├─ mock-openai.mjs    tiruan gateway OpenAI-compatible untuk pengujian (tanpa kuota)
   ├─ cek-penyedia.mjs   periksa penyedia AI (daftar model, kunci, percakapan uji)
   ├─ cek-impor-api.mjs  memastikan semua endpoint bisa diimpor (tidak ada nama ekspor salah)
   ├─ cek-ikon.mjs       memastikan semua nama ikon yang dipakai itu ada
   ├─ buat-logo.py       mengubah gambar logo (JPG latar hitam) → PNG transparan + favicon
   ├─ buat-contoh-berkas.py  membuat contoh DOCX/PDF/XLSX untuk uji lampiran berkas
   ├─ _modul17.js · _modul18a.js · _modul19.js  modul halaman (dipakai index.html)
   └─ contoh/            berkas contoh untuk uji (bukan bagian aplikasi)
```

## 1. Mencoba di komputer sendiri

```bash
cd van-chat-spy
node tools/server-uji.mjs          # lalu buka http://127.0.0.1:8131/
```

Uji otomatis (tanpa kuota AI) — dijalankan dari folder proyek:

```bash
npm run uji                 # 12 rangkaian uji backend/logika (tanpa browser)
npm i puppeteer             # sekali saja, untuk uji yang memakai browser sungguhan
npm run uji:tampilan        # uji tampilan & tombol nyata di Chromium
```

Berkas backend yang dijalankan persis sama dengan yang nanti dipakai di
hosting, jadi yang terlihat lokal = yang akan jalan setelah dipasang.

### 1b. Menyiapkan kunci penyedia AI (NaraRouter)

Aplikasi ini bicara ke **NaraRouter** (https://router.bynara.id) — satu kunci
untuk banyak model, dengan paket gratis untuk mulai. Tanpa kunci, aplikasi tetap
bisa dibuka, tetapi setiap percakapan dijawab jujur «kunci NaraRouter belum
dipasang» — tidak ada jawaban palsu.

```bash
# 1. Buat kunci di https://router.bynara.id/keys  (berawalan sk-nry-…)
# 2. Periksa kuncinya dari terminal (sekaligus menyimpan ke tools/penyedia.json):
node tools/cek-penyedia.mjs --url https://router.bynara.id/v1 --key sk-nry-XXXX --nama bynara --tulis
# 3. Jalankan aplikasi:
node tools/server-uji.mjs          # http://127.0.0.1:8131/  → Setelan → Model AI
```

Tanpa `--tulis`, cukup pakai environment variable:
`AI_PROVIDER=bynara AI_API_KEY=sk-nry-XXXX node tools/server-uji.mjs`.

Daftar model di Setelan diambil langsung dari akunmu (`GET /v1/models`), jadi
yang muncul hanya model yang boleh dipakai paketmu. Kalau penyedia/jaringan
sedang tidak bisa dihubungi, jawabannya jujur dan web mencoba lagi otomatis —
begitu normal, percakapan langsung jalan tanpa perlu restart.

## 2. Memasang (Vercel)

**Tidak ada kunci di dalam kode.** Setelah repo ini di-import:

1. Buka vercel.com → **Add New → Project** → pilih repo ini (tidak perlu build
   step; `/api/*.js` otomatis menjadi Edge Function, sisanya berkas statis).
2. Project → **Settings → Environment Variables**, isi:
   `AI_PROVIDER=bynara` · `AI_API_KEY=sk-nry-…` (kunci NaraRouter-mu).
   Opsional: `AI_MODEL_FAST`, `AI_MODEL_THINK`, `AI_MODEL_VISI`, `ALLOWED_ORIGINS`, `APP_URL`.
3. **Deploy** — lalu buka webnya. Kalau env diubah belakangan, **redeploy**
   supaya berlaku.

Langkah super rinci (nama env satu per satu, contoh isi, cara memastikan sudah
benar, dan daftar masalah umum) ada di **`PANDUAN-VERCEL.md`**.

> `.vercelignore` mengeluarkan folder `tools/` (perkakas uji lokal) supaya tidak
> ikut terunggah.

## 3. Logo

Logo diambil dari gambar yang kamu kirim: latar hitam dipisahkan menjadi kanal
alpha, warnanya dipertahankan (merah `#fa0102`), lalu dipotong rapi dan
diskalakan. Perintah untuk mengulanginya (misalnya kalau gambarnya diganti):

```bash
python3 tools/buat-logo.py "path/gambar-baru.jpg"
```

Hasilnya dipakai di: lencana merek kiri atas, avatar jawaban AI, papan sambutan
(berdenyut), favicon tab browser, dan ikon aplikasi saat dipasang ke layar
utama.

## 4. Yang benar-benar jalan

| Bagian | Keadaan |
| --- | --- |
| Percakapan AI | **nyata**, 4 mode: Fast · Think · Deep · Expert — bisa dipilih dari bilah atas **atau** tombol mode di kotak tulis |
| Jawaban mengalir | **nyata** (SSE langsung dari penyedia AI) + kursor berkedip + tombol Hentikan (Esc) |
| Pembuat halaman web | **nyata** — `/api/builder` mengembalikan satu berkas HTML utuh |
| Referensi Wikipedia | **nyata** — browser mengambil ringkasan dari Wikipedia Indonesia (tanpa kunci API), lalu dikirim sebagai bahan tambahan untuk AI; lencananya muncul di balon pengguna. Bisa dinyalakan lewat chip "Cari referensi" atau Pengaturan |
| Lampiran berkas | berkas teks/kode (≤ 400 KB) **benar-benar dibaca** dan isinya ikut dikirim ke AI |
| Riwayat percakapan | lengkap di browser (localStorage): cari, ganti nama, hapus, sematkan, kelompok waktu, ekspor/impor JSON |
| **Foto → AI melihat (vision)** | **nyata** — sampai 3 foto per pesan dikecilkan di browser lalu dikirim ke model yang memang menerima gambar (antrean model visi hanya berisi model yang benar-benar menerima gambar; terbukti menjawab "latar merah, lingkaran putih, batang biru" untuk gambar uji) |
| **Memori AI** | **nyata** — catatan tersimpan ikut dikirim di setiap pertanyaan (bisa dimatikan); ada tombol simpan cepat dari balon jawaban |
| **Proyek** | **nyata** — tiap proyek punya arahan tetap; percakapan di dalamnya terkelompok, riwayat bisa disaring; percakapan umum tidak pernah hilang dari daftar |
| **Arahan proyek = apa yang dibaca AI** | **nyata** — ringkasan arahan yang terlihat di halaman Proyek (bahasa · aturan coding · gaya desain · arahan tambahan) itulah yang dikirim pada setiap pesan di obrolan proyek; kotak tulis menampilkan catatan jujur bila obrolan yang dibuka belum masuk proyek, dengan satu tombol untuk memasukkannya |
| **Bahasa kode proyek diperiksa, bukan cuma diminta** | **nyata** — bila proyek memakai aturan coding (mis. TypeScript) dan pertanyaan meminta kode, contoh kode di jawaban diperiksa: bukan bahasa yang diminta → model diminta memperbaiki (sampai 3 putaran); kalau tetap tidak pas, muncul catatan jujur, bukan jawaban yang berpura-pura patuh |
| **Pengaman pratinjau (anti-macet)** | **nyata** — kode berisi perulangan tanpa henti (`while(true)`, `for(;;)`, `do…while(true)`) **tidak dijalankan** di Builder, ruang kerja, maupun Pustaka: pratinjau ditahan, alasannya disebut beserta nomor baris, dan pengguna diberi pilihan aman (tampilkan tanpa skrip / buka di tab terpisah) |
| **Tugas terjadwal** | **nyata selama halaman terbuka** — tugas "sekali"/"harian" dijalankan otomatis (diperiksa tiap 20 detik) dan hasilnya jadi percakapan "Tugas: …" + notifikasi browser |
| **Riset dalam** | **nyata (versi ringkas)** — menyusun rencana → mengambil 4 artikel Wikipedia → menulis laporan jadi berkas `riset-*.html` (memakai 2 permintaan kuota); konfirmasinya berupa bilah **di dalam aplikasi** (Batal · Lanjutkan), bukan dialog bawaan browser yang membekukan halaman |
| **Pustaka berkas + editor** | **nyata** — semua berkas hasil ada di ruang kerja: dipakai ulang di percakapan, unggah, berkas baru, ganti nama, unduh, hapus, dan **disunting langsung** lalu disimpan |
| **Pencarian web + sitasi** | **nyata** — `/api/search` menanyakan 6 penyedia tanpa kunci API (Wikipedia Indonesia, DuckDuckGo Instant, Stack Overflow, Hacker News, GitHub, + web umum opsional). Hasilnya dipakai AI dengan tanda `[1] [2] [3]`, blok **Sumber** tampil di bawah pertanyaan, dan ada tombol **Hapus hasil Web** |
| **Alat hitung lokal** | **nyata & tanpa kuota** — `hitung(18*7+5)`, `hitung: 9*9`, `berapa (12+8)*3`, konversi satuan (`12 km to m`), jam WIB, jumlah kata dijawab pasti di browser; hasilnya jadi **pesan alat** dengan tombol **Ulangi Tool** |
| **Jenis pesan** | **nyata** — pengguna · AI (mengalir) · **sistem** (mis. mode/riset/pustaka) · **alat** (hasil tool, lengkap dengan tombol ulangi) · **galat** (mis. kuota habis, jaringan putus). Semuanya ikut tersimpan di riwayat |
| **Kotak pasir "Jalankan"** | **nyata** — blok kode HTML/SVG/CSS/JS punya tombol **Perbesar** (editor + nomor baris + bahasa) dan **Jalankan** di iframe `sandbox="allow-scripts allow-modals allow-forms"` (tanpa `allow-same-origin`); keluaran tampil di panel *Keluaran*, dan galat sintaks dilaporkan ke pengguna |
| **Riset mendalam (butir 15)** | **nyata** — 7 langkah berstatus (rencana → sumber → kumpulkan → analisis → bandingkan → periksa → laporan), sumber dari `/api/search`, hasilnya berkas `riset-*.html` dengan sitasi `[n]` |
| **AI Builder (butir 24–25)** | **nyata** — 10 langkah, proyek multi-berkas, pratinjau di iframe terisolasi, konsol & jaringan, uji otomatis, build, ZIP, deploy (butuh penyedia), dan **diff Terima/Tolak/Batalkan** sebelum perubahan besar |
| **Code editor (butir 28)** | **nyata** — nomor baris, sorot sintaks (JS/TS/React/Next/HTML/CSS/Python/JSON/SQL…), cari, ganti, ganti semua, rapikan, salin, unduh |
| **Studio gambar (butir 17)** | **nyata bila kunci diisi** — prompt, rasio, kualitas, buat ulang, simpan ke Pustaka, unduh, tambah ke Proyek |
| **Mode suara (butir 18)** | **nyata lewat browser** — Mikrofon · Mulai Voice · Berhenti · Mute · Speaker; alur bicara → STT → AI → TTS |
| **Proyek · memori · tugas · plugin (butir 19–23)** | **nyata** — 7 penghitung, instruksi otomatis ke AI, 4 kategori memori, penjadwal (server bila KV diisi), 6 plugin dengan izin tertulis |
| **Pencarian global (butir 36)** | **nyata** — `Ctrl+Shift+K`, hasil berkelompok: Obrolan · Pesan · Proyek · File · Builder |
| **Bagikan & cabang (butir 37–38)** | **nyata** — tautan hanya-baca + masa berlaku, atau mode Pribadi; cabang obrolan tidak mengubah percakapan asli |
| **Pengaturan · admin (butir 39–40)** | **nyata** — 14 menu setelan (tema Terang/Gelap/Sistem), `/admin` bergerbang kunci dengan System Health, Penggunaan, Model, Provider, Plugin, Rate Limit, dan Log audit |
| **Ekspor data (butir 53)** | **nyata** — JSON · TXT · CSV (percakapan, proyek, metadata berkas, preferensi) + impor percakapan |
| **Halaman /library** | **nyata** — tab Semua File · Gambar · Dokumen · Kode · Arsip, cari, urutkan (nama/ukuran/terbaru), tag, proyek, pratinjau + ganti nama/unduh/hapus/ke percakapan |
| **Kamera** | **nyata di https/localhost** — ambil foto, pratinjau, ambil ulang, kirim ke model vision |
| **Tempel & seret berkas** | **nyata** — tempel gambar langsung jadi lampiran; tempelan ≥1200 karakter jadi lampiran berkas; berkas bisa diseret ke area percakapan |
| Ruang kerja | pratinjau · kode berwarna · daftar berkas · ukuran layar · unduh · buka tab baru |
| Geser & atur panel | dua pembatas bisa digeser tetikus (atau tombol panah saat fokus), **klik ganda = kembali ke ukuran otomatis** yang ikut menyesuaikan layar |
| Saran cepat | baris chip di atas kotak tulis: Jelaskan · Buat halaman web · Periksa kode · Ringkas · Cari referensi |
| Papan sambutan | logo berdenyut + cincin mengembang, saran cepat muncul bertahap |
| Suara | text-to-speech & input suara memakai **Web Speech API bawaan browser** |
| Tema | gelap & terang, ukuran huruf, lebar kolom — tersimpan di perangkat |
| Bisa dipasang | `manifest.webmanifest` + ikon → "Tambahkan ke layar utama" di Android, ikon app di desktop |

Batas yang perlu diketahui (jujur):

* **Kuota**: batas permintaan mengikuti **paket akunmu di NaraRouter** (paket gratis punya batas menit & token harian). Aplikasi tidak mengarang angka kuota — pesan dari penyedia ditampilkan apa adanya.
* **Referensi Wikipedia**: artikel yang diambil adalah artikel Wikipedia itu sendiri — AI tidak menjelajah internet bebas, jadi untuk berita/angka terkini tetap bisa keliru. Fitur ini bisa dimatikan.
* Riwayat disimpan di **browser** pengguna, bukan di server; hapus data browser = riwayat hilang (pakai Ekspor dulu bila perlu).
* Bukan pembuat gambar: halaman/SVG dibuat lewat kode. Model pembuat gambar di penyedia AI semuanya berbayar, jadi tidak ada tombol "buat gambar" yang pura-pura jalan.
* **Tugas terjadwal** berjalan saat aplikasi terbuka di browser. Tanpa server penyimpan tugas, halaman yang ditutup = tugas menunggu sampai dibuka lagi.
* **Memori, proyek, dan riwayat** hidup di browser pengguna (localStorage), bukan di server.
* **Jawaban AI jujur soal kuota/biaya**: aplikasi tidak pernah menampilkan jatah
  kuota yang tidak diketahuinya; pesan batas/kuota dari penyedia diteruskan apa
  adanya, dan percakapan lama tetap bisa dibaca.
* Rincian riwayat pengerjaan (19 daftar fitur · butir 8–14 · butir 15–53 ·
  laporan F19) tersimpan di folder lokal `dokumen-lama/` — **tidak** ikut
  diunggah ke repo publik.
* **Pencarian web**: penyedia bebas kunci itu ensiklopedia/forum/repositori —
  bukan mesin pencari umum. Google/Bing/Brave butuh kunci berbayar, dan HTML
  DuckDuckGo menolak permintaan otomatis. Isi `SEARCH_API_KEY` bila punya kunci
  resmi → otomatis dipakai lebih dulu.
* **Buat gambar**: jalur AI-nya lengkap (`/api/image/generate`, `IMAGE_PROVIDER` +
  `IMAGE_API_KEY`, rasio & kualitas, simpan ke Pustaka, tambah ke Proyek). Tanpa
  kunci, tombolnya **mengatakannya apa adanya** dan menawarkan gambar lewat kode
  (SVG/HTML/canvas) — bukan gambar AI palsu.
* **Plugin pihak ketiga** tidak dipasang (butuh server + kotak pasir); menu
  "Plugin" menampilkan **6 alat bawaan yang benar-benar jalan + 1 yang ditandai
  "belum dipasang"** — lengkap dengan izin, endpoint, dan autentikasinya.
* Kalau semua model cadangan sedang sibuk, jawaban gagal dengan pesan yang jelas — bukan diam-diam kosong.
* **Perintah bentuk** ("tepat tiga kata", "maksimal 5 kata", "hanya daftar bernomor", "hanya kodenya") diperiksa di server dan diperbaiki otomatis sampai 3 putaran — **tepat**, **maksimal**, dan **minimal** dibedakan ("maksimal 8 kata" tidak lagi dianggap "harus pas 8"). Permintaan internal aplikasi (Builder, Riset, Perbaiki berkas) sengaja **tidak** lewat pemeriksa ini: jawabannya dipakai sebagai data (JSON/isi berkas), bukan sebagai jawaban pengguna. Kalau model tetap meleset, aplikasi **mengatakannya** lewat catatan di balon jawaban — tidak ada klaim palsu bahwa perintah sudah dipatuhi.
* **Batas permintaan penyedia tercapai** ditampilkan apa adanya ("batas penyedia tercapai (dari NaraRouter)"); percakapan lama tetap bisa dibaca dan ruang kerja tetap bisa dipakai.

## 5. Uji tampilan (bukti)

Uji memakai Chromium sungguhan; setiap tombol diklik dengan tetikus asli dan
diperiksa dulu dengan `elementFromPoint` supaya tidak lolos palsu.

```bash
# terminal 1
npm run mulai                       # server di http://127.0.0.1:8131/

# terminal 2
npm run uji                         # backend & logika (tanpa kuota, tanpa browser)
npm i puppeteer                     # sekali saja — mesin Chromium untuk uji tampilan
npm run uji:tampilan                # klik tombol sungguhan di Chromium
```

Rinciannya (bisa juga dijalankan satu per satu):

```bash
node tools/uji-bentuk.mjs          # "respon AI sesuai perintah": lapis logika (gratis)
node tools/uji-api.mjs             # kontrak endpoint (badan permintaan diperiksa)
node tools/uji-bynara.mjs          # alur NaraRouter lengkap (gateway ditiru, tanpa kuota)
node tools/uji-rahasia.mjs         # keamanan: kunci tidak bocor, asal asing ditolak
node tools/cek-impor-api.mjs       # semua endpoint bisa diimpor
node tools/cek-ikon.mjs            # semua nama ikon ada
node tools/cek-penyedia.mjs        # periksa penyedia (--url --key) sebelum dipakai
node tools/uji-cari.mjs            # pencarian web sungguhan (tanpa kuota AI)
node tools/uji-tampilan.mjs        # tampilan A–G + ponsel + backend asli
node tools/uji-bagian-h.mjs        # butir 15–53 (penyedia AI ditiru)
node tools/uji-arahan-proyek.mjs   # arahan proyek benar-benar terkirim
node tools/smoke-18.mjs            # asap: 6 halaman + tombol kunci + nol galat JS
node tools/uji-live.mjs            # KUOTA sungguhan (± 12 permintaan) — dengan kunci asli
```

### Memakai NaraRouter (satu-satunya penyedia aplikasi ini)

Petunjuk lengkap + hasil pemeriksaan endpoint-nya ada di
**PANDUAN-PENYEDIA-BYNARA.md**. Ringkasnya:

```bash
node tools/cek-penyedia.mjs --url https://router.bynara.id/v1 --key sk-nry-XXXX --nama bynara --tulis
npm run uji           # uji backend/logika (tanpa kuota, tanpa browser)
npm i puppeteer       # sekali saja — untuk uji tampilan di Chromium
npm run uji:tampilan  # uji tombol & tampilan sungguhan
```

**Gateway OpenAI-compatible lain?** Boleh. Isi `AI_BASE_URL` + `AI_API_KEY`
(lihat *PANDUAN-VERCEL.md § 5b*). Aplikasi membaca daftar model dari gateway itu,
menyisir kandidat sampai ketemu model yang benar-benar aktif, lalu mengingatnya —
jadi gateway yang daftar modelnya "ramai tapi separuh mati" tetap bisa dipakai.
Kosongkan `AI_BASE_URL` untuk kembali ke NaraRouter. Uji nyata gateway pihak
ketiga (percakapan, streaming, foto, builder) ada di
`bukti-uji/HASIL-UJI-GATEWAY-KUSTOM.txt`.

