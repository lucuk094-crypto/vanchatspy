/**
 * ════════════════════════════════════════════════════════════════════
 *  Van Chat.SPY — /api/builder   (Vercel Edge Function)
 * ════════════════════════════════════════════════════════════════════
 *  Dipakai saat permintaan pengguna berbentuk "buatkan halaman/website".
 *  Bedanya dengan /api/chat: di sini model DIMINTA mengeluarkan satu
 *  berkas HTML utuh (tanpa blok markdown), jadi hasilnya bisa langsung
 *  ditampilkan di pratinjau ruang kerja dan diunduh sebagai index.html.
 *
 *  POST /api/builder  { prompt, mode? } → { ok, html, model, bytes }
 *  GET  /api/builder  → { ok, ready, models }
 * ════════════════════════════════════════════════════════════════════
 */

/* Model cadangan untuk membangun halaman kalau daftar model dari NaraRouter
   belum terbaca (daftar sungguhan diambil dari penyedia itu sendiri). */
const MODEL_BANGUN = ["agnes-3-flash", "agnes-2.5-flash", "deepseek-v4-pro"];

const MAX_TOKENS = { fast: 4000, think: 6000, deep: 7000, expert: 8000 };
const SUHU = { fast: 0.5, think: 0.4, deep: 0.4, expert: 0.3 };

const SYSTEM = `Kamu mesin pembuat halaman web di dalam aplikasi "Van Chat.SPY".
TUGAS: hasilkan SATU berkas HTML utuh yang bisa langsung dibuka di browser.
ATURAN KERAS:
- Balas HANYA kode HTML. Tanpa penjelasan, tanpa pembuka, tanpa blok markdown (jangan pakai \`\`\`).
- Mulai dari <!DOCTYPE html> dan tutup dengan </html>.
- Semua gaya (CSS) di dalam <style> di <head>; skrip kecil di dalam <script>. Tidak boleh ada berkas/tautan luar yang gagal dimuat — tanpa CDN, tanpa font atau gambar dari internet.
- Gambar/ikon: pakai SVG sebaris (inline) atau bentuk CSS. Jangan pakai emoji sebagai ikon.
- Desain modern, rapi, dan responsif (enak dilihat di ponsel maupun desktop). Sertakan warna, jarak, dan bayangan yang enak dilihat.
- Teks antarmuka memakai bahasa Indonesia yang wajar. Jangan memakai lorem ipsum.
- Beri sedikit interaksi yang benar-benar berfungsi dengan JavaScript sebaris (misalnya menu, tab, atau tombol yang mengubah tampilan).`;

const json = (o, s, extra) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...(extra || {}) },
  });

import { asalDiizinkan } from "./_aman.js";
import { penyediaTeks } from "./_ai.js";
import { daftarModelLokal, daftarModelCepat, pilihModelMode, kunciDitolakTerakhir, pesanKunciDitolak, pesanKunciKosong, sebabLokalTerakhir } from "./chat.js";

/* daftar model untuk membangun halaman: diambil dari NaraRouter (GET /models),
   supaya yang dipakai benar-benar model yang diizinkan paket akunmu */
async function kandidatBangun(env) {
  const p = penyediaTeks(env);
  const jelas = String(env.AI_MODELS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const daftar = await daftarModelCepat(env, 1500);   /* builder: tunggu seperlunya saja */
  if (daftar && daftar.length) {
    if (jelas.length) return jelas.slice(0, 6);
    const pilih = [pilihModelMode("deep", daftar, env), pilihModelMode("think", daftar, env), pilihModelMode("fast", daftar, env)].filter(Boolean);
    const unik = [...new Set(pilih)];
    return unik.concat(daftar.filter((d) => !unik.includes(d)).slice(0, 3));
  }
  /* daftar model dari penyedia belum terbaca (lambat/gagal sesaat) → JANGAN menyerah:
     pakai model dari setelan, lalu daftar bawaan. Kalau penyedianya memang tak bisa
     dihubungi, percobaannya sendiri yang gagal dan pesannya menyebut sebabnya. */
  const dariSetelan = [...new Set([env.AI_MODEL_DEEP, env.AI_MODEL_THINK, env.AI_MODEL_FAST, env.AI_MODEL].filter(Boolean))];
  return dariSetelan.length ? dariSetelan : MODEL_BANGUN.slice();
}

const pesanRouterMati = (p) => {
  const nama = p.nama === "bynara" ? "NaraRouter" : p.nama;
  const sebab = sebabLokalTerakhir();
  return "Tidak bisa menghubungi penyedia AI (" + nama + " di " + p.dasar + ") untuk membangun halaman."
    + (sebab ? " Penyebab: " + sebab + "." : "")
    + " Periksa koneksi internet server ini dan kunci AI_API_KEY (diagnosa cepat: buka /api/health?uji=1). "
    + "Ruang kerja tetap bisa dipakai: halaman lama masih bisa dibuka, dijalankan, dan diunduh.";
};

function cors(origin, env, request) {
  const list = String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  let allow;
  if (list.length) allow = origin && list.includes(origin) ? origin : "";
  else if (!origin) allow = "";
  else allow = (!request || asalDiizinkan(request, env)) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function bersihkanHtml(teks) {
  let t = String(teks || "").trim();
  /* buang blok markdown kalau model tetap menambahkannya */
  const pagar = t.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (pagar && /<\w+[\s>]/.test(pagar[1])) t = pagar[1].trim();
  const awal = t.search(/<!DOCTYPE html|<html[\s>]/i);
  if (awal > 0) t = t.slice(awal);
  if (!/<!DOCTYPE html/i.test(t.slice(0, 200)) && !/<html[\s>]/i.test(t.slice(0, 400))) {
    /* kalau cuma potongan HTML, bungkus jadi halaman utuh */
    t = `<!DOCTYPE html>\n<html lang="id">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>Hasil Van Chat.SPY</title>\n</head>\n<body>\n${t}\n</body>\n</html>`;
  }
  return t;
}

function jamResetWIB(epoch) {
  try {
    const n = Number(epoch);
    if (!n) return "beberapa saat lagi";
    return new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta", hour12: false })
      .format(new Date(n * 1000)).replace(":", ".") + " WIB";
  } catch { return "beberapa saat lagi"; }
}
function kuotaHabis(status, detail) {
  if (status === 429) return true;
  return /free-models-per-day|rate limit exceeded|insufficient credits|quota/i.test(String(detail || ""));
}

async function bangunSatu(model, prompt, mode, p, env) {
  const kepala = { "Content-Type": "application/json" };
  if (p.kunci) kepala.Authorization = `Bearer ${p.kunci}`;
  const badan = {
    model,
    temperature: SUHU[mode] ?? 0.4,
    max_tokens: MAX_TOKENS[mode] || 6000,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: String(prompt || "").slice(0, 12000) },
    ],
  };
  const alamat = p.dasar + "/chat/completions";
  let r;
  try {
    r = await fetch(alamat, { method: "POST", headers: kepala, body: JSON.stringify(badan) });
  } catch (e) {
    throw new Error("LOKAL|" + pesanRouterMati(p) + " (" + String((e && e.message) || e).slice(0, 80) + ")");
  }
  if (!r.ok) {
    const t = await r.text();
    let pesan = `HTTP ${r.status}`;
    try {
      const j = JSON.parse(t);
      if (j && j.error) {
        if (typeof j.error === "string") pesan = String(j.error).slice(0, 200);
        else if (j.error.message) pesan = String(j.error.message).slice(0, 200);
      } else if (j && j.message) pesan = String(j.message).slice(0, 200);
    } catch {}
    if (/insufficient balance|insufficient credit|no credit|saldo|kredit habis/i.test(t)) {
      throw new Error("SALDO|saldo/kredit penyedia AI habis: \"" + pesan + "\" — isi ulang saldo di dasbor penyedia lalu coba lagi.");
    }
    if (r.status === 401 || r.status === 403) {
      throw new Error("KUNCI|kunci penyedia AI ditolak: \"" + pesan + "\" — periksa AI_API_KEY lalu coba lagi.");
    }
    if (kuotaHabis(r.status, t)) {
      let reset = "";
      try {
        const j = JSON.parse(t);
        const h = (j && j.error && j.error.metadata && j.error.metadata.headers) || {};
        reset = h["X-RateLimit-Reset"] || h["x-ratelimit-reset"] || "";
      } catch {}
      throw new Error("KUOTA|batas permintaan penyedia AI tercapai (paket NaraRouter). Coba lagi " + jamResetWIB(reset) + ", atau naikkan paket di dasbor NaraRouter.");
    }
    throw new Error(pesan);
  }
  const d = await r.json();
  const c = d && d.choices && d.choices[0];
  let teks = (c && c.message && c.message.content) || (c && c.text) || "";
  if (Array.isArray(teks)) teks = teks.map((b) => (b && (b.text || b.content)) || "").join("");
  const html = bersihkanHtml(teks);
  if (html.length < 120) throw new Error("hasil terlalu pendek");
  return html;
}

async function tangani(request, env) {
  const origin = request.headers.get("Origin") || "";
  const c = cors(origin, env, request);
  const p = penyediaTeks(env);
  const kunci = p.kunci;

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: c });
  if (request.method === "GET") {
    const daftar = (await daftarModelLokal(env)) || [];
    return json({
      ok: true, ready: !!kunci, models: daftar.length ? daftar : MODEL_BANGUN,
      penyedia: { nama: p.nama, alamat: p.dasar },
      pesan: kunci ? "siap — " + p.nama + " di " + p.dasar : "kunci AI_API_KEY belum dipasang",
    }, 200, c);
  }
  if (request.method !== "POST") return json({ ok: false, pesan: "Gunakan GET atau POST" }, 405, c);
  if (!asalDiizinkan(request, env)) {
    return json({ ok: false, pesan: "Permintaan dari alamat asal yang tidak dikenal ditolak." }, 403, c);
  }
  if (!kunci) return json({ ok: false, kunci: true, pesan: "Kunci NaraRouter belum dipasang di server (AI_API_KEY)." }, 401, c);

  let body;
  try { body = JSON.parse(await request.text()); } catch { return json({ ok: false, pesan: "JSON tidak valid" }, 400, c); }

  const prompt = String(body.prompt || "").slice(0, 12000).trim();
  if (!prompt) return json({ ok: false, pesan: "Permintaan masih kosong." }, 400, c);
  const mode = ["fast", "think", "deep", "expert"].includes(body.mode) ? body.mode : "think";

  const kandidat = await kandidatBangun(env);
  if (!kandidat.length) {
    /* alamatnya menjawab tapi kuncinya ditolak ≠ penyedia mati */
    if (!p.adaKunci) return json({ ok: false, kunci: true, pesan: pesanKunciKosong(p) }, 401, c);
    if (kunciDitolakTerakhir()) return json({ ok: false, kunci: true, pesan: pesanKunciDitolak(p) }, 401, c);
    return json({ ok: false, pesan: pesanRouterMati(p), penyedia: { nama: p.nama, alamat: p.dasar } }, 502, c);
  }

  let terakhir = "tidak diketahui";
  let pesanJujur = "";
  for (const model of kandidat) {
    try {
      const html = await bangunSatu(model, prompt, mode, p, env);
      return json({ ok: true, html, model, mode, bytes: html.length, penyedia: p.nama }, 200, c);
    } catch (e) {
      const m = String((e && e.message) || e);
      if (m.indexOf("KUOTA|") === 0) return json({ ok: false, kuota: true, pesan: m.slice(6) }, 429, c);
      if (m.indexOf("SALDO|") === 0) return json({ ok: false, saldo: true, pesan: m.slice(6) }, 402, c);
      if (m.indexOf("KUNCI|") === 0) return json({ ok: false, kunci: true, pesan: m.slice(6) }, 401, c);
      if (m.indexOf("LOKAL|") === 0) { pesanJujur = m.slice(6); continue; }
      terakhir = m;
    }
  }
  if (!terakhir || terakhir === "tidak diketahui") terakhir = "penyedia tidak menjawab";
  if (pesanJujur) return json({ ok: false, pesan: pesanJujur, penyedia: { nama: p.nama, alamat: p.dasar } }, 502, c);
  return json({ ok: false, pesan: "Semua model sedang sibuk (" + terakhir + "). Coba lagi sebentar." }, 502, c);
}

export const config = { runtime: "edge" };

/* env dari process.env, boleh ditimpa server lokal (tools/server-uji.mjs → tools/penyedia.json) */
function envProses(tambahan) {
  const das = (typeof process !== "undefined" && process.env) || {};
  const g = { ...das, ...(tambahan || {}) };
  const kunci = {};
  for (const k of ["AI_PROVIDER", "AI_BASE_URL", "AI_API_KEY", "AI_MODEL", "AI_MODELS", "AI_MODEL_VISI",
    "AI_MODEL_FAST", "AI_MODEL_THINK", "AI_MODEL_DEEP", "AI_MODEL_EXPERT",
    "BYNARA_API_KEY", "MODELS_JSON",
    "ALLOWED_ORIGINS", "APP_URL", "AI_MODEL_IZIN", "AI_CADANGAN",
    "VERCEL", "VERCEL_ENV", "VERCEL_URL", "HOSTING",
  ]) if (g[k] !== undefined) kunci[k] = g[k];
  return kunci;
}

export default async function (request, env) {
  return tangani(request, envProses(env));
}
