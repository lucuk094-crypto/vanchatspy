#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
#  mulai-9router.sh — jalankan 9Router lalu web Van Chat.SPY sekaligus
#  Pakai:  bash tools/mulai-9router.sh        (macOS / Linux / Git Bash)
#
#  Alur: 9Router dulu → tunggu siap → cek-9router (sekali) → web :8131
#  Kalau 9Router sudah jalan di jendela terminal lain, skrip ini
#  melewati langkah menyalakannya.
# ─────────────────────────────────────────────────────────────────────
set -e
cd "$(dirname "$0")/.."

PORT="${PORT_9ROUTER:-20128}"
ALAMAT="http://127.0.0.1:$PORT/v1"
echo "=== Van Chat.SPY × 9Router ==="

hidup() { curl -s -m 3 -o /dev/null "$ALAMAT/models"; }

echo "[1/4] Memeriksa 9Router di $ALAMAT …"
if hidup; then
  echo "      9Router sudah jalan."
else
  if command -v 9router >/dev/null 2>&1; then
    echo "      menyalakan 9Router di jendela ini (biarkan tetap terbuka)…"
    (9router >/tmp/9router.log 2>&1 &) || true
  else
    echo "      9Router belum dipasang. Jalankan dulu:  npm install -g 9router"
    exit 1
  fi
  echo "[2/4] Menunggu 9Router siap (maks 60 detik)…"
  ok=""
  for _ in $(seq 1 30); do
    if hidup; then ok=1; break; fi
    sleep 2
  done
  if [ -z "$ok" ]; then
    echo "      9Router belum menjawab. Lihat catatan di /tmp/9router.log"
    echo "      atau jalankan '9router' di terminal lain sampai muncul \"Server ready\"."
    exit 1
  fi
  echo "      9Router terjangkau."
fi

echo "[3/4] Menyiapkan setelan model…"
if [ -f tools/9router.json ]; then
  echo "      tools/9router.json sudah ada — pemeriksaan dilewati"
  echo "      (hapus berkas itu kalau ingin memeriksa ulang)"
else
  node tools/cek-9router.mjs
fi

echo "[4/4] Menjalankan web di http://127.0.0.1:8131/"
command -v open >/dev/null 2>&1 && open http://127.0.0.1:8131/ || true
command -v xdg-open >/dev/null 2>&1 && xdg-open http://127.0.0.1:8131/ 2>/dev/null || true
node tools/server-uji.mjs
