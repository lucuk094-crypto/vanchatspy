# Memakai penyedia AI bergaya Anthropic (contoh: cc.freemodel.dev)

Dokumen ini mencatat hasil pemeriksaan penyedia yang kamu berikan, apa yang perlu
dilakukan, dan bagaimana aplikasi sekarang bisa memakainya.

## 1. Hasil pemeriksaan (29 Sep 2026, dari sandbox ini langsung ke penyedianya)

| Yang diperiksa | Hasil |
|---|---|
| `GET https://cc.freemodel.dev/v1/models` dengan kuncimu | **HTTP 200** — 9 model terbaca |
| Daftar model | `claude-opus-5-5`, `claude-opus-5`, `claude-opus-4-8`, `claude-opus-4-7`, `claude-fable-5-1`, `claude-sonnet-5`, `claude-sonnet-4-6`, `claude-opus-4-6`, `claude-haiku-4-5-20251001` |
| Jenis endpoint tiap model | `supported_endpoint_types: ["anthropic"]` — **semuanya hanya melayani protokol Anthropic** |
| `POST /v1/messages` (gaya Anthropic, header `x-api-key`) | **HTTP 401 · `{"error":"Insufficient balance"}`** |
| `POST /v1/chat/completions` (gaya OpenAI, `Authorization: Bearer`) | **HTTP 401 · `{"error":"Insufficient balance"}`** |
| `GET https://cc.freemodel.dev/` | `{"error":"Unauthorized: No valid credentials provided"}` → ini gateway API, bukan situs berhalaman |

Kesimpulan: **kuncinya sah** (daftar model bisa dibaca), tetapi **akun di balik kunci itu
tidak punya saldo/kredit** — karena itu semua permintaan percakapan ditolak. Ini bukan
masalah setelan di sisi web: apa pun yang dipakai (halaman ini, 9Router, atau klien lain)
akan mendapat jawaban yang sama sampai saldo diisi di dasbor penyedia.

**Yang harus kamu lakukan lebih dulu:** buka situs/dasbor penyedia (cc.freemodel.dev) →
isi/dbeli kredit untuk akun yang memakai kunci `fe_oa_…` → baru lanjut ke langkah 3.

## 2. Perbedaan penting: protokolnya bukan OpenAI

Provider ini **hanya** melayani **Anthropic Messages API**:
`POST {base}/messages` dengan header `x-api-key` + `anthropic-version: 2023-06-01`,
dan jawabannya berbentuk `{ content: [ { type: "text", text: … } ] }` serta SSE
`content_block_delta`. Aplikasi Van Chat.SPY awalnya hanya bicara bahasa OpenAI
(`/chat/completions` + `Authorization: Bearer`) — jadi **tidak bisa** langsung dipakai.

Karena itu saya tambahkan dukungan **gaya Anthropic** ke aplikasi:

- `AI_GAYA=anthropic` (atau nama penyedia `anthropic` / `claude` / `freemodel` — otomatis)
- permintaan dikirim ke `{AI_BASE_URL}/messages` dengan `x-api-key` + `anthropic-version`
- `system` dipisah, pesan berurutan digabung, **gambar** dikirim sebagai blok
  `{type:"image", source:{type:"base64", …}}` (jadi fitur baca foto tetap jalan)
- jawaban biasa **dan** jawaban mengalir (SSE) diterjemahkan ke bentuk yang dipahami halaman
- daftar model dibaca dari penyedia itu (`GET /models`), jadi tidak ada nama model
  OpenRouter yang nyasar
- pesan galat diteruskan apa adanya (`{"error":"Insufficient balance"}` → «saldo/kredit
  penyedia AI habis …»), bukan jawaban palsu

Untuk penyedia gaya OpenAI (OpenRouter, 9Router, Groq, …) tidak ada yang berubah.

## 3. Cara memakai penyedia ini (setelah saldo diisi)

### A. Di komputer sendiri — sudah siap, tinggal jalan

Setelan sudah saya simpan di `tools/penyedia.json` (berisi kunci rahasiamu; berkas ini
**tidak** ikut di dalam zip/deploy):

```json
{ "nama": "freemodel", "url": "https://cc.freemodel.dev/v1",
  "kunci": "fe_oa_…", "gaya": "anthropic" }
```

```bash
node tools/server-uji.mjs      # barisnya akan berbunyi: penyedia AI: freemodel (…) · gaya Anthropic
# buka http://127.0.0.1:8131/  → Setelan → Model AI
```

Mau kembali ke OpenRouter sementara? Hapus/ganti nama `tools/penyedia.json`, atau jalankan
dengan `AI_PROVIDER=openrouter node tools/server-uji.mjs` (env selalu menang atas berkas).

### B. Cara lain: environment variable

```bash
AI_PROVIDER=freemodel
AI_BASE_URL=https://cc.freemodel.dev/v1
AI_API_KEY=fe_oa_…
AI_GAYA=anthropic
# opsional, memilih model per mode:
AI_MODEL_FAST=claude-haiku-4-5-20251001
AI_MODEL_THINK=claude-sonnet-5
AI_MODEL_DEEP=claude-opus-4-8
AI_MODEL_EXPERT=claude-opus-5-5
AI_MODEL_VISI=claude-sonnet-5
```

### C. Di Vercel (atau hosting lain)

Penyedia ini **bisa** dipakai dari Vercel langsung — alamatnya sudah publik dan HTTPS,
jadi tidak butuh PC menyala seperti 9Router. Cukup: Vercel → Settings → Environment
Variables → isi enam nilai di atas → **Redeploy** → buka web → Setelan → Model AI.
(Pastikan saldo penyedia sudah ada, kalau tidak setiap percakapan akan menjawab
«saldo/kredit penyedia AI habis …» — dan itu memang jawaban yang benar.)

### D. Memeriksa sendiri kapan saja

```bash
node tools/cek-penyedia.mjs --url https://cc.freemodel.dev/v1 --key KUNCI --nama freemodel
node tools/cek-penyedia.mjs --url … --key … --nama freemodel --tulis   # sekaligus menyimpan ke tools/penyedia.json
```
Pemeriksa ini bekerja untuk penyedia gaya OpenAI **dan** Anthropic (gayanya dideteksi
otomatis: kalau `/chat/completions` ditolak 404, ia mencoba `/messages`), melaporkan
daftar model, hasil percakapan uji, dan **membedakan** kunci salah vs saldo habis.

## 4. Yang sudah diuji di repo ini

`node tools/uji-anthropic.mjs` → **SEMUA LULUS** (bukti: `bukti-uji/HASIL-UJI-ANTHROPIC.txt`),
memakai `tools/mock-anthropic.mjs` (tiruan penyedia gaya Anthropic, termasuk mode
`--saldo-habis`):

| Pemeriksaan | Hasil |
|---|---|
| Penyedia dikenali bergaya Anthropic | ✓ `gaya: "anthropic"` |
| Daftar model dari penyedia itu (claude-*, bukan `:free`) | ✓ 6 model |
| Percakapan lewat `POST /messages` | ✓ |
| Perintah bentuk “tepat tiga kata” | ✓ `"Kopi adalah minuman."` |
| Jawaban mengalir (SSE Anthropic → bentuk halaman) | ✓ 5 potongan + `[DONE]` |
| Foto terkirim sebagai blok `image` base64 & “dilihat” | ✓ “merah … lingkaran putih … batang biru” |
| AI Builder lewat penyedia yang sama | ✓ HTML utuh diterima |
| Saldo habis (`--saldo-habis`) | ✓ `saldo: true` + pesan «Insufficient balance» — bukan jawaban palsu |

Pemeriksa penyedia juga sudah diuji terhadap tiga situasi nyata: penyedia gaya Anthropic
sehat, penyedia **dengan saldo habis**, dan penyedia gaya OpenAI — hasilnya tersimpan di
`bukti-uji/HASIL-CEK-PENYEDIA.txt`, dan pengujian langsung ke `cc.freemodel.dev` menghasilkan:

```
✓ daftar model terbaca (GET /models) — HTTP 200 · 9 model
2) percakapan uji via POST /messages (gaya Anthropic)
   jawaban penyedia: HTTP 401 · Insufficient balance
   ✗ saldo/kredit penyedia habis — bukan salah setelan
```

## 5. Catatan keamanan (penting)

Kunci yang kamu kirim lewat percakapan ini (awalan `fe_oa_…`), jadi anggap kunci itu **sudah bocor**.
Setelah selesai menguji, sebaiknya **rotasi/ganti kunci** di dasbor penyedia, lalu perbarui
nilai di `tools/penyedia.json` (atau env). Berkas `tools/penyedia.json`, `tools/9router.json`,
dan `tools/cloudflare.json` sengaja **tidak** disertakan di dalam zip/deploy
(sudah masuk `.gitignore`, `.dockerignore`, `.vercelignore`) supaya kunci tidak ikut tersebar.
