# Van Chat.SPY — jawaban atas 19 daftar fitur

Pertanyaanmu: *"apakah fungsi/fiturnya sudah lengkap seperti ini?"*
Jawaban singkat: **13 sudah nyata, 4 nyata tapi ada batas yang saya sebutkan
apa adanya, 2 tidak saya buat karena memang tidak bisa jujur tanpa kunci
berbayar.** Tidak ada tombol yang pura-pura jalan.

Keterangan tanda:

* ✅ **nyata** — benar-benar bekerja, sudah diuji di browser sungguhan
* 🟡 **nyata dengan batas** — bekerja, batasnya dijelaskan di kolom terakhir
* ⛔ **tidak dibuat** — mustahil dibuat jujur dengan paket gratis; alasannya ditulis

| # | Fitur | Status | Di Van Chat.SPY menjadi apa | Batas jujur |
|---|---|---|---|---|
| 1 | AI Chat | ✅ | Percakapan AI nyata, 4 mode: **Fast · Think · Deep · Expert**, jawaban mengalir (streaming) + tombol Hentikan (Esc), format markdown, kode berwarna | Kuota gratis 50 permintaan/hari (akun paket gratis penyedia AI) |
| 2 | AI Coding Assistant | ✅ | Minta kode, perbaikan, atau penjelasan lewat chip "Periksa kode"/"Jelaskan"; hasilnya bisa langsung **disunting di ruang kerja** lalu disimpan | — |
| 3 | AI Web Search | 🟡 | Referensi **Wikipedia Indonesia** ditarik langsung dari browser tanpa kunci API (chip "Cari referensi" / Pengaturan), lalu dikirim sebagai bahan ke AI; lencana sumber muncul di balon | Ini bukan mesin pencari umum. Pencarian web bebas butuh kunci API berbayar; jalur gratis yang saya uji (DuckDuckGo Instant Answer) mengembalikan kosong, jadi **tidak** saya pasang sebagai "pencarian web" palsu |
| 4 | AI File Analysis | ✅ | Berkas teks/kode ≤ 400 KB benar-benar dibaca isinya dan ikut ke AI (banyak berkas sekaligus, ada chip per berkas); berkas besar/biner → nama + ukuran + catatan | Berkas > 400 KB tidak dibaca sebagian — diberi tahu, bukan diam-diam dipotong |
| 5 | AI Image Generation | ⛔ | Tidak ada tombol "buat gambar". Sebagai gantinya: gambar/SVG dibuat lewat kode (SVG, CSS, canvas) yang tampil di ruang kerja | Semua model pembuat gambar di penyedia AI yang kami pakai **hanya berbayar**; dengan paket gratis tidak ada satu pun yang bisa dipakai. Membuat tombolnya hanya akan jadi janji kosong |
| 6 | AI Vision | ✅ | Sampai **3 foto per pesan** (≤ 4 MB): dikecilkan di browser (JPEG 1024 px) lalu dikirim ke model yang memang menerima gambar; balonmu menampilkan miniatur foto | Baru diuji dengan jawaban AI tiruan + pemeriksaan isi permintaan; **uji dengan AI sungguhan menunggu kuota terisi ulang** (07.00 WIB) |
| 7 | AI Voice | 🟡 | Tombol **"Bacakan"** di tiap jawaban (suara Indonesia, bisa dipilih di Pengaturan, ada mode otomatis) dan tombol **mikrofon** untuk berbicara sebagai ganti menulis | Memakai mesin suara bawaan browser (Web Speech API), bukan suara cloud: kualitas & ketersediaan tergantung perangkat. Kalau browser tidak mendukung, muncul pesan jelas — sudah diuji |
| 8 | AI Projects | ✅ | Proyek dengan **arahan tetap** yang dikirim di setiap pertanyaan, percakapan terkelompok per proyek, riwayat bisa disaring, jumlah percakapan terlihat; percakapan lama/umum tetap tampil di grup "Umum (tanpa proyek)" | — |
| 9 | AI Memory | ✅ | Catatan memori (mis. "Nama saya Rian, suka jawaban singkat") otomatis dikirim di tiap pertanyaan; bisa ditambah dari Pengaturan **atau** tombol otak di balon jawaban; ada sakelar hidup/mati | Maksimal 40 catatan, 20 terakhir yang dikirim. Memori hidup di browser pengguna, bukan di server |
| 10 | AI Tasks / Scheduled | 🟡 | Tugas dengan waktu + ulangan **sekali/harian**; saat waktunya tiba, aplikasi membuat percakapan "Tugas: …", menjalankannya sendiri, dan memberi notifikasi browser | Berjalan **saat halaman aplikasi terbuka** (diperiksa tiap 20 detik). Tanpa server penjadwal, tugas tidak jalan saat tab ditutup — saya pilih ini daripada berpura-pura "selalu jalan" |
| 11 | Plugin / Apps | ⛔ | Tidak ada sistem plugin pihak ketiga. Yang ada: **alat bawaan** yang jalan tanpa kunci — hitung matematika, konversi satuan, jam WIB, jumlah kata, Wikipedia, pembuat halaman, pustaka berkas | Plugin nyata butuh server + kotak pasir pihak ketiga; dengan paket gratis & tanpa server, tidak bisa dibuat jujur |
| 12 | Deep Research | 🟡 | Menyusun rencana pertanyaan → mengambil **4 artikel Wikipedia** → menulis laporan jadi berkas `riset-*.html` yang tampil di ruang kerja | Ini riset versi ringkas (bahan dari Wikipedia), bukan penjelajahan web bebas. Memakai 2 permintaan kuota sekali jalan |
| 13 | Thinking Mode | ✅ | Mode **Think** (penalaran) berdampingan dengan Fast/Deep/Expert; bisa dipilih dari bilah atas atau tombol mode di kotak tulis | — |
| 14 | AI Builder | ✅ | `/api/builder` menghasilkan **satu berkas HTML utuh** dari permintaanmu → langsung tampil di ruang kerja | Bergantung kuota AI harian |
| 15 | Code Builder | ✅ | Kode banyak bahasa dengan warna sintaks, bisa diminta diperbaiki, lalu **disunting langsung** di ruang kerja (tab Kode) dan disimpan | — |
| 16 | Website Builder | ✅ | Sama seperti AI Builder: minta "buatkan halaman/website …" → satu berkas siap pasang, bisa dicoba di ukuran ponsel/laptop/PC lalu diunduh | — |
| 17 | Project Workspace | ✅ | Kerangka **3 kolom** (riwayat · percakapan · ruang kerja), kedua pembatas bisa digeser tetikus, klik ganda = ukuran otomatis; tab Pratinjau/Kode/Berkas, editor, unduh, buka tab baru | — |
| 18 | File Library | ✅ | Semua berkas yang pernah dibuat AI **dan** berkas milikmu: unggah, berkas baru, ganti nama, pakai ulang di percakapan, unduh, hapus; saringan "semua / dari AI / milikku" | Tersimpan di browser (maksimal 60 berkas); berkas besar sebaiknya diunduh dulu |
| 19 | Conversation Management | ✅ | Cari percakapan, ganti nama, hapus, **sematkan**, kelompok waktu/proyek, filtras per proyek, ekspor & impor JSON sebagai cadangan | Data ada di browser pengguna, bukan di server — hapus data browser = hilang (pakai Ekspor) |

**Ringkasan:** 13 ✅ · 4 🟡 · 2 ⛔

## Yang tidak ada, dan kenapa saya tidak memaksakannya

1. **Pembuat gambar (image generation)** — semua model gambar di penyedia AI
   yang dipakai berbayar. Yang bisa saya tawarkan tanpa biaya: gambar dibuat
   lewat kode (SVG/CSS/canvas).
2. **Plugin / Apps pihak ketiga** — butuh server + kotak pasir. Yang ada adalah
   alat bawaan (hitung, konversi, jam, Wikipedia, pembuat halaman, pustaka).

Dua hal yang juga perlu kamu tahu:

* **Kuota**: akun memakai model `:free` → **50 permintaan/hari**, terisi ulang
  pukul **07.00 WIB**. Kalau habis, aplikasi berkata terus terang
  ("kuota gratis harian sudah habis …") — bukan diam atau mengarang jawaban.
* **Tugas terjadwal, memori, riwayat, pustaka**: hidup di browser. Tidak ada
  server yang menyimpan data pribadimu.

## Cara membuktikan sendiri

Aplikasi + uji sudah ada di paket ini:

```bash
cd van-chat-spy
node tools/server-uji.mjs        # buka http://127.0.0.1:8131/
node tools/uji-api.mjs           # uji backend tanpa memakai kuota AI
LD_LIBRARY_PATH=/tmp/libs/x/usr/lib/x86_64-linux-gnu:/tmp/libs/x/lib/x86_64-linux-gnu \
PUPPETEER_CACHE_DIR=/tmp/pcache UJI_URL=http://127.0.0.1:8131/ \
node tools/uji-tampilan.mjs      # uji di Chromium sungguhan (A–F)
```

Hasil pemeriksaan terakhir (**semua lulus**):

* `bukti-uji/HASIL-UJI-API.txt` — 12 pemeriksaan backend: mode memilih model,
  gambar dikirim sebagai `image_url`, memori & arahan proyek masuk ke instruksi
  sistem, riwayat dibatasi, prompt kosong ditolak (400).
* `bukti-uji/HASIL-UJI-TAMPILAN.txt` — bagian A–F: tampilan, backend asli,
  ponsel 390×844, laptop 1280/1366/1440, PC 1920×1080, lalu fitur baru
  (memori, tugas otomatis, proyek, alat hitung, visi foto, pustaka + editor,
  riset, sematan), data versi lama, dan suara.
* Tangkapan layar: `bukti-uji/01…13`, `20-tunnel.png`, `30-vision.png`,
  `31-riset-dalam.png`, `32-pustaka-proyek.png`, `33-data-lama-setelan.png`.

## Sisa satu langkah

Jawaban AI **sungguhan** (termasuk visi foto pertama) belum bisa diuji malam
ini karena kuota harian sudah terpakai 57/50 dan baru terisi ulang pukul
**07.00 WIB**. Semua jalur sudah diperiksa lewat tiruan + pemeriksaan isi
permintaan; tinggal satu percakapan nyata setelah kuota pulih.
