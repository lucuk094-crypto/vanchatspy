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

const KUNCI_BAWAAN = "sk-or-v1-DIHAPUS-F27";

const MODEL = {
  fast: "inclusionai/ling-3.0-flash-sante:free",
  think: "dots-studio/dots-3-note-preview:free",
  deep: "nex-agi/nex-n2.5-pro:free",
  expert: "nvidia/nemotron-3-super-120b-a12b:free",
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

  const kunci = String(process.env.OPENROUTER_KEY || KUNCI_BAWAAN || "").trim();
  return json({
    ok: true,
    service: "van-chat-spy",
    versi: "1.0",
    keyConfigured: !!kunci,
    kunciDari: process.env.OPENROUTER_KEY ? "env" : "bawaan paket",
    model: MODEL,
    fitur: {
      chat: true,
      streaming: true,
      builder: true,
      riwayat: "browser (localStorage)",
      suara: "bawaan browser (Web Speech API)",
      batas: "50 permintaan AI/hari (kuota gratis penyedia) + pengaman 60 permintaan/menit per IP",
    },
    pesan: kunci ? "siap dipakai" : "kunci API belum dipasang",
  }, 200);
}
