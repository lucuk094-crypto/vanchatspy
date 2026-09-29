/**
 * ════════════════════════════════════════════════════════════════════
 *  Van Chat.SPY — /api/health   (Vercel Edge Function)
 * ════════════════════════════════════════════════════════════════════
 *  Dipakai aplikasi untuk menulis status di kiri bawah:
 *  "server AI siap" / "kunci AI belum dipasang" / "server tidak terjangkau".
 *
 *  GET /api/health → { ok, service, versi, keyConfigured, model, modes }
 * ════════════════════════════════════════════════════════════════════
 */

/* Model cadangan (daftar sungguhan diambil dari NaraRouter oleh /api/chat). */
const MODEL = {
  fast: "agnes-2.5-flash",
  think: "agnes-3-flash",
  deep: "deepseek-v4-flash",
  expert: "deepseek-v4-pro",
};

export const config = { runtime: "edge" };

const json = (o, s) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

export default async function (request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method !== "GET") return json({ ok: false, pesan: "Gunakan GET" }, 405);

  const kunci = String(process.env.AI_API_KEY || process.env.BYNARA_API_KEY || "").trim();
  return json({
    ok: true,
    service: "van-chat-spy",
    versi: "1.0",
    penyedia: "NaraRouter (https://router.bynara.id)",
    keyConfigured: !!kunci,
    kunciDari: kunci ? "env (AI_API_KEY)" : "belum dipasang",
    model: MODEL,
    fitur: {
      chat: true,
      streaming: true,
      builder: true,
      riwayat: "browser (localStorage)",
      suara: "bawaan browser (Web Speech API)",
      batas: "sesuai paket akun NaraRouter + pengaman 60 permintaan/menit per IP",
    },
    pesan: kunci ? "siap dipakai" : "kunci API belum dipasang",
  }, 200);
}
