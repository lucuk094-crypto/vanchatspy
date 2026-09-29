# Van Chat.SPY × 9Router — panduan singkat

**Jawaban singkat: ya, web ini bisa jalan dengan mengandalkan AI dari 9Router.**
9Router dipakai sebagai **penyedia teks** — jadi semua otak AI-nya (percakapan,
jawaban mengalir/streaming, mode Normal·Berpikir·Mendalam·Expert, membaca foto/vision,
sampai AI Builder) diambil dari router lokal itu. Kunci API tidak wajib: kalau 9Router-mu
tidak memakai kunci, aplikasi tetap jalan.

---

## 1. Yang harus ada di komputermu

| Hal | Keterangan |
|---|---|
| Node.js 18+ | untuk menjalankan 9Router dan web ini |
| 9Router | `npm install -g 9router` (sekali saja) |
| Penyedia di dashboard 9Router | sambungkan minimal satu akun/penyedia (Groq, GitHub Copilot, OpenRouter, dll.) |

## 2. Langkah menjalankan (semuanya di komputermu, bukan di cloud)

1. **Jalankan 9Router** — buka CMD/terminal, tulis:
   ```
   9router
   ```
   Tunggu sampai muncul **“Server ready”** dan dashboard terbuka di
   `http://localhost:20128/dashboard`. Sambungkan penyedia di dashboard itu.

2. **Periksa dari sisi web** (terminal kedua, di folder proyek ini):
   ```
   node tools/cek-9router.mjs
   ```
   Skrip ini menguji `GET /v1/models`, jawaban biasa, jawaban mengalir, dan
   tes melihat gambar, lalu menyimpan hasilnya ke `tools/9router.json`.
   Kalau port/kunci berbeda: `node tools/cek-9router.mjs --url http://127.0.0.1:20128/v1 --key KUNCI`.

3. **Jalankan web-nya**:
   ```
   node tools/server-uji.mjs
   ```
   Buka `http://127.0.0.1:8131/`. Pengaturan model ada di **Setelan → Model AI**
   (daftar model diambil langsung dari 9Router).

4. Kalau 9Router **belum** jalan, aplikasi tidak mengelabui: jawabannya jujur —
   *“Tidak bisa menghubungi 9Router di http://127.0.0.1:20128/v1. Jalankan 9Router dulu
   di CMD/terminal — tulis `9router` sampai muncul "Server ready" …”*. Ini juga berlaku
   untuk chat, vision, dan AI Builder.

## 2b. Cara tanpa `cek-9router` (pakai env saja)

```
AI_PROVIDER=9router
AI_BASE_URL=http://127.0.0.1:20128/v1      # boleh dikosongkan, alamat bawaan sudah ini
AI_API_KEY=...                              # hanya kalau 9Router-mu memakai kunci
AI_MODEL_FAST=gh/gpt-5-mini
AI_MODEL_THINK=kr/claude-sonnet-4.5
AI_MODEL_DEEP=kr/claude-sonnet-4.5
AI_MODEL_EXPERT=cc/claude-opus-4-7
AI_MODEL_VISI=vertex/gemini-3-flash
```

Nama variabel lain yang juga dibaca: `ROUTER_API_KEY`, `NINEROUTER_API_KEY`
(alternatif `AI_API_KEY`), `AI_MODELS` (daftar model cadangan, dipisah koma),
dan `AI_MODEL_IZIN` (membatasi model yang boleh dipakai).

## 3. Yang otomatis (tanpa setelan tambahan)

- **Daftar model dari router** — aplikasi memanggil `GET /v1/models` ke 9Router
  (cache 60 detik) dan menaruh nama aslinya (mis. `kr/claude-sonnet-4.5`,
  `if/glm-4.7`, `vertex/gemini-3-flash`) ke menu Setelan · Model AI.
- **Pemilihan model per mode** — Normal memilih model cepat, Berpikir/Mendalam/Expert
  memilih model yang lebih kuat; foto otomatis dikirim ke model yang bisa melihat gambar.
- **Cadangan otomatis** — kalau model pilihan gagal, model lain dari router dicoba.
- **Pesan galat apa adanya** — tidak ada jawaban palsu saat router mati atau kuota habis.
- **Bisa dikembalikan** — hapus `tools/9router.json` (atau jangan pasang env
  `AI_PROVIDER`) dan aplikasi kembali memakai OpenRouter seperti semula.

## 4. Batasan yang harus kamu tahu

- **Cloud (Vercel/hosting) tidak bisa menjangkau `localhost:20128` milikmu.**
  Penyedia lokal wajib jalan **di komputer yang sama** dengan web-nya
  (`node tools/server-uji.mjs`). Kalau ingin diakses dari HP atau internet,
  buka tunnel dari komputermu (mis. `cloudflared tunnel --url http://127.0.0.1:8131`)
  atau taruh 9Router di VPS.
- **Kuota mengikuti penyedia yang kamu sambungkan di 9Router**, bukan milik web ini.
  Karena itu pemakaian lewat 9Router tidak menghabiskan kuota bawaan paket.
- 9Router ikut memakai port 20128 — kalau port itu terpakai program lain, ubah lewat
  setelan 9Router dan sebutkan alamatnya di `tools/cek-9router.mjs --url …`.
- Fitur yang memang butuh kunci lain (gambar/`IMAGE_PROVIDER`, suara/`STT`·`TTS_PROVIDER`,
  deploy/`DEPLOY_PROVIDER`) tetap seperti sebelumnya — 9Router hanya untuk teks.

## 5. Bukti uji (dijalankan di repo ini)

Perintah: `node tools/uji-9router.mjs` — memakai **9Router tiruan** yang berbicara
protokol OpenAI-compatible sama seperti 9Router asli (`/v1/models` +
`/v1/chat/completions` biasa & SSE), karena sandbox uji tidak punya 9Router asli.
Hasil (SEMUA LULUS, tersimpan di `bukti-uji/HASIL-UJI-9ROUTER.txt`):

| Pemeriksaan | Hasil |
|---|---|
| Server uji melaporkan penyedia 9Router | ✓ `9router → http://127.0.0.1:20128/v1 · kunci dipasang` |
| Daftar model berasal dari `/v1/models` router | ✓ `oc/…, kr/…, cc/…, gh/…, if/…, vertex/…` (bukan model OpenRouter) |
| Perintah bentuk “tepat tiga kata” | ✓ `"Kopi adalah minuman."` (0 perbaikan) |
| Perintah “hanya kode” | ✓ jawaban hanya berisi blok kode |
| Percakapan mengalir (streaming) lewat router | ✓ jawaban masuk ke UI |
| Setelan → Model AI | ✓ 6 model dari router ditawarkan |
| Foto dikirim ke router (vision) | ✓ model menyebut “merah, lingkaran putih, batang biru” |
| AI Builder lewat router | ✓ proyek “KartuUlangTahun”, 3 berkas, pratinjau terisi |
| Galat JS di halaman | ✓ 0 |
| Router dimatikan | ✓ pesan jujur “Tidak bisa menghubungi 9Router di …” |

Bukti tambahan: `node tools/cek-9router.mjs --url http://127.0.0.1:20128/v1 --key …`
diuji terhadap router tiruan → **SEMUA LULUS**, dan `tools/9router.json` terbentuk
berisi `url`, `kunci`, serta pilihan model `fast/think/deep/expert/visi`
(file ini **tidak** dibawa di paket; dibuat saat kamu menjalankan cek di komputermu).

---

## 6. “Harus buka 9Router dulu, baru webnya?”

**Idealnya iya** (9Router dulu → baru `node tools/server-uji.mjs`), tapi **tidak wajib lagi**:
kalau web dibuka lebih dulu, aplikasi memeriksa router tiap **±5 detik**. Begitu kamu
menyalakan 9Router, web langsung aktif dalam beberapa detik **tanpa perlu di-restart**.
Yang penting: 9Router sudah jalan **sebelum kamu menekan Kirim**, kalau belum, jawabannya
jujur — *“Tidak bisa menghubungi 9Router di …”*.

Bukti: `node tools/uji-9router-urutan.mjs` → **SEMUA LULUS** (`bukti-uji/HASIL-UJI-9ROUTER-URUTAN.txt`):
dibuka tanpa router → 4 pesan berturut-turut dijawab jujur; router dinyalakan → dalam
**5 detik** web jalan memakai model dari router (`gh/gpt-5-mini`), tanpa restart.

## 7. Cara termudah: satu klik / satu perintah

- **Windows:** klik dua kali `tools\mulai-9router.bat`
  (membuka 9Router di jendela baru → menunggu “Server ready” → cek setelan → menjalankan web + membuka browser).
- **macOS/Linux/Git Bash:** `bash tools/mulai-9router.sh`

## 8. “Aktif atau tidak?” — tiga cara memastikan (semua di komputermu)

1. **Status di halaman:** kalau 9Router hidup, bilah atas berbunyi *“server AI siap”*;
   di **Setelan → Model AI** daftar model berisi nama router (mis. `kr/…`, `if/…`, `gh/…`).
2. **Skrip pemeriksa:** `node tools/cek-9router.mjs`
   → menguji `/v1/models`, jawaban biasa, **jawaban mengalir**, dan kemampuan melihat gambar.
   Kalau tiga-tiganya ✓, router aktif.
3. **Baris saat web dijalankan:** `node tools/server-uji.mjs` mencetak
   `✓ 9router terjangkau (200) — N model terdaftar` (atau ✗ dengan instruksi kalau belum jalan).

Tombol **Setelan → Uji koneksi** juga memanggil `GET /api/chat` tanpa memakai kuota AI.

## 9. Soal “kirim link localhost + API-nya, biar dicek”

Jangan kirim kunci API ke siapa pun — termasuk ke saya:

- `http://localhost:20128` itu **loopback**: alamat itu hanya berarti di komputer yang
  menjalankannya. Dari sisi saya (server lain di internet) alamat itu menunjuk ke komputer
  saya sendiri, jadi **tidak bisa dipakai untuk memeriksa 9Router-mu**. Hal yang sama
  berlaku untuk hosting cloud: Vercel tidak bisa menyentuh `localhost` milikmu.
- **Kunci API di 9Router = semua model di akunmu.** Sekali tersebar, orang lain bisa
  memakai kuotamu. Simpan hanya di komputermu (`tools/9router.json` atau env) — berkas itu
  tidak perlu dikirim ke mana-mana.
- **Yang saya butuhkan hanya hasil pemeriksaannya**, bukan kuncinya. Jalankan
  `node tools/cek-9router.mjs` lalu tempelkan **keluarannya** ke saya (nama model & status
  ✓/✗) — dari situ saya bisa menilai aktif atau tidak dan apa yang perlu diperbaiki.
- Kalau tetap ingin diperiksa dari luar, tempelkan **alamatnya yang terbuka** (bukan
  localhost) lewat tunnel, mis. di komputermu:
  `cloudflared tunnel --url http://127.0.0.1:20128` → kamu dapat alamat
  `https://….trycloudflare.com`. Sadari risikonya: selama link itu hidup, **siapa pun yang
  tahu alamatnya bisa memakai kuota 9Router-mu**. Tutup tunnel-nya segera setelah selesai,
  dan jangan pernah kirim kunci API-nya.
