# PANDUAN VERCEL — dari repo ke web yang hidup

Repo: `https://github.com/lucuk094-crypto/vanchatspy`
Penyedia AI yang dipakai: **9Router** (`https://rqacwx8.abc-tunnel.us`). Jadi kamu hanya
butuh **satu kunci**: `sk-…`

---

## 0. Sebelum mulai: ambil kuncinya

1. Buka dashboard 9Router: <https://rqacwx8.abc-tunnel.us> (otomatis diarahkan ke
   `/dashboard`) → halaman **API keys** → **Create key / Buat kunci**.
2. Salin kunci yang muncul (berawalan **`sk-`**).
3. Simpan dulu di catatan aman, jangan di dalam kode atau di repo.

Opsional, cek kuncinya dari terminal dulu:

```bash
node tools/cek-penyedia.mjs --url https://rqacwx8.abc-tunnel.us/v1 --key sk-KUNCI-MU --nama 9router
```

Kalau muncul ✓ daftar model + ✓ percakapan + ✓ streaming, berarti kunci sehat.

---

## 1. Import repo ke Vercel

1. Buka <https://vercel.com> → login (boleh pakai akun GitHub).
2. **Add New… → Project**.
3. Pilih **Import Git Repository** → kalau repo `vanchatspy` belum muncul, klik
   *Adjust GitHub App Permissions* dan beri akses ke repo itu.
4. Yang **tidak perlu** diubah:
   * **Framework Preset**: `Other`
   * **Root Directory**: `./`
   * **Build Command**, **Output Directory**, **Install Command**: biarkan **kosong**
5. **Belum klik Deploy dulu** — isi dulu environment variable di langkah 2 (kalau
   sudah terlanjur deploy, tidak masalah: rubah env lalu **Redeploy**).

---

## 2. Environment Variables — INI BAGIAN PENTINGNYA

Di halaman import, buka bagian **Environment Variables**.
(Kalau projectnya sudah ada: **Settings → Environment Variables**.)

Kolomnya ada tiga: **Key** (nama), **Value** (isi), **Environments** (centang
**Production** *dan* **Preview** supaya berlaku di dua-duanya).

### Wajib — dua baris ini (penyedia bawaan sekarang: **Apinex**)

| Key | Value | Keterangan |
|---|---|---|
| `AI_PROVIDER` | `apinex` | penyedia bawaan aplikasi sejak 1 Okt 2026. Jangan diganti huruf besar/beda. |
| `APINEX_API_KEY` | `sk-apx………………` | kunci Apinex-mu (dari apinex.bond). **Jangan pakai tanda kutip**, jangan ada spasi di depan/belakang. |

> Catatan Apinex: paket gratis dibatasi **5 permintaan/menit per akun**, dan
> `free/minimax-m3.1` ternyata **butuh langganan** — aplikasi mengatakan itu apa
> adanya kalau model tersebut dipakai (tidak mengganti model diam-diam).
> Model `claude-*` juga butuh saldo/top-up. Lihat bagian 2b untuk daftar lengkapnya.

### Alternatif: kembali memakai 9Router (tunnel)

| Key | Value | Keterangan |
|---|---|---|
| `AI_PROVIDER` | `9router` | kalau mau lewat tunnel 9Router lagi |
| `AI_API_KEY` | `sk-………………` | kunci 9Router-mu (dari langkah 0) |
| `AI_BASE_URL` | *(kosongkan)* | otomatis `https://rqacwx8.abc-tunnel.us/v1` |

### Opsional — pilih model (boleh dikosongkan)

Kalau dibiarkan kosong, aplikasi memakai model bawaan penyedia yang aktif.

| Key | Value contoh (Apinex) | Keterangan |
|---|---|---|
| `AI_MODEL_FAST` | `free/gpt-6-luna` | mode Normal |
| `AI_MODEL_THINK` | `free/glm-5.3-flash` | mode Berpikir |
| `AI_MODEL_DEEP` | `free/deepseek-v4-pro-0813` | mode Berpikir Mendalam |
| `AI_MODEL_EXPERT` | `free/mimo-v2.6-pro` | mode Expert |
| `AI_MODEL_VISI` | `free/glm-5.3-flash` | untuk kirim foto (sudah diuji membaca gambar) |
| `AI_MODEL_BUILDER` | `free/deepseek-v4-pro-0813` | AI Builder |

*(Kalau memakai 9Router, contohnya: `kr/claude-haiku-4.5`, `kr/claude-sonnet-4.5`,
`kr/claude-sonnet-4.5-agentic`.)*

### Opsional — keamanan & alamat

| Key | Value contoh | Keterangan |
|---|---|---|
| `APP_URL` | `https://vanchatspy.vercel.app` | alamat web kamu (untuk tautan bagikan) |
| `ALLOWED_ORIGINS` | `https://vanchatspy.vercel.app` | batasi hanya domain ini yang boleh memakai API |
| `AI_MODEL_IZIN` | `kr/claude-haiku-4.5,kr/claude-sonnet-4.5` | batasi model yang boleh dipakai |

### Opsional — fitur gambar AI

**Catatan jujur:** 9Router lewat tunnel ini belum melayani pembuatan gambar
(endpoint gambarnya menjawab `No credentials for provider: openai`), jadi biarkan
bagian ini kosong — panel gambar mengatakan "belum aktif" dan menawarkan gambar
lewat kode/SVG. Isi hanya kalau kamu punya layanan gambar OpenAI-compatible
(berbayar per gambar):

| Key | Value | Keterangan |
|---|---|---|
| `IMAGE_PROVIDER` | nama penyedia gambar | mis. `openai` |
| `IMAGE_API_KEY` | `sk-………………` | boleh kunci yang sama |
| `IMAGE_BASE_URL` | `https://…/v1` | alamat layanan gambar |
| `IMAGE_MODEL` | `gpt-image-1` | nama model gambarnya |

### Opsional — suara (transkripsi / text-to-speech)

Tanpa ini, aplikasi memakai **suara bawaan browser** (gratis, kualitas tergantung
perangkat) dan itu sudah jalan:

| Key | Value | Keterangan |
|---|---|---|
| `STT_PROVIDER` + `STT_API_KEY` | penyedia OpenAI-compatible | ubah suara → teks |
| `TTS_PROVIDER` + `TTS_API_KEY` | penyedia OpenAI-compatible | teks → suara |

> ❗ **Jangan isi** `AI_BASE_URL` kalau memakai Apinex/9Router/Gemini: alamat
> bawaannya sudah benar (Apinex → `https://api.apinex.bond/v1`, 9Router →
> `https://rqacwx8.abc-tunnel.us/v1`, Gemini → `…/v1beta`). Isi hanya kalau kamu
> memang memakai gateway lain.

---

## 2b. Apinex (bawaan) & Google AI Studio

**Apinex sekarang adalah penyedia bawaan aplikasi** (lihat tabel "Wajib" di atas).
Dua penyedia ini juga bisa dipilih **dari dalam web** (Pengaturan → Penyedia AI) —
cara itu **tidak perlu Redeploy** karena setelannya ikut terkirim dari browser
setiap permintaan (kunci tidak disimpan di server). Tapi kalau kamu mau jadi
bawaan untuk semua orang yang membuka webnya, isi env-nya seperti ini:

### Apinex (`https://api.apinex.bond/v1`) — bawaan sekarang

| Key | Value | Keterangan |
|---|---|---|
| `AI_PROVIDER` | `apinex` | sudah jadi bawaan; baris ini boleh dikosongkan |
| `APINEX_API_KEY` | `sk-apx…………` | kunci dari apinex.bond |
| `AI_MODEL_FAST` | `free/gpt-6-luna` | mode Normal |
| `AI_MODEL_THINK` | `free/glm-5.3-flash` | mode Berpikir |
| `AI_MODEL_DEEP` | `free/deepseek-v4-pro-0813` | mode Berpikir Mendalam |
| `AI_MODEL_EXPERT` | `free/mimo-v2.6-pro` | mode Expert |
| `AI_MODEL_VISI` | `free/glm-5.3-flash` | kirim foto |
| `AI_MODEL_BUILDER` | `free/deepseek-v4-pro-0813` | AI Builder |

Catatan jujur soal Apinex (hasil uji langsung, 1 Okt 2026):
* batas **5 permintaan/menit** per akun — kalau kena, aplikasi menampilkan pesan
  batas itu apa adanya plus "Retry in Ns" dari penyedia;
* enam model `free/*` yang muncul di pemilih model: `free/gpt-6-luna`,
  `free/glm-5.3-flash`, `free/deepseek-v4.1-flash`, `free/deepseek-v4-pro-0813`,
  `free/mimo-v2.6-pro`, `free/minimax-m3.1`;
* **`free/minimax-m3.1` ternyata BUTUH LANGGANAN** (penyedia menjawab 402
  *"available only with a subscription"*). Modelnya tetap ada di daftar (kamu yang
  minta), tapi kalau dipakai aplikasi menjawab dengan catatan jujur, bukan diam-diam
  berganti model;
* model `claude-*` juga butuh saldo/top-up — model uji di tombol "Uji & Aktifkan"
  otomatis memilih model `free/*` supaya akun tanpa saldo tetap lulus uji.

### Google AI Studio (Gemini)

| Key | Value | Keterangan |
|---|---|---|
| `AI_PROVIDER` | `gemini` | |
| `GEMINI_API_KEY` | `AIza…………` atau `AQ.…………` | kunci dari aistudio.google.com (kunci gaya `AQ.` juga jalan) |
| `AI_MODEL_FAST` | `gemini-flash-lite-latest` | mode Normal |
| `AI_MODEL_VISI` | `gemini-flash-lite-latest` | kirim foto |

* `AI_BASE_URL` **jangan diisi** — aplikasi memakai alamat asli Google
  `https://generativelanguage.googleapis.com/v1beta` dan protokol `:generateContent`.
* Kalau mau lewat jalur OpenAI-compatible: `AI_GAYA=openai` +
  `AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai`.
* Yang sudah diuji langsung: `gemini-flash-lite-latest` dan `gemini-3.1-flash-lite`
  bisa teks **dan** melihat gambar; `gemini-flash-latest` sering menjawab 503
  («sedang sibuk») dan `gemini-pro-latest` kena kuota gratis — makanya dipakai
  sebagai cadangan belakang.
* **Pembuat gambar di Gemini tidak gratis** (`gemini-2.5-flash-image` kena kuota/berbayar)
  → biarkan pembuat gambar di **Pollinations/Cloudflare** (bawaan aplikasi).

---

## 2c. Mengubah setelan tanpa redeploy (dari dalam web)

**Pengaturan → Penyedia AI** di aplikasi:

1. pilih penyedia (Apinex, Google AI Studio, 9Router, Groq, Pollinations,
   Cloudflare, atau **Kustom** untuk gateway lain),
2. isi **alamat** + **kunci**, klik **Uji & Aktifkan** — aplikasi membaca daftar
   model dan mencoba satu percakapan kecil lebih dulu, hasilnya ditampilkan jujur
   (termasuk kunci tersamar `sk-apx…a62a`, bukan kunci utuh),
3. tentukan **model per fitur** (Normal / Berpikir / Mendalam / Expert / kirim foto /
   Builder) dan pembuat gambar, lalu tutup — setelan tersimpan di browser ini,
4. tombol **Kembalikan ke server** menghapus setelan itu dan kembali memakai env.

### Ganti penyedia di Vercel nanti (kamu sendiri)

1. **Settings → Environment Variables** → ubah `AI_PROVIDER` + kunci penyedia baru
   (mis. `AI_PROVIDER=gemini` + `GEMINI_API_KEY=AIza…`),
2. **Deployments → deployment teratas → ⋯ → Redeploy** — env baru **hanya** berlaku
   setelah redeploy,
3. buka `/api/health` untuk memastikan: `penyedia`, `kunciDari`, dan daftar `model`
   akan mengikuti penyedia yang baru.

Kalau hanya mau coba-coba tanpa menyentuh env: pakai **Pengaturan → Penyedia AI**
di dalam web (kunci hanya di browser, tanpa redeploy).

Kunci yang kamu tulis di situ **hanya dipakai untuk permintaan itu** (header
`x-setelan-penyedia`), tidak ditulis ke log, dan tidak pernah dikembalikan lagi ke
browser. Kalau web dibuka di perangkat lain, setelannya tidak ikut — itu memang
disengaja supaya kunci tetap di perangkatmu.

---

## 3. Deploy

1. Klik **Deploy** → tunggu ± 1 menit.
2. Klik **Visit** → webnya terbuka.

**Penting:** Environment Variable yang diubah **belum berlaku** pada deployment
yang sudah jalan. Setiap kali mengganti/menambah env →
**Deployments → (deployment paling atas) → ⋯ → Redeploy**.

---

## 4. Cara memastikan sudah benar (2 menit)

1. Buka `https://<proyek-mu>.vercel.app/api/health`.
   Yang diharapkan:
   ```json
   { "ok": true, "penyedia": "9Router (https://rqacwx8.abc-tunnel.us/v1)",
     "keyConfigured": true, "kunciDari": "env (AI_API_KEY)",
     "model": { "fast": "kr/claude-haiku-4.5", ... } }
   ```
   * `keyConfigured: false` → `AI_API_KEY` belum masuk / salah tempat.
   * Ingin lebih pasti? Buka **`/api/health?uji=1`** — itu menyentuh 9Router
     sungguhan (daftar model) dan menjawab salah satu dari: *"alamat + kunci sehat"*,
     *"kunci ditolak penyedia"*, atau *"tidak bisa menghubungi penyedia: … (N ms)"*.
     Tambahkan `&uji=chat` kalau mau sekalian satu percakapan uji.
2. Buka webnya → **Setelan → Model AI**: daftar model harus terisi (itu diambil
   dari akunmu). Kalau kosong, kunci belum berlaku → redeploy lagi.
3. Kalau masih ada masalah, buka **`/api/health?uji=1`** — itu menyentuh 9Router
   sungguhan dan menyebut penyebabnya apa adanya (HTTP berapa, berapa milidetik,
   atau galat jaringannya). Tambahkan `?uji=chat` untuk sekalian mengirim satu
   percakapan sangat pendek (memakai sedikit kuota):

   ```
   https://<proyek-mu>.vercel.app/api/health?uji=1
   https://<proyek-mu>.vercel.app/api/health?uji=chat
   ```

   Contoh jawaban sehat: `"kesimpulan": "alamat + kunci sehat (37 model terlihat)"`.
4. Kirim pesan uji: `Balas tepat tiga kata: kopi itu enak` →
   jawaban pendek yang mengikuti perintah = seluruh jalur sudah sehat.

---

## 5. Kalau ada masalah

| Gejala | Artinya | Yang dilakukan |
|---|---|---|
| "kunci penyedia AI belum dipasang" | `AI_API_KEY` belum terisi | isi env → redeploy |
| "kunci penyedia AI ditolak penyedianya (HTTP 401)" | kunci salah/terpotong/di-rotasi | buat ulang di dashboard 9Router (halaman API keys), ganti env, redeploy |
| "Tidak bisa menghubungi penyedia AI" | jaringan/Vercel ↔ 9Router sedang tidak bisa dihubungi | coba lagi sebentar (aplikasi mencoba sendiri, tanpa restart) |
| "batas permintaan penyedia tercapai" | batas paket (mis. 15 permintaan/menit) | tunggu sebentar, atau naikkan paket |
| Daftar model kosong padahal kunci benar | paket akunmu belum punya model untuk mode itu | pilih model lain di Setelan |
| Perubahan env tidak berefek | deployment belum di-redeploy | Redeploy |
| "Model pilihanmu (…) tidak bisa dipakai di penyedia ini: … langganan berbayar" | model itu memang butuh langganan (mis. `free/minimax-m3.1`) | pilih model lain di Pengaturan → Penyedia AI → model per fitur |
| "batas permintaan penyedia AI tercapai" (Apinex) | Apinex gratis dibatasi 5 permintaan/menit | tunggu ± 1 menit, atau pilih 9Router/Gemini di Pengaturan |
| "Tidak ada model yang bisa dipakai dari …" | gateway itu menyebut model yang kredensialnya tidak aktif | pilih model lain di Setelan → Model AI, atau kosongkan `AI_BASE_URL` |

---

## 5b. Memakai gateway AI lain (opsional, untuk yang mau)

Bawaannya aplikasi memakai **9Router lewat tunnel** dan kamu **tidak perlu**
mengisi `AI_BASE_URL`. Bagian ini untuk yang ingin menunjuk ke alamat 9Router
yang lain — misalnya 9Router yang dijalankan di komputer sendiri.

```env
AI_BASE_URL=https://alamat-gateway-kamu/v1
AI_API_KEY=kunci-dari-gateway-itu
AI_PROVIDER=9router            # protokolnya OpenAI-compatible → biarkan seperti ini
AI_MODEL_FAST=...             # opsional, pilih model yang ADA di daftar gateway itu
```

Yang perlu kamu tahu (hasil uji nyata, bukan teori):

* Aplikasi membaca daftar model dari **gateway itu sendiri** (`GET /models`). Kalau
  gateway menyebut 90 model tapi hanya 5 yang punya kredensial aktif, aplikasi akan
  **menyisir kandidat** sampai ketemu yang jalan, lalu **mengingat** model itu untuk
  percakapan berikutnya (dan menahan model yang baru gagal selama 5 menit).
  Percakapan pertama bisa terasa lebih lama (beberapa detik); setelah itu normal.
* Aliran jawaban tanpa baris penutup `data: [DONE]` **tidak** membuat aplikasi
  menggantung — aplikasi berhenti saat aliran ditutup. Kalau sebuah gateway tetap
  mengalir walau diminta `stream:false`, jawabannya tetap dipadukan dengan benar.
* Nama model harus yang **benar-benar ada** di daftar gateway itu. Nama model dari
  penyedia lain akan ditolak, dan aplikasi akan mengatakannya apa adanya.
* Untuk kembali ke 9Router: **kosongkan `AI_BASE_URL`**, lalu **Redeploy**.
* Alamat tunnel gratis (mis. `*.trycloudflare.com`, host acak sejenis) bersifat
  **sementara** — begitu hostnya mati, percakapan akan gagal. Jangan dipakai untuk
  hal yang harus jalan terus.

---

## 6. Domain sendiri (opsional)

Vercel → **Settings → Domains → Add** → ikuti instruksi DNS-nya.
Setelah jadi, perbarui `APP_URL` dan `ALLOWED_ORIGINS` ke domain itu, lalu **Redeploy**.

---

## 7. Catatan jujur

* Paket **Hobby** Vercel = untuk penggunaan **pribadi/non-komersial**.
* Kuota & tarif AI mengikuti **paket akunmu di 9Router** (paket gratis:
  batas per menit + token harian). Aplikasi tidak pernah menampilkan angka kuota
  yang tidak diketahuinya.
* Kunci hanya hidup di Environment Variables Vercel (sisi server). Halaman web
  tidak pernah menerima kunci — panel Setelan hanya menampilkan versi tersamar
  (`sk-nr…cdef`).
* Kalau kunci pernah tampil di screenshot/chat: **hapus di dashboard 9Router lalu buat baru**.
