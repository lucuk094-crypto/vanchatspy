/**
 * ════════════════════════════════════════════════════════════════════
 *  Van Chat.SPY — /api/chat   (Vercel Edge Function)
 * ════════════════════════════════════════════════════════════════════
 *  Otak percakapan. Dipanggil oleh assets/app.js.
 *
 *  POST /api/chat
 *    { prompt, riwayat?: string[], mode?, stream?,
 *      gambar?: dataURL[], memori?: string[], proyek?: string }
 *        → stream=true  : text/event-stream  (potongan jawaban, SSE
 *                         langsung dari penyedia AI; ada satu baris
 *                         awal {"model":"…"} supaya aplikasi bisa
 *                         menampilkan model yang dipakai)
 *        → stream=false : { ok, text, model, mode }
 *
 *  • gambar  : 1–3 foto (data URL) → otomatis memakai model yang bisa
 *              MELIHAT gambar (ANTREAN_VISI), jawaban dikirim utuh
 *  • memori  : catatan yang diketahui tentang pengguna (disisipkan ke instruksi)
 *  • proyek  : arahan proyek yang sedang dibuka
 *
 *  GET  /api/chat → { ok, ready, modes, model }
 *
 *  MODE → MODEL  (daftar pertama = pilihan utama, sisanya cadangan)
 *    fast   → Ling 3.0 Flash          tercepat, tanya-jawab harian
 *    think  → Dots 3 Note             tulisan & kode lebih rapi
 *    deep   → Nex 2.5 Pro             pembahasan panjang
 *    expert → Nemotron 3 Super 120B   tugas berat
 *  Kalau satu model gagal (penyedia penuh, dll.) otomatis dicoba
 *  model berikutnya dalam daftar — pengguna tidak ikut gagal.
 *
 *  KUOTA
 *    Batas ditentukan paket akunmu di 9Router (mis. paket gratis: 7 juta
 *    token/hari, 15 permintaan/menit). Kalau penyedia menjawab 429, server
 *    meneruskannya apa adanya sebagai { kuota: true, pesan } — bukan jawaban palsu.
 *
 *  KUNCI API
 *    Hanya dari Environment Variable AI_API_KEY (di hosting) atau berkas .env.
 *    TIDAK ADA kunci yang ditanam di dalam kode — supaya repo ini aman
 *    dipublikasikan.
 * ════════════════════════════════════════════════════════════════════
 */

/* lapisan bersama: penyedia AI yang bisa dikonfigurasi + pengaman permintaan */
import { teksDariSSE, bersihkanPikir, buatPenyaringPikir, penyediaTeks, modelBawaan } from "./_ai.js";
import { periksaGambar as saringGambar, teksMasuk, audit, asalDiizinkan } from "./_aman.js";

/* Model cadangan kalau daftar model dari 9Router belum terbaca.
   Daftar sungguhan selalu diambil dari penyedia itu sendiri (GET /models),
   jadi yang muncul di Setelan = model yang boleh dipakai paketmu. */
const ANTREAN = {
  fast: ['kr/claude-haiku-4.5', 'kr/auto', 'FreeTiers'],
  think: ['kr/claude-sonnet-4.5', 'kr/claude-haiku-4.5', 'FreeTiers'],
  deep: ['kr/claude-sonnet-4.5', 'kr/claude-sonnet-4-thinking', 'FreeTiers'],
  expert: ['kr/claude-sonnet-4.5-agentic', 'cx/gpt-6-sol', 'kr/claude-sonnet-4.5', 'FreeTiers'],
};

/* Model yang bisa MELIHAT gambar (diuji: kr/claude-* melihat gambar dengan baik).
   Kalau router menyebut kemampuan modelnya sendiri, daftar itu yang dipakai. */
const ANTREAN_VISI = ['kr/claude-sonnet-4.5', 'kr/claude-haiku-4.5', 'FreeTiers'];

const MAX_TOKENS = { fast: 1200, think: 2500, deep: 3000, expert: 4000 };
/* Batas & model ditentukan paket akunmu di 9Router. Daftar model tambahan
   bisa dibatasi lewat env AI_MODEL_IZIN (dipisah koma); AI_MODELS memaksa
   urutan model yang dipakai aplikasi. */
const SUHU = { fast: 0.7, think: 0.6, deep: 0.5, expert: 0.4 };
const MODE_SAH = ["fast", "think", "deep", "expert"];

const SYSTEM = `Kamu adalah "Van Chat.SPY", asisten AI di dalam aplikasi ruang kerja Van Chat.SPY.
ATURAN MENGIKUTI PERINTAH (paling utama):
- Perintah pengguna MENANG atas gaya bawaanmu. Kalau pengguna minta "tepat 3 kata", jawablah tepat 3 kata. Kalau minta "hanya daftar bernomor", mulailah langsung dengan "1." tanpa kalimat pembuka. Kalau minta "satu paragraf", jangan lebih dari satu paragraf.
- Jangan mengawali jawaban dengan basa-basi ("Tentu!", "Baik,", "Berikut adalah", "Tentu saja") kecuali kamu diminta begitu. Langsung ke isi.
- Kalau pengguna melarang sesuatu ("tanpa penjelasan", "jangan pakai tabel", "tanpa basa-basi"), jangan melanggarnya walau kamu merasa tambahan itu berguna.
- Kalau permintaan tidak jelas, tanyakan satu hal yang paling penting dulu — jangan menebak panjang.
- Kalau ada blok "PROYEK YANG SEDANG DIKERJAKAN", arahannya WAJIB dipatuhi — termasuk bahasa pemrograman, kerangka kerja, gaya penulisan, dan gaya desain yang disebut di dalamnya. Setiap contoh kode harus memakai bahasa/kerangka itu.
ATURAN JAWABAN:
- Jawab dalam bahasa Indonesia yang natural, sopan, dan langsung ke inti.
- Jangan menulis tag instruksi seperti [ANALISIS] atau [JAWABAN]; tulis jawabannya saja.
- Rapikan: paragraf pendek, pakai daftar bernomor/bullet bila membantu, pakai **tebal** untuk istilah penting.
- Kalau menulis kode, taruh di blok kode berkunci bahasa (contoh: \`\`\`html). Kode HTML halaman penuh ditulis lengkap dari <!DOCTYPE html> supaya bisa langsung dijalankan.
- Kalau tidak yakin atau butuh data terkini, katakan tidak yakin — jangan mengarang fakta, angka, atau tautan.
- Kamu tidak bisa membuka internet, jadi jangan mengaku sudah mengecek tautan tertentu.
- JANGAN menampilkan proses berpikirmu sendiri (tanpa "Hmm", "Mari kita analisis", "Saya akan menganalisis dulu", tanpa tag [ANALISIS]/[JAWABAN]). Pengguna hanya perlu ringkasan alasan bila perlu, lalu jawaban akhirnya.`;

/* model tambahan milik pengguna sendiri (kunci berbayar/open-weight) */
function tambahan(env = {}) {
  return String(env.AI_MODEL_IZIN || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20);
}

const RATE = { windowMs: 60_000, max: 60 };
const hits = new Map();
function kenaBatas(ip) {
  const now = Date.now();
  const r = hits.get(ip) || { t: now, n: 0 };
  if (now - r.t > RATE.windowMs) { r.t = now; r.n = 0; }
  r.n++; hits.set(ip, r);
  if (hits.size > 5000) hits.clear();
  return r.n > RATE.max;
}

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

const json = (o, s, extra) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...(extra || {}) },
  });

/* ── batas permintaan dari penyedia (mis. 429 «rate limit» / kuota) ── */
function jamResetWIB(epoch) {
  try {
    const n = Number(epoch);
    if (!n) return "menit berikutnya";
    return "pukul " + new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta", hour12: false })
      .format(new Date(n * 1000)).replace(":", ".") + " WIB";
  } catch { return "menit berikutnya"; }
}
function kuotaHabis(status, detail) {
  if (status === 429) return true;
  return /free-models-per-day|rate limit exceeded|insufficient credits|quota/i.test(String(detail || ""));
}
function pesanKuota(detail) {
  let reset = "";
  try {
    const j = JSON.parse(String(detail || "{}"));
    const h = (j && j.error && j.error.metadata && j.error.metadata.headers) || {};
    reset = h["X-RateLimit-Reset"] || h["x-ratelimit-reset"] || "";
  } catch {}
  return "batas permintaan penyedia AI tercapai (paket akunmu di penyedianya). " +
    "Coba lagi " + jamResetWIB(reset) + " — atau naikkan paket akunmu di dasbor penyedia. " +
    "Sementara itu percakapan lama masih bisa dibaca dan ruang kerja tetap jalan.";
}

/* kunci & alamat penyedia ditentukan di _ai.js — ganti AI_PROVIDER / AI_API_KEY
   untuk memakai penyedia lain tanpa mengubah berkas ini */
const kunciDipakai = (env) => penyediaTeks(env).kunci;
const alamatPenyedia = (env) => penyediaTeks(env).dasar + "/chat/completions";

/* ── daftar model dari penyedia (9Router) ─────────────────────────
   Diambil dari GET {dasar}/models milik 9Router, jadi aplikasi hanya
   memakai model yang BENER-BENER diizinkan paket akunmu — bukan daftar
   karangan. Hasilnya disimpan 60 detik supaya tidak memanggil berulang. */
let cacheLokal = { dasar: "", ts: 0, daftar: [], visi: [], ok: false, kode: 0, sebab: "", ms: 0 };

/* alasan kegagalan terakhir (untuk pesan jujur: timeout? HTTP berapa? DNS?) */
const sebabLokalTerakhir = () => cacheLokal.sebab || "";
function sebabDari(e, ms) {
  const nama = String((e && e.name) || "");
  if (nama === "TimeoutError" || nama === "AbortError") return "penyedia tidak menjawab dalam " + Math.round(ms / 1000) + " detik";
  const status = Number((e && e.status) || 0);
  if (status) return "penyedia menjawab HTTP " + status;
  const m = String((e && e.message) || e).slice(0, 140);
  return m ? "gagal menghubungi penyedia (" + m + ")" : "gagal menghubungi penyedia";
}
/* pemeriksaan terakhir GAGAL karena kuncinya ditolak (bukan karena penyedia mati)?
   Dipakai supaya pesannya tidak menyesatkan ("pastikan sudah jalan") saat
   alamatnya sebenarnya menjawab, hanya kuncinya salah. */
const kunciDitolakTerakhir = () => cacheLokal.kode === 401 || cacheLokal.kode === 403;
async function daftarModelLokal(env) {
  const p = penyediaTeks(env);
  if (!p.router) return null;   /* penyedia yang daftar modelnya tidak dibaca dari penyedia itu */
  const kini = Date.now();
  /* hasil yang tersimpan hanya dipercaya kalau memang pernah BERHASIL;
     percobaan yang gagal tidak boleh dianggap "daftar kosong" (nanti model
     penyedia lain yang dipakai) — harus null = tidak bisa dihubungi */
  if (cacheLokal.dasar === p.dasar && kini - cacheLokal.ts < 60000) return cacheLokal.ok ? cacheLokal.daftar : null;
  const t0 = Date.now();
  try {
    const h = { "Content-Type": "application/json" };
    if (p.kunci) h.Authorization = "Bearer " + p.kunci;
    /* batas waktu 9 detik: di hosting (Vercel Edge) + penyedia di balik Cloudflare,
       permintaan pertama bisa lambat — 4 detik terlalu ketat dan membuat aplikasi
       mengaku "penyedia mati" padahal hanya lambat. */
    const r = await fetch(p.dasar + "/models", {
      headers: h,
      signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(9000) : undefined,
    });
    if (!r.ok) throw Object.assign(new Error("HTTP " + r.status), { status: r.status });
    const j = await r.json();
    const butir = (j.data || j.models || []).filter(Boolean);
    const daftar = butir.map((m) => String(m.id || m.name || "").trim()).filter(Boolean).slice(0, 200);
    /* kalau gateway menyebut kemampuan modelnya (capabilities.vision), pakai itu —
       lebih tepat daripada menebak dari namanya */
    const visi = butir
      .filter((m) => m && m.capabilities && (m.capabilities.vision === true || m.capabilities.imageInput === true))
      .map((m) => String(m.id || m.name || "").trim()).filter(Boolean).slice(0, 40);
    cacheLokal = { dasar: p.dasar, ts: kini, daftar, visi, ok: daftar.length > 0, kode: 0, sebab: "", ms: Date.now() - t0 };
    if (!daftar.length) { cacheLokal.sebab = "penyedia menjawab, tetapi daftar model untuk paketmu kosong"; return null; }
    return daftar;
  } catch (e) {
    /* penyedia belum bisa dihubungi → coba lagi 5 detik kemudian (bukan menunggu 60 detik),
       supaya begitu jaringan/penyedia normal lagi, web langsung jalan tanpa di-restart */
    cacheLokal = {
      dasar: p.dasar, ts: kini - 55000, daftar: [], visi: [], ok: false,
      kode: Number((e && e.status) || 0), sebab: sebabDari(e, Date.now() - t0), ms: Date.now() - t0,
    };
    return null;
  }
}

/* Versi SABAR-TAPI-TIDAK-LAMA: percakapan tidak boleh menunggu probe lambat.
   Kalau daftar model belum selesai dalam 2,5 detik, percakapan tetap jalan
   memakai daftar bawaan — probe-nya terus berjalan di latar dan hasilnya
   tersimpan untuk permintaan berikutnya. */
/* Tunggu paling lama 2,5 detik untuk daftar model pada PERCAKAPAN PERTAMA.
   Nama model harus yang benar-benar ada di router (kalau tidak, permintaannya
   ditolak), tetap saja percakapan tidak boleh tertahan lama: setelah 2,5 detik
   aplikasi jalan dengan daftar bawaannya, sementara pembacaan daftar tetap
   berlanjut di latar dan tersimpan untuk permintaan berikutnya (60 detik). */
const DAFTAR_CEPAT_MS = 2500;
let janjiCari = null;
async function daftarModelCepat(env, ms = DAFTAR_CEPAT_MS) {
  if (cacheLokal.dasar === penyediaTeks(env).dasar && cacheLokal.ok) return cacheLokal.daftar;
  if (!janjiCari) {
    janjiCari = daftarModelLokal(env).finally(() => { janjiCari = null; });
  }
  const batas = new Promise((r) => setTimeout(() => r(null), ms));
  return Promise.race([janjiCari, batas]);
}

/* apakah model ditentukan sendiri oleh pengguna (env)? kalau ya, jangan menyerah
   hanya karena daftar model router belum terbaca */
const adaModelPaksa = (env) => ["AI_MODELS", "AI_MODEL", "AI_MODEL_FAST", "AI_MODEL_THINK", "AI_MODEL_DEEP", "AI_MODEL_EXPERT", "AI_MODEL_VISI"]
  .some((k) => String((env && env[k]) || "").trim());

/* kunci ditolak penyedia (alamatnya menjawab, kuncinya salah) */
function pesanKunciDitolak(penyedia) {
  return "kunci penyedia AI ditolak penyedianya (" + (penyedia.label || penyedia.nama) + " di " + penyedia.dasar
    + "). Periksa AI_API_KEY — kuncinya harus yang terbaru dari dasbor penyedia"
    + (penyedia && penyedia.kustom ? "" : " (di 9Router kunci berawalan sk-)")
    + "; kalau baru diganti/di-rotasi, pakai kunci yang paling baru lalu coba lagi.";
}

/* kunci belum dipasang sama sekali (bukan "ditolak penyedia") — pesannya dibedakan
   supaya pengguna tahu langkah persisnya, bukan menebak kunci salah */
function pesanKunciKosong(penyedia) {
  const kustom = !!(penyedia && penyedia.kustom);
  return "kunci penyedia AI belum dipasang — percakapan butuh satu kunci API untuk "
    + (penyedia && penyedia.label ? penyedia.label : "penyedia AI") + ". "
    + (kustom
      ? "Isi AI_API_KEY dengan kunci dari gateway yang kamu pakai di " + penyedia.dasar + " "
      : "Buat kunci berawalan sk- di halaman API keys dasbor 9Router (https://rqacwx8.abc-tunnel.us/keys), ")
    + "lalu pasang sebagai AI_API_KEY di hosting paling lambat sebelum deploy ulang "
    + "(Vercel: Settings → Environment Variables → Redeploy). "
    + "Alamat penyedia yang dipakai sekarang: " + penyedia.dasar + ".";
}

/* pesan apa adanya saat penyedia AI tidak bisa dihubungi */
function pesanPenyediaMati(penyedia, env, sebab) {
  const nama = penyedia.label || penyedia.nama;
  const ubahAlamat = String((env && env.AI_BASE_URL) || '').trim();
  return 'Tidak bisa menghubungi penyedia AI (' + nama + ' di ' + penyedia.dasar + ').'
    + (sebab ? ' Penyebab: ' + sebab + '.' : '')
    + (ubahAlamat ? ' AI_BASE_URL diisi "' + ubahAlamat + '" — kalau gateway itu tidak menjawab, kosongkan dulu supaya kembali ke bawaan.' : '')
    + ' Periksa koneksi internet server ini dan kunci AI_API_KEY masih berlaku. '
    + 'Percakapan lama tetap bisa dibaca — tidak ada jawaban palsu. '
    + 'Diagnosa cepat: buka /api/health?uji=1 di browser, atau dari terminal: '
    + '`node tools/cek-penyedia.mjs --url ' + penyedia.dasar + ' --key <kunci> --nama 9router`.';
}

/* pilih model yang paling masuk akal untuk tiap mode, dari nama modelnya */
const COCOK_MODE = {
  fast: /flash|mini|nano|haiku|sante|lightning|lite|turbo|small|instant/i,
  think: /think|reason|sonnet|glm|kimi|qwen|deepseek|pro|plus|large/i,
  deep: /pro|opus|sonnet|max|ultra|glm|kimi|deepseek|r1|o3|o4|gpt-5|gpt-4/i,
  expert: /opus|pro|max|ultra|o3|o4|gpt-5|gemini|claude|sonnet/i,
};
function pilihModelMode(mode, daftar, env) {
  const khusus = env["AI_MODEL_" + String(mode).toUpperCase()] || env.AI_MODEL;
  if (khusus) return String(khusus);
  const rx = COCOK_MODE[mode];
  const kena = rx ? daftar.filter((d) => rx.test(d)) : [];
  return kena[0] || daftar[0] || "";
}
/* Model yang TERBUKTI berhasil (per mode) — diingat selama proses hidup.
   Banyak gateway menyebut puluhan model padahal sebagian tidak punya
   kredensial aktif; percobaan pertama bisa jadi kena yang mati, dan setelah
   ketemu yang jalan, permintaan berikutnya langsung memakai itu. */
const modelTerbukti = { fast: "", think: "", deep: "", expert: "" };

/* Model yang baru saja gagal karena memang tidak tersedia di gateway itu
   (503 "unavailable for free", 404 "no active credentials", dsb). Ditahan
   5 menit supaya percakapan berikutnya tidak mencoba yang sama berulang kali. */
const TIDAK_ADA_MS = 5 * 60 * 1000;
const modelTidakAda = new Map();
const catatTidakAda = (m) => { if (m) modelTidakAda.set(String(m), Date.now()); };
const baruMati = (m) => { const t = modelTidakAda.get(String(m)); return !!t && (Date.now() - t) < TIDAK_ADA_MS; };
const RX_MODEL_MATI = /unavailable|not available|no active credentials|does not exist|model not found|unknown model|tidak tersedia|no endpoints|invalid model/i;
const catatTerbukti = (mode, model) => { if (model && modelTerbukti[mode] !== model) modelTerbukti[mode] = model; };

/* Susun urutan kandidat model untuk satu mode (dipakai percakapan & builder):
   1) model yang pernah berhasil, 2) pilihan cerdas untuk mode itu, 3) sisa
   daftar penyedia. Model yang baru terbukti tidak tersedia ditaruh paling
   belakang supaya tidak membuang waktu di percobaan berikutnya. */
export function kandidatModel(env, daftar, mode = "fast", maks = 8) {
  const semua = [].concat(daftar || []).map((m) => String(m || "").trim()).filter(Boolean);
  const ingat = modelTerbukti[mode];
  const utama = pilihModelMode(mode, semua, env);
  const ekstra = tambahan(env);
  const urut = [];
  const dorong = (m) => { if (m && semua.includes(m) && !urut.includes(m)) urut.push(m); };
  if (ingat) dorong(ingat);
  ekstra.forEach(dorong);
  if (utama) dorong(utama);
  semua.forEach(dorong);
  const hidup = urut.filter((m) => !baruMati(m));
  const mati = urut.filter((m) => baruMati(m));
  return hidup.concat(mati).slice(0, maks);
}

/* antrean model: khusus untuk penyedia lokal — model pilihan lebih dulu,
   sisanya jadi cadangan bila model itu gagal */
async function antreanLokal(env, cepat = false) {
  const daftar = cepat ? await daftarModelCepat(env) : await daftarModelLokal(env);
  const dasar = antreanMode(env);
  if (!daftar || !daftar.length) return dasar;
  const jelas = String(env.AI_MODELS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const hasil = {};
  for (const mode of ["fast", "think", "deep", "expert"]) {
    if (jelas.length) { hasil[mode] = jelas.slice(0, 8); continue; }
    const utama = pilihModelMode(mode, daftar, env);
    hasil[mode] = kandidatModel(env, daftar, mode, 8);
  }
  return hasil;
}
/* model yang bisa melihat gambar di penyedia lokal */
async function visiLokal(env, cepat = false) {
  const daftar = cepat ? await daftarModelCepat(env) : await daftarModelLokal(env);
  if (!daftar || !daftar.length) return null;
  if (env.AI_MODEL_VISI) return [String(env.AI_MODEL_VISI)];
  /* gateway yang menyebut kemampuan modelnya sendiri (capabilities.vision) → pakai itu */
  const dariPenyedia = (cacheLokal.visi || []).filter((m) => daftar.includes(m));
  if (dariPenyedia.length) return dariPenyedia.slice(0, 6);
  const kena = daftar.filter((d) => /vl|vision|omni|multimodal|gemini|gpt-4|gpt-5|sonnet|claude|dots|qwen.*vl|llava|pixtral/i.test(d));
  return kena.length ? kena.slice(0, 5) : daftar.slice(0, 3);
}

function antreanMode(env) {
  /* penyedia selain 9Router punya daftar modelnya sendiri (mis. Google AI Studio,
     Pollinations, Groq) → pakai itu sebagai dasar supaya mode tetap jalan walaupun
     GET /models belum terbaca. */
  const dasar = (penyediaTeks(env).nama === "9router"
    ? ANTREAN
    : {
        fast: modelBawaan(env, "fast"),
        think: modelBawaan(env, "think"),
        deep: modelBawaan(env, "deep"),
        expert: modelBawaan(env, "expert"),
      });
  const isiAda = [].concat(dasar.fast, dasar.think, dasar.deep, dasar.expert).filter(Boolean).length > 0;
  const dasarPakai = isiAda ? dasar : ANTREAN;
  if (!env.MODELS_JSON) return dasarPakai;
  try {
    const ubah = JSON.parse(env.MODELS_JSON);
    if (!ubah || typeof ubah !== "object") return dasarPakai;
    const hasil = { ...dasarPakai };
    for (const k of Object.keys(ubah)) hasil[k] = Array.isArray(ubah[k]) ? ubah[k] : [ubah[k]];
    return hasil;
  } catch { return dasarPakai; }
}

/* susun pesan: system (+ memori & proyek) + giliran sebelumnya + pertanyaan */
/* teknologi yang disebut dalam arahan proyek → ditegaskan kembali ke model */
const TEKNOLOGI_RX = /\b(TypeScript|JavaScript|Python|PHP|Golang|Go|Java|Kotlin|Swift|Rust|React|Next\.?js|Vue|Svelte|Tailwind|Bootstrap|Laravel|Django|Flask|Node\.?js|Express|MySQL|PostgreSQL|MongoDB|SQL)\b/gi;

/* Perintah ketat dari pengguna ditegaskan lagi tepat di atas pertanyaannya —
   supaya model kecil yang cepat pun tidak "lupa" pada gaya bawaannya. */
const PENEGAS = [
  { uji: /\btepat\s+\d+\s*(kata|kalimat|baris|poin|butir|paragraf)\b/i, pesan: 'Pengguna minta JUMLAH PASTI — hitung dulu, lalu jawab tepat sebanyak itu.' },
  { uji: /\b(hanya|tepat|cukup|maksimal|max)?\s*(\d+|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)\s*\bkata\b/i, pesan: 'Jawaban harus terdiri dari jumlah kata yang diminta — hitung kata satu per satu sebelum mengirim.' },
  { uji: /\b(hanya|hanyalah|cuma|tanpa\s+(kalimat\s+)?(pembuka|penutup|basa-basi|pengantar))\b/i, pesan: 'Pengguna minta TANPA basa-basi: mulai langsung dengan isi, tanpa kalimat pengantar maupun penutup.' },
  { uji: /\bdaftar\s+bernomor|numbered\s+list/i, pesan: 'Jawab dalam bentuk daftar bernomor (1., 2., …) saja.' },
  { uji: /\b(daftar|poin|butir|bullet)\b/i, pesan: 'Gunakan bentuk daftar seperti yang diminta pengguna.' },
  { uji: /\b(jawab|balas|respon|jawaban)\s+(singkat|pendek|ringkas)\b|\bsecara singkat\b/i, pesan: 'Jawab seringkas mungkin: langsung intinya.' },
  { uji: /\b(jangan|tanpa)\b[^.]{0,30}\b(jelaskan|menjelaskan|penjelasan|uraikan|cerita)\b/i, pesan: 'Jangan menguraikan panjang — cukup jawabannya.' },
  { uji: /\b(bahasa\s+inggris|in\s+english|english)\b/i, pesan: 'Jawab dalam bahasa Inggris.' },
  { uji: /\b(hanya|tanpa)\b[^.]{0,30}\b(kode|code)\b|\bhanya kodenya\b/i, pesan: 'Kirim hanya kode di dalam satu blok kode, tanpa penjelasan tambahan.' },
  { uji: /\b(paragraf|paragraph)\b/i, pesan: 'Tulis dalam bentuk prosa satu paragraf.' },
];
function penegasUntuk(prompt) {
  const teks = String(prompt || '');
  const kena = [];
  for (const p of PENEGAS) if (p.uji.test(teks)) kena.push('- ' + p.pesan);
  return kena.length ? '\n\nPENEGASAN UNTUK PERMINTAAN INI (wajib, di atas gaya bawaannya):\n' + kena.join('\n') : '';
}

/* ── bahasa kode proyek: diperiksa, bukan hanya diminta ────────────────
   Arahan proyek ("Aturan coding: TypeScript") masuk ke prompt sistem, tetapi
   model kecil kadang tetap membalas contoh kode JavaScript. Karena itu contoh
   kode di jawaban diperiksa; kalau tidak sesuai, model diminta memperbaikinya
   (jalur perbaikan yang sama dengan perintah bentuk). Kalau pengguna sendiri
   minta bahasa lain di pertanyaannya, permintaan pengguna yang menang. */
const TEKNOLOGI_NX = new RegExp(TEKNOLOGI_RX.source, "i");

const PENANDA = {
  typescript: { label: "TypeScript", fence: /^(ts|typescript|tsx)$/i, isi: /(interface\s+\w+|\btype\s+\w+\s*=|:\s*(number|string|boolean|void|any|unknown|never|object)\b|\bas\s+(const|unknown|[A-Z]\w*)\b|\benum\s+\w+|<[A-Z]\w*>|\w\?\s*:)/ },
  javascript: { label: "JavaScript", fence: /^(js|jsx|javascript|mjs|cjs|node)$/i, isi: /(function\s+\w*\s*\(|=>|\bconst\s+\w+|\blet\s+\w+|\bvar\s+\w+|console\.log|require\()/ },
  python: { label: "Python", fence: /^(py|python\d?|python)$/i, isi: /(^\s*(def|class|import|from|print)\b|\belif\b|f["'])/m },
  php: { label: "PHP", fence: /^(php\d?|php)$/i, isi: /(<\?php|\$\w+\s*=|\bfunction\s+\w+\s*\(\s*\$)/ },
  go: { label: "Go", fence: /^(go|golang)$/i, isi: /(^\s*(package|func)\s+\w+|\w+\s*:=|fmt\.)/m },
  java: { label: "Java", fence: /^java$/i, isi: /((public|private|protected)\s+(static\s+)?(class|void|int|String|double|boolean)\b|System\.out\.print)/ },
  sql: { label: "SQL", fence: /^sql$/i, isi: /\b(select|insert\s+into|update|delete\s+from|create\s+table|alter\s+table)\b/i },
  rust: { label: "Rust", fence: /^(rust|rs)$/i, isi: /(^\s*(fn|use|let\s+mut)\b|println!|impl\s+\w+)/m },
};

function kunciTeknologi(nama) {
  const n = String(nama || "").toLowerCase().replace(/[.\s]+/g, "").replace(/[+#]$/, "");
  const peta = { ts: "typescript", js: "javascript", node: "javascript", nodejs: "javascript", golang: "go", py: "python", python3: "python", postgres: "sql", postgresql: "sql", mysql: "sql", sqlite: "sql" };
  const k = peta[n] || n;
  return PENANDA[k] ? k : "";
}

function blokKode(teks) {
  const keluar = [];
  const rx = /```([^\n`]*)\r?\n([\s\S]*?)```/g;
  let m;
  while ((m = rx.exec(String(teks || "")))) keluar.push({ bahasa: String(m[1] || "").trim().toLowerCase(), isi: m[2] });
  return keluar;
}

function cocokTeknologi(kunci, b) {
  const p = PENANDA[kunci];
  if (!p) return true;
  if (p.fence.test(b.bahasa || "")) return true;
  if (kunci === "javascript") {
    /* blok yang jelas TypeScript bukan JavaScript */
    if (PENANDA.typescript.fence.test(b.bahasa || "") || PENANDA.typescript.isi.test(b.isi)) return false;
  }
  return p.isi ? p.isi.test(b.isi) : false;
}

/* bahasa kode yang diminta proyek ("" = tidak ada / tidak bisa diperiksa) */
function teknologiDiminta(proyekTeks, prompt) {
  const p = String(proyekTeks || "");
  if (!p) return "";
  const mBaris = p.match(/aturan\s+coding\s*:\s*([^\s.,;]+)/i);
  const nama = (mBaris ? mBaris[1] : (TEKNOLOGI_NX.exec(p) || [""])[0]).replace(/[.,;:]+$/, "").trim();
  const kunci = kunciTeknologi(nama);
  if (!kunci) return "";
  /* pengguna sendiri menyebut bahasa lain di pertanyaannya → ikuti pengguna */
  const diPrompt = TEKNOLOGI_NX.exec(String(prompt || ""));
  if (diPrompt && kunciTeknologi(diPrompt[0]) && kunciTeknologi(diPrompt[0]) !== kunci) return "";
  return kunci;
}

/* ── pemeriksa perintah ketat ──────────────────────────────────────────
   Kalau pengguna meminta hal yang bisa dihitung (jumlah kata, jumlah poin,
   satu paragraf, hanya kode), jawabannya diperiksa di server. Kalau meleset,
   satu permintaan perbaikan dikirim ke model yang sama — pengguna tidak perlu
   tahu bahwa modelnya perlu ditegur sekali. */
const ANGKA_KATA = { satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10, sebelas: 11, dua_belas: 12 };

function perintahKetat(prompt) {
  const t = String(prompt || "");
  const aturan = [];
  const ANGKA_TEKS = 'satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|dua belas';
  /* "tepat 3 kata", "hanya dengan tiga kata", "maksimal 10 kata", "3 kata saja" */
  const mKata = t.match(new RegExp('\\b(?:tepat|hanya|cukup|maksimal|maks|max|maksimum|minimal|min|minimum|paling|sekitar|kurang lebih|tidak lebih|tidak kurang)\\b[^.!?\\n]{0,26}?\\b(\\d+|' + ANGKA_TEKS + ')\\s+kata\\b', 'i'))
    || t.match(new RegExp('\\b(\\d+|' + ANGKA_TEKS + ')\\s+kata\\b', 'i'));
  if (mKata) {
    const n = ANGKA_KATA[String(mKata[1]).toLowerCase()] || parseInt(mKata[1], 10);
    /* "maksimal 8 kata" = batas atas, "minimal 8 kata" = batas bawah,
       "tepat/hanya 8 kata" = pas — ketiganya tidak boleh disamakan */
    const frasa = String(mKata[0]).toLowerCase();
    const batas = /maksimal|maksimum|maks\\b|max\\b|paling banyak|tidak lebih|kurang dari/.test(frasa) ? "maks"
      : /minimal|minimum|min\\b|paling sedikit|tidak kurang|lebih dari/.test(frasa) ? "min" : "tepat";
    if (n > 0 && n <= 400) aturan.push({ jenis: "kata", n, batas });
  }
  if (/\b(hanya|tanpa)\b[^.]{0,40}\b(daftar bernomor|daftar|poin|butir|bullet)\b/i.test(t)) aturan.push({ jenis: "daftar" });
  if (/\b(satu|sebuah|1)\s+paragraf\b/i.test(t)) aturan.push({ jenis: "paragraf", n: 1 });
  if (/\b(hanya|tanpa)\b[^.]{0,40}\b(kode|code)\b|\bhanya kodenya\b/i.test(t)) aturan.push({ jenis: "kode" });
  return aturan;
}

function hitungKata(teks) {
  /* untuk jumlah kata: tanpa blok kode, tanpa penanda markdown */
  const bersih = String(teks || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`#>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return bersih ? bersih.split(" ").filter((k) => /[\p{L}\p{N}]/u.test(k)).length : 0;
}

function periksaJawaban(teks, aturan) {
  for (const a of aturan) {
    if (a.jenis === "kata") {
      const jumlah = hitungKata(teks);
      const lewat = a.batas === "maks" ? jumlah > a.n
        : a.batas === "min" ? jumlah < a.n
        : jumlah !== a.n;
      if (lewat) {
        const seharusnya = a.batas === "maks" ? "maksimal " + a.n : a.batas === "min" ? "minimal " + a.n : String(a.n);
        return { gagal: true, alasan: "jumlah kata " + jumlah + ", seharusnya " + seharusnya, jenis: "kata", jumlah };
      }
    }
    if (a.jenis === "daftar") {
      const baris = String(teks || "").split("\n").map((b) => b.trim()).filter(Boolean);
      if (!baris.length || !/^(\d+[.)]|[-*])\s/.test(baris[0])) return { gagal: true, alasan: "jawaban tidak dimulai dengan butir daftar", jenis: "daftar" };
    }
    if (a.jenis === "paragraf") {
      const paragraf = String(teks || "").split(/\n\s*\n/).filter((b) => b.trim());
      if (paragraf.length > a.n + 1) return { gagal: true, alasan: "jumlah paragraf " + paragraf.length, jenis: "paragraf" };
    }
    if (a.jenis === "kode") {
      const adaKode = /```/.test(teks);
      const teksDiLuar = String(teks || "").replace(/```[\s\S]*?```/g, "").replace(/[\s*_`-]/g, "");
      if (!adaKode || teksDiLuar.length > 40) return { gagal: true, alasan: "ada penjelasan di luar blok kode", jenis: "kode" };
    }
    if (a.jenis === "teknologi") {
      const blok = blokKode(teks);
      const p = PENANDA[a.nama];
      if (blok.length && p && blok.some((b) => !cocokTeknologi(a.nama, b))) {
        return { gagal: true, alasan: "contoh kode tidak memakai " + p.label, jenis: "teknologi", nama: p.label };
      }
    }
  }
  return { gagal: false };
}

function instruksiPerbaikan(aturan, hasil, putaran) {
  const minta = aturan.map((a) => a.jenis === "kata" ? ((a.batas === "maks" ? "paling banyak " : a.batas === "min" ? "paling sedikit " : "tepat ") + a.n + " kata")
    : a.jenis === "daftar" ? "LANGSUNG daftar bernomor tanpa satu pun kalimat pembuka (baris pertama harus mulai dengan \"1.\")"
    : a.jenis === "kode" ? "hanya satu blok kode, tanpa penjelasan di luar kode"
    : a.jenis === "teknologi" ? "SEMUA contoh kode memakai " + (PENANDA[a.nama] ? PENANDA[a.nama].label : a.nama) + " (anotasi tipe & idioma " + (PENANDA[a.nama] ? PENANDA[a.nama].label : a.nama) + "), bukan bahasa lain"
    : "tepat " + a.n + " paragraf").join(", ");
  const dasar = "Jawabanmu belum mematuhi perintah bentuk (" + hasil.alasan + "). Tulis ULANG hanya jawaban akhirnya saja — tanpa penjelasan, tanpa permintaan maaf, tanpa tanda kutip — dengan " + minta + ". ";
  if (putaran > 0) {
    return dasar + "INI PERCOBAAN TERAKHIR. Sebelum mengirim, hitung sendiri kata-katamu satu per satu dan pastikan jumlahnya pas (tanda baca tidak dihitung). Kalau kelebihan, buang kata yang paling tidak penting; kalau kurang, tambahkan satu kata penting.";
  }
  return dasar + "Hitung dulu jumlah katanya, baru kirim.";
}

/* seberapa jauh sebuah jawaban dari bentuk yang diminta (0 = tepat) */
function jarakBentuk(teks, aturan) {
  let jarak = 0;
  for (const a of aturan) {
    if (a.jenis === "kata") {
      const jml = hitungKata(teks);
      jarak += a.batas === "maks" ? Math.max(0, jml - a.n)
        : a.batas === "min" ? Math.max(0, a.n - jml)
        : Math.abs(jml - a.n);
    }
    else if (a.jenis === "daftar") {
      const baris = String(teks || "").split("\n").map((b) => b.trim()).filter(Boolean);
      if (!baris.length || !/^(\d+[.)]|[-*])\s/.test(baris[0])) jarak += 2;
      const butir = (String(teks || "").match(/^\s*(\d+[.)]|[-*])\s/gm) || []).length;
      const diminta = (String(aturan.diminta || "") && 0) || 0;   /* jumlah butir opsional */
      if (diminta && butir !== diminta) jarak += Math.abs(butir - diminta);
    }
    else if (a.jenis === "kode") {
      const teksDiLuar = String(teks || "").replace(/```[\s\S]*?```/g, "").replace(/[\s*_`-]/g, "");
      if (!/```/.test(teks)) jarak += 3; else if (teksDiLuar.length > 40) jarak += 1;
    }
    else if (a.jenis === "paragraf") {
      const p2 = String(teks || "").split(/\n\s*\n/).filter((b) => b.trim()).length;
      jarak += Math.abs(p2 - a.n);
    }
    else if (a.jenis === "teknologi") {
      const blok = blokKode(teks);
      if (blok.length && blok.some((b) => !cocokTeknologi(a.nama, b))) jarak += 4;
    }
  }
  return jarak;
}

function susunPesan(riwayat, prompt, opsi) {
  const o = opsi || {};
  let system = SYSTEM;

  const memori = (Array.isArray(o.memori) ? o.memori : [])
    .map((m) => String(m || "").replace(/\s+/g, " ").trim().slice(0, 300))
    .filter(Boolean).slice(0, 20);
  if (memori.length) {
    system += "\n\nYANG KAMU KETAHUI TENTANG PENGGUNA (memori tersimpan — pakai bila relevan, jangan dibacakan semua):\n"
      + memori.map((m) => "- " + m).join("\n");
  }
  const proyek = String(o.proyek || "").replace(/\s+/g, " ").trim().slice(0, 600);
  if (proyek) {
    system += "\n\nPROYEK YANG SEDANG DIKERJAKAN (ikuti arahannya):\n" + proyek;
    const teknologi = [];
    for (const m of proyek.matchAll(TEKNOLOGI_RX)) {
      const n = m[0].trim();
      if (!teknologi.some((x) => x.toLowerCase() === n.toLowerCase())) teknologi.push(n);
    }
    if (teknologi.length) {
      system += "\n\nWAJIB untuk proyek ini: setiap contoh kode memakai "
        + teknologi.slice(0, 3).join(" / ")
        + ". Jangan menggantinya dengan bahasa lain walau terasa lebih mudah.";
    }
  }

  system += penegasUntuk(prompt);
  const pesan = [{ role: "system", content: system }];
  (Array.isArray(riwayat) ? riwayat : []).slice(-4).forEach((t) => {
    const v = String(t || "").trim();
    if (v) pesan.push({ role: "user", content: v.slice(0, 8000) });
  });

  const teksUser = String(prompt || "").slice(0, 24000);
  const gambar = (Array.isArray(o.gambar) ? o.gambar : [])
    .filter((g) => typeof g === "string" && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(g))
    .slice(0, 3);
  if (gambar.length) {
    pesan.push({
      role: "user",
      content: [{ type: "text", text: teksUser || "Perhatikan gambar ini dan jelaskan." }]
        .concat(gambar.map((u) => ({ type: "image_url", image_url: { url: u } }))),
    });
  } else {
    pesan.push({ role: "user", content: teksUser });
  }
  return pesan;
}

/* Kirim ke 9Router (protokol OpenAI): /chat/completions + Authorization: Bearer. */
function mintaKePenyedia({ model, pesan, mode, kunci, env, stream, signal }) {
  const p = penyediaTeks(env);
  const kepala = { "Content-Type": "application/json" };
  if (kunci) kepala.Authorization = `Bearer ${kunci}`;
  const isi = {
    model,
    temperature: SUHU[mode] ?? 0.6,
    max_tokens: MAX_TOKENS[mode] || 1200,
    stream: !!stream,
    messages: pesan,
  };
  return fetch(alamatPenyedia(env), {
    method: "POST",
    signal,
    headers: kepala,
    body: JSON.stringify(isi),
  });
}

async function galatPenyedia(r, env) {
  const t = await r.text();
  let pesan = `HTTP ${r.status}`;
  try {
    const j = JSON.parse(t);
    if (j && j.error) {
      /* sebagian gateway menjawab {"error":"Insufficient balance"} (teks, bukan objek) */
      if (typeof j.error === "string") pesan = String(j.error).slice(0, 200);
      else if (j.error.message) pesan = String(j.error.message).slice(0, 200);
    } else if (j && j.message) pesan = String(j.message).slice(0, 200);
  } catch {}
  if (kuotaHabis(r.status, t)) throw new Error("KUOTA|" + pesanKuota(t));
  /* saldo/kredit penyedia habis → katakan apa adanya, jangan disamarkan */
  if (/insufficient balance|insufficient credit|no credit|out of credits|saldo|kredit habis|quota exceeded/i.test(t)) {
    throw new Error("SALDO|saldo/kredit penyedia AI habis menurut jawaban penyedianya: \"" + pesan + "\". Isi ulang kredit di dasbor 9Router (menu billing/top-up), lalu coba lagi.");
  }
  /* kunci ditolak (bukan soal saldo) → jangan bilang "sibuk"; suruh periksa kuncinya */
  if (r.status === 401 || r.status === 403) {
    throw new Error("KUNCI|kunci penyedia AI ditolak penyedianya: \"" + pesan + "\". Periksa AI_API_KEY (dan AI_BASE_URL) pada penyedia yang dipakai, lalu coba lagi.");
  }
  /* 502/503/504 dari penyedia = gateway-nya sendiri yang tidak menjawab */
  if (env && penyediaTeks(env).router && (r.status === 502 || r.status === 503 || r.status === 504)) {
    throw new Error("ROUTERMATI|" + pesan);
  }
  throw new Error(pesan);
}

/* ── jawaban sekaligus (tanpa streaming) ── */
async function sekaliJalan(model, pesan, mode, kunci, env, signal) {
  const r = await mintaKePenyedia({ model, pesan, mode, kunci, env, stream: false, signal });
  if (!r.ok) return galatPenyedia(r, env);
  const mentah = await r.text();
  let d = null;
  try { d = JSON.parse(mentah); } catch (e) {
    /* gateway ini menjawab dengan aliran SSE walau diminta stream:false */
    if (/^\s*data:/m.test(mentah)) {
      const sse = teksDariSSE(mentah);
      if (sse.teks) return bersihkanPikir(sse.teks);
      throw new Error("jawaban kosong (aliran tanpa isi)");
    }
    throw new Error("jawaban penyedia bukan JSON: " + mentah.replace(/\s+/g, " ").slice(0, 120));
  }
  const c = d && d.choices && d.choices[0];
  let teks = (c && c.message && c.message.content) || (c && c.text) || "";
  /* sebagian model penalaran mengirim isi di beberapa bagian */
  if (Array.isArray(teks)) teks = teks.map((b) => (b && (b.text || b.content)) || "").join("");
  teks = bersihkanPikir(teks);
  if (!String(teks).trim()) throw new Error("jawaban kosong");
  return String(teks).trim();
}

/* ── jawaban mengalir: teruskan SSE penyedia ke browser ── */
function aliranDari(upstream, model, ac) {
  const enc = new TextEncoder();
  return new ReadableStream({
    async start(c) {
      c.enqueue(enc.encode("data: " + JSON.stringify({ model }) + "\n\n"));
      const rd = upstream.body.getReader();
      const dec = new TextDecoder();
      const saring = buatPenyaringPikir();
      let buf = "";
      let adaIsi = false;
      const kirimIsi = (teks) => {
        if (!teks) return;
        adaIsi = true;
        c.enqueue(enc.encode("data: " + JSON.stringify({ choices: [{ delta: { content: teks } }] }) + "\n\n"));
      };
      try {
        for (;;) {
          const { done, value } = await rd.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const baris = buf.split("\n");
          buf = baris.pop();
          for (const ln of baris) {
            const t = ln.trim();
            if (!t.startsWith("data:")) continue;
            const isi = t.slice(5).trim();
            if (!isi || isi === "[DONE]") continue;
            let j = null;
            try { j = JSON.parse(isi); } catch { /* potongan rusak → lewati */ }
            if (!j) continue;
            const d = (j.choices && j.choices[0] && j.choices[0].delta) || (j.choices && j.choices[0] && j.choices[0].message) || {};
            if (d.content) kirimIsi(saring.tulis(typeof d.content === "string" ? d.content : ""));
          }
        }
        kirimIsi(saring.sisa());
        if (!adaIsi) {
          c.enqueue(enc.encode("data: " + JSON.stringify({ error: "penyedia tidak mengirim isi jawaban (model " + model + ")" }) + "\n\n"));
        }
      } catch (e) {
        c.enqueue(enc.encode("data: " + JSON.stringify({ error: String((e && e.message) || e) }) + "\n\n"));
      }
      c.enqueue(enc.encode("data: [DONE]\n\n"));
      try { c.close(); } catch {}
    },
    cancel() { try { ac.abort(); } catch {} },
  });
}

async function cobaStream(model, pesan, mode, kunci, env) {
  const ac = new AbortController();
  const r = await mintaKePenyedia({ model, pesan, mode, kunci, env, stream: true, signal: ac.signal });
  if (!r.ok || !r.body) return galatPenyedia(r, env);
  return new Response(aliranDari(r, model, ac), {
    status: 200,
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}

async function tangani(request, env) {
  const origin = request.headers.get("Origin") || "";
  const c = cors(origin, env, request);
  const kunci = kunciDipakai(env);
  const penyedia = penyediaTeks(env);
  /* model selalu diambil dari 9Router (daftar milik akunmu).
     Untuk POST (percakapan) pakai jalur cepat supaya pengguna tidak menunggu
     probe yang lambat; untuk GET (halaman Setelan) boleh menunggu sepenuhnya. */
  const cepat = request.method === "POST";
  const antrean = penyedia.router ? await antreanLokal(env, cepat) : antreanMode(env);
  const antreanVisi = penyedia.visi === false
    ? []
    : (penyedia.router ? ((await visiLokal(env, cepat)) || antrean.fast || []) : (antrean.fast && antrean.fast.length ? antrean.fast : ANTREAN_VISI));

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: c });

  if (request.method === "GET") {
    const utama = {};
    for (const k of Object.keys(antrean)) utama[k] = antrean[k][0];
    const lokalSiap = penyedia.router ? (await daftarModelLokal(env)) !== null : false;
    return json({
      ok: true, ready: penyedia.router ? lokalSiap : !!kunci, modes: utama, model: utama.fast,
      penyedia: {
        nama: penyedia.nama, label: penyedia.label, kustom: penyedia.kustom, alamat: penyedia.dasar, lokal: penyedia.lokal,
        router: penyedia.router, dasarLokal: penyedia.dasarLokal, gaya: penyedia.gaya,
        modelDariRouter: penyedia.router && lokalSiap,
      },
      /* daftar lengkap supaya halaman Setelan bisa menawarkan pilihan model */
      daftarModel: antrean, daftarVisi: antreanVisi, modelTambahan: tambahan(env),
      pesan: penyedia.router
        ? (lokalSiap
          ? "siap — " + penyedia.label + " di " + penyedia.dasar
          : "belum bisa menghubungi " + penyedia.label + " di " + penyedia.dasar
            + (kunci ? " — periksa koneksi, atau kunci AI_API_KEY masih berlaku." : " — kunci AI_API_KEY belum dipasang."))
        : (kunci ? "siap" : "kunci API belum dipasang"),
    }, 200, c);
  }
  if (request.method !== "POST") return json({ ok: false, pesan: "Gunakan GET atau POST" }, 405, c);

  /* hanya halaman yang dikenal boleh memakai kuota AI ini */
  if (!asalDiizinkan(request, env)) {
    audit("asal-ditolak", { endpoint: "chat", origin, ip: String(request.headers.get("x-forwarded-for") || "").split(",")[0] });
    return json({ ok: false, pesan: "Permintaan dari alamat asal yang tidak dikenal ditolak." }, 403, c);
  }

  const ip = String(request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  if (kenaBatas(ip)) return json({ ok: false, pesan: "Terlalu banyak permintaan — tunggu 1 menit lalu coba lagi." }, 429, c);


  let body;
  try { body = JSON.parse(await request.text()); } catch { return json({ ok: false, pesan: "JSON tidak valid" }, 400, c); }

  const prompt = teksMasuk(body.prompt, 24000);
  if (!prompt.trim()) return json({ ok: false, pesan: "Pertanyaan masih kosong." }, 400, c);

  /* Gerbang di sini SENGAJA hanya untuk hal yang pasti (kunci belum dipasang /
     kunci ditolak). Hasil "uji daftar model" TIDAK memblokir percakapan:
     probe yang lambat/gagal sesaat dulu membuat aplikasi berkata "penyedia mati"
     padahal percakapan sebenarnya bisa. Sekarang percakapan selalu dicoba dulu,
     dan kalau memang gagal, pesannya menyebut penyebab yang sebenarnya. */
  if (!penyedia.adaKunci) {
    audit("kunci-kosong", { penyedia: penyedia.nama, alamat: penyedia.dasar, asal: "gerbang-awal" });
    return json({ ok: false, kunci: true, pesan: pesanKunciKosong(penyedia) }, 401, c);
  }
  if (kunciDitolakTerakhir()) {
    audit("kunci-ditolak", { penyedia: penyedia.nama, alamat: penyedia.dasar, asal: "gerbang-awal" });
    return json({ ok: false, kunci: true, pesan: pesanKunciDitolak(penyedia) }, 401, c);
  }

  /* jaring pengaman: kalau penyedia tidak bergaya router tetapi kuncinya kosong */
  if (!kunci) return json({ ok: false, pesan: "Kunci API belum dipasang di server." }, 500, c);


  const mode = MODE_SAH.includes(body.mode) ? body.mode : "fast";
  /* validasi gambar: hanya data-URL gambar yang sah, ukuran & jumlah dibatasi */
  const saring = saringGambar(body.gambar);
  const gambar = saring.sah;
  const adaGambar = gambar.length > 0;
  /* Permintaan internal dari aplikasi sendiri (builder/riset/perbaiki berkas):
     jawabannya dipakai sebagai data (JSON, isi berkas), jadi TIDAK dikenakan
     pemeriksa perintah bentuk — pemeriksa itu untuk pertanyaan pengguna. */
  const internal = body.internal === true;
  const aturanKetatAwal = internal ? [] : perintahKetat(prompt);
  /* proyek dengan aturan coding + pertanyaan yang meminta kode → bahasa kode
     ikut diperiksa (bukan cuma diminta lewat prompt sistem) */
  const MINTA_KODE = /\b(kode|kodenya|code|fungsi|function|method|metode|skrip|script|class|kelas|komponen|component|query|sql|program|aplikasi|api|endpoint|html|css|refactor|perbaiki|debug|error|bug|implementasi|algoritma|snippet|contoh|tulis)\b/i;
  const teknologiProyek = MINTA_KODE.test(String(prompt || "")) ? teknologiDiminta(body.proyek, prompt) : "";
  if (teknologiProyek) aturanKetatAwal.push({ jenis: "teknologi", nama: teknologiProyek });
  /* Penyedia yang modelnya belum bisa melihat gambar (mis. Pollinations tanpa
     kunci) → katakan apa adanya, jangan mengirim gambar ke model yang salah. */
  if (adaGambar && penyedia.visi === false) {
    return json({
      ok: false,
      pesan: "Penyedia yang sedang dipakai (" + penyedia.label + ") belum bisa melihat gambar. "
        + "Pakai penyedia yang bisa melihat gambar: isi AI_PROVIDER=gemini + AI_API_KEY kunci gratis dari aistudio.google.com "
        + "(atau AI_PROVIDER=9router), lalu coba lagi. Pertanyaan tanpa gambar tetap bisa dijawab seperti biasa.",
    }, 400, c);
  }
  /* permintaan ketat diperiksa dulu → dikirim utuh (bukan mengalir) supaya bisa diperbaiki
     (penyedia tanpa streaming — mis. Pollinations — juga dikirim utuh) */
  const inginStream = body.stream !== false && !adaGambar && aturanKetatAwal.length === 0
    && penyedia.stream !== false;
  if (saring.catatan) audit("gambar-disaring", { catatan: saring.catatan, ip });
  const pesan = susunPesan(body.riwayat, prompt, { gambar, memori: body.memori, proyek: body.proyek });
  audit("permintaan-chat", { mode, gambar: gambar.length, ip, stream: inginStream, internal, ketat: aturanKetatAwal.map((a) => a.jenis) });
  /* pilihan model dari pengguna (Setelan → Model AI), hanya dari daftar yang sah */
  const pilihModel = teksMasuk(body.model, 120);
  const sahModel = new Set([].concat(
    (cacheLokal && cacheLokal.daftar) || [], antrean.fast, antrean.think, antrean.deep, antrean.expert, antreanVisi, tambahan(env),
  ));
  let kandidat = adaGambar ? antreanVisi : (antrean[mode] || antrean.fast);
  if (pilihModel && sahModel.has(pilihModel)) {
    kandidat = [pilihModel].concat(kandidat.filter((m) => m !== pilihModel));
    audit("model-dipilih", { mode, model: pilihModel, ip });
  }
  let terakhir = "tidak diketahui";
  let galatRouter = 0, galatLain = 0;

  for (const model of kandidat) {
    try {
      if (inginStream) {
        const r = await cobaStream(model, pesan, mode, kunci, env);
        /* sebagian penyedia mengabaikan stream:true dan menjawab JSON biasa →
           jangan diteruskan sebagai aliran kosong, ambil isinya apa adanya */
        const ct = String(r.headers.get("content-type") || "");
        if (r.ok && ct && ct.indexOf("text/event-stream") < 0) {
          const sse = teksDariSSE(await r.text());
          if (sse.teks) {
            catatTerbukti(mode, model);
            return json({ ok: true, text: bersihkanPikir(sse.teks), model, mode }, 200, c);
          }
          throw new Error("jawaban kosong dari " + model);
        }
        if (r.ok) catatTerbukti(mode, model);
        const kepala = new Headers(r.headers);
        Object.entries(c).forEach(([k, v]) => kepala.set(k, v));
        return new Response(r.body, { status: 200, headers: kepala });
      }
      let teks = await sekaliJalan(model, pesan, mode, kunci, env);
      catatTerbukti(mode, model);
      let diperbaiki = 0, bentukTidakPas = false, alasanTidakPas = "";
      if (aturanKetatAwal.length) {
        let hasil = periksaJawaban(teks, aturanKetatAwal);
        let terbaik = teks;
        /* sampai dua putaran perbaikan; kalau tetap tidak pas, jawaban yang
           paling dekat dengan bentuk yang diminta yang dipakai */
        for (let putaran = 0; hasil.gagal && putaran < 3; putaran++) {
          audit("perbaikan-bentuk", { jenis: hasil.jenis, alasan: hasil.alasan, putaran: putaran + 1, ip });
          const pesanPerbaikan = pesan.concat([
            { role: "assistant", content: String(teks).slice(0, 4000) },
            { role: "user", content: instruksiPerbaikan(aturanKetatAwal, hasil, putaran) },
          ]);
          try {
            const ulang = await sekaliJalan(model, pesanPerbaikan, mode, kunci, env);
            if (ulang && String(ulang).trim()) {
              diperbaiki++;
              if (jarakBentuk(ulang, aturanKetatAwal) <= jarakBentuk(terbaik, aturanKetatAwal)) terbaik = ulang;
              teks = ulang;
            }
          } catch (e) { break; }
          hasil = periksaJawaban(teks, aturanKetatAwal);
        }
        if (hasil.gagal) {
          bentukTidakPas = true;
          teks = terbaik;
          audit("bentuk-tidak-pas", { alasan: hasil.alasan, jenis: hasil.jenis, ip });
        }
        alasanTidakPas = hasil.gagal ? hasil.alasan : "";
      }
      return json({
        ok: true, text: teks, model, mode,
        bentukDiperiksa: aturanKetatAwal.map((a) => a.jenis), diperbaiki,
        bentukTidakPas,
        catatanBentuk: bentukTidakPas ? ("Jawaban belum persis seperti yang kamu minta (" + alasanTidakPas + ") — sudah dicoba tiga kali diperbaiki.") : undefined,
      }, 200, c);
    } catch (e) {
      const m = String((e && e.message) || e);
      /* kuota habis → ganti model tidak akan menolong, beri tahu apa adanya */
      if (m.indexOf("KUOTA|") === 0) return json({ ok: false, kuota: true, pesan: m.slice(6) }, 429, c);
      if (m.indexOf("SALDO|") === 0) return json({ ok: false, saldo: true, pesan: m.slice(6) }, 402, c);
      if (m.indexOf("KUNCI|") === 0) return json({ ok: false, kunci: true, pesan: m.slice(6) }, 401, c);
      /* Masalah tingkat-penyedia (tidak bisa dihubungi / gateway menjawab 502-504).
         SENGAJA tidak langsung berhenti: banyak gateway mengembalikan 503 hanya
         untuk model tertentu yang kredensialnya tidak aktif, sementara model
         lain normal. Semua kandidat dicoba dulu; kalau memang SEMUANYA gagal
         karena alasan ini, barulah dilaporkan sebagai penyedia bermasalah. */
      if (RX_MODEL_MATI.test(m)) catatTidakAda(model);
      if (m.indexOf("ROUTERMATI|") === 0 || (penyedia.router && /fetch failed|ECONNREFUSED|connect|network|Failed to fetch|timed out|timeout/i.test(m))) {
        galatRouter++;
        terakhir = m.indexOf("ROUTERMATI|") === 0 ? m.slice(11) : m;
        continue;
      }
      galatLain++;
      terakhir = m;
      /* model bermasalah → lanjut ke model cadangan berikutnya */
    }
  }
  /* semua kandidat gagal, dan semuanya karena masalah tingkat-penyedia
     (tidak bisa dihubungi / 502-504) → laporkan penyedia yang bermasalah */
  if (galatRouter > 0 && galatLain === 0) {
    if (!penyedia.adaKunci) {
      audit("kunci-kosong", { penyedia: penyedia.nama, alamat: penyedia.dasar, ip });
      return json({ ok: false, kunci: true, pesan: pesanKunciKosong(penyedia) }, 401, c);
    }
    if (kunciDitolakTerakhir()) {
      audit("kunci-ditolak", { penyedia: penyedia.nama, alamat: penyedia.dasar, ip });
      return json({ ok: false, kunci: true, pesan: pesanKunciDitolak(penyedia) }, 401, c);
    }
    audit("penyedia-mati", { penyedia: penyedia.nama, alamat: penyedia.dasar, ip, sebab: sebabLokalTerakhir(), percobaan: galatRouter });
    return json({ ok: false, pesan: pesanPenyediaMati(penyedia, env, sebabLokalTerakhir()) }, 502, c);
  }
  /* kandidat gagal karena alasan model (mis. tidak punya kredensial aktif di
     gateway itu) → katakan apa adanya, sertakan galat terakhir penyedia */
  const bersih = String(terakhir || "").replace(/\s+/g, " ").slice(0, 160);
  return json({
    ok: false,
    pesan: "Tidak ada model yang bisa dipakai dari " + penyedia.label + ". Galat terakhir dari penyedia: " + bersih
      + ". Buka /api/health?uji=1 untuk diagnosa, atau pilih model lain di Setelan → Model AI"
      + (penyedia.kustom ? " (sebagian model di gateway ini memang tidak punya kredensial aktif)." : "."),
  }, 502, c);
}

/* diekspor supaya bisa diuji tanpa memanggil AI: node tools/uji-bentuk.mjs */
export { catatTidakAda, baruMati, RX_MODEL_MATI, catatTerbukti, modelTerbukti, perintahKetat, periksaJawaban, hitungKata, instruksiPerbaikan, susunPesan, jarakBentuk, teknologiDiminta, cocokTeknologi, blokKode, kunciTeknologi, antreanLokal, visiLokal, daftarModelLokal, daftarModelCepat, pilihModelMode, kunciDitolakTerakhir, pesanKunciDitolak, pesanKunciKosong, pesanPenyediaMati, sebabLokalTerakhir, tangani };

export const config = { runtime: "edge" };

/* env diambil dari process.env (berlaku di hosting Vercel maupun server lokal) */
function envProses(tambahanEnv) {
  const dasar = (typeof process !== "undefined" && process.env) || {};
  const p = { ...dasar, ...(tambahanEnv || {}) };
  const kunci = {};
  for (const k of [
    "AI_PROVIDER", "AI_BASE_URL", "AI_API_KEY", "NINE_API_KEY", "AI_MODEL", "AI_MODELS", "AI_MODEL_VISI",
    "AI_MODEL_FAST", "AI_MODEL_THINK", "AI_MODEL_DEEP", "AI_MODEL_EXPERT", "MODELS_JSON",
    "ALLOWED_ORIGINS", "APP_URL", "AI_MODEL_IZIN", "AI_CADANGAN",
    "VERCEL", "VERCEL_ENV", "VERCEL_URL", "HOSTING",
  ]) if (p[k] !== undefined) kunci[k] = p[k];
  return kunci;
}

export default async function (request, env) {
  return tangani(request, envProses(env));
}
