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

const KUNCI_BAWAAN = "sk-or-v1-DIHAPUS-F27";

const MODEL_BANGUN = [
  "dots-studio/dots-3-note-preview:free",        /* paling rapi untuk HTML panjang */
  "nvidia/nemotron-3-super-120b-a12b:free",
  "nex-agi/nex-n2.5-pro:free",
  "cohere/north-mini-code:free",
  "deepseek/deepseek-v4-flash-0731:free",
];

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
import { daftarModelLokal, pilihModelMode, kunciDitolakTerakhir, pesanKunciDitolak } from "./chat.js";

/* daftar model untuk membangun halaman:
   - OpenRouter: daftar tetap di atas
   - penyedia lokal (9Router/LM Studio): diambil dari router itu sendiri */
async function kandidatBangun(env) {
  const p = penyediaTeks(env);
  if (!p.router) return MODEL_BANGUN;   /* penyedia bergaya router (9Router lokal/tunnel/VPS) → daftar dari router */
  const jelas = String(env.AI_MODELS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const daftar = await daftarModelLokal(env);
  if (daftar && daftar.length) {
    if (jelas.length) return jelas.slice(0, 6);
    const pilih = [pilihModelMode("deep", daftar, env), pilihModelMode("think", daftar, env), pilihModelMode("fast", daftar, env)].filter(Boolean);
    const unik = [...new Set(pilih)];
    return unik.concat(daftar.filter((d) => !unik.includes(d)).slice(0, 3));
  }
  /* router belum bisa dihubungi → pakai model dari setelan (kalau ada) */
  return [...new Set([env.AI_MODEL_DEEP, env.AI_MODEL_THINK, env.AI_MODEL_FAST, env.AI_MODEL].filter(Boolean))];
}

const pesanRouterMati = (p, env) => {
  if (env && (env.VERCEL || env.HOSTING) && p.dasarLokal) {
    return "Alamat " + p.dasar + " tidak bisa dipakai dari hosting (Vercel) — di sana localhost menunjuk ke server Vercel sendiri. "
      + "Buka 9Router-mu lewat tunnel (cloudflared) atau VPS, lalu set AI_BASE_URL ke alamat publiknya (/v1) dan deploy ulang. Lihat DEPLOY.md bagian C.";
  }
  return "Tidak bisa menghubungi " + (p.nama === "9router" ? "9Router" : p.nama) + " di " + p.dasar + ". "
  + (p.dasarLokal
    ? "Jalankan 9Router dulu di CMD/terminal — tulis `9router` sampai muncul \"Server ready\" dan dashboard terbuka di http://localhost:20128/dashboard — lalu kirim ulang."
    : "Pastikan 9Router di alamat itu sedang jalan dan alamatnya berakhiran /v1"
      + (p.kunci ? "" : " — kalau 9Router itu memakai kunci, isi dulu AI_API_KEY") + ".");
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
    if (!n) return "07.00 WIB";
    return new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta", hour12: false })
      .format(new Date(n * 1000)).replace(":", ".") + " WIB";
  } catch { return "07.00 WIB"; }
}
function kuotaHabis(status, detail) {
  if (status === 429) return true;
  return /free-models-per-day|rate limit exceeded|insufficient credits|quota/i.test(String(detail || ""));
}

async function bangunSatu(model, prompt, mode, p, env) {
  const kepala = { "Content-Type": "application/json" };
  const antropis = p.gaya === "anthropic";
  let alamat, badan;
  if (antropis) {
    if (p.kunci) kepala["x-api-key"] = p.kunci;
    kepala["anthropic-version"] = "2023-06-01";
    badan = {
      model,
      max_tokens: MAX_TOKENS[mode] || 6000,
      temperature: SUHU[mode] ?? 0.4,
      system: SYSTEM,
      messages: [{ role: "user", content: String(prompt || "").slice(0, 12000) }],
    };
    alamat = p.dasar + "/messages";
  } else {
    if (p.kunci) kepala.Authorization = `Bearer ${p.kunci}`;
    if (!p.lokal) {
      kepala["HTTP-Referer"] = env.APP_URL || "https://van-chat-spy.local";
      kepala["X-Title"] = "Van Chat.SPY Builder";
    }
    badan = {
      model,
      temperature: SUHU[mode] ?? 0.4,
      max_tokens: MAX_TOKENS[mode] || 6000,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: String(prompt || "").slice(0, 12000) },
      ],
    };
    if (!p.lokal) badan.reasoning = { enabled: false };
    alamat = p.dasar + "/chat/completions";
  }
  let r;
  try {
    r = await fetch(alamat, { method: "POST", headers: kepala, body: JSON.stringify(badan) });
  } catch (e) {
    throw new Error("LOKAL|" + pesanRouterMati(p, env) + " (" + String((e && e.message) || e).slice(0, 80) + ")");
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
      throw new Error("KUOTA|kuota gratis harian sudah habis — batas 50 pesan/hari dari penyedia AI. Kuota terisi ulang otomatis pukul " + jamResetWIB(reset) + ".");
    }
    throw new Error(pesan);
  }
  const d = await r.json();
  let teks = "";
  if (p.gaya === "anthropic") {
    teks = (Array.isArray(d && d.content) ? d.content : [])
      .filter((b) => b && (b.type === "text" || b.type === undefined))
      .map((b) => String(b.text || "")).join("");
  } else {
    const c = d && d.choices && d.choices[0];
    teks = (c && c.message && c.message.content) || (c && c.text) || "";
  }
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
    const daftar = p.lokal ? ((await daftarModelLokal(env)) || []) : MODEL_BANGUN;
    return json({
      ok: true, ready: p.lokal ? true : !!kunci, models: daftar.length ? daftar : MODEL_BANGUN,
      penyedia: { nama: p.nama, alamat: p.dasar, lokal: p.lokal },
      pesan: p.lokal ? "siap — " + p.nama + " lokal di " + p.dasar : (kunci ? "siap" : "kunci API belum dipasang"),
    }, 200, c);
  }
  if (request.method !== "POST") return json({ ok: false, pesan: "Gunakan GET atau POST" }, 405, c);
  if (!asalDiizinkan(request, env)) {
    return json({ ok: false, pesan: "Permintaan dari alamat asal yang tidak dikenal ditolak." }, 403, c);
  }
  if (!p.lokal && !kunci) return json({ ok: false, pesan: "Kunci API belum dipasang di server." }, 500, c);

  let body;
  try { body = JSON.parse(await request.text()); } catch { return json({ ok: false, pesan: "JSON tidak valid" }, 400, c); }

  const prompt = String(body.prompt || "").slice(0, 12000).trim();
  if (!prompt) return json({ ok: false, pesan: "Permintaan masih kosong." }, 400, c);
  const mode = ["fast", "think", "deep", "expert"].includes(body.mode) ? body.mode : "think";

  const kandidat = await kandidatBangun(env);
  if (!kandidat.length) {
    /* alamatnya menjawab tapi kuncinya ditolak ≠ penyedia mati */
    if (kunciDitolakTerakhir()) return json({ ok: false, kunci: true, pesan: pesanKunciDitolak(p) }, 401, c);
    return json({ ok: false, pesan: pesanRouterMati(p, env), penyedia: { nama: p.nama, alamat: p.dasar, lokal: p.lokal } }, 502, c);
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
  if (pesanJujur) return json({ ok: false, pesan: pesanJujur, penyedia: { nama: p.nama, alamat: p.dasar, lokal: p.lokal } }, 502, c);
  return json({ ok: false, pesan: "Semua model sedang sibuk (" + terakhir + "). Coba lagi sebentar." }, 502, c);
}

export const config = { runtime: "edge" };

/* env dari process.env, boleh ditimpa server lokal (tools/server-uji.mjs → tools/9router.json) */
function envProses(tambahan) {
  const das = (typeof process !== "undefined" && process.env) || {};
  const g = { ...das, ...(tambahan || {}) };
  const kunci = {};
  for (const k of ["AI_PROVIDER", "AI_BASE_URL", "AI_API_KEY", "AI_MODEL", "AI_MODELS", "AI_MODEL_VISI",
    "AI_MODEL_FAST", "AI_MODEL_THINK", "AI_MODEL_DEEP", "AI_MODEL_EXPERT",
    "ROUTER_API_KEY", "NINEROUTER_API_KEY", "OPENROUTER_KEY", "MODELS_JSON",
    "ALLOWED_ORIGINS", "APP_URL", "VERCEL", "VERCEL_ENV", "VERCEL_URL", "HOSTING",
    "AI_GAYA", "AI_STYLE", "AI_ROUTER"]) if (g[k] !== undefined) kunci[k] = g[k];
  return kunci;
}

export default async function (request, env) {
  return tangani(request, envProses(env));
}
