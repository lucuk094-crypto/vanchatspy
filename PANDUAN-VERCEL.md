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

### Wajib — hanya dua baris ini

| Key | Value | Keterangan |
|---|---|---|
| `AI_PROVIDER` | `9router` | nama penyedia. Jangan diganti huruf besar/beda. |
| `AI_API_KEY` | `sk-………………` | kunci 9Router milikmu (dari langkah 0). **Jangan pakai tanda kutip**, jangan ada spasi di depan/belakang. |

### Opsional — pilih model (boleh dikosongkan)

Kalau dibiarkan kosong, aplikasi memakai model bawaan & daftar model dari akunmu.

| Key | Value contoh | Keterangan |
|---|---|---|
| `AI_MODEL_FAST` | `kr/claude-haiku-4.5` | mode Normal |
| `AI_MODEL_THINK` | `kr/claude-sonnet-4.5` | mode Berpikir |
| `AI_MODEL_DEEP` | `kr/claude-sonnet-4.5` | mode Berpikir Mendalam |
| `AI_MODEL_EXPERT` | `kr/claude-sonnet-4.5-agentic` | mode Expert |
| `AI_MODEL_VISI` | `kr/claude-sonnet-4.5` | untuk kirim foto (sudah diuji membaca gambar) |

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

> ❗ **Jangan isi** `AI_BASE_URL`. Kalau dikosongkan, aplikasi otomatis memakai
> `https://rqacwx8.abc-tunnel.us/v1`. Isi hanya kalau kamu memang memakai alamat lain.

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
