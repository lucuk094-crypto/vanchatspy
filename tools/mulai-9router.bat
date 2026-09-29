@echo off
rem ─────────────────────────────────────────────────────────────────────
rem  mulai-9router.bat — jalankan 9Router lalu web Van Chat.SPY sekaligus
rem  Pakai: klik dua kali berkas ini (Windows), atau dari CMD:
rem         tools\mulai-9router.bat
rem ─────────────────────────────────────────────────────────────────────
setlocal
chcp 65001 >nul
cd /d "%~dp0.."
echo === Van Chat.SPY x 9Router ===

echo [1/4] Membuka 9Router di jendela baru...
start "9Router" cmd /k 9router

echo [2/4] Menunggu 9Router siap di http://127.0.0.1:20128 ...
where curl >nul 2>nul
if errorlevel 1 (
  echo       curl tidak tersedia - menunggu 15 detik saja...
  timeout /t 15 /nobreak >nul
  goto siap
)
set /a coba=0
:itung
set /a coba+=1
curl -s -m 3 -o nul http://127.0.0.1:20128/v1/models
if not errorlevel 1 goto siap
if %coba% GEQ 30 goto lambat
timeout /t 2 /nobreak >nul
goto itung

:lambat
echo       9Router belum menjawab setelah 60 detik.
echo       Cek jendela berjudul 9Router - harus muncul "Server ready".
echo       Kalau port-nya bukan 20128, jalankan manual:
echo         node tools\cek-9router.mjs --url http://127.0.0.1:PORT/v1
pause
goto lanjut

:siap
echo       9Router terjangkau.

:lanjut
echo [3/4] Menyiapkan setelan model...
if exist tools\9router.json (
  echo       tools\9router.json sudah ada - pemeriksaan dilewati
  echo       (hapus berkas itu kalau ingin memeriksa ulang)
) else (
  node tools\cek-9router.mjs
)

echo [4/4] Menjalankan web-nya di http://127.0.0.1:8131/
start "" http://127.0.0.1:8131/
node tools\server-uji.mjs
