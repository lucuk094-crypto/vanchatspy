# Van Chat.SPY + 9Router — DI DEPLOY DI MANA?

Pertanyaan intinya: **9Router jalan di `localhost:20128`** (di komputer sendiri), sedangkan
web ini bisa ditaruh di mana saja. Yang menentukan adalah **siapa yang menjalankan 9Router
dan siapa yang menjalankan web-nya** — keduanya harus bisa saling menghubungi.

Ringkasan cepat:

| Pilihan | 9Router di | Web di | Bisa dibuka dari HP/internet | Ribet | Catatan |
|---|---|---|---|---|---|
| **A. Satu komputer** (paling gampang) | PC-mu | PC-mu (`node tools/server-uji.mjs`) | hanya kalau tunnel dibuka | ⭐ | tidak ada setelan tambahan, kunci tidak wajib |
| **B. VPS kecil / server sendiri** (paling “deploy” beneran) | VPS | VPS yang sama | ya (domain + HTTPS) | ⭐⭐⭐ | 9Router & web hidup 24 jam, tanpa PC nyala |
| **C. Web di Vercel + 9Router di rumah lewat tunnel** | PC-mu (tunnel) | Vercel | ya | ⭐⭐ | **alamat localhost TIDAK bisa** — wajib alamat publik 9Router; PC harus nyala; jaga alamat & kunci |
| **D. Satu jaringan (LAN)** | PC-mu | laptop/HP lain di Wi-Fi yang sama | ya, hanya di rumah/kantor | ⭐ | pakai alamat `http://IP-PC:20128/v1` |

Semua pilihan memakai kunci env yang sama: `AI_PROVIDER=9router`, `AI_BASE_URL` (alamat
9Router yang bisa dijangkau **dari tempat web berjalan**), `AI_API_KEY` (isi bila 9Router-mu
memakai kunci), dan opsional `AI_MODEL_FAST/THINK/DEEP/EXPERT/VISI`.

---

## 0-bis. Kalau penyedia AI-mu bukan gaya OpenAI (mis. cc.freemodel.dev)

Ada penyedia yang **hanya** melayani protokol **Anthropic** (`POST /messages` + header
`x-api-key`), bukan `/chat/completions` ala OpenAI. Untuk itu pasang:

```
AI_PROVIDER = freemodel
AI_BASE_URL = https://cc.freemodel.dev/v1
AI_API_KEY  = <kunci dari dasbor penyedia>
AI_GAYA     = anthropic
AI_MODEL_FAST  = claude-haiku-4-5-20251001
AI_MODEL_THINK = claude-sonnet-5
```

lalu **redeploy**. Aplikasi sudah bisa bicara gaya Anthropic (termasuk jawaban mengalir,
foto sebagai blok `image`, dan pesan galat penyedia apa adanya). Rincian, hasil pemeriksaan,
dan cara memeriksanya sendiri: **PANDUAN-PENYEDIA-ANTHROPIC.md**
(`node tools/cek-penyedia.mjs --url … --key …`).

---

## A. Di komputer sendiri (default, tanpa setelan)

```bash
9router                     # terminal 1 → tunggu "Server ready"
node tools/server-uji.mjs   # terminal 2 → http://127.0.0.1:8131/
```
Tidak perlu env apa pun: aplikasi otomatis memakai `http://127.0.0.1:20128/v1`.
Kalau ingin dibuka dari HP tanpa memindahkan 9Router, tunnel **web-nya** saja:

```bash
cloudflared tunnel --url http://127.0.0.1:8131     # → https://….trycloudflare.com
```
Semua permintaan dari HP tetap dikerjakan di PC (9Router tetap di localhost) — ini cara
paling aman karena **9Router tidak pernah terbuka ke internet**.

## B. Di VPS / server sendiri (deploy sungguhan, hidup 24 jam)

Tempat terbaik kalau ingin "benar-benar deploy": **9Router dan web di mesin yang sama**.
Dua cara:

**B1. Tanpa Docker** (paling cepat):
```bash
# di VPS (Ubuntu/Debian), sebagai user biasa
npm install -g 9router            # lalu jalankan: 9router   (buka dashboard-nya lewat SSH port-forward)
git clone <repo-mu> /opt/van-chat-spy && cd /opt/van-chat-spy
node tools/cek-9router.mjs        # di VPS: alamat 127.0.0.1:20128 → tools/9router.json
PORT=8131 node tools/server-uji.mjs
```
Buka dashboard 9Router dari komputermu lewat SSH tunnel kalau perlu:
`ssh -L 20128:127.0.0.1:20128 user@vps` → buka `http://localhost:20128/dashboard`.
Supaya tetap hidup: `pm2 start tools/server-uji.mjs --name van-chat-spy` (dan `pm2 start 9router`)
atau unit systemd. Tambahkan Nginx/Caddy sebagai HTTPS di depan port 8131.

**B2. Dengan Docker** (berkas sudah disediakan: `Dockerfile` + `docker-compose.yml`):
```bash
cp .env.example .env      # isi AI_API_KEY bila 9Router memakai kunci
docker compose up -d      # → web di :8131, 9Router di :20128 (dua container, satu jaringan)
```
`docker-compose.yml` sudah mengisi `AI_BASE_URL=http://ninerouter:20128/v1`
(nama service di jaringan Docker), jadi web menemukan 9Router tanpa alamat publik.

> Kunci di VPS: dashboard 9Router ada di port 20128 — jangan dibuka mentah-mentah ke
> internet. Cukup port web (di balik HTTPS) yang dibuka, 9Router biarkan internal.

## C. Web di Vercel + 9Router di rumah lewat tunnel

**Jawaban singkat untuk skenario ini:** kalau `AI_BASE_URL` diisi `http://127.0.0.1:20128/v1`
(alamat localhost), **webnya jalan tetapi AI-nya tidak bisa dipakai** — Vercel akan menjawab
jujur: *“Alamat http://127.0.0.1:20128/v1 tidak bisa dipakai dari hosting (Vercel): di sana
127.0.0.1 menunjuk ke server Vercel sendiri, bukan ke komputermu.”*

Sebabnya sederhana: `localhost`/`127.0.0.1` artinya “mesin ini”. Di komputermu itu komputermu;
di Vercel itu server Vercel. Jadi yang harus dipasang bukan alamat localhost, melainkan
**alamat publik 9Router** (tunnel atau VPS). Itu bisa, dan jalur ini sudah diuji
(lihat “Bukti”: aplikasi menyambung ke `https://….trycloudflare.com/v1`, membaca 7 model,
dan bercakap normal).

### Resep langkah demi langkah (Windows)

1. **Buka 9Router ke internet** (pilih salah satu):
   - *Cepat, tanpa domain* (alamat berubah setiap kali dijalankan):
     ```bat
     winget install --id Cloudflare.cloudflared        :: sekali saja
     cloudflared tunnel --url http://127.0.0.1:20128
     ```
     → catat alamat yang muncul, mis. `https://kata-kata-acak.trycloudflare.com`
   - *Tetap, pakai domain sendiri* (disarankan; alamat tidak berubah):
     ```bat
     cloudflared tunnel login
     cloudflared tunnel create van-chat-9router
     cloudflared tunnel route dns van-chat-9router router.contoh.com
     cloudflared tunnel run van-chat-9router
     ```
     dengan `%USERPROFILE%\.cloudflared\config.yml`:
     ```yaml
     tunnel: van-chat-9router
     credentials-file: C:\Users\<namamu>\.cloudflared\<id-tunnel>.json
     ingress:
       - hostname: router.contoh.com
         service: http://127.0.0.1:20128
       - service: http_status:404
     ```

2. **Kunci di 9Router** — buka dashboard `http://localhost:20128/dashboard`, set
   `REQUIRE_API_KEY=true`, salin kuncinya. (Tanpa ini, siapa pun yang tahu alamat tunnel
   bisa memakai kuota modelmu.)

3. **Environment Variables di Vercel** (Project → Settings → Environment Variables):
   ```
   AI_PROVIDER = 9router
   AI_BASE_URL = https://kata-kata-acak.trycloudflare.com/v1     ← berakhiran /v1, bukan localhost
   AI_API_KEY  = kunci dari dashboard 9Router
   AI_MODEL_FAST  = gh/gpt-5-mini            ← opsional, tapi disarankan (lihat batas waktu)
   AI_MODEL_THINK = kr/claude-sonnet-4.5     ← opsional
   AI_MODEL_VISI  = vertex/gemini-3-flash    ← opsional (untuk foto)
   ```
   Lalu **deploy ulang** (`vercel --prod` atau tombol Redeploy) — perubahan env baru berlaku
   setelah redeploy.

4. **Periksa**: buka web Vercel-mu → **Setelan → Model AI**. Kalau berhasil, model yang
   tertulis adalah nama dari 9Router (mis. `kr/…`, `gh/…`) dan tombol **Uji koneksi** hijau.
   Kalau gagal, pesannya menyebut alamat mana yang dicoba — dari situ sudah jelas apa yang salah.

### Yang harus kamu terima kalau memilih cara ini

- **PC harus menyala** dan 9Router harus jalan setiap kali web Vercel-mu dipakai.
- **Alamat quick tunnel berubah** setiap dijalankan → tiap kali berubah, `AI_BASE_URL` di Vercel
  harus diganti + redeploy. Kalau tidak mau repot, pakai *named tunnel* dengan domain tetap.
- **Batas waktu Vercel (Edge runtime):** respons pertama harus mulai keluar dalam **25 detik**
  (kalau lewat, streaming gagal) dan streaming maksimal **300 detik**. Karena itu disarankan
  model cepat untuk mode Normal — kalau PC-mu sedang lambat/9Router baru “bangun”, jawaban
  panjang bisa terpotong.
- **Vercel Hobby hanya untuk proyek pribadi/non-komersial.**
- Catatan ke depan: Vercel menandai *Edge Functions* “deprecated for new projects”
  (mengarahkan ke Vercel Functions + Node runtime). Selama masih jalan, kode ini aman dipakai;
  untuk jangka panjang, pola yang paling awet tetap **B (VPS)** atau **A (di komputer sendiri)**.

### C-bis. Tanpa tunnel sama sekali: domain Cloudflare + port forward

Kalau kamu ingin **domain Cloudflare sendiri (bukan tunnel)**:

```
Vercel → https://router.contoh.com:8443/v1 → Cloudflare (proxy) → router rumah
        → Caddy di PC (HTTPS, only /v1/*) → 9Router 127.0.0.1:20128
```

Ringkasnya: DNS **A record proxied** ke IP publik rumah + **port forward 8443** +
**Caddy** sebagai pintu masuk (dengan Cloudflare Origin Certificate) + **DDNS** karena
IP rumah biasanya berubah. Syarat mutlak: ISP memberi **IP publik** (bukan CGNAT).
Panduan langkah demi langkah (dengan tabel troubleshooting dan skrip pembantu):
**`PANDUAN-DOMAIN-CLOUDFLARE.md`**.

### Keamanan (penting untuk cara ini)

Alamat tunnel = pintu terbuka ke 9Router-mu. Minimal: `REQUIRE_API_KEY=true` + kunci acak panjang.
Lebih baik lagi: batasi dengan **Cloudflare Access** (hanya emailmu yang boleh lewat) atau
blockir jalur `/dashboard` dari publik. Kalau tidak ingin mengurus ini semua, pilih B atau A.

Saya sudah siapkan pembantu: `tools\buka-9router-tunnel.bat` — membuka tunnel ke port 20128
lalu **mencetak langsung tiga baris env** (`AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`) untuk
disalin ke Vercel.

## D. Satu jaringan rumah/kantor (LAN)

Kalau web-nya dijalankan di laptop lain atau di HP (mis. lewat Termux):
```
AI_PROVIDER = 9router
AI_BASE_URL = http://192.168.1.10:20128/v1      ← IP PC yang menjalankan 9Router
```
1. Pastikan 9Router mendengarkan di alamat jaringan (bukan hanya 127.0.0.1) — cek dari
   laptop lain: `node tools/cek-9router.mjs --url http://192.168.1.10:20128/v1`
2. Izinkan port 20128 di firewall Windows: `New-NetFirewallRule -DisplayName "9Router" -Direction Inbound -LocalPort 20128 -Protocol TCP -Action Allow` (PowerShell **admin**).
3. Jangan lakukan ini di Wi-Fi publik — tidak ada HTTPS di LAN.

---

## Bukti uji (dijalankan di repo ini, 29 Sep 2026)

`node tools/uji-9router-jauh.mjs` → **SEMUA LULUS** (`bukti-uji/HASIL-UJI-9ROUTER-JAUH.txt`):

| Pemeriksaan | Hasil |
|---|---|
| 9Router di alamat jaringan (bukan localhost) | ✓ `http://169.254.0.21:20130/v1 → HTTP 200` |
| 9Router di alamat publik HTTPS (tunnel) | ✓ `https://….trycloudflare.com/v1 → HTTP 200` |
| Web dijalankan dengan `AI_BASE_URL` ke alamat itu | ✓ penyedia `alamat=https://….trycloudflare.com/v1`, `dasarLokal=false`, `modelDariRouter=true` |
| Daftar model tetap dari 9Router (bukan penyedia lain) | ✓ memakai `gh/gpt-5-mini` dari 7 model router |
| Perintah bentuk “tepat tiga kata” lewat 9Router jauh | ✓ `"Kopi adalah minuman."` |
| 9Router mati di balik tunnel | ✓ pesan jujur *“Tidak bisa menghubungi 9Router di https://…”* (bukan jawaban palsu, bukan menyuruh `9router` di CMD lokal) |
| Skenario “di-deploy di Vercel” (`VERCEL=1`, alamat publik) | ✓ penyedia dibaca dari env, model dari router, percakapan jalan — lihat `bukti-uji/HASIL-UJI-9ROUTER-JAUH.txt` |
| Skenario “di-deploy di Vercel” + `AI_BASE_URL` localhost | ✓ pesan jelas: *“Alamat http://127.0.0.1:20128/v1 tidak bisa dipakai dari hosting (Vercel) …”* — lihat `bukti-uji/HASIL-UJI-9ROUTER-URUTAN.txt` |

Catatan jujur: sandbox uji ini tidak punya 9Router asli, jadi dipakai `tools/mock-9router.mjs`
(tiruan dengan protokol sama: `/v1/models` + `/v1/chat/completions` biasa & SSE). Selain itu,
DNS sandbox lambat mengenali hostname tunnel baru (Cloudflare sempat menjawab 530 lalu 200),
karena itu uji menunggu sampai alamat publik benar-benar menjawab — di komputer/HP biasa
DNS sudah benar sejak awal.

## Kalau bermasalah, cek berurutan

1. `node tools/cek-9router.mjs --url <alamat-yang-dipakai-web>/v1 --key <kunci>` → semua ✓?
2. Baris saat web dijalankan: `penyedia AI: 9router → <alamat>` dan `✓ 9router terjangkau (200) — N model terdaftar`.
3. Kalau ✗: pastikan **alamat itu memang bisa dijangkau dari mesin tempat web berjalan**
   (`curl <alamat>/v1/models`) — localhost hanya berarti di mesin yang sama.
4. Kalau 401/403: 9Router memakai kunci → isi `AI_API_KEY`.
5. Kalau 502/503/504: tunnel/gateway-nya jalan tapi 9Router-nya mati → aplikasi akan
   menampilkan pesan jujur “Tidak bisa menghubungi 9Router di …”.
