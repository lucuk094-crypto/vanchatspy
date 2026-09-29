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
 *    Akun ini memakai model ":free" OpenRouter: batasnya 50 permintaan
 *    per hari (bukan per mode). Kalau habis, server menjawab 429 dengan
 *    { kuota: true, pesan } berisi jam pengisian ulang (07.00 WIB).
 *
 *  KUNCI API
 *    • Utama  : env OPENROUTER_KEY (bisa diatur di dashboard hosting)
 *    • Cadangan: KUNCI_BAWAAN di bawah — sudah terpasang, jadi paket ini
 *      langsung jalan tanpa setelan tambahan.
 * ════════════════════════════════════════════════════════════════════
 */

const KUNCI_BAWAAN = "sk-or-v1-DIHAPUS-F27";

/* lapisan bersama: penyedia AI yang bisa dikonfigurasi + pengaman permintaan */
import { penyediaTeks } from "./_ai.js";
import { periksaGambar as saringGambar, teksMasuk, audit, asalDiizinkan } from "./_aman.js";

/* Model per mode. Semua ":free" — cocok dengan kuota akun ini. */
const ANTREAN = {
  fast: [
    "inclusionai/ling-3.0-flash-sante:free",   /* tercepat ~1,5 dtk */
    "dots-studio/dots-3-note-preview:free",    /* ~3 dtk */
    "deepseek/deepseek-v4-flash-0731:free",
    "nvidia/nemotron-3.5-lightning:free",
  ],
  think: [
    "dots-studio/dots-3-note-preview:free",    /* tulisan rapi + kode panjang */
    "inclusionai/ling-3.0-flash-sante:free",
    "nex-agi/nex-n2.5-pro:free",
  ],
  deep: [
    "nex-agi/nex-n2.5-pro:free",
    "dots-studio/dots-3-note-preview:free",
    "deepseek/deepseek-v4-flash-0731:free",
  ],
  expert: [
    "nvidia/nemotron-3-super-120b-a12b:free",
    "nex-agi/nex-n2.5-pro:free",
    "cohere/north-mini-code:free",
    "deepseek/deepseek-v4-flash-0731:free",
  ],
};

/* Model gratis yang bisa MELIHAT gambar (modalitas masukan: image).
   Dipakai begitu pengguna melampirkan foto/screenshot. */
const ANTREAN_VISI = [
  "dots-studio/dots-3-note-preview:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "qwen/qwen3.8-27b:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
];

const MAX_TOKENS = { fast: 1200, think: 2500, deep: 3000, expert: 4000 };
/* Catatan: semua nama di atas adalah model ":free" (kuota akun ini 50/hari).
   Kalau kamu memasang kunci berbayar sendiri, daftarkan model tambahan lewat
   env AI_MODEL_IZIN (dipisah koma) — hanya model yang terdaftar di situ yang
   boleh dipilih dari aplikasi, supaya tidak ada permintaan ke model asing. */
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

/* ── kuota harian penyedia AI (50 permintaan/hari untuk model :free) ── */
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
function pesanKuota(detail) {
  let reset = "";
  try {
    const j = JSON.parse(String(detail || "{}"));
    const h = (j && j.error && j.error.metadata && j.error.metadata.headers) || {};
    reset = h["X-RateLimit-Reset"] || h["x-ratelimit-reset"] || "";
  } catch {}
  return "kuota gratis harian sudah habis — batas 50 pesan/hari dari penyedia AI. " +
    "Kuota terisi ulang otomatis pukul " + jamResetWIB(reset) + ". " +
    "Sementara itu percakapan lama masih bisa dibaca, dan ruang kerja tetap bisa dipakai untuk berkas yang sudah ada.";
}

/* kunci & alamat penyedia ditentukan di _ai.js — ganti AI_PROVIDER / AI_API_KEY
   untuk memakai penyedia lain tanpa mengubah berkas ini */
const kunciDipakai = (env) => penyediaTeks(env).kunci;
const alamatPenyedia = (env) => penyediaTeks(env).dasar + "/chat/completions";

/* ── daftar model dari penyedia lokal (9Router/Ollama/LM Studio) ───────
   Diambil dari GET {dasar}/models supaya aplikasi memakai model yang
   BENAR-BENAR ada di router itu (nama model OpenRouter seperti
   "inclusionai/ling-3.0-flash-sante:free" tidak berlaku di 9Router).
   Hasilnya disimpan 60 detik supaya tidak memanggil berulang. */
let cacheLokal = { dasar: "", ts: 0, daftar: [], ok: false, kode: 0 };
/* pemeriksaan terakhir GAGAL karena kuncinya ditolak (bukan karena penyedia mati)?
   Dipakai supaya pesannya tidak menyesatkan ("pastikan sudah jalan") saat
   alamatnya sebenarnya menjawab, hanya kuncinya salah. */
const kunciDitolakTerakhir = () => cacheLokal.kode === 401 || cacheLokal.kode === 403;
async function daftarModelLokal(env) {
  const p = penyediaTeks(env);
  if (!p.router) return null;   /* penyedia bergaya router: 9Router (lokal/tunnel/VPS), Ollama, LM Studio */
  const kini = Date.now();
  /* hasil yang tersimpan hanya dipercaya kalau memang pernah BERHASIL;
     percobaan yang gagal tidak boleh dianggap "daftar kosong" (nanti model
     penyedia lain yang dipakai) — harus null = tidak bisa dihubungi */
  if (cacheLokal.dasar === p.dasar && kini - cacheLokal.ts < 60000) return cacheLokal.ok ? cacheLokal.daftar : null;
  try {
    const h = { "Content-Type": "application/json" };
    if (p.kunci) {
      if (p.gaya === "anthropic") { h["x-api-key"] = p.kunci; h["anthropic-version"] = "2023-06-01"; }
      else h.Authorization = "Bearer " + p.kunci;
    }
    const r = await fetch(p.dasar + "/models", {
      headers: h,
      signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined,
    });
    if (!r.ok) throw Object.assign(new Error("HTTP " + r.status), { status: r.status });
    const j = await r.json();
    const daftar = (j.data || j.models || [])
      .map((m) => String((m && (m.id || m.name)) || "").trim())
      .filter(Boolean).slice(0, 80);
    cacheLokal = { dasar: p.dasar, ts: kini, daftar, ok: daftar.length > 0, kode: 0 };
    return daftar.length ? daftar : null;
  } catch (e) {
    /* router belum bisa dihubungi → coba lagi 5 detik kemudian (bukan menunggu 60 detik),
       supaya begitu 9Router dinyalakan web langsung ikut aktif tanpa di-restart */
    cacheLokal = { dasar: p.dasar, ts: kini - 55000, daftar: [], ok: false, kode: Number((e && e.status) || 0) };
    return null;
  }
}

/* apakah model ditentukan sendiri oleh pengguna (env)? kalau ya, jangan menyerah
   hanya karena daftar model router belum terbaca */
const adaModelPaksa = (env) => ["AI_MODELS", "AI_MODEL", "AI_MODEL_FAST", "AI_MODEL_THINK", "AI_MODEL_DEEP", "AI_MODEL_EXPERT", "AI_MODEL_VISI"]
  .some((k) => String((env && env[k]) || "").trim());

/* kunci ditolak penyedia (alamatnya menjawab, kuncinya salah) */
function pesanKunciDitolak(penyedia) {
  return "kunci penyedia AI ditolak penyedianya (" + penyedia.nama + " di " + penyedia.dasar
    + "). Periksa AI_API_KEY — di NaraRouter kunci harus berawalan sk-nry- dan diambil dari halaman API keys di dasbor;"
    + " kalau baru diganti/di-rotasi, pakai kunci yang paling baru lalu coba lagi.";
}

/* pesan apa adanya saat penyedia lokal (9Router) belum jalan */
function pesanLokalMati(penyedia, env) {
  const namaTampil = penyedia.nama === "9router" ? "9Router" : penyedia.nama;
  /* di hosting (Vercel) alamat 127.0.0.1/localhost menunjuk ke server hosting itu sendiri,
     bukan ke komputer pengguna — jelaskan supaya tidak bingung */
  const diHosting = !!(env && (env.VERCEL || env.HOSTING)) && penyedia.dasarLokal;
  if (diHosting) {
    return "Alamat " + penyedia.dasar + " tidak bisa dipakai dari hosting (Vercel): di sana "
      + "127.0.0.1/localhost menunjuk ke server Vercel sendiri, bukan ke komputermu. "
      + "Buka 9Router-mu ke internet dulu (mis. `cloudflared tunnel --url http://127.0.0.1:20128` "
      + "atau named tunnel dengan domain tetap), lalu set di Vercel: "
      + "AI_PROVIDER=9router · AI_BASE_URL=https://alamat-tunnel-mu/v1 · AI_API_KEY=<kunci 9Router>, "
      + "dan deploy ulang. Panduan lengkap: DEPLOY.md bagian C.";
  }
  if (penyedia.dasarLokal) {
    return "Tidak bisa menghubungi " + namaTampil + " di " + penyedia.dasar + ". "
      + (penyedia.nama === "9router"
        ? 'Jalankan 9Router dulu di CMD/terminal — tulis `9router` sampai muncul "Server ready" dan dashboard terbuka di http://localhost:20128/dashboard — lalu kirim ulang pesanmu.'
        : "Pastikan penyedia AI lokal itu sudah jalan, lalu coba lagi.");
  }
  /* 9Router di mesin lain (VPS / rumah yang dibuka lewat tunnel) */
  return "Tidak bisa menghubungi " + namaTampil + " di " + penyedia.dasar + ". "
    + "Pastikan 9Router di alamat itu sedang jalan dan alamatnya berakhiran /v1"
    + (penyedia.kunci ? "" : " — kalau 9Router itu memakai kunci, isi dulu AI_API_KEY")
    + ". Kalau 9Router-mu ada di komputer sendiri, pakai http://127.0.0.1:20128/v1 dan jalankan web ini di komputer yang sama.";
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
/* antrean model: khusus untuk penyedia lokal — model pilihan lebih dulu,
   sisanya jadi cadangan bila model itu gagal */
async function antreanLokal(env) {
  const daftar = await daftarModelLokal(env);
  const dasar = antreanMode(env);
  if (!daftar || !daftar.length) return dasar;
  const jelas = String(env.AI_MODELS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const hasil = {};
  for (const mode of ["fast", "think", "deep", "expert"]) {
    if (jelas.length) { hasil[mode] = jelas.slice(0, 8); continue; }
    const utama = pilihModelMode(mode, daftar, env);
    hasil[mode] = utama ? [utama].concat(daftar.filter((d) => d !== utama).slice(0, 3)) : daftar.slice(0, 3);
  }
  return hasil;
}
/* model yang bisa melihat gambar di penyedia lokal */
async function visiLokal(env) {
  const daftar = await daftarModelLokal(env);
  if (!daftar || !daftar.length) return null;
  if (env.AI_MODEL_VISI) return [String(env.AI_MODEL_VISI)];
  const kena = daftar.filter((d) => /vl|vision|omni|multimodal|gemini|gpt-4|gpt-5|sonnet|claude|dots|qwen.*vl|llava|pixtral/i.test(d));
  return kena.length ? kena.slice(0, 5) : daftar.slice(0, 3);
}

function antreanMode(env) {
  if (!env.MODELS_JSON) return ANTREAN;
  try {
    const ubah = JSON.parse(env.MODELS_JSON);
    if (!ubah || typeof ubah !== "object") return ANTREAN;
    const hasil = { ...ANTREAN };
    for (const k of Object.keys(ubah)) hasil[k] = Array.isArray(ubah[k]) ? ubah[k] : [ubah[k]];
    return hasil;
  } catch { return ANTREAN; }
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

/* Ubah daftar pesan gaya-OpenAI menjadi bentuk yang dipahami API Anthropic:
   system dipisah, gambar jadi blok "image" berisi base64, dan pesan berurutan
   dengan peran sama digabung (Anthropic menuntut peran bergantian). */
function pesanAntropis(pesan) {
  const sistem = [];
  const isi = [];
  const dorong = (peran, bagian) => {
    const akhir = isi[isi.length - 1];
    if (akhir && akhir.role === peran) akhir.content = akhir.content.concat([{ type: "text", text: "\n\n" }], bagian);
    else isi.push({ role: peran, content: bagian });
  };
  for (const m of Array.isArray(pesan) ? pesan : []) {
    if (!m) continue;
    if (m.role === "system") { if (typeof m.content === "string") sistem.push(m.content); continue; }
    const peran = m.role === "assistant" ? "assistant" : "user";
    if (typeof m.content === "string") { if (m.content.trim()) dorong(peran, [{ type: "text", text: m.content }]); continue; }
    const bagian = [];
    for (const b of Array.isArray(m.content) ? m.content : []) {
      if (!b) continue;
      if (b.type === "text" && String(b.text || "").trim()) { bagian.push({ type: "text", text: String(b.text) }); continue; }
      if (b.type === "image_url") {
        const url = String((b.image_url && b.image_url.url) || "");
        const cocok = url.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
        if (cocok) bagian.push({ type: "image", source: { type: "base64", media_type: cocok[1].toLowerCase(), data: cocok[2] } });
        continue;
      }
      bagian.push(b);
    }
    if (bagian.length) dorong(peran, bagian);
  }
  return { sistem: sistem.join("\n\n"), pesan: isi };
}

function mintaKePenyedia({ model, pesan, mode, kunci, env, stream, signal }) {
  const p = penyediaTeks(env);
  const kepala = { "Content-Type": "application/json" };
  if (p.gaya === "anthropic") {
    /* Anthropic (dan relay Claude Code): x-api-key + anthropic-version, endpoint /messages */
    if (kunci) kepala["x-api-key"] = kunci;
    kepala["anthropic-version"] = "2023-06-01";
    const ubah = pesanAntropis(pesan);
    const isiA = {
      model,
      max_tokens: MAX_TOKENS[mode] || 1200,
      temperature: SUHU[mode] ?? 0.6,
      stream: !!stream,
      messages: ubah.pesan,
    };
    if (ubah.sistem) isiA.system = ubah.sistem;
    return fetch(p.dasar + "/messages", {
      method: "POST",
      signal,
      headers: kepala,
      body: JSON.stringify(isiA),
    });
  }
  if (kunci) kepala.Authorization = `Bearer ${kunci}`;     /* 9Router boleh tanpa kunci */
  if (p.nama === "openrouter") {
    kepala["HTTP-Referer"] = env.APP_URL || "https://van-chat-spy.local";
    kepala["X-Title"] = "Van Chat.SPY";
  }
  const isi = {
    model,
    temperature: SUHU[mode] ?? 0.6,
    max_tokens: MAX_TOKENS[mode] || 1200,
    stream: !!stream,
    messages: pesan,
  };
  /* hanya OpenRouter: tanpa ini model penalaran memakai jatah token untuk
     "berpikir" dan jawaban yang sampai ke pengguna bisa kosong. Router lokal
     (9Router) tidak perlu — bahkan sebagian proxy menolak kolom asing. */
  if (p.nama === "openrouter") isi.reasoning = { enabled: false };
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
    throw new Error("SALDO|saldo/kredit penyedia AI habis menurut jawaban penyedianya: \"" + pesan + "\". Isi ulang saldo di dasbor penyedia (untuk cc.freemodel.dev: halaman pembelian kredit), lalu coba lagi.");
  }
  /* kunci ditolak (bukan soal saldo) → jangan bilang "sibuk"; suruh periksa kuncinya */
  if (r.status === 401 || r.status === 403) {
    throw new Error("KUNCI|kunci penyedia AI ditolak penyedianya: \"" + pesan + "\". Periksa AI_API_KEY (dan AI_BASE_URL) pada penyedia yang dipakai, lalu coba lagi.");
  }
  /* 502/503/504 dari penyedia bergaya router = 9Router-nya sendiri yang tak menjawab
     (lewat tunnel/alamat lain, gateway-nya sudah menjawab lebih dulu) */
  if (env && penyediaTeks(env).router && (r.status === 502 || r.status === 503 || r.status === 504)) {
    throw new Error("ROUTERMATI|" + pesan);
  }
  throw new Error(pesan);
}

/* ── jawaban sekaligus (tanpa streaming) ── */
async function sekaliJalan(model, pesan, mode, kunci, env, signal) {
  const r = await mintaKePenyedia({ model, pesan, mode, kunci, env, stream: false, signal });
  if (!r.ok) return galatPenyedia(r, env);
  const d = await r.json();
  let teks = "";
  if (penyediaTeks(env).gaya === "anthropic") {
    teks = (Array.isArray(d && d.content) ? d.content : [])
      .filter((b) => b && (b.type === "text" || b.type === undefined))
      .map((b) => String(b.text || "")).join("");
  } else {
    const c = d && d.choices && d.choices[0];
    teks = (c && c.message && c.message.content) || (c && c.text) || "";
  }
  if (!String(teks).trim()) throw new Error("jawaban kosong");
  return String(teks).trim();
}

/* ── jawaban mengalir: teruskan SSE penyedia ke browser ── */
function aliranDari(upstream, model, ac, gaya) {
  const enc = new TextEncoder();
  return new ReadableStream({
    async start(c) {
      c.enqueue(enc.encode("data: " + JSON.stringify({ model }) + "\n\n"));
      const rd = upstream.body.getReader();
      try {
        if (gaya === "anthropic") {
          /* SSE Anthropic (event: content_block_delta / delta.text) → bentuk OpenAI
             supaya halaman tidak perlu tahu penyedianya siapa */
          const dec = new TextDecoder();
          let sisa = "";
          for (;;) {
            const { done, value } = await rd.read();
            if (done) break;
            sisa += dec.decode(value, { stream: true });
            let potong;
            while ((potong = sisa.indexOf("\n")) >= 0) {
              const baris = sisa.slice(0, potong).trim();
              sisa = sisa.slice(potong + 1);
              if (!baris || baris.startsWith("event:") || !baris.startsWith("data:")) continue;
              const isi = baris.slice(5).trim();
              if (!isi || isi === "[DONE]") continue;
              let j;
              try { j = JSON.parse(isi); } catch { continue; }
              if (j.type === "content_block_delta" && j.delta && typeof j.delta.text === "string") {
                c.enqueue(enc.encode("data: " + JSON.stringify({ choices: [{ index: 0, delta: { content: j.delta.text } }] }) + "\n\n"));
              } else if (j.type === "error") {
                c.enqueue(enc.encode("data: " + JSON.stringify({ error: (j.error && j.error.message) || "galat penyedia" }) + "\n\n"));
              }
            }
          }
        } else {
          for (;;) {
            const { done, value } = await rd.read();
            if (done) break;
            c.enqueue(value);
          }
        }
      } catch (e) {
        c.enqueue(enc.encode("data: " + JSON.stringify({ error: String(e && e.message || e) }) + "\n\n"));
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
  return new Response(aliranDari(r, model, ac, penyediaTeks(env).gaya), {
    status: 200,
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}

async function tangani(request, env) {
  const origin = request.headers.get("Origin") || "";
  const c = cors(origin, env, request);
  const kunci = kunciDipakai(env);
  const penyedia = penyediaTeks(env);
  /* penyedia lokal (9Router/Ollama/LM Studio) → pakai daftar model dari router;
     penyedia awan → daftar bawaan OpenRouter */
  /* penyedia bergaya router: cek dulu router-nya hidup atau tidak */
  const lokalMati = penyedia.router && !adaModelPaksa(env) ? (await daftarModelLokal(env)) === null : false;
  const antrean = penyedia.router ? await antreanLokal(env) : antreanMode(env);
  const antreanVisi = penyedia.router ? ((await visiLokal(env)) || antrean.fast || []) : ANTREAN_VISI;

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: c });

  if (request.method === "GET") {
    const utama = {};
    for (const k of Object.keys(antrean)) utama[k] = antrean[k][0];
    const lokalSiap = penyedia.router ? (await daftarModelLokal(env)) !== null : false;
    return json({
      ok: true, ready: penyedia.router ? lokalSiap : !!kunci, modes: utama, model: utama.fast,
      penyedia: {
        nama: penyedia.nama, alamat: penyedia.dasar, lokal: penyedia.lokal,
        router: penyedia.router, dasarLokal: penyedia.dasarLokal, gaya: penyedia.gaya,
        modelDariRouter: penyedia.router && lokalSiap,
      },
      /* daftar lengkap supaya halaman Setelan bisa menawarkan pilihan model */
      daftarModel: antrean, daftarVisi: antreanVisi, modelTambahan: tambahan(env),
      pesan: penyedia.router
        ? (lokalSiap
          ? "siap — " + (penyedia.nama === "9router" ? "9Router" : penyedia.nama) + " di " + penyedia.dasar
          : (penyedia.nama === "9router" ? "9Router" : penyedia.nama) + " di " + penyedia.dasar + " belum bisa dihubungi — "
            + (penyedia.dasarLokal ? "jalankan dulu di terminal." : "pastikan 9Router di mesin itu hidup."))
        : (kunci ? "siap" : "kunci API belum dipasang"),
    }, 200, c);
  }
  if (request.method !== "POST") return json({ ok: false, pesan: "Gunakan GET atau POST" }, 405, c);
  /* 9Router belum jalan → katakan apa adanya; begitu dinyalakan, pesan berikutnya langsung jalan */
  if (lokalMati) {
    if (kunciDitolakTerakhir()) {
      audit("kunci-ditolak", { penyedia: penyedia.nama, alamat: penyedia.dasar, asal: "gerbang-awal" });
      return json({ ok: false, kunci: true, pesan: pesanKunciDitolak(penyedia) }, 401, c);
    }
    audit("penyedia-lokal-mati", { penyedia: penyedia.nama, alamat: penyedia.dasar, asal: "gerbang-awal" });
    return json({ ok: false, pesan: pesanLokalMati(penyedia, env), penyedia: { nama: penyedia.nama, alamat: penyedia.dasar, lokal: penyedia.lokal, router: penyedia.router, dasarLokal: penyedia.dasarLokal } }, 502, c);
  }

  /* hanya halaman yang dikenal boleh memakai kuota AI ini */
  if (!asalDiizinkan(request, env)) {
    audit("asal-ditolak", { endpoint: "chat", origin, ip: String(request.headers.get("x-forwarded-for") || "").split(",")[0] });
    return json({ ok: false, pesan: "Permintaan dari alamat asal yang tidak dikenal ditolak." }, 403, c);
  }

  const ip = String(request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  if (kenaBatas(ip)) return json({ ok: false, pesan: "Terlalu banyak permintaan — tunggu 1 menit lalu coba lagi." }, 429, c);

  if (!kunci) return json({ ok: false, pesan: "Kunci API belum dipasang di server." }, 500, c);

  let body;
  try { body = JSON.parse(await request.text()); } catch { return json({ ok: false, pesan: "JSON tidak valid" }, 400, c); }

  const prompt = teksMasuk(body.prompt, 24000);
  if (!prompt.trim()) return json({ ok: false, pesan: "Pertanyaan masih kosong." }, 400, c);

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
  /* permintaan ketat diperiksa dulu → dikirim utuh (bukan mengalir) supaya bisa diperbaiki */
  const inginStream = body.stream !== false && !adaGambar && aturanKetatAwal.length === 0;
  if (saring.catatan) audit("gambar-disaring", { catatan: saring.catatan, ip });
  const pesan = susunPesan(body.riwayat, prompt, { gambar, memori: body.memori, proyek: body.proyek });
  audit("permintaan-chat", { mode, gambar: gambar.length, ip, stream: inginStream, internal, ketat: aturanKetatAwal.map((a) => a.jenis) });
  /* pilihan model dari pengguna (Setelan → Model AI), hanya dari daftar yang sah */
  const pilihModel = teksMasuk(body.model, 120);
  const sahModel = new Set([].concat(antrean.fast, antrean.think, antrean.deep, antrean.expert, antreanVisi, tambahan(env)));
  let kandidat = adaGambar ? antreanVisi : (antrean[mode] || antrean.fast);
  if (pilihModel && sahModel.has(pilihModel)) {
    kandidat = [pilihModel].concat(kandidat.filter((m) => m !== pilihModel));
    audit("model-dipilih", { mode, model: pilihModel, ip });
  }
  let terakhir = "tidak diketahui";

  for (const model of kandidat) {
    try {
      if (inginStream) {
        const r = await cobaStream(model, pesan, mode, kunci, env);
        const kepala = new Headers(r.headers);
        Object.entries(c).forEach(([k, v]) => kepala.set(k, v));
        return new Response(r.body, { status: 200, headers: kepala });
      }
      let teks = await sekaliJalan(model, pesan, mode, kunci, env);
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
      /* penyedia lokal belum jalan → tidak ada gunanya mencoba model lain */
      if (m.indexOf("ROUTERMATI|") === 0 || (penyedia.router && /fetch failed|ECONNREFUSED|connect|network|Failed to fetch|timed out|timeout/i.test(m))) {
        if (kunciDitolakTerakhir()) {
          audit("kunci-ditolak", { penyedia: penyedia.nama, alamat: penyedia.dasar, ip });
          return json({ ok: false, kunci: true, pesan: pesanKunciDitolak(penyedia) }, 401, c);
        }
        audit("penyedia-lokal-mati", { penyedia: penyedia.nama, alamat: penyedia.dasar, ip });
        return json({ ok: false, pesan: pesanLokalMati(penyedia, env) }, 502, c);
      }
      terakhir = m;
      /* model bermasalah → lanjut ke model cadangan berikutnya */
    }
  }
  return json({ ok: false, pesan: "Semua model sedang sibuk (" + terakhir + "). Coba lagi sebentar." }, 502, c);
}

/* diekspor supaya bisa diuji tanpa memanggil AI: node tools/uji-bentuk.mjs */
export { perintahKetat, periksaJawaban, hitungKata, instruksiPerbaikan, susunPesan, jarakBentuk, teknologiDiminta, cocokTeknologi, blokKode, kunciTeknologi, antreanLokal, visiLokal, daftarModelLokal, pilihModelMode, kunciDitolakTerakhir, pesanKunciDitolak, tangani };

export const config = { runtime: "edge" };

/* env diambil dari process.env (berlaku di hosting Vercel maupun server lokal) */
function envProses(tambahanEnv) {
  const dasar = (typeof process !== "undefined" && process.env) || {};
  const p = { ...dasar, ...(tambahanEnv || {}) };
  const kunci = {};
  for (const k of [
    "AI_PROVIDER", "AI_BASE_URL", "AI_API_KEY", "AI_MODEL", "AI_MODELS", "AI_MODEL_VISI",
    "AI_MODEL_FAST", "AI_MODEL_THINK", "AI_MODEL_DEEP", "AI_MODEL_EXPERT",
    "AI_GAYA", "AI_STYLE", "AI_ROUTER",
    "ROUTER_API_KEY", "NINEROUTER_API_KEY", "OPENROUTER_KEY", "MODELS_JSON",
    "ALLOWED_ORIGINS", "APP_URL", "AI_MODEL_IZIN", "AI_CADANGAN",
    "VERCEL", "VERCEL_ENV", "VERCEL_URL", "HOSTING",
  ]) if (p[k] !== undefined) kunci[k] = p[k];
  return kunci;
}

export default async function (request, env) {
  return tangani(request, envProses(env));
}
