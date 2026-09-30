# Penyedia AI GRATIS untuk Van Chat.SPY — mana yang menutup SEMUA fitur

Diperiksa: 1 Oktober 2026 · bukti uji: `bukti-uji/HASIL-UJI-PENYEDIA-GRATIS.txt` (`node tools/uji-penyedia-gratis.mjs`)

Aplikasi ini butuh 6 kemampuan: **percakapan · jawaban mengalir (streaming) · melihat foto (vision) ·
membuat gambar · dengar suara (STT) · membaca jawaban (TTS)** — plus Builder & Riset yang ikut jalur percakapan.

## 1. Jawaban singkat

| Penyedia | Gratisnya | Perlu kunci? | Percakapan | Mengalir | Lihat foto | Buat gambar | Dengar | Bicara |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Cloudflare Workers AI** ⭐ | 10.000 neuron/hari, tanpa kartu | ya (gratis) | ✅ | ✅ | ✅ | ✅ FLUX | ✅ Whisper | ✅ MeloTTS |
| **Google AI Studio (Gemini)** | kuota harian gratis, tanpa kartu | ya (gratis) | ✅ | ✅ | ✅ | ❌ berbayar | — | ✅ (preview gratis) |
| **Pollinations** (bawaan aplikasi) | tanpa pendaftaran | **tidak** | ⚠️ terbatas | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Groq** | batas harian gratis | ya (gratis) | ✅ | ✅ | ⚠️ sebagian model | ❌ | ✅ Whisper | ✅ Orpheus |
| 9Router (tunnel-mu, bawaan aplikasi) | tergantung paket akunmu | ya | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |

**Satu akun yang menutup semuanya → Cloudflare Workers AI.** Kalau mau nol setelan → biarkan seperti sekarang:
percakapan lewat 9Router, gambar lewat Pollinations (sudah hidup tanpa kunci).

## 2. Cara paling cepat: biarkan bawaan (0 setelan)

Aplikasi sudah dirancang supaya fitur gambar **hidup tanpa kunci**:

* Percakapan / streaming / kirim foto → **9Router** (tunnel-mu) seperti sekarang.
* Buat gambar → **Pollinations** otomatis (`IMAGE_PROVIDER` dikosongkan), model `sana`, gratis, ada tanda air.
  Kuotanya ±1 permintaan/15 detik; aplikasi mencoba ulang otomatis 3× sebelum menyerah dan bilang jujur kalau gagal.

Tidak ada yang perlu diisi. Cek di **Setelan → Penyedia** atau buka `/api/providers`.

## 3. Rekomendasi: Cloudflare Workers AI (semua fitur, gratis, tanpa kartu)

1. Daftar gratis di <https://dash.cloudflare.com/sign-up> (tanpa kartu kredit).
2. Buka **Workers & Pages → AI → Workers AI** — di situ tertulis jatah **10.000 neuron/hari** (reset 00:00 UTC).
3. Buat API token: **My Profile → API Tokens → Create Token → template “Workers AI”** (permission *Workers AI: Read*).
4. Catat **Account ID** (ada di kanan halaman Workers AI / URL dasbor).
5. Isi setelan (lokal: `.env.local`; Vercel: *Settings → Environment Variables*, lalu **Redeploy**):

```
AI_PROVIDER=cloudflare
CF_ACCOUNT_ID=<Account ID kamu>
CF_API_TOKEN=<token Workers AI kamu>
IMAGE_PROVIDER=cloudflare
STT_PROVIDER=cloudflare
TTS_PROVIDER=cloudflare
```

6. Bukti cepat: buka `/api/health` → blok `kemampuan` harus `lihatGambar: true, streaming: true, pembuatGambarSiap: true`.

Yang dipakai aplikasi di akun itu:

| Fitur | Model Cloudflare |
| --- | --- |
| Percakapan | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (cadangan: `llama-3.1-8b-instruct`) |
| Lihat foto | `@cf/meta/llama-3.2-11b-vision-instruct` |
| Buat gambar | `@cf/black-forest-labs/flux-1-schnell` — **tanpa tanda air** |
| Dengar (STT) | `@cf/openai/whisper` |
| Bicara (TTS) | `@cf/myshell-ai/melotts` (bahasa `id-ID`) |

Catatan jujur: 10.000 neuron/hari itu **jatah kecil** — cukup untuk pemakaian pribadi/uji coba, habis lalu
permintaan ditolak sampai reset (pesannya diteruskan apa adanya oleh aplikasi). Gambar FLUX memakai neuron
paling banyak; percakapan teks jauh lebih hemat.

## 4. Pilihan lain

**Google AI Studio (Gemini)** — kunci gratis dari <https://aistudio.google.com/apikey>, tanpa kartu. Terbaik untuk
percakapan + streaming + melihat foto (kuota harian jauh lebih longgar daripada Cloudflare). Pembuatan gambar di
Google **berbayar** (tier gratis tidak tersedia), jadi aplikasi otomatis memakai Pollinations untuk gambar.

```
AI_PROVIDER=gemini
GEMINI_API_KEY=<kunci kamu>
# gambar tetap Pollinations (biarkan IMAGE_PROVIDER kosong)
```

**Groq** — <https://console.groq.com/keys>, gratis tanpa kartu, sangat cepat. Cocok untuk percakapan + Whisper.
Tidak punya pembuat gambar → gambar tetap Pollinations.

```
AI_PROVIDER=groq
GROQ_API_KEY=<kunci kamu>
```

**Pollinations saja (nol kunci)** — cukup `AI_PROVIDER=pollinations`. Jujur: modelnya cuma `openai-fast`,
jawabannya datang sekaligus (tanpa streaming), tidak bisa melihat foto, dan kuota anonimnya ketat
(sering menjawab HTTP 402 — aplikasi meneruskan pesan itu apa adanya, bukan mengarang jawaban).

## 5. Berpindah penyedia

* Lokal: ubah `AI_PROVIDER` (+ kuncinya) di `.env.local`, lalu jalankan ulang `node tools/server-uji.mjs`.
* Vercel: ubah Environment Variable → **Redeploy** (perubahan env tidak berlaku tanpa deploy ulang).
* 9Router tetap dipakai bila `AI_PROVIDER` dibiarkan kosong — jadi tidak ada yang rusak kalau tidak diubah.

## 6. Yang TIDAK dilakukan aplikasi (biar tidak salah harap)

* Tidak menampilkan gambar palsu: kalau penyedia gambar menolak, pesan penolakan aslinya yang tampil.
* Tidak memaksa perintah ke fitur yang tidak didukung: kirim foto ke penyedia tanpa vision dijawab 400 + saran
  penyedia yang bisa (Gemini/Cloudflare), jawaban mengalir dimatikan bila penyedia tidak mendukung SSE.
* Tidak menulis kunci di kode/repo/zip — semuanya lewat environment (`.env.local` di komputermu).
