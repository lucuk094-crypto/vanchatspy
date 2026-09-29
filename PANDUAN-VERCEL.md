# PANDUAN VERCEL — dari repo ke web yang hidup

Repo: `https://github.com/lucuk094-crypto/vanchatspy`
Penyedia AI yang dipakai: **NaraRouter** (`https://router.bynara.id`). Jadi kamu hanya
butuh **satu kunci**: `sk-nry-…`

---

## 0. Sebelum mulai: ambil kuncinya

1. Buka <https://router.bynara.id/keys> → **Create key / Buat kunci**.
2. Salin kunci yang muncul (berawalan **`sk-nry-`**) — biasanya **hanya tampil sekali**.
3. Simpan dulu di catatan aman, jangan di dalam kode atau di repo.

Opsional, cek kuncinya dari terminal dulu:

```bash
node tools/cek-penyedia.mjs --url https://router.bynara.id/v1 --key sk-nry-KUNCI-MU --nama bynara
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
| `AI_PROVIDER` | `bynara` | nama penyedia. Jangan diganti huruf besar/beda. |
| `AI_API_KEY` | `sk-nry-………………` | kunci NaraRouter milikmu (dari langkah 0). **Jangan pakai tanda kutip**, jangan ada spasi di depan/belakang. |

### Opsional — pilih model (boleh dikosongkan)

Kalau dibiarkan kosong, aplikasi memakai model bawaan & daftar model dari akunmu.

| Key | Value contoh | Keterangan |
|---|---|---|
| `AI_MODEL_FAST` | `agnes-2.5-flash` | mode Normal |
| `AI_MODEL_THINK` | `agnes-3-flash` | mode Berpikir |
| `AI_MODEL_DEEP` | `deepseek-v4-flash` | mode Berpikir Mendalam |
| `AI_MODEL_EXPERT` | `deepseek-v4-pro` | mode Expert |
| `AI_MODEL_VISI` | `gemini-3.8-flash-high` | untuk kirim foto — pakai **hanya kalau** model itu ada di paketmu |

### Opsional — keamanan & alamat

| Key | Value contoh | Keterangan |
|---|---|---|
| `APP_URL` | `https://vanchatspy.vercel.app` | alamat web kamu (untuk tautan bagikan) |
| `ALLOWED_ORIGINS` | `https://vanchatspy.vercel.app` | batasi hanya domain ini yang boleh memakai API |
| `AI_MODEL_IZIN` | `agnes-2.5-flash,agnes-3-flash` | batasi model yang boleh dipakai |

### Opsional — fitur gambar AI

Tanpa tiga baris ini, tombol gambar tetap jujur bilang "belum aktif" (dan
menawarkan gambar lewat kode/SVG). Isi kalau mau gambar AI **berbayar per gambar**:

| Key | Value | Keterangan |
|---|---|---|
| `IMAGE_PROVIDER` | `bynara` | |
| `IMAGE_API_KEY` | `sk-nry-………………` | boleh kunci yang sama |
| `IMAGE_MODEL` | `agnes-image-2.1-flash` | model gambar NaraRouter |

### Opsional — suara (transkripsi / text-to-speech)

Tanpa ini, aplikasi memakai **suara bawaan browser** (gratis, kualitas tergantung
perangkat) dan itu sudah jalan:

| Key | Value | Keterangan |
|---|---|---|
| `STT_PROVIDER` + `STT_API_KEY` | penyedia OpenAI-compatible | ubah suara → teks |
| `TTS_PROVIDER` + `TTS_API_KEY` | penyedia OpenAI-compatible | teks → suara |

> ❗ **Jangan isi** `AI_BASE_URL`. Kalau dikosongkan, aplikasi otomatis memakai
> `https://router.bynara.id/v1`. Isi hanya kalau kamu memang memakai alamat lain.

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
   { "ok": true, "penyedia": "NaraRouter (https://router.bynara.id)",
     "keyConfigured": true, "kunciDari": "env (AI_API_KEY)",
     "model": { "fast": "agnes-2.5-flash", ... } }
   ```
   * `keyConfigured: false` → `AI_API_KEY` belum masuk / salah tempat.
2. Buka webnya → **Setelan → Model AI**: daftar model harus terisi (itu diambil
   dari akunmu). Kalau kosong, kunci belum berlaku → redeploy lagi.
3. Kirim pesan uji: `Balas tepat tiga kata: kopi itu enak` →
   jawaban pendek yang mengikuti perintah = seluruh jalur sudah sehat.

---

## 5. Kalau ada masalah

| Gejala | Artinya | Yang dilakukan |
|---|---|---|
| "kunci penyedia AI belum dipasang" | `AI_API_KEY` belum terisi | isi env → redeploy |
| "kunci penyedia AI ditolak penyedianya (HTTP 401)" | kunci salah/terpotong/di-rotasi | buat ulang di `/keys`, ganti env, redeploy |
| "Tidak bisa menghubungi penyedia AI" | jaringan/Vercel ↔ NaraRouter sedang tidak bisa dihubungi | coba lagi sebentar (aplikasi mencoba sendiri, tanpa restart) |
| "batas permintaan penyedia tercapai" | batas paket (mis. 15 permintaan/menit) | tunggu sebentar, atau naikkan paket |
| Daftar model kosong padahal kunci benar | paket akunmu belum punya model untuk mode itu | pilih model lain di Setelan |
| Perubahan env tidak berefek | deployment belum di-redeploy | Redeploy |

---

## 6. Domain sendiri (opsional)

Vercel → **Settings → Domains → Add** → ikuti instruksi DNS-nya.
Setelah jadi, perbarui `APP_URL` dan `ALLOWED_ORIGINS` ke domain itu, lalu **Redeploy**.

---

## 7. Catatan jujur

* Paket **Hobby** Vercel = untuk penggunaan **pribadi/non-komersial**.
* Kuota & tarif AI mengikuti **paket akunmu di NaraRouter** (paket gratis:
  batas per menit + token harian). Aplikasi tidak pernah menampilkan angka kuota
  yang tidak diketahuinya.
* Kunci hanya hidup di Environment Variables Vercel (sisi server). Halaman web
  tidak pernah menerima kunci — panel Setelan hanya menampilkan versi tersamar
  (`sk-nr…cdef`).
* Kalau kunci pernah tampil di screenshot/chat: **hapus di `/keys` lalu buat baru**.
