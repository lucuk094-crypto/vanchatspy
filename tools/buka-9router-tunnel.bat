@echo off
rem ─────────────────────────────────────────────────────────────────────
rem  buka-9router-tunnel.bat — buka 9Router (port 20128) ke internet lewat
rem  Cloudflare tunnel, lalu cetak nilai env untuk ditempel di Vercel.
rem
rem  PERINGATAN: selama tunnel ini hidup, alamat itu terbuka ke internet.
rem  Wajib: set REQUIRE_API_KEY=true di dashboard 9Router
rem         (http://localhost:20128/dashboard) dan pakai kunci yang acak/panjang.
rem ─────────────────────────────────────────────────────────────────────
setlocal
chcp 65001 >nul
echo === Membuka 9Router ke internet (Cloudflare tunnel) ===
where cloudflared >nul 2>nul
if errorlevel 1 (
  echo cloudflared belum ada. Pasang dulu:
  echo   winget install --id Cloudflare.cloudflared
  echo lalu jalankan berkas ini lagi.
  pause
  exit /b 1
)
echo Pastikan 9Router sudah jalan ^(tulis: 9router di terminal lain^).
echo.
echo Setelah alamat https://....trycloudflare.com muncul di bawah, salin
echo tiga baris env ini ke Vercel ^(Project - Settings - Environment Variables^):
echo.
echo   AI_PROVIDER = 9router
echo   AI_BASE_URL = https://ALAMAT-YANG-MUNCUL/v1
echo   AI_API_KEY  = KUNCI-DARI-DASHBOARD-9ROUTER
echo.
echo Tekan Ctrl+C kalau ingin menutup tunnel.
echo ─────────────────────────────────────────────────────────────────────
cloudflared tunnel --url http://127.0.0.1:20128
