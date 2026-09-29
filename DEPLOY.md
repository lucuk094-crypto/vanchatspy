# Van Chat.SPY — DEPLOY DI MANA?

Penyedia AI aplikasi ini **9Router** (`https://rqacwx8.abc-tunnel.us`) — sebuah
gateway yang berjalan di internet. Artinya: **tidak ada server AI yang perlu
kamu jalankan sendiri**, tidak ada router lokal, tidak ada tunnel. Yang kamu
butuhkan cuma satu kunci API (`sk-…`) dan tempat untuk menaruh halaman web
ini.

| Pilihan | Web di | Bisa dibuka dari HP/internet | Ribet | Catatan |
|---|---|---|---|---|
| **A. Komputer sendiri** | PC-mu (`npm run mulai`) | hanya di jaringan yang sama | ⭐ | cara tercepat untuk mencoba |
| **B. Vercel** *(disarankan untuk publik)* | Vercel | **ya**, punya alamat HTTPS | ⭐ | cukup import repo + isi 2 env |
| **C. VPS / Docker** | servermu | ya (domain + HTTPS) | ⭐⭐ | hidup 24 jam, kendali penuh |

Setelan yang dipakai ketiganya **sama**: `AI_PROVIDER=9router` + `AI_API_KEY=sk-…`
(`AI_BASE_URL` boleh dikosongkan — bawaannya `https://rqacwx8.abc-tunnel.us/v1`).

---

## 0. Sekali saja: siapkan & periksa kuncinya

1. Buka <https://rqacwx8.abc-tunnel.us/keys> → buat kunci (ditampilkan **sekali**, salin).
2. Periksa dari terminal (sekaligus melihat model apa saja yang boleh dipakai paketmu):

```bash
node tools/cek-penyedia.mjs --url https://rqacwx8.abc-tunnel.us/v1 --key sk-XXXX --nama 9router
```

Harapannya: `GET /v1/models` mengembalikan daftar model, dan percakapan uji
dijawab (atau dijawab jujur kalau paketmu belum punya jatah). Tambahkan
`--tulis` kalau ingin hasilnya disimpan ke `tools/penyedia.json` (berisi kunci →
**tidak** ikut repo; sudah masuk `.gitignore`).

> Kunci ini **jangan** ditulis di dalam kode, README, atau di-commit. Cukup di
> environment variable.

---

## A. Di komputer sendiri

```bash
npm run mulai            # → http://127.0.0.1:8131/
```

Lalu isi kunci dengan salah satu cara:

```bash
# 1) environment variable (sekali jalan)
AI_PROVIDER=9router AI_API_KEY=sk-XXXX npm run mulai

# 2) file .env (dibaca kalau kamu memakai pm2/docker compose)
cp .env.example .env     # lalu isi AI_API_KEY=sk-XXXX
```

Buka **Setelan → Model AI** di aplikasinya: daftar model diambil langsung dari
akunmu (`GET /v1/models`). Kalau daftarnya kosong atau jawabannya «kunci ditolak»,
lihat bagian *Kalau bermasalah* di bawah.

> Mau dibuka dari HP juga? Paling mudah: deploy ke Vercel (bagian B). Kalau tetap
> ingin dari PC sendiri, jalankan web-nya di PC dan buka lewat **alamat LAN**
> (`http://192.168.x.x:8131/`) — jangan lupa izinkan port 8131 di firewall.
> Aplikasi ini tidak butuh tunnel: penyedia AI-nya sudah publik.

---

## B. Vercel (rekomendasi untuk dipakai publik)

Tidak ada build step. Semua berkas di `api/` otomatis menjadi Function,
sisanya berkas statis.

1. **Push repo ini ke GitHub** (repo publik aman — di dalamnya tidak ada kunci).
2. Vercel → **Add New → Project** → *Import Git Repository* → pilih repo ini.
   Framework Preset: **Other**; biarkan Build/Output Command kosong.
3. **Settings → Environment Variables**, tambahkan (untuk Production *dan* Preview):

   | Nama | Nilai | Wajib |
   |---|---|---|
   | `AI_PROVIDER` | `9router` | ya |
   | `AI_API_KEY` | `sk-…` (kuncimu) | ya |
   | `AI_MODEL_FAST` / `AI_MODEL_THINK` / `AI_MODEL_VISI` | mis. `kr/claude-haiku-4.5` | tidak |
   | `ALLOWED_ORIGINS` / `APP_URL` | mis. `https://chat.contoh.com` | tidak |

4. **Deploy** → buka alamat `https://<proyek>.vercel.app`.
5. Cek `/api/health` — harus menjawab `penyedia: 9Router …` dan
   `kunci: terpasang`.

**Penting:** mengubah Environment Variable **tidak** mengubah deployment yang
sudah jalan. Setelah mengubah env → **Redeploy** (Deployments → … → Redeploy).

Catatan Vercel:

* Paket **Hobby** hanya untuk penggunaan pribadi/non-komersial; fungsi Node
  dibatasi ± 300 detik per permintaan — cukup untuk streaming jawaban.
* Kalau memakai **domain sendiri**: Settings → Domains → ikuti instruksi DNS.
  Tidak ada syarat lain, karena tidak ada router lokal yang perlu dijangkau.
* Berkas `tools/` dan `dokumen-lama/` tidak ikut terunggah (lihat `.vercelignore`).

---

## C. VPS / Docker (hidup 24 jam)

```bash
# di VPS (Ubuntu/Debian)
git clone <repo-mu> van-chat-spy && cd van-chat-spy
cp .env.example .env         # isi AI_API_KEY=sk-XXXX
docker compose up -d         # → http://<ip-vps>:8131
```

Tanpa Docker pun bisa:

```bash
npm install -g pm2
AI_API_KEY=sk-XXXX pm2 start tools/server-uji.mjs --name van-chat-spy
pm2 save
```

Supaya ada HTTPS, taruh reverse proxy (Caddy paling singkat) di depannya:

```
chat.contoh.com {
    reverse_proxy 127.0.0.1:8131
}
```

Isi `ALLOWED_ORIGINS=https://chat.contoh.com` dan `APP_URL=https://chat.contoh.com`
di `.env` kalau webnya dipakai dari domain itu.

---

## Keamanan (berlaku di semua pilihan)

* Kunci 9Router hidup **hanya di environment variable** server. Halaman web
  tidak pernah menerima kunci — `/api/providers` hanya mengirim versi tersamar
  (`sk-nr…cdef`).
* Jangan pernah menaruh kunci di `index.html`, `assets/*`, README, atau commit.
* Kalau kunci sempat bocor (mis. terkirim di chat/screenshot): hapus di
  <https://rqacwx8.abc-tunnel.us/keys> lalu buat yang baru.
* Aplikasi **menolak** permintaan dari asal (Origin) asing; isi
  `ALLOWED_ORIGINS` bila webnya dibuka dari domain lain.

## Batas & biaya (jujur)

* Kuota/token mengikuti **paket akunmu di 9Router** (ada paket gratis dengan
  batas permintaan per menit & token harian; detailnya di halaman *Pricing*).
  Aplikasi tidak mengarang angka kuota — pesan dari penyedia diteruskan apa adanya.
* Fitur yang butuh kunci tambahan (gambar AI, suara AI) hanya aktif kalau
  `IMAGE_API_KEY` / `TTS_API_KEY` / `STT_API_KEY` diisi. Tanpa itu, tombolnya
  mengatakan apa adanya (gambar lewat kode, suara lewat Web Speech bawaan browser).
* Hosting Vercel Hobby = penggunaan pribadi/non-komersial.

## Bukti uji (repo ini, 29–30 Sep 2026)

| Berkas | Isinya |
|---|---|
| `bukti-uji/HASIL-UJI-9ROUTER.txt` | alur 9Router lengkap (tiruan): daftar model dari penyedia (`kr/*`), percakapan, streaming, visi, builder, kunci salah → jujur «kunci ditolak», dan pemulihan otomatis tanpa restart |
| `bukti-uji/HASIL-CEK-PENYEDIA-9ROUTER.txt` | hasil `tools/cek-penyedia.mjs` ke `rqacwx8.abc-tunnel.us` |
| `bukti-uji/` (lainnya) | tangkapan layar & hasil uji tampilan/butir 15–53 |

Catatan jujur: di sandbox uji tidak ada akun 9Router (tidak ada kunci), jadi
alur penyedia ditiru oleh `tools/mock-openai.mjs` dengan protokol yang sama
(`GET /v1/models` + `POST /v1/chat/completions` biasa & SSE). Endpoint aslinya
sendiri sudah diperiksa langsung: tanpa kunci selalu menjawab
`401 {"error":{"type":"unauthorized","message":"A valid API key is required."}}`.

## Kalau bermasalah, cek berurutan

1. `node tools/cek-penyedia.mjs --url https://rqacwx8.abc-tunnel.us/v1 --key sk-XXXX` → semua ✓?
2. Buka **Setelan → Model AI** di aplikasi: ada daftar model → kunci & jaringan beres.
3. Jawaban «kunci penyedia AI ditolak penyedianya» → kunci salah/terpotong, atau
   sudah dihapus di 9Router. Periksa juga spasi/newline yang ikut tersalin.
4. Jawaban «Tidak bisa menghubungi penyedia AI» → **pesannya sekarang menyebut
   penyebabnya** (mis. `penyebab: tidak menjawab dalam 9 detik`). Buka
   `/api/health?uji=1` di browser untuk melihat status HTTP & lama waktunya; kalau
   `AI_BASE_URL` kamu isi sendiri, kosongkan dulu (bawaannya sudah benar). Aplikasi
   mencoba lagi otomatis; begitu normal, percakapan langsung jalan **tanpa restart**.
5. Pesan batas/kuota dari penyedia → tunggu sebentar atau tingkatkan paketnya.
6. Di Vercel: sudah **redeploy** setelah mengubah env?
7. Daftar model kosong padahal kunci benar → paket akunmu mungkin belum punya
   model untuk mode itu; pilih model lain di Setelan → Model AI.
7b. Bingung penyebabnya? Buka `/api/health?uji=1` (tambah `&uji=chat` untuk
   percakapan uji). Jawabannya menyebut alamat, status, dan lamanya — jadi jelas
   apakah masalahnya kunci, jaringan, atau penyedia.
8. Memakai 9Router di alamat lain (opsional): isi `AI_BASE_URL` (mis.
   `http://127.0.0.1:20128/v1` kalau 9Router jalan di komputer sendiri) +
   `AI_API_KEY`. Kalau router menyebut banyak model tapi sebagian tidak punya
   kredensial aktif, aplikasi menyisir kandidat dan mengingat yang berhasil
   (percakapan pertama bisa lebih lama beberapa detik). Kosongkan `AI_BASE_URL`
   untuk kembali ke alamat bawaan (tunnel 9Router).
