#!/usr/bin/env bash
# siapkan-chromium.sh — menyiapkan Chromium untuk uji tampilan di sandbox.
#
# Sandbox ini sering menghapus isi /tmp. Skrip ini memulihkan semuanya:
#   1. memasang puppeteer + Chromium (bila belum ada)
#   2. menyiapkan pustaka sistem (NSS, ATK, CUPS, ALSA, …) dari berkas
#      .deb yang disimpan di tools/deb — jadi tidak perlu unduh ulang
#
# Pakai:
#   bash tools/siapkan-chromium.sh
# lalu jalankan uji dengan:
#   export LD_LIBRARY_PATH=/tmp/libs/x/usr/lib/x86_64-linux-gnu:/tmp/libs/x/lib/x86_64-linux-gnu
#   export PUPPETEER_CACHE_DIR=/tmp/pcache CHROME=$(ls /tmp/pcache/chrome/*/chrome-linux64/chrome | head -1)
#   node tools/uji-bagian-h.mjs
set -u
AKAR="$(cd "$(dirname "$0")/.." && pwd)"
DEB="$AKAR/tools/deb"
LIBX=/tmp/libs/x

echo "── 1. puppeteer ─────────────────────────────────────────"
if [ ! -d /tmp/u/node_modules/puppeteer ]; then
  mkdir -p /tmp/u
  (cd /tmp/u && PUPPETEER_CACHE_DIR=/tmp/pcache npm i puppeteer --silent) || {
    echo "GAGAL: tidak bisa memasang puppeteer (periksa jaringan npm)"; exit 1; }
fi
CH=$(ls /tmp/pcache/chrome/*/chrome-linux64/chrome 2>/dev/null | head -1)
if [ -z "$CH" ]; then
  echo "GAGAL: Chromium tidak ada di /tmp/pcache — jalankan: (cd /tmp/u && PUPPETEER_CACHE_DIR=/tmp/pcache npx puppeteer browsers install chrome)"
  exit 1
fi
echo "ok · puppeteer + $CH"

echo "── 2. pustaka sistem ────────────────────────────────────"
sebelum=$(LD_LIBRARY_PATH="$LIBX/usr/lib/x86_64-linux-gnu:$LIBX/lib/x86_64-linux-gnu" ldd "$CH" 2>/dev/null | grep -c 'not found')
if [ "$sebelum" -eq 0 ]; then
  echo "ok · semua pustaka sudah lengkap"
else
  echo "kurang $sebelum pustaka → memasang dari $DEB"
  mkdir -p "$LIBX"
  jumlah=0
  for d in "$DEB"/*.deb; do
    [ -f "$d" ] || continue
    dpkg-deb -x "$d" "$LIBX" 2>/dev/null && jumlah=$((jumlah + 1))
  done
  echo "ok · $jumlah paket diekstrak ke $LIBX"
  sisa=$(LD_LIBRARY_PATH="$LIBX/usr/lib/x86_64-linux-gnu:$LIBX/lib/x86_64-linux-gnu" ldd "$CH" 2>/dev/null | grep -c 'not found')
  if [ "$sisa" -ne 0 ]; then
    echo "MASIH KURANG $sisa pustaka:"
    LD_LIBRARY_PATH="$LIBX/usr/lib/x86_64-linux-gnu:$LIBX/lib/x86_64-linux-gnu" ldd "$CH" | grep 'not found'
    echo "Ambil .deb tambahan dari https://deb.debian.org/debian/pool/main/<huruf>/<paket>/ lalu taruh di tools/deb, ulangi skrip ini."
    exit 2
  fi
fi

echo "── 3. pemeriksaan ──────────────────────────────────────"
LD_LIBRARY_PATH="$LIBX/usr/lib/x86_64-linux-gnu:$LIBX/lib/x86_64-linux-gnu" "$CH" --version
echo
echo "siap dipakai. Contoh:"
echo "  export LD_LIBRARY_PATH=$LIBX/usr/lib/x86_64-linux-gnu:$LIBX/lib/x86_64-linux-gnu"
echo "  export PUPPETEER_CACHE_DIR=/tmp/pcache CHROME=$CH"
echo "  node tools/uji-tampilan.mjs"
