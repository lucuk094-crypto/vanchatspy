/**
 * ════════════════════════════════════════════════════════════════════
 *  Van Chat.SPY — /api/health   (Vercel Edge Function)
 * ════════════════════════════════════════════════════════════════════
 *  Dipakai aplikasi untuk menulis status di kiri bawah:
 *  "server AI siap" / "kunci AI belum dipasang" / "server tidak terjangkau".
 *
 *  GET /api/health → { ok, service, versi, keyConfigured, model, modes }
 *
 *  GET /api/health?uji=1     → uji koneksi ke NaraRouter (GET /v1/models)
 *  GET /api/health?uji=chat  → sekalian kirim 1 percakapan sangat pendek
 *  Hasilnya menyebut status HTTP, lama waktu, dan galat apa adanya — dipakai
 *  untuk menjawab "kenapa tidak bisa menghubungi penyedia AI?" tanpa menebak.
 * ════════════════════════════════════════════════════════════════════
 */
import { penyediaTeks } from "./_ai.js";

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

/* diagnosa: apa yang sebenarnya terjadi saat server menyentuh penyedia AI? */
async function ujiPenyedia(mintaChat) {
  const env = process.env || {};
  const p = penyediaTeks(env);
  const h = { "Content-Type": "application/json" };
  if (p.kunci) h.Authorization = "Bearer " + p.kunci;
  const hasil = {
    alamat: p.dasar,
    kunciDipakai: p.kunci ? p.kunci.slice(0, 4) + "…(" + p.kunci.length + " karakter)" : "belum dipasang",
    model: null,
    percakapan: null,
  };
  /* 1. daftar model */
  {
    const t0 = Date.now();
    try {
      const r = await fetch(p.dasar + "/models", { headers: h, signal: AbortSignal.timeout(12000) });
      const teks = await r.text();
      let jumlah = 0, contoh = [];
      try {
        const j = JSON.parse(teks);
        const daftar = (j.data || j.models || []).map((m) => String((m && (m.id || m.name)) || "")).filter(Boolean);
        jumlah = daftar.length; contoh = daftar.slice(0, 5);
      } catch (e) { /* bukan JSON */ }
      hasil.model = { ok: r.ok, status: r.status, ms: Date.now() - t0, jumlah, contoh, cuplikan: r.ok ? undefined : teks.slice(0, 200) };
    } catch (e) {
      hasil.model = { ok: false, status: 0, ms: Date.now() - t0, galat: String((e && e.message) || e), nama: String((e && e.name) || "") };
    }
  }
  /* 2. percakapan sangat pendek (opsional, memakai sedikit kuota) */
  if (mintaChat) {
    const t0 = Date.now();
    try {
      const model = (hasil.model && hasil.model.contoh && hasil.model.contoh[0]) || MODEL.fast;
      const r = await fetch(p.dasar + "/chat/completions", {
        method: "POST",
        headers: h,
        signal: AbortSignal.timeout(25000),
        body: JSON.stringify({ model, max_tokens: 8, messages: [{ role: "user", content: "Balas satu kata: halo" }] }),
      });
      const teks = await r.text();
      let jawab = "", galat = "";
      try {
        const j = JSON.parse(teks);
        jawab = String((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "");
        galat = String((j.error && (j.error.message || j.error)) || "");
      } catch (e) { galat = teks.slice(0, 200); }
      hasil.percakapan = { ok: r.ok && !!jawab, status: r.status, ms: Date.now() - t0, model, jawaban: jawab.slice(0, 80), galat: galat.slice(0, 200) };
    } catch (e) {
      hasil.percakapan = { ok: false, status: 0, ms: Date.now() - t0, galat: String((e && e.message) || e), nama: String((e && e.name) || "") };
    }
  }
  /* kesimpulan jujur */
  const m = hasil.model || {};
  const c = hasil.percakapan;
  hasil.kesimpulan = c
    ? (c.ok ? "penyedia + kunci sehat — percakapan berhasil"
      : (c.status === 401 || c.status === 403 ? "kunci ditolak penyedia (periksa AI_API_KEY)"
        : "percakapan gagal: " + (c.galat || "HTTP " + c.status)))
    : (m.ok ? (m.jumlah ? "alamat + kunci sehat (" + m.jumlah + " model terlihat)"
      : "alamat menjawab, tetapi daftar model kosong untuk paketmu")
      : (m.status === 401 || m.status === 403 ? "kunci ditolak penyedia (periksa AI_API_KEY)"
        : "tidak bisa menghubungi penyedia: " + (m.galat || "HTTP " + m.status) + " (" + m.ms + " ms)"));
  return hasil;
}

export default async function (request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method !== "GET") return json({ ok: false, pesan: "Gunakan GET" }, 405);

  const kunci = String(process.env.AI_API_KEY || process.env.BYNARA_API_KEY || "").trim();

  /* ?uji=1 / ?uji=chat → diagnosa sungguhan ke penyedia */
  const param = new URL(request.url).searchParams.get("uji");
  if (param && param !== "0" && param !== "false") {
    const hasil = await ujiPenyedia(param === "chat");
    return json({
      ok: hasil.model.ok || !!(hasil.percakapan && hasil.percakapan.ok),
      service: "van-chat-spy",
      penyedia: "NaraRouter (https://router.bynara.id)",
      keyConfigured: !!kunci,
      waktu: new Date().toISOString(),
      uji: hasil,
    }, 200);
  }

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
