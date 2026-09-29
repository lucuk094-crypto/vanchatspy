#!/usr/bin/env bash
# buka-tunnel.sh — membuka akses publik (Cloudflare quick tunnel) ke server uji
# Van Chat.SPY yang jalan di port 8131, lalu MENGUJI bahwa link-nya benar-benar
# melayani halaman + API (bukan cuma "terlihat jalan").
#
# Pakai:
#   bash tools/buka-tunnel.sh              # server uji harus sudah jalan di :8131
#   PORT=8080 bash tools/buka-tunnel.sh    # kalau memakai port lain
#
# Catatan: quick tunnel (tanpa akun Cloudflare) tidak punya jaminan hidup —
# link mati kalau proses cloudflared berhenti atau sandbox direset. Jalankan
# ulang skrip ini untuk mendapat link baru.
set -e

PORT="${PORT:-8131}"
CF="/tmp/cf/cloudflared"
LOG="/tmp/cf/tunnel.log"

mkdir -p /tmp/cf

if [ ! -x "$CF" ]; then
  echo "mengunduh cloudflared…"
  curl -sL -m 180 -o "$CF" https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
  chmod +x "$CF"
fi
"$CF" --version

if ! curl -s -m 5 -o /dev/null "http://127.0.0.1:$PORT/api/health"; then
  echo "PERINGATAN: server di 127.0.0.1:$PORT belum menjawab. Jalankan dulu:"
  echo "  node tools/server-uji.mjs"
  exit 1
fi

pkill -f "cloudflared tunnel" 2>/dev/null || true
sleep 1
nohup "$CF" tunnel --no-autoupdate --url "http://127.0.0.1:$PORT" > "$LOG" 2>&1 &
echo "menunggu link dibuat…"
for i in $(seq 1 30); do
  URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG" | head -1 || true)
  [ -n "$URL" ] && break
  sleep 1
done

if [ -z "$URL" ]; then
  echo "gagal mendapat link. Isi log:"; tail -20 "$LOG"; exit 1
fi

echo
echo "LINK  : $URL"

# Uji mandiri. DNS di sandbox ini kadang belum siap beberapa detik setelah link
# dibuat (cache negatif), jadi bila hasilnya 000 dicoba lagi lewat alamat IP
# Cloudflare — dari HP/PC pengguna, DNS normal sudah benar sejak awal.
HOST=${URL#https://}
IPCF="104.16.231.132"
uji() {   # $1 = path
  local kode
  kode=$(curl -s -m 30 -o /dev/null -w '%{http_code}' "$URL$1")
  if [ "$kode" = "000" ]; then
    kode=$(curl -s -m 30 --resolve "$HOST:443:$IPCF" -o /dev/null -w '%{http_code}' "$URL$1")
  fi
  echo "$kode"
}
echo "halaman: $(uji /)"
echo "API    : $(uji /api/health)"
echo "berkas : $(uji /assets/app.js)"
echo
echo "uji seluruh berkas & API lewat link (opsional):"
echo "  node tools/uji-tunnel.mjs $URL"
