# 9Router — satu-satunya penyedia Van Chat.SPY

Aplikasi ini **hanya** bicara ke 9Router. Alamat aksesnya lewat tunnel:

```
https://rqacwx8.abc-tunnel.us/v1
```

Penyedia lain sudah dilepas dari kode, tampilan, dan dokumen. Satu kunci untuk
semua model.

## 1. Yang sudah diperiksa langsung (29 Sep 2026)

| Yang diuji | Hasil |
|---|---|
| `GET /v1/models` | **200**, 87–94 model (jumlahnya berubah antar panggilan) |
| Tanpa kunci | **401** `API key required for remote API access` — kunci wajib |
| `POST /v1/chat/completions` (`FreeTiers`, `kr/claude-haiku-4.5`, `kr/claude-sonnet-4.5`, `kr/auto`) | **200**, jawaban normal |
| Kirim foto (blok `image_url`) ke `kr/claude-sonnet-4.5` / `kr/claude-haiku-4.5` | **200**, gambar benar-benar dibaca |
| Streaming SSE | jalan; alirannya berakhir **tanpa** baris `data: [DONE]` |
| `openrouter/…:free` | **503** "This model is unavailable for free" (sebagian 403/404) |
| Model penalaran (`…-thinking`) | jalan, tapi menulis penalaran di dalam tag `<thinking>` |
| `POST /v1/images/generations` | **400** `No credentials for provider: openai` → **9Router lewat tunnel ini tidak melayani pembuatan gambar** |

Karena daftar modelnya "ramai tapi sebagian mati", aplikasi **menyisir kandidat
model**: mencoba model berikutnya sampai ketemu yang hidup, lalu **mengingat**
model yang berhasil untuk mode itu. Model yang baru gagal ditahan 5 menit supaya
percakapan berikutnya tidak mencoba yang sama. Jadi kamu tidak perlu memilih
model manual — tapi tetap bisa, di **Setelan → Model AI**.

Penalaran internal model (`<thinking>…</thinking>`) **dibuang di server**, tidak
pernah tampil di layar — termasuk saat jawaban mengalir.

## 2. Cara pakai sehari-hari

1. **Nyalakan 9Router** (tunnel-nya).
2. Jalankan webnya:

   ```bash
   node tools/server-uji.mjs        # → http://127.0.0.1:8131/
   ```

   Kunci dibaca dari `.env.local` (lihat `.env.local.contoh`). Berkas itu
   **tidak ikut repo/zip**. Berkasnya cukup berisi satu baris:

   ```env
   AI_API_KEY=sk-kunci-9routermu
   ```

3. Webnya langsung berfungsi. Kalau 9Router belum menyala, aplikasi menjawab
   jujur "tidak bisa menghubungi penyedia AI" — dan begitu tunnelnya hidup,
   percakapan jalan **tanpa restart**.

Di hosting (Vercel) tidak ada berkas, jadi kuncinya lewat
**Settings → Environment Variables**:

| Nama | Nilai |
|---|---|
| `AI_API_KEY` | `sk-…` (wajib) |
| `AI_BASE_URL` | *(boleh dikosongkan — bawaannya `https://rqacwx8.abc-tunnel.us/v1`)* |
| `AI_MODEL_FAST` | `kr/claude-haiku-4.5` *(opsional)* |
| `AI_MODEL_THINK` | `kr/claude-sonnet-4.5` *(opsional)* |
| `AI_MODEL_DEEP` | `kr/claude-sonnet-4.5` *(opsional)* |
| `AI_MODEL_EXPERT` | `kr/claude-sonnet-4.5-agentic` *(opsional)* |

lalu **Redeploy** — perubahan env di Vercel baru berlaku setelah deploy ulang.

## 3. Kalau 9Router dijalankan di komputer sendiri

Ganti alamatnya saja, tanpa mengubah kode:

```bash
AI_BASE_URL=http://127.0.0.1:20128/v1 AI_API_KEY=sk-… node tools/server-uji.mjs
```

atau tulis `AI_BASE_URL=…` di `.env.local`.

## 4. Uji sendiri

```bash
node tools/cek-penyedia.mjs --url https://rqacwx8.abc-tunnel.us/v1 --key sk-XXXX --nama 9router
```

Alat itu memeriksa daftar model, percakapan, dan streaming, lalu menulis
ringkasannya ke `bukti-uji/`. Hasil pemeriksaan yang tersimpan:
`bukti-uji/HASIL-CEK-PENYEDIA-9ROUTER.txt`, dan uji alur aplikasi penuh
`node tools/uji-9router.mjs` → `bukti-uji/HASIL-UJI-9ROUTER.txt`.

## 5. Catatan jujur & keamanan

- **Host tunnel bersifat sementara.** Kalau alamatnya mati/ganti, perbarui
  `AI_BASE_URL`. Selama tidak diisi, aplikasi memakai alamat bawaan di atas.
- **Kunci hanya hidup di sisi server** (env atau `.env.local` yang diabaikan Git).
  `node tools/uji-rahasia.mjs` memastikan kunci tidak ikut ke halaman web.
- Kunci yang pernah lewat obrolan/screenshot sebaiknya **dirotasi**.
- Pembuat gambar **belum aktif** karena 9Router lewat tunnel ini tidak melayani
  gambar; panelnya mengatakan apa adanya, bukan mengarang gambar.
- Fitur lain (cari web, riset, ruang kerja berkas, pratinjau, suara bawaan
  browser) tidak bergantung pada penyedia AI dan tetap jalan seperti biasa.
