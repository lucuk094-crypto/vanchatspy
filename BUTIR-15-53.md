# Van Chat.SPY — Jawaban untuk butir 15–53

**Pertanyaanmu:** "apakah sudah memenuhi syarat ini juga?"
**Jawaban singkat:** sudah dikerjakan seluruhnya dan diuji ulang hari ini dengan **Chromium sungguhan** (klik tetikus nyata lewat `elementFromPoint`), bukan sekadar diperiksa dari kode.

| Butir | Isi | Status |
|---|---|---|
| 15 | Riset Mendalam (rencana → sumber → kumpulkan → analisis → bandingkan → periksa → laporan + sitasi) | ✅ sudah |
| 16 | Mode Berpikir (Normal / Berpikir / Berpikir Mendalam, model bisa diganti, tanpa proses berpikir internal) | ✅ sudah |
| 17 | Buat Gambar (prompt, rasio, kualitas, ulang, simpan, unduh, Pustaka, ke Proyek) | 🟡 jalur lengkap, **butuh kunci** `IMAGE_PROVIDER` + `IMAGE_API_KEY` |
| 18 | Voice (STT/TTS/percakapan suara, tombol Mikrofon·Mulai Voice·Berhenti·Mute·Speaker) | 🟡 jalan lewat mesin browser (Web Speech), server opsional |
| 19 | Proyek `/projects` (nama, deskripsi, instruksi, obrolan, file, gambar, memori, tugas, plugin, builder) | ✅ sudah |
| 20 | Instruksi Proyek (Bahasa, aturan coding, gaya desain) otomatis dipakai AI | ✅ sudah |
| 21 | Memori (4 kategori, ringkasan, kelola, minta AI memperbarui, nonaktifkan, pribadi) | ✅ sudah |
| 22 | Tugas Terjadwal `/scheduled` (sekali/berulang, nama, prompt, jadwal, zona waktu, status, terakhir, berikutnya) | 🟡 penjadwal server butuh KV; tanpa itu tugas jalan selama halaman terbuka (dinyatakan jujur di halaman) |
| 23 | Plugin (nama, deskripsi, ikon, provider, izin, endpoint, auth, aksi — semua lewat backend) | ✅ sudah (6 plugin aktif + 1 jujur "belum dipasang") |
| 24 | AI Builder 10 langkah (paham → … → deployment) | ✅ sudah |
| 25 | Builder UI (buat/edit/hapus/ganti nama/pindah, folder, komponen, API, refactor, debug + **Diff Terima/Tolak/Batalkan**) | ✅ sudah |
| 28 | Code Editor (JS/TS/React/Next/HTML/CSS/Python/JSON/SQL: sorot, nomor baris, cari, ganti, rapikan, salin, unduh) | ✅ sudah (baru dilengkapi di putaran ini) |
| 29 | Live Preview (desktop/tablet/mobile, refresh, buka, konsol, error, jaringan, status build) | ✅ sudah |
| 30 | Website Builder (landing page, toko online, streaming, dashboard admin) | ✅ sudah (4 contoh cepat di Builder) |
| 34 | Deployment (status Mempersiapkan…/Membangun…/Menjalankan test…/Berhasil…/Siap deploy., provider, URL) | 🟡 build+test jalan lokal; deploy otomatis butuh `DEPLOY_PROVIDER` + `DEPLOY_TOKEN` |
| 36 | Pencarian Global (chat/pesan/proyek/file/builder, hasil berkelompok) | ✅ sudah |
| 37 | Bagikan Chat (Pribadi / tautan / masa berlaku) | ✅ sudah |
| 38 | Cabang Obrolan (dari titik konteks, percakapan asli tidak berubah) | ✅ sudah |
| 39 | Pengaturan `/settings` (14 menu; Terang/Gelap/Sistem) | ✅ sudah (14 menu terhitung di uji) |
| 40 | Admin `/admin` (RBAC, System Health, Penggunaan, Model, Provider, Plugin, Rate Limit, Log, Pengguna) | 🟡 gerbang lokal + apa yang benar-benar ada; Users/Chat/File semua orang tidak ada karena tidak ada basis data server |
| 41 | Sistem Model AI (generateText/streamText/analyzeImage/generateImage/speechToText/textToSpeech, penyedia bisa diganti env) | ✅ sudah |
| 49 | Keamanan (batas permintaan, validasi, izin plugin, isolasi kunci, CSRF/asal, audit, kotak pasir builder) | ✅ sudah diuji `tools/uji-rahasia.mjs` |
| 52 | Notifikasi (toast 4 jenis, status memuat, kerangka/skeleton, tidak spam) | ✅ sudah |
| 53 | Ekspor Data (JSON/TXT/CSV) | ✅ sudah |

Ringkasan: **18 butir ✅ · 6 butir 🟡 (karena butuh kunci/biaya milikmu, bukan karena belum dibuat) · 0 butir ⛔.**

---

## Cara menguji ulang sendiri

```bash
cd van-chat-spy
node tools/server-uji.mjs &           # server uji di :8131
node tools/uji-bagian-h.mjs           # butir 15–53 (Chromium sungguhan)
node tools/uji-tampilan.mjs           # tampilan A–G
node tools/uji-rahasia.mjs            # keamanan: kunci & rahasia
node tools/uji-cari.mjs               # /api/search (penyedia sungguhan)
node tools/uji-api.mjs                # backend tanpa kuota
node tools/cek-impor-api.mjs          # semua endpoint bisa diimpor
node tools/cek-ikon.mjs               # ikon SVG
```
Hasil terakhir tersimpan di `bukti-uji/` (`HASIL-UJI-BAGIAN-H.txt`, `HASIL-UJI-TAMPILAN.txt`, `HASIL-UJI-RAHASIA.txt`, …) beserta 36 tangkapan layar.

---

## Rincian per butir

### 15. RISET MENDAALAM ✅
**Alur nyata 7 langkah**: membuat rencana (AI) → mencari sumber (`/api/search`: Wikipedia ID, Stack Overflow, Hacker News, GitHub) → mengumpulkan informasi → menganalisis (AI kedua) → membandingkan (analisis lokal antarsumber) → memeriksa informasi (tautan sah, duplikat dibuang) → membuat laporan.
- Status proses muncul di kotak tulis: `Sedang membuat rencana…`, `Sedang mencari sumber…`, `Sedang mengumpulkan informasi…`, `Sedang menganalisis…`, `Sedang memeriksa informasi…`, `Sedang membuat laporan…`.
- Hasil: **berkas laporan HTML** (`riset-<id>.html`) masuk ke Kartu berkas + Pustaka, berisi daftar sumber dengan nomor sitasi `[1]`, `[2]`…
- Jejak langkah tetap tertinggal di pesan akhir (bukan hilang) supaya bisa diperiksa.
- **Bukti uji:** `riset mendalam → 7 langkah … · sumber 4 · label penyedia 4` dan `berkas laporan: riset-…html`; screenshot `bukti-uji/40-riset-mendalam.png`.
- Jujur: sumbernya penyedia publik tanpa kunci (Wikipedia/SO/HN/GitHub). Indeks web umum (Google/Bing) butuh kunci berbayar yang tidak saya pasang diam-diam.

### 16. MODE BERPIKIR ✅
- Empat mode: **Normal**, **Berpikir**, **Berpikir Mendalam** (+ Expert sebagai tambahan). Masing-masing punya model sendiri.
- **Model & penyedia bisa dikonfigurasi**: Setelan → **Model AI** menyediakan pilihan model per mode (daftar diambil dari `GET /api/chat`, hanya model yang terdaftar di server yang diterima). Uji membuktikan pilihan benar-benar ikut dikirim: `model AI → mode Berpikir mengirim model "dots-studio/dots-3-note-preview:free"`.
- Penyedia (OpenRouter/OpenAI/Groq/Together/DeepSeek/Mistral/Ollama) diganti dari sisi server lewat env `AI_PROVIDER` — tanpa menyentuh kode.
- **Tanpa proses berpikir internal**: yang terlihat hanya (a) status proses, (b) ringkasan alasan bila perlu, (c) jawaban akhir. Ada catatan eksplisit di lembar mode: *"…proses berpikir internal model tidak ditampilkan"*, dan status berputar tiap 2,2 detik: `menyiapkan jawaban… / menimbang konteks… / menyusun jawaban… / merapikan…`. Backend juga mematikan keluaran penalaran (`reasoning: {enabled:false}`).

### 17. BUAT GAMBAR 🟡 (kode lengkap, jalan penuh begitu kunci diisi)
- Ada: prompt, **rasio** (1:1, 16:9, 9:16), **kualitas** (standar/HD), **Buat ulang**, **Simpan ke Pustaka**, **Unduh**, **Tambah ke Proyek**; endpoint `POST /api/image/generate`; rasio/ukuran diatur di server (1:1 → 1024², 16:9 → 1792×1024).
- Penyedia diganti lewat env `IMAGE_PROVIDER` + `IMAGE_API_KEY` (openai/groq/together/dll).
- **Uji dua arah:** tanpa kunci → pesan apa adanya (`Pembuat gambar AI belum bisa dipakai: semua penyedia gambar mewajibkan kunci…`) + jalur alternatif **SVG lewat kode**; dengan penyedia aktif (ditiru di uji) → gambar tampil, tombol simpan aktif, tersimpan ke Pustaka.
- Jujur: model gambar di akun gratis tidak tersedia — saya tidak memalsukan gambar AI. Kalau kunci diisi, jalur ini langsung bekerja.

### 18. VOICE 🟡 (UI lengkap, mesin suara dari browser)
- Tombol persis seperti diminta: **Mikrofon · Mulai Voice · Berhenti · Mute · Speaker** (terverifikasi uji).
- Alur 6 langkah: bicara → pengenalan suara (STT) → transkrip ke kotak tulis → AI menjawab → dibacakan (TTS) → siap bicara lagi.
- STT memakai Web Speech API browser (id-ID), TTS memakai `speechSynthesis`. Bila `STT_PROVIDER`/`TTS_PROVIDER` diisi di hosting, jalur server dipakai dan statusnya terlihat di Setelan → Suara.
- Jujur: Chromium di lingkungan uji tidak punya mesin pengenal suara, jadi uji memverifikasi tombol, alur, Mute/Stop — bukan transkripsi sungguhan.

### 19. PROYEK `/projects` ✅
- Satu proyek memuat: nama, deskripsi, instruksi tetap, **obrolan, file, gambar, memori, tugas, plugin, builder** — **7 penghitung** nyata (teruji) + tombol pilih/ubah/hapus.
- Contoh nama disediakan: **Novel.ID, MIRU, Van Dream, Generate QR Pro**.
- Uji: `proyek → 1 kartu … · 7 penghitung: 0 obrolan · 0 file · 0 gambar · 0 memori · 0 tugas · 6 plugin · 0 builder`.

### 20. INSTRUKSI PROYEK ✅
- Tiga bagian: **Bahasa jawaban**, **Aturan coding**, **Gaya desain**; terbentuk otomatis saat proyek dibuat dan dikirim ke AI pada tiap pesan (`proyek → instruksi otomatis: Bahasa jawaban: Indonesia · Aturan coding: JavaScript · Gaya desain: Clean Minimalis`).
- Uji lama juga memverifikasi arahan benar-benar ada di badan permintaan ke `/api/chat`.

### 21. MEMORI ✅
- **4 kategori**: tentang saya, preferensi, pekerjaan, catatan penting.
- Lihat ringkasan per kategori, tambah/ubah/hapus, **"Minta AI memperbarui"** (AI menyimpulkan dari percakapan lalu menyimpan), sakelar nonaktif, dan privasi: hanya di browser ini — tidak ada server yang menyimpan, jadi pengguna lain tidak bisa membacanya.

### 22. TUGAS TERJADWAL `/scheduled` 🟡
- Ada: **sekali jalan / harian / mingguan**, nama, prompt, jam, **zona waktu**, status aktif/nonaktif, **terakhir dijalankan**, **berikutnya**, tombol jalankan sekarang, simpan ke penjadwal, hapus.
- Penjadwal sisi-server: `POST /api/cron` dengan penyimpanan KV (`KV_REST_API_URL` + `KV_REST_API_TOKEN`) + cron hosting. Selama belum diisi, halaman menyatakan terus terang: *"Belum aktif… tugas berjalan di browser selama halaman ini terbuka — bukan diam-diam diklaim jalan terus."*
- Uji: `tugas → 1 baris … jadwal: Setiap Senin pukul 08:00 (Asia/Jakarta) … · status penjadwal server tidak jujur? → lolos karena jujur`.

### 23. PLUGIN ✅
- 7 entri (6 aktif): Pencarian Web, Alat Hitung Lokal, Pembaca Berkas, Pustaka Berkas, AI Builder + Kotak Pasir, Pembuat Gambar, dan satu yang **dinyatakan belum dipasang** (GitHub/Kalender/DB).
- Tiap kartu memuat **nama · ikon · deskripsi · provider · izin · endpoint · autentikasi · aksi** — izin ditulis apa adanya (mis. "jaringan keluar ke penyedia gambar", "biaya kunci milikmu").
- Aturan: plugin hanya boleh memanggil jaringan dari sisi server; kunci tidak pernah sampai ke browser; plugin yang butuh akun hanya aktif kalau kamu mengisi kredensial sendiri.

### 24. AI BUILDER — 10 LANGKAH ✅
`Memahami permintaan → Menganalisis kebutuhan → Membuat struktur aplikasi → Membuat file → Membuat kode → Menampilkan preview → Menguji aplikasi → Memperbaiki error → Melakukan build → Menyiapkan deployment`.
- Uji: `builder → jejak 10/10 selesai`, hasil nyata 3 berkas (`index.html`, `styles.css`, `app.js`), pratinjau 1958 karakter.

### 25. BUILDER UI + DIFF ✅
- Aksi: **file baru, folder, edit, ganti nama, pindahkan, hapus, komponen, API, refactor, debug, perbaiki error, uji, build, ZIP, deploy, salin, unduh, buka tab baru, refresh, bersihkan**.
- **Perubahan besar lewat Diff**: editor → *Lihat diff & simpan* → jendela diff menampilkan baris `+`/`−` → tombol **Terima / Tolak / Batalkan**.
- Uji: `diff → +2 / −0 baris · 1 sama · tombol ["Terima","Tolak","Batalkan"]` lalu `diterapkan: isi berkas 298 → 339 karakter`.

### 28. CODE EDITOR ✅ (baru dilengkapi putaran ini)
- Bahasa yang dikenali: **JS, TS, React (JSX/TSX), Next, HTML, CSS/SCSS, Python, JSON, SQL**, plus Go/Java/C/PHP/Bash/Markdown.
- Fitur: **sorot sintaks** (lapisan `<pre>` di bawah textarea transparan), **nomor baris** sinkron, **Cari** + **Cari berikutnya**, **Ganti**, **Ganti semua**, **Rapikan** (indentasi otomatis; JSON dirapikan penuh, CSS dipecah bertingkat, HTML/JS/CSS/Go/Java/C/PHP pakai heuristik kurung), **Salin**, **Unduh**, Tab menyisipkan indentasi.
- Berkas besar (>200 KB) otomatis mematikan sorot supaya mengetik tetap ringan — dan editor mengatakannya di lencana bahasa.
- Uji: `editor kode → bahasa CSS · nomor baris 4/4 · token tersorot 22`, `cari memilih "border"`, `ganti semua: border→outline (berhasil)`, `rapikan: 17 baris, deklarasi bertingkat: true`.

### 29. LIVE PREVIEW ✅
- Ukuran **Fit / Desktop / Tablet / Mobile**, tombol **muat ulang**, **buka di tab baru**, panel **Konsol & Jaringan** yang benar-benar merekam `console.log`, `console.error`, error runtime, dan permintaan jaringan dari dalam iframe (lewat `postMessage`), plus **status build**.
- Uji: `konsol: console 3 · peringatan 0 · console error 0 · runtime error 0 · jaringan 1` dan isi konsol `log MIRU siap · net fetch /api/daftar-episode · log pratinjau siap`.
- Jujur: pratinjau berjalan di iframe **terisolasi** (sandbox, tanpa `allow-same-origin`) — kode di dalamnya tidak bisa memanggil API situs ini; catatan ini tertulis di halaman Builder, bukan disembunyikan.

### 30. WEBSITE BUILDER ✅
- Empat contoh cepat siap pakai: **landing page** (kedai kopi), **toko online** (dengan keranjang), **streaming** (MIRU), **dashboard admin** (dengan grafik) — semuanya dibangun multi-berkas dan langsung bisa dipratinjau, diuji, di-ZIP.

### 34. DEPLOYMENT 🟡
- Status berurutan: `Mempersiapkan… → Membangun… → Menjalankan test… → Berhasil… → Siap deploy.` (terverifikasi: `build → status "Siap deploy."`).
- Provider deploy: `POST /api/deploy` dengan env `DEPLOY_PROVIDER` + `DEPLOY_TOKEN` + `APP_URL`; pilih/ganti penyedia ada di server.
- Tanpa kunci deploy, jawabannya apa adanya: *"Deployment otomatis belum aktif… alternatif: unduh ZIP"* — plus **ZIP benar-benar terbentuk** (diuji: `miru-streaming.zip · 1105 bita · mulai dengan PK: true`).

### 36. PENCARIAN GLOBAL ✅
- `Ctrl+Shift+K`: indeks percakapan, pesan, proyek, berkas, dan hasil Builder; hasil **dikelompokkan** per jenis dan klik membuka konteksnya (pesan langsung digulir ke posisinya).
- Uji: `kelompok tersedia: ["Obrolan","Pesan","Proyek","File","Builder"]`.

### 37. BAGIKAN CHAT ✅
- Pilihan **Pribadi** (tanpa tautan — tombol unduh saja) atau **Siapa saja yang punya tautan**, dengan masa berlaku **1 hari / 7 hari / 30 hari / tanpa batas**.
- Halaman bagikan bersifat **hanya-baca** dan berkata jujur bahwa isi percakapan disandikan di dalam tautan (tidak disimpan di server), jadi siapa pun yang memegangnya bisa membacanya. Mode Pribadi tidak pernah membuat tautan — tidak ada kebocoran.
- Uji: `tautan 1273 karakter, berisi #/bagi= true`, halaman tampil `6 pesan · keterangan hanya-baca true`.

### 38. CABANG OBROLAN ✅
- Tombol **Cabangkan** pada pesan terpilih → percakapan baru berjudul `Cabang: <pertanyaan>` dengan konteks sampai titik itu; **percakapan asli tidak berubah**.
- Uji: `percakapan 1 → 2 · "Cabang: Apa itu kopi arabika?" · 4 pesan dibawa`.

### 39. PENGATURAN `/settings` ✅
- **14 menu**: Profil & Akun · Umum · Tampilan · Bahasa & Wilayah · Notifikasi · Suara · Model AI · Keamanan · Privasi & Kontrol Data · Penyimpanan · Memori · Plugin · Penggunaan & Penyedia · Tentang.
- Tema **Terang / Gelap / Sistem**, ukuran huruf, lebar kolom, sakelar bahasa & zona waktu, pemilih model per mode, uji koneksi, ekspor/impor, hapus semua data.
- Yang baru di putaran ini: Profil & Akun (nama panggilan — ikut dikirim ke AI: uji `instruksi ikut terkirim: true`), Bahasa & Wilayah (bahasa jawaban AI, format tanggal, zona waktu), Model AI (pilihan model per mode).

### 40. ADMIN `/admin` 🟡
- RBAC lokal: peran **pemilik / admin / tamu**. Tanpa kunci → halaman **terkunci**; setelah kunci benar (pemilik) atau login admin → dashboard terbuka dengan **System Health, Penggunaan, Model, Provider, Plugin, Rate Limit, Log (audit lokal), Pengguna & hak akses**.
- **Apa yang tidak ada saya tulis apa adanya**: aplikasi ini tidak punya basis data pengguna di server, jadi "semua chat orang lain" dan "semua file orang lain" memang tidak ada datanya — tidak dibuat tabel kosong palsu. Yang tersedia adalah penggunaan & log nyata dari server ini (rate limit, penyedia, audit).
- Uji: tanpa masuk → `"Halaman ini terkunci…"`; sesudah masuk → `peran: admin` + 8 bagian, `rate limit: chat 60`.

### 41. SISTEM MODEL AI ✅
- Satu lapisan abstraksi di `api/_ai.js`: **generateText, streamText, analyzeImage (visi), generateImage, speechToText, textToSpeech**.
- Penyedia yang bisa diganti lewat env: **openrouter (bawaan), openai, groq, together, deepseek, mistral, ollama** — kunci model juga bisa ditimpa (`AI_MODEL`, `AI_MODEL_IZIN`).
- `GET /api/providers` melaporkan kesiapan tiap jalur (teks/gambar/suara/deploy/penjadwal) **tanpa pernah mengirim kunci** — hanya versi tersamar (`sk-or-…b7ef`).
- Fallback otomatis: bila satu model sibuk, model berikutnya di antrean dicoba; kuota habis dilaporkan terus terang, bukan diulang-ulang.

### 49. KEAMANAN ✅
Diuji otomatis dengan `node tools/uji-rahasia.mjs` (8 pemeriksaan, semua lolos):
- **Isolasi rahasia**: kunci API hanya hidup di sisi server; berkas publik (`index.html`, `app.js`, `app.css`, `icons.js`, manifest) **bersih dari kunci**, dan jawaban `/api/providers` hanya memuat kunci tersamar.
- **Batas permintaan (rate limit)**: chat 60/menit · pencarian 30 · gambar 20 · deploy 10 · penjadwal 30 (per IP).
- **Validasi masukan**: prompt kosong → 400, JSON rusak → 400, kueri >300 karakter → 400, rasio gambar tak dikenal → ditolak, badan permintaan dibatasi ukurannya.
- **Otorisasi & asal (CSRF)**: hanya asal yang dikenal (host sendiri, pratinjau hosting, terowongan uji) yang dilayani; `POST /api/chat` dari asal asing → **403**, dan header CORS tidak lagi `*`.
- **Validasi berkas & batas ukuran**: daftar jenis berkas sah + batas ukuran; berkas pengguna **tidak pernah diunggah ke hosting** (dibaca di browser), jadi tidak ada jalur unggahan yang bisa disalahgunakan.
- **Cookie aman**: aplikasi tidak membuat sesi server maupun cookie login — tidak ada yang perlu diamankan, dan itu dinyatakan apa adanya.
- **XSS**: semua teks dari pengguna/AI di-escape (`esc`) sebelum masuk HTML; markdown dirender lewat jalur terbatas (tanpa `eval`, tanpa HTML mentah dari model).
- **SQL injection**: tidak ada basis data SQL — tidak ada kueri yang bisa disuntik.
- **Audit logging**: setiap permintaan penting dicatat (`audit()` → log terstruktur, plus Log audit lokal di `/admin`).
- **Izin plugin**: setiap plugin menuliskan izinnya di kartu plugin; plugin pihak ketiga belum dibuka (tidak ada marketplace diam-diam).
- **Kotak pasir builder**: kode hasil builder dijalankan di iframe `sandbox="allow-scripts"` tanpa akses ke halaman induk maupun DOM aplikasi.

### 52. NOTIFIKASI ✅
- Toast **4 jenis** (berhasil/ok, error, peringatan, informasi) — bisa dicoba satu-satu dari Setelan → Notifikasi.
- **Status memuat**: indikator "menyusun jawaban" di balon + status proses di kotak tulis; daftar panjang menampilkan **kerangka (skeleton)** sebelum data siap.
- **Tidak spam**: toast dengan teks sama dalam 1,2 detik tidak diulang; notifikasi desktop hanya diminta izinnya saat tugas pertama dibuat.

### 53. EKSPOR DATA ✅
- **JSON** (percakapan, proyek, preferensi/setelan, semuanya), **TXT** (percakapan terbaca), **CSV** (percakapan, proyek, metadata berkas: nama·jenis·ukuran·tanggal·pemilik·proyek·tag).
- Ada juga **impor percakapan** dari JSON hasil ekspor.
- Uji: `ekspor → berkas-metadata-….csv, percakapan-….csv, preferensi-….json` (3 unduhan sungguhan lewat Chromium).

---

## Yang perlu kamu isi supaya 🟡 menjadi ✅ penuh

| Fitur | Env yang dibutuhkan | Tanpa itu |
|---|---|---|
| Buat Gambar | `IMAGE_PROVIDER` + `IMAGE_API_KEY` | pesan apa adanya + jalur SVG lewat kode |
| Suara sisi server (STT/TTS) | `STT_PROVIDER`/`TTS_PROVIDER` + kunci | pakai mesin browser (Web Speech) |
| Deploy otomatis | `DEPLOY_PROVIDER` + `DEPLOY_TOKEN` + `APP_URL` | unduh ZIP + instruksi deploy manual |
| Penjadwal sisi server | `KV_REST_API_URL` + `KV_REST_API_TOKEN` | tugas jalan selama halaman terbuka (jujur dinyatakan) |
| Model tambahan/berbayar | `AI_MODEL_IZIN` (daftar model) | hanya model `:free` yang bisa dipilih |

Dua hal yang **tidak** akan pernah saya klaim: menampilkan proses berpikir internal model (dilarang oleh aturanmu sendiri dan sudah saya patuhi), dan menampilkan data pengguna/server yang tidak benar-benar ada.
