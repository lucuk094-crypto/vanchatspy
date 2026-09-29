# NaraRouter (https://router.bynara.id) — satu-satunya penyedia Van Chat.SPY

Aplikasi ini sekarang **hanya** bicara ke NaraRouter: satu kunci untuk banyak
model (termasuk paket gratis). Penyedia lain sudah dilepas dari kodenya, jadi
kalau onboarding di bawah ini diikuti, tidak ada setelan lain yang perlu diurus.

Kode yang kamu kirim:

```bash
curl https://router.bynara.id/v1/chat/completions \
  -H "Authorization: Bearer $BYNARA_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"agnes-2.5-flash","messages":[{"role":"user","content":"Hello"}]}'
```

## 1. Hasil pemeriksaan endpoint itu (29 Sep 2026, langsung dari server ini)

| Yang diuji | Hasil |
|---|---|
| `GET /v1/models` tanpa kunci | **401** `{"error":{"type":"unauthorized","message":"A valid API key is required."}}` → penyedia **pasti butuh kunci** |
| `POST /v1/chat/completions` tanpa kunci | **401** (sama) |
| `POST /v1/chat/completions` dengan kunci palsu | **401** (sama) — jadi tidak ada celah "tanpa kunci" |
| Protokol | **OpenAI-compatible**: `Authorization: Bearer <kunci>` + `POST /v1/chat/completions` (+ `/v1/responses`, `/v1/messages`, `/v1/embeddings`) |
| Mode reasoning | `reasoning_effort` (`none`…`max`) — dipakai aplikasi untuk mode Berpikir/Dalam/Tingkat lanjut |
| Halaman resmi | `router.bynara.id` — NaraRouter: gateway multi-model, ada **paket gratis** (Agnes 2.5 Flash, Agnes 3 Flash, Jev, Laguna S 2.1, Ling 3.0 Flash, Nemotron, MiMo Free, …) dengan **batas 7 juta token/hari** dan **15 permintaan/menit** |
| Bentuk kunci | diawali **`sk-nry-`**, dibuat di halaman **API keys** (`router.bynara.id/keys`), hanya ditampilkan sekali |
| Format streaming | SSE `data: {"choices":[{"delta":{"content":"…"}}]}` + `data: [DONE]` (sama seperti yang sudah dipakai aplikasi) |
| Gambar | endpoint gambar terpisah: `https://api-images.bynara.id/v1/images/generations` |

Kesimpulan: **endpoint ini bisa dipakai langsung** — protokolnya sama dengan yang
sudah dipakai aplikasi (OpenAI-compatible), ada paket gratis, dan karena berupa
layanan publik HTTPS, web-nya bisa langsung di-deploy ke Vercel tanpa server
tambahan di rumah. Yang belum ada hanyalah **kunci**: selama kunci belum diisi,
setiap percakapan dijawab jujur «kunci penyedia AI ditolak penyedianya …»
(bukan jawaban palsu).

## 2. Yang sudah saya sambungkan ke aplikasi

1. `AI_PROVIDER=bynara` (atau `nararouter`) kini **nama yang dikenal**: alamat bawaannya
   `https://router.bynara.id/v1`, jadi `AI_BASE_URL` boleh dikosongkan.
2. Penyedia ini termasuk **bergaya router** → daftar model dibaca dari
   `GET https://router.bynara.id/v1/models` milik **akunmu** (jadi model yang muncul
   persis yang boleh dipakai paketmu: `agnes-2.5-flash`, `agnes-3-flash`, … — bukan
   daftar bawaan aplikasi).
3. Pesan galat baru yang jujur: kunci salah/kosong →
   `{"ok":false,"kunci":true,"pesan":"kunci penyedia AI ditolak penyedianya (bynara di https://router.bynara.id/v1). Periksa AI_API_KEY — di NaraRouter kunci harus berawalan sk-nry- …"}` (HTTP 401).
   Sebelumnya keadaan ini bisa tertukar dengan «penyedia belum jalan/sibuk» — sekarang tidak.
4. Uji otomatis `node tools/uji-bynara.mjs` → **SEMUA LULUS**
   (bukti: `bukti-uji/HASIL-UJI-BYNARA.txt`): alamat bawaan, daftar model dari penyedia,
   percakapan, perintah bentuk “tepat tiga kata”, streaming SSE, foto (blok `image_url`),
   AI Builder, kasus kunci salah, dan **pemulihan otomatis** — web yang dibuka sebelum
   penyedia hidup akan jalan sendiri, tanpa restart.
5. Fitur gambar (`/api/image/generate`) memakai endpoint gambar NaraRouter:
   `IMAGE_PROVIDER=bynara`, `IMAGE_API_KEY=sk-nry-…`, model bawaan
   `agnes-image-2.1-flash`. Tanpa kunci itu, tombolnya mengatakan apa adanya.

## 3. Langkah persis memakainya

### A. Cek dulu kuncimu (di komputermu, kunci tidak dikirim ke mana pun selain penyedianya)

```bash
node tools/cek-penyedia.mjs --url https://router.bynara.id/v1 --key sk-nry-XXXX --nama bynara --tulis
```
`--tulis` menyimpan hasilnya ke `tools/penyedia.json` (berisi kunci → **tidak** ikut
zip/deploy, sudah ada di `.gitignore`), sehingga `node tools/server-uji.mjs` langsung
memakai NaraRouter. Environment variable selalu menang atas berkas itu, jadi
`AI_API_KEY=sk-nry-… node tools/server-uji.mjs` juga sah.

### B. Jalankan lokal

```bash
node tools/server-uji.mjs        # buka http://127.0.0.1:8131/
```

### C. Deploy ke Vercel

Vercel → **Settings → Environment Variables**, isi:

| Nama | Nilai |
|---|---|
| `AI_PROVIDER` | `bynara` |
| `AI_API_KEY` | `sk-nry-…` |
| `AI_BASE_URL` | *(boleh dikosongkan — otomatis `https://router.bynara.id/v1`)* |
| `AI_MODEL_FAST` | `agnes-2.5-flash` *(opsional)* |
| `AI_MODEL_THINK` | `agnes-3-flash` *(opsional)* |
| `AI_MODEL_VISI` | model penglihatan milik paketmu *(opsional — hanya kalau kartu modelnya menyebut vision)* |

lalu **Redeploy** (perubahan env baru berlaku setelah deploy ulang).
Karena NaraRouter berupa layanan publik HTTPS, **tidak perlu** PC/server di rumah
menyala, tidak perlu tunnel, dan tidak ada router lokal yang dijalankan.

### D. Setara dengan env (lokal)

```bash
AI_PROVIDER=bynara AI_API_KEY=sk-nry-… node tools/server-uji.mjs
```

## 4. Catatan jujur & keamanan

- **Kunci belum ada**: sampai kamu membuat kunci di dasbor NaraRouter dan mengisinya,
  aplikasi akan menjawab dengan pesan “kunci ditolak”. Itu perilaku yang benar.
- Jangan menempelkan kunci di percakapan/chat publik; kalau sudah pernah, **rotasi**
  (dashboard → API keys → rotate) lalu pakai yang baru.
- Kunci hanya hidup di sisi server (env atau `tools/penyedia.json` yang di-abaikan Git).
  Periksa dengan `node tools/uji-rahasia.mjs` bila ingin memastikan kunci tidak bocor ke browser.
- Batas paket gratis: 7 juta token/hari, 15 permintaan/menit. Untuk uji yang memakai kuota
  sungguhan (`tools/uji-live.mjs`), jalankan saat jatah harian masih segar.
- Panduan deploy untuk publik (Vercel/VPS) ada di **`DEPLOY.md`**.
