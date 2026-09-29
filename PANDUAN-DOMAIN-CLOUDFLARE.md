# Panduan: domain Cloudflare (tanpa tunnel) → 9Router di PC → web di Vercel

Alur yang dibangun:

```
Vercel (web Van Chat.SPY)
   │  AI_BASE_URL = https://router.contoh.com:8443/v1
   ▼
Cloudflare (DNS proxied + HTTPS, menyembunyikan IP rumah)
   │  port 8443 (port yang didukung proxy Cloudflare)
   ▼
Router rumah (port forward 8443 → PC)
   ▼
Caddy di PC (:8443, HTTPS dengan Cloudflare Origin Certificate)
   ▼
9Router di PC (http://127.0.0.1:20128)
```

Tidak ada tunnel: koneksi masuk **langsung** ke rumahmu lewat domain sendiri.
Konsekuensinya: **PC harus menyala** setiap kali web Vercel dipakai.

---

## Langkah 0 — Cek dulu 5 menit (jangan dilewati)

**a. Punya domain yang bisa ganti nameserver?** (beli di Niagahoster/Domainesia/Rumahweb/Namecheap/dll.)

**b. Cek IP publik vs IP WAN di router — ini penentu berhasil/tidaknya.**

```bat
:: di PC, terminal apa saja
curl https://api.ipify.org
```
Lalu buka halaman admin router (biasanya `http://192.168.1.1`) → **Status / WAN** → catat IP WAN.

| Yang kamu lihat | Artinya |
|---|---|
| IP WAN **sama** dengan hasil `ipify` | bagus — port forward bisa jalan |
| IP WAN **beda**, atau berawalan `10.`, `100.64`–`100.127`, `172.16`–`172.31`, `192.168.` | **CGNAT/double NAT** — port forward TIDAK akan jalan |

Kalau CGNAT: minta **IP publik (public IPv4)** ke ISP-mu, atau pilih jalur lain
(`DEPLOY.md` bagian B: 9Router + web di VPS — tanpa perlu port forward sama sekali).

**c. Cek port ISP:** sebagian ISP memblokir port 80/443 masuk. Di panduan ini dipakai
**8443** (port yang didukung proxy Cloudflare: 443, 2053, 2083, 2087, 2096, 8443).

---

## Langkah 1 — Pindahkan domain ke Cloudflare

1. Buka `dash.cloudflare.com` → **Sign up / Log in** → **Add a site** → ketik domainmu → pilih paket **Free** → Continue.
2. Cloudflare menampilkan **2 nameserver** (mis. `ada.ns.cloudflare.com` dan `bob.ns.cloudflare.com`) — salin keduanya.
3. Di **registrar** (tempat kamu beli domain): cari menu **Nameserver / DNS** → ganti nameserver ke dua alamat itu → simpan.
4. Tunggu sampai status domain di Cloudflare (Overview) menjadi **Active** (biasanya 5–30 menit, maksimal 24 jam).

## Langkah 2 — Buat record A untuk 9Router

Cloudflare → **DNS → Records → Add record**:

| Isian | Nilai |
|---|---|
| Type | `A` |
| Name | `router` (jadi `router.contoh.com`) |
| IPv4 address | IP publik rumahmu (langkah 0b) |
| Proxy status | **Proxied** (awan jingga **menyala**) |
| TTL | Auto |

Save. (Kalau IP rumahmu dinamis, langkah 7 yang mengurus pembaruannya otomatis.)

## Langkah 3 — Buat Origin Certificate (sertifikat untuk PC)

1. Cloudflare → **SSL/TLS → Origin Server → Create Certificate**.
2. Private key type: `RSA (2048)` · Hostnames: `router.contoh.com` dan `*.contoh.com` (dua baris) · masa berlaku 15 tahun → **Create**.
3. Simpan dua teks yang muncul:
   - **Origin Certificate** → `C:\caddy\origin.pem`
   - **Private Key** → `C:\caddy\origin.key`
   (pakai Notepad → Save As → ubah "Save as type" ke *All Files* supaya tidak jadi `origin.pem.txt`)

## Langkah 4 — Pasang Caddy di PC (pintu masuk HTTPS)

Caddy dipakai karena konfigurasinya 4 baris dan otomatis menutup jalur non-`/v1`
(termasuk `/dashboard` supaya tidak terbuka ke internet).

```bat
winget install --id CaddyServer.Caddy
```
Atau unduh `caddy_windows_amd64.exe` dari `caddyserver.com` → simpan sebagai `C:\caddy\caddy.exe`.

Buat `C:\caddy\Caddyfile` (contohnya juga ada di repo: `tools/Caddyfile.contoh`):

```
router.contoh.com:8443 {
    tls C:\caddy\origin.pem C:\caddy\origin.key
    @bukanv1 not path /v1/*
    respond @bukanv1 403
    reverse_proxy 127.0.0.1:20128
}
```

Uji di PC (masih di dalam jaringan rumah):

```bat
cd C:\caddy
caddy run --config Caddyfile
:: terminal lain:
curl -k https://127.0.0.1:8443/v1/models
```
Harapan: jawaban **401** (artinya Caddy jalan dan permintaan sudah sampai ke 9Router;
`-k` dipakai karena sertifikatnya untuk domain, bukan untuk IP).

> **Cara cepat (kurang aman, tanpa sertifikat):** kalau tidak mau mengurus sertifikat,
> set mode SSL Cloudflare ke **Flexible** dan pakai Caddyfile versi plain:
> `http://router.contoh.com:8443 { reverse_proxy 127.0.0.1:20128 }`.
> Bedanya: jalur Cloudflare → PC tidak terenkripsi (jalur HP → Cloudflare tetap HTTPS).

## Langkah 5 — Buka port di Windows dan di router

**Windows Firewall** — PowerShell **sebagai Administrator**:
```powershell
New-NetFirewallRule -DisplayName "9Router 8443" -Direction Inbound -Protocol TCP -LocalPort 8443 -Action Allow
```

**Router** → menu **Port Forwarding / Virtual Server / NAT**:

| Isian | Nilai |
|---|---|
| Nama | 9Router |
| Port luar (external) | `8443` (TCP) |
| IP dalam (internal) | IP PC-mu, mis. `192.168.1.10` |
| Port dalam (internal) | `8443` |
| Protokol | TCP |

Simpan. Disarankan juga: **DHCP reservation** untuk PC-mu supaya IP-nya tidak berubah.

> Jangan buka port `20128` ke internet — cukup `8443` (Caddy) yang terbuka.

## Langkah 6 — Mode SSL Cloudflare + kunci 9Router

1. Cloudflare → **SSL/TLS → Overview** → pilih **Full (strict)**.
2. Cloudflare → **SSL/TLS → Edge Certificates** → nyalakan **Always Use HTTPS** (opsional).
3. Dashboard 9Router (`http://localhost:20128/dashboard`) → nyalakan **REQUIRE_API_KEY** → salin kuncinya.
   Ini wajib: tanpa kunci, siapa pun yang tahu alamatmu bisa memakai kuota modelmu.
4. (Disarankan) Cloudflare → **Security → WAF → Custom rules**: kalau `hostname = router.contoh.com` dan `path` dimulai `/dashboard` → **Block**.

## Langkah 7 — Uji dari luar rumah

Pakai **HP dengan data seluler** (jangan Wi-Fi rumah!), lalu:

```bat
node tools/cek-domain-9router.mjs --domain router.contoh.com --port 8443 --key KUNCI_9ROUTER
```

Alat ini memeriksa: DNS menunjuk IP Cloudflare (proxy aktif) · tanpa kunci harus 401 ·
dengan kunci harus 200 + daftar model · peringatan CGNAT kalau `--wan` diisi ·
dan langsung mencetak nilai env untuk Vercel.

Kalau belum bisa dipanggil dari luar, jangan lanjut ke Vercel — perbaiki dulu (lihat tabel di bawah).

## Langkah 8 — Kalau IP rumah dinamis: DDNS otomatis

1. Buat **API Token**: Cloudflare → **My Profile → API Tokens → Create Token** →
   template **Edit zone DNS** → Zone Resources: *Include → Specific zone → domainmu* → **Create Token** → salin.
2. Simpan sekali di `tools/cloudflare.json`:
   ```json
   { "domain": "router.contoh.com", "token": "TOKEN_TADI", "proxied": true }
   ```
3. Uji: `node tools/cloudflare-ddns.mjs --dry-run` (lihat rencananya), lalu jalankan tanpa `--dry-run`.
4. Jalankan terus-menerus: `node tools/cloudflare-ddns.mjs --loop 300` (cek tiap 5 menit).
5. Supaya otomatis mulai sendiri setiap kali Windows menyala:
   ```bat
   schtasks /Create /TN "Cloudflare DDNS" /SC ONLOGON /RL HIGHEST ^
     /TR "node C:\path\van-chat-spy\tools\cloudflare-ddns.mjs --loop 300"
   ```

## Langkah 9 — Deploy web ke Vercel

1. **vercel.com → Add New → Project** → import repo (GitHub) atau jalankan
   `npm i -g vercel` lalu `vercel --prod` di folder proyek.
   Framework preset: **Other** (halaman statis + folder `api/` otomatis jadi Functions).
2. **Settings → Environment Variables** (Production) — tambahkan:
   ```
   AI_PROVIDER = 9router
   AI_BASE_URL = https://router.contoh.com:8443/v1
   AI_API_KEY  = KUNCI_9ROUTER
   AI_MODEL_FAST  = gh/gpt-5-mini          ← opsional (disarankan: respons pertama cepat)
   AI_MODEL_THINK = kr/claude-sonnet-4.5   ← opsional
   AI_MODEL_VISI  = vertex/gemini-3-flash  ← opsional (untuk foto)
   ```
3. **Redeploy** (Deployments → ⋯ → Redeploy). Perubahan env baru berlaku setelah deploy ulang.
4. Buka web Vercel-mu → **Setelan → Model AI** → nama model harus berisi model 9Router
   (`kr/…`, `gh/…`) dan tombol **Uji koneksi** hijau.

**Opsional — hilangkan `:8443` dari URL:** Cloudflare → **Rules → Origin Rules → Create rule**:
`When incoming requests match: Hostname equals router.contoh.com` → `Then: Destination Port → 8443` → Deploy.
Lalu di Vercel: `AI_BASE_URL = https://router.contoh.com/v1`. (Origin Rules tersedia di paket Free.)

---

## Kalau ada masalah

| Gejala | Penyebab paling sering | Perbaikan |
|---|---|---|
| **521 / 522** di browser | Caddy belum jalan, atau port forward belum dibuat | jalankan `caddy run`, ulangi langkah 5 |
| **525 / 526** (SSL handshake failed) | mode SSL bukan Full (strict) atau origin cert salah pasang | langkah 3 & 6 |
| **1020 / 403** dari Cloudflare | WAF/Custom rule memblokir | cek Security → WAF |
| **1016 / 1014** | DNS record salah atau proxy dimatikan | langkah 2 |
| Timeout dari HP | port 8443 diblokir ISP atau CGNAT | coba port 2053/2083/2087/2096, atau cek CGNAT (langkah 0b) |
| **401** saat diuji *dengan* kunci | kunci salah/tidak sinkron dengan dashboard | salin ulang kunci 9Router |
| **200 tanpa kunci** | `REQUIRE_API_KEY` belum dinyalakan | langkah 6 no. 3 |
| Web Vercel bilang *“Alamat … tidak bisa dipakai dari hosting (Vercel)”* | `AI_BASE_URL` masih localhost | ganti ke `https://router.contoh.com:8443/v1`, lalu redeploy |
| Web Vercel bilang *“Tidak bisa menghubungi 9Router di https://router…”* | PC mati / 9Router belum jalan / Caddy mati | nyalakan ketiganya |
| Jawaban terpotong di tengah | batas Vercel Edge: respons pertama ≤ 25 detik, streaming ≤ 300 detik | pakai model cepat untuk mode Normal (`AI_MODEL_FAST`), dan pastikan upload rumahmu stabil |

## Berkas pendukung di repo ini

| Berkas | Gunanya |
|---|---|
| `tools/Caddyfile.contoh` | contoh konfigurasi Caddy (salin isinya jadi `C:\caddy\Caddyfile`) |
| `tools/cek-domain-9router.mjs` | pemeriksa lengkap: DNS/proxy, CGNAT, 401/200, cetak env Vercel |
| `tools/cloudflare-ddns.mjs` | DDNS Cloudflare (IP rumah berubah → record A ikut berubah) |
| `bukti-uji/HASIL-UJI-DDNS.txt` | hasil uji skrip DDNS memakai tiruan API Cloudflare (SEMUA LULUS) |
| `bukti-uji/HASIL-UJI-DOMAIN.txt` | hasil uji pemeriksa alamat publik (SEMUA LULUS) |
| `DEPLOY.md` | perbandingan semua cara deploy (komputer sendiri / VPS / tunnel / LAN) |
