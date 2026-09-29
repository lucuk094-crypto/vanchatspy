# Van Chat.SPY — pemeriksaan daftar fitur (butir 8–14)

Jawaban singkat: **hampir semuanya sudah seperti daftarmu, dan yang belum saya
kerjakan hari ini.** Tiap baris di bawah diuji dengan Chromium sungguhan —
tombol benar-benar diklik tetikus (`elementFromPoint` dulu, supaya tidak lolos
palsu). Baris bukti diambil apa adanya dari hasil uji terakhir.

Legenda: ✅ sudah jalan · 🟡 jalan dengan batas (saya sebutkan batasnya) ·
⛔ memang tidak bisa dibuat dengan kunci gratis — saya jelaskan alasannya.

Uji terakhir: **tools/uji-tampilan.mjs bagian G → SEMUA LULUS**
(menu "+" 10 pilihan · web 3 sumber + sitasi · hapus hasil web · pesan alat +
ulangi alat · pesan galat · blok kode · perbesar · **jalankan di kotak pasir**
· kode galat dilaporkan · 10 tombol aksi pesan · bagikan · cabangkan · hapus
pesan · DOCX+PDF terbaca · kamera · tempel kode panjang · halaman /library ·
tab · cari · urutkan · tag · ganti nama · pratinjau + 4 aksi · kembali ke
percakapan), plus `node tools/uji-cari.mjs` (9 sumber nyata, tanpa kunci API).

---

## 8. Bilah aksi pesan + sumber jawaban

| Butir | Status | Bukti / catatan |
| --- | --- | --- |
| Salin | ✅ | tombol salin di tiap balon AI & pengguna; teks Markdown utuh |
| Suka / Tidak suka | ✅ | tersimpan di percakapan (dipakai untuk menandai jawaban bagus) |
| Bacakan | ✅ | memakai Web Speech API bawaan browser — **suara bergantung perangkat**, bukan suara cloud premium |
| Bagikan | ✅ | `navigator.share` kalau ada (HP), kalau tidak → salin ke papan klip + pemberitahuan |
| Coba lagi | ✅ | mengulang permintaan terakhir |
| Cabangkan ke Obrolan Baru | ✅ | percakapan baru berisi riwayat sampai jawaban itu; judulnya "Cabang: …" — di uji: `percakapan 1 → 2 · "Cabang: Apa itu kopi arabika?" · 4 pesan dibawa` |
| Hapus | ✅ | hapus satu pesan — di uji: `4 → 3 pesan` |
| Ulangi Tool | ✅ | hanya muncul di pesan yang memakai alat (mis. hasil hitung); di uji: `ulangi alat → hasil tetap "hitung(18*7+5) = 131"` |
| Sumber + sitasi pada jawaban hasil pencarian web | ✅ | blok "Sumber" berisi penyedia, judul, cuplikan, tautan, dengan nomor `[1] [2] [3]` yang dipakai AI di dalam jawaban |
| Hapus hasil Web | ✅ | tombol **Hapus hasil Web** membuang blok sumber **dan** konteks yang menempel di percakapan — di uji: `blok sumber tersisa 0 · konteks masih tersimpan: false` |

## 9. Kotak tulis `[ + ] [ … ] [ Mikrofon ] [ Voice ]` + menu "+"

| Butir | Status | Bukti / catatan |
| --- | --- | --- |
| Tombol "+" dengan 10 pilihan | ✅ | `menu "+" → tampil true · 10 pilihan: kamera, foto, file, plugin, think, web, riset, gambar, belajar, builder` |
| Kamera | ✅ | buka kamera belakang, jepret, ambil ulang, kirim (butir 10) |
| Foto | ✅ | pilih dari galeri; masuk sebagai lampiran gambar untuk vision |
| File | ✅ | multi-unggah (`multiple`) — PDF/TXT/JSON/CSV/XLSX/DOCX/PPTX/HTML/CSS/JS/TS/PY/ZIP (butir 12) |
| Plugin | 🟡 | tidak memasang plugin pihak ketiga (butuh server + kotak pasir). Yang ada: daftar **6 alat bawaan** yang benar-benar jalan (hitung lokal, pencarian web, riset dalam, pembuat halaman, pembaca berkas, pustaka) — ditampilkan apa adanya, bukan tombol palsu |
| Berpikir Lebih Keras | ✅ | menyetel mode **Think** (juga bisa dari bilah atas) |
| Pencarian Web | ✅ | sakelar nyata → tiap pertanyaan dicari lebih dulu, hasilnya dipakai AI + sitasi |
| Riset Mendalam | ✅ | rencana → sumber → laporan jadi berkas `riset-*.html` (memakai 2 permintaan kuota) |
| Buat Gambar | 🟡 | **model gambar AI hanya tersedia berbayar** di penyedia yang saya pakai, jadi tidak ada tombol yang pura-pura jalan. Yang benar-benar jalan: menuliskan **prompt gambar sebagai kode (SVG/HTML/canvas)** lalu hasilnya bisa dipratinjau & diunduh |
| Mode Belajar | ✅ | menyiapkan permintaan "jelaskan bertahap + 3 pertanyaan kuis" |
| Builder | ✅ | pintasan ke pembuat halaman (`/api/builder`, satu berkas HTML utuh) |
| Tempel gambar (Ctrl+V) | ✅ | tempelan gambar langsung jadi lampiran |
| Tempel kode panjang | ✅ | tempelan ≥ 1200 karakter otomatis jadi lampiran berkas (tidak membanjiri kotak tulis) — di uji: `tempelan-panjang.txt` |
| Seret & lepas berkas | ✅ | jatuhkan berkas ke area percakapan → jadi lampiran |
| Pratinjau & hapus lampiran | ✅ | daftar lampiran di atas kotak tulis: nama, ukuran, jenis ("dilihat AI" / "dibaca AI"), tombol hapus per lampiran |
| Pesan panjang | ✅ | kotak tulis tumbuh sampai 200 px lalu bisa digulir |
| Pintasan papan tik | ✅ | Enter kirim (atau Ctrl+Enter, bisa dibalik di Pengaturan), Esc hentikan, **Alt+K** buka menu "+", **Alt+L** buka pustaka, **Alt+C** kamera |

## 10. Kamera

| Butir | Status | Bukti / catatan |
| --- | --- | --- |
| Ambil foto | ✅ | `getUserMedia` (kamera belakang di HP) |
| Pratinjau hasil | ✅ | gambar hasil jepretan tampil sebelum dikirim |
| Ambil ulang | ✅ | di uji: `ambil ulang bekerja: true` |
| Kirim ke AI | ✅ | di uji: `foto terkirim ke kotak tulis: ["kamera-… .jpg 2.4 KB · dilihat AI"]` |
| Layar / dokumen / error / benda | ✅ | foto apa pun dikirim apa adanya ke model vision — tidak ada klaim "OCR khusus" |
| OCR (teks di dalam gambar) | 🟡 | dibaca oleh model vision (bukan mesin OCR terpisah) dan hasilnya dikembalikan sebagai teks jawaban; akurasinya bergantung model gratis |
| Analisis gambar | ✅ | pertanyaan analisis (diagram, tabel, desain UI, error) dikirim bersama gambarnya |

Catatan jujur: di lingkungan uji ini tidak ada kamera fisik, jadi yang diuji
adalah alur lengkapnya (modal, kanvas, ambil ulang, kirim) dengan gambar dari
kanvas; pesan "Kamera tidak bisa dibuka: Requested device not found" muncul di
uji, di HP/PC asli kamera akan hidup setelah izin diberikan. Kamera butuh
**https** atau `localhost`.

## 11. Vision / OCR

| Butir | Status | Bukti / catatan |
| --- | --- | --- |
| Baca gambar | ✅ | sampai **3 gambar** per pesan, dikecilkan di browser dulu (hemat kuota) |
| Baca teks di gambar | 🟡 | lewat model vision, bukan OCR khusus |
| Analisis screenshot / diagram / tabel / desain UI | ✅ | semua lewat jalur gambar yang sama; hasilnya teks + Markdown biasa |

Batas nyata: model yang **menerima gambar** dan gratis jumlahnya sedikit. Karena
itu permintaan bergambar memakai daftar model tersendiri (bukan streaming) dan
bisa gagal kalau semua sedang penuh — pesannya akan muncul jelas.

## 12. Berkas (metadata + format + aksi)

| Butir | Status | Bukti / catatan |
| --- | --- | --- |
| Nama · ukuran · format | ✅ | tampil di lampiran dan di kartu pustaka |
| Tanggal unggah | ✅ | contoh pratinjau: `18 Sep 2026, 22.59` |
| Pemilik | ✅ | `AI` (hasil jawaban) atau `saya` (unggahan) |
| Proyek | ✅ | berkas bisa dimasukkan/dilepas dari proyek |
| Tag | ✅ | tag bebas; di uji: `tag ditambahkan: ["penting"]` |
| Format PDF · TXT · JSON · CSV · XLSX · DOCX · PPTX · HTML · CSS · JS · TS · PY · ZIP | ✅ | dibaca di browser tanpa server: **DOCX, XLSX, PPTX, ZIP, PDF lolos** (uji berkas: 5/5). ZIP dibaca daftar isinya + berkas teks di dalamnya |
| Pratinjau | ✅ | HTML (iframe), SVG, gambar, dan teks/kode |
| Unduh | ✅ | berkas sungguhan tersimpan ke perangkat |
| Hapus | ✅ | dari kartu maupun dari pratinjau |
| Ganti nama | ✅ | baru ditambahkan hari ini — di uji: `ganti nama: catatan-baru.html · ada: true` |
| Cari | ✅ | kotak cari di pustaka |
| Tag | ✅ | tombol tag di kartu |
| Ke chat | ✅ | "Ke percakapan" menyisipkan berkas ke kotak tulis |
| Ke proyek | ✅ | berkas ditautkan ke proyek aktif |

## 13. Halaman `/library`

| Butir | Status | Bukti / catatan |
| --- | --- | --- |
| Alamat `/library` | ✅ | bisa dibuka langsung (tautan di panel kiri + Alt+L) dan kembali ke percakapan tanpa kehilangan konteks |
| Tab Semua File · Gambar · Dokumen · Kode · Arsip | ✅ | `tab ["Semua File","Gambar","Dokumen","Kode","Arsip"]` |
| Cari | ✅ | `cari "catatan": 0 berkas (cari: catatan)` — penghitung ikut berubah |
| Filter · urutkan | ✅ | urutan Nama A–Z / Terbesar / Terbaru |
| Pratinjau | ✅ | `6 info (format · ukuran · pemilik · tanggal · proyek · tag)` + isi berkas |
| Unduh · hapus · ganti nama · ke proyek · ke percakapan | ✅ | 6 aksi di kartu + 4 aksi di dalam pratinjau: `["Ganti nama","Ke percakapan","Unduh","Hapus"]` |

## 14. `/api/search` — sistem penyedia pencarian

✅ Nyata dan **tanpa kunci API**. Enam penyedia dijalankan bersamaan, hasil yang
gagal tidak menjatuhkan yang lain, duplikat dibuang, dan setiap hasil selalu
menyebut sumbernya:

| Penyedia | Hasil uji |
| --- | --- |
| Wikipedia Indonesia | 3–7 artikel + ringkasan |
| DuckDuckGo Instant Answer | jawaban ringkas (sering kosong — apa adanya) |
| Stack Overflow | 4 pertanyaan |
| Hacker News (Algolia) | 2 diskusi |
| GitHub | repositori |
| Web umum (Brave/SerpAPI) | **opsional** — otomatis aktif kalau `SEARCH_API_KEY` diisi |

Uji: `node tools/uji-cari.mjs` → 9 sumber nyata, tiap hasil punya
penyedia/judul/url/cuplikan, kueri kosong & >300 karakter ditolak (400).

Batas jujur: Google/Bing/Brave mewajibkan kunci berbayar, dan halaman HTML
DuckDuckGo menolak permintaan otomatis (saya uji: balas "anomaly/challenge",
nol hasil) — jadi pencarian "web umum" yang benar-benar bebas kunci itu tidak
ada. Yang saya pakai adalah penyedia terbuka di atas; kalau nanti kamu punya
kunci resmi, cukup isi env `SEARCH_API_KEY` dan penyedia itu dipakai lebih dulu.

---

## Perbaikan yang saya temukan & betulkan hari ini

1. **Tombol "Jalankan" di blok kode dulu diam-diam rusak.** Kode pengguna
   ditempel ke dalam kotak pasir dengan satu urutan balik yang salah, sehingga
   peramban menolaknya sebagai *syntax error* — jendela hasil terbuka tapi
   kosong. Sekarang kode dijalankan lewat `eval` terkurung, keluarannya
   ditampilkan di panel **Keluaran**, dan **galat sintaks pun dilaporkan ke
   pengguna** (dulu tidak terlihat sama sekali).
   Bukti: `jalankan kode → keluaran "Halo, Surabaya!"` dan
   `kode galat → "sebelum galatGalat: tidakAdaFungsi is not defined"`.
2. **Kotak pasir tetap ketat**: `sandbox="allow-scripts allow-modals allow-forms"`
   (sengaja **tanpa** `allow-same-origin`) — hasil dikirim ke halaman induk
   lewat `postMessage`, jadi kode asing tidak bisa menyentuh aplikasimu.
3. **`/api/search` menolak kueri kosong dan kueri >300 karakter** dengan pesan
   yang jelas, bukan memotong diam-diam.
4. **Versi lama tetap aman**: percakapan lama yang lampirannya bukan daftar
   tidak lagi membuat tampilan gagal.
5. **Pustaka berkas**: tombol **Ganti nama** + 4 aksi di dalam pratinjau.
6. **Alat hitung lokal** kini juga menerima gaya `hitung(18*7+5)`,
   `hitung: 9*9`, dan `berapa (12+8)*3`.

## Cara mencobanya sendiri

```bash
cd van-chat-spy
node tools/server-uji.mjs            # buka http://127.0.0.1:8131/

node tools/uji-cari.mjs              # pencarian nyata, tanpa kunci API
node tools/uji-api.mjs               # backend, tanpa memakai kuota AI
node tools/uji-tampilan.mjs          # Chromium sungguhan (bagian A–G)
node tools/cek-ikon.mjs              # semua nama ikon tersedia
```

Catatan kuota: akun ini memakai model `:free` (batas 50 permintaan/hari).
Pencarian web, alat hitung, pustaka, kamera, dan kotak pasir **tidak memakai
kuota** — hanya jawaban AI yang menghitung.
