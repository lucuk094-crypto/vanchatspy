# ─────────────────────────────────────────────────────────────────────
# Van Chat.SPY — citra untuk VPS / server sendiri
# Web ini tidak butuh build step; cukup Node + berkas proyek.
# Penyedia AI = 9Router (alamat publik), jadi cukup satu container.
#   docker build -t van-chat-spy .
#   docker run -p 8131:8131 -e AI_API_KEY=sk-xxxx van-chat-spy
# ─────────────────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app
COPY . .

# PORT = port web (bawaan 8131). Server mengikat 0.0.0.0 supaya bisa diakses dari luar.
ENV PORT=8131
EXPOSE 8131

# healthcheck sederhana: endpoint /api/health tidak memakai kuota AI
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD wget -q -O /dev/null http://127.0.0.1:${PORT}/api/health || exit 1

CMD ["node", "tools/server-uji.mjs"]
