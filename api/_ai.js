/*
 * _ai.js — satu pintu ke penyedia AI aplikasi ini.
 *
 * PENYEDIA: **9Router** — router multi-model lokal (keluarga 9router) yang
 * diakses lewat alamat tunnel, dan bicara protokol OpenAI:
 *
 *   AI_BASE_URL = https://rqacwx8.abc-tunnel.us/v1   ← boleh dikosongkan, ini bawaannya
 *   AI_API_KEY  = kunci 9Router (boleh juga NINE_API_KEY)
 *   AI_MODEL    = model tunggal (kalau kosong → daftar per mode di chat.js)
 *
 * Alamatnya bisa diganti kapan saja lewat AI_BASE_URL. Contoh kalau 9Router jalan
 * di komputer sendiri: AI_BASE_URL=http://127.0.0.1:20128/v1
 *
 *   IMAGE_PROVIDER / IMAGE_API_KEY = pembuat gambar (opsional; 9Router lewat tunnel
 *                                  ini TIDAK melayani pembuatan gambar, jadi
 *                                  fiturnya jujur menyebut belum aktif)
 *   STT_PROVIDER / STT_API_KEY     = transkripsi suara (protokol OpenAI)
 *   TTS_PROVIDER / TTS_API_KEY     = suara AI (protokol OpenAI)
 *   TTS_MODEL / TTS_VOICE
 *
 * Fungsi yang disediakan:
 *   generateText() · streamText() · analyzeImage() · generateImage()
 *   speechToText() · textToSpeech() · daftarProvider()
 *
 * Catatan jujur: kunci TIDAK dipasang di dalam kode ini. Kalau kunci belum ada,
 * fungsi mengembalikan { ok:false, pesan:"…", butuhKunci:true } — bukan jawaban
 * atau gambar palsu.
 */

/* ── Penyedia yang dikenal aplikasi (dipilih lewat AI_PROVIDER) ─────────
   Semuanya berbicara protokol OpenAI, jadi tidak ada kode yang perlu diubah:
   cukup AI_PROVIDER + AI_API_KEY, dan (kalau mau) AI_BASE_URL untuk alamat lain.

   • 9router      – router 9Router lewat tunnel (bawaan)
   • gemini       – Google AI Studio: GRATIS tanpa kartu, bisa lihat gambar (foto)
   • pollinations – GRATIS tanpa kunci sama sekali (batasnya ketat, lihat catatan)
   • groq         – GRATIS tanpa kartu, cepat; Whisper (suara→teks) juga gratis

   Penyedia yang dikenal: lihat PRESET di bawah. Nama lain tetap bisa dipakai
   lewat AI_BASE_URL (protokol OpenAI). */

/* Model "thinking" kadang menulis penalaran internalnya di dalam tag. Penalarannya
   TIDAK boleh tampil ke pengguna (aturan aplikasi: jangan pernah menampilkan isi
   pikiran model), jadi bagian itu dibuang — bukan ditampilkan, bukan dikarang. */
const RX_PIKIR = /<(thinking|thought|reasoning)>[\s\S]*?<\/\1>/gi;
export function bersihkanPikir(teks) {
  return String(teks || '').replace(RX_PIKIR, '').replace(/^\s*<\/?(thinking|thought|reasoning)>\s*/gim, '').trim();
}

/* Versi untuk jawaban yang MENGALIR: menyaring sambil jalan, tahan potongan tag. */
export function buatPenyaringPikir() {
  let buf = '', dalam = false;
  const buka = /<(thinking|thought|reasoning)>/i, tutup = /<\/(thinking|thought|reasoning)>/i;
  return {
    tulis(bagian) {
      buf += String(bagian || '');
      let keluar = '';
      for (;;) {
        if (dalam) {
          const m = buf.match(tutup);
          if (!m) { buf = buf.slice(-12); return keluar; }   /* buang isi pikiran */
          buf = buf.slice(m.index + m[0].length); dalam = false; continue;
        }
        const b = buf.match(buka);
        if (!b) {
          if (buf.length > 12) { keluar += buf.slice(0, buf.length - 12); buf = buf.slice(-12); }
          return keluar;
        }
        keluar += buf.slice(0, b.index);
        buf = buf.slice(b.index + b[0].length); dalam = true;
      }
    },
    sisa() { const s2 = dalam ? '' : buf; buf = ''; dalam = false; return s2; },
  };
}

/* Sebagian gateway mengabaikan stream:false dan tetap menjawab dengan aliran SSE.
   Fungsi ini menyatukan potongan-potongan itu menjadi teks utuh supaya jawaban
   tidak dianggap gagal hanya karena bentuknya mengalir. */
export function teksDariSSE(teks) {
  let utuh = "", model = "", alasan = "";
  for (const baris of String(teks || "").split(/\r?\n/)) {
    const b = baris.trim();
    if (!b.startsWith("data:")) continue;
    const isi = b.slice(5).trim();
    if (!isi || isi === "[DONE]") continue;
    try {
      const j = JSON.parse(isi);
      if (j && j.model) model = String(j.model);
      const c = j && j.choices && j.choices[0];
      if (!c) continue;
      const d = c.delta || c.message || {};
      const bagian = d.content;
      if (typeof bagian === "string") utuh += bagian;
      else if (Array.isArray(bagian)) utuh += bagian.map((x) => (x && (x.text || x.content)) || "").join("");
      if (c.finish_reason) alasan = String(c.finish_reason);
    } catch (e) { /* potongan rusak → lewati */ }
  }
  return { teks: utuh.trim(), model, sesuai: true, alasan };
}

/* Nama tampilan yang JUJUR: kalau AI_BASE_URL menunjuk ke alamat lain (mis.
   9Router yang jalan di komputer sendiri), host-nya disebut apa adanya. */
function namakanTampilan(dasar, alamatBawaan, labelPenyedia) {
  const host = (() => { try { return new URL(dasar).host; } catch (e) { return dasar; } })();
  const bawaan = (() => { try { return new URL(alamatBawaan).host; } catch (e) { return ''; } })();
  if (!bawaan || host === bawaan) return labelPenyedia;
  return labelPenyedia + ' (' + host + ')';
}

const PRESET = {
  '9router': {
    dasar: 'https://rqacwx8.abc-tunnel.us/v1',
    label: '9Router',
    visi: true, stream: true, kunci: 'wajib',
    model: ['kr/claude-haiku-4.5', 'kr/claude-sonnet-4.5', 'FreeTiers'],
    catatan: '9Router — banyak model; sebagian paketnya gratis.',
  },
  'gemini': {
    dasar: 'https://generativelanguage.googleapis.com/v1beta/openai',
    label: 'Google AI Studio (Gemini)',
    visi: true, stream: true, kunci: 'wajib', gratis: true,
    model: ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'],
    gambar: { mode: 'gemini', model: 'gemini-2.5-flash-image' },
    catatan: 'Kunci GRATIS dari aistudio.google.com (tanpa kartu): teks, streaming, dan '
      + 'melihat gambar. Pembuatan gambar di Google berbayar — biarkan ditangani Pollinations.',
  },
  'pollinations': {
    dasar: 'https://text.pollinations.ai/openai',
    label: 'Pollinations',
    visi: false, stream: false, kunci: 'bebas', gratis: true,
    model: ['openai-fast'],
    gambar: { mode: 'pollinations', model: 'sana' },
    catatan: 'GRATIS tanpa pendaftaran. Batas: 1 permintaan/15 detik, satu model kecil, '
      + 'belum bisa melihat gambar, dan jawabannya datang sekaligus (tanpa streaming).',
  },
  'cloudflare': {
    dasar: '',   /* diturunkan dari CF_ACCOUNT_ID: .../accounts/<id>/ai/v1 */
    label: 'Cloudflare Workers AI',
    visi: true, stream: true, kunci: 'wajib', gratis: true,
    model: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-3.1-8b-instruct',
      '@cf/meta/llama-3.2-11b-vision-instruct'],
    gambar: { mode: 'cloudflare', model: '@cf/black-forest-labs/flux-1-schnell' },
    catatan: 'GRATIS 10.000 neuron/hari (tanpa kartu) dan menutup SEMUA fitur: teks, melihat gambar, '
      + 'membuat gambar (FLUX), dengar (Whisper), dan suara (MeloTTS). Butuh CF_ACCOUNT_ID + CF_API_TOKEN.',
  },
  'groq': {
    dasar: 'https://api.groq.com/openai/v1',
    label: 'Groq',
    visi: true, stream: true, kunci: 'wajib', gratis: true,
    model: ['llama-3.3-70b-versatile', 'meta-llama/llama-4-scout-17b-16e-instruct'],
    catatan: 'GRATIS tanpa kartu (batas harian). Bagus untuk suara: Whisper + Orpheus TTS.',
  },
};
const PRESET_BAWAAN = '9router';
const ALAMAT_BAWAAN = PRESET[PRESET_BAWAAN].dasar;

/* kunci bisa datang dari beberapa nama env supaya gampang dipakai apa adanya */
function kunciDariEnv(env) {
  return String(env.AI_API_KEY || env.NINE_API_KEY || env.GEMINI_API_KEY || env.GOOGLE_API_KEY
    || env.GROQ_API_KEY || env.CF_API_TOKEN || env.CLOUDFLARE_API_TOKEN || '').trim();
}

/* Model bawaan per mode untuk penyedia yang daftar modelnya belum terbaca. */
export function modelBawaan(env = {}, mode = 'fast') {
  const p = penyediaTeks(env);
  const daftar = (p.modelBawaan || []).filter(Boolean);
  if (!daftar.length) return [];
  if (daftar.length === 1) return daftar.slice();
  const urut = { fast: [0, 1, 2], think: [0, 1, 2], deep: [0, 1, 2], expert: [0, 1, 2] }[mode] || [0, 1, 2];
  if (p.nama === 'cloudflare' && /vision|lihat/i.test(mode)) return daftar.filter((m) => /vision/.test(m)).concat(daftar);
  return urut.map((i) => daftar[i]).filter(Boolean);
}

export function penyediaTeks(env = {}) {
  const namaAsli = String(env.AI_PROVIDER || PRESET_BAWAAN).toLowerCase();
  const dikenal = !!PRESET[namaAsli];
  const p = dikenal ? PRESET[namaAsli] : { dasar: ALAMAT_BAWAAN, label: namaAsli || 'Penyedia AI' };
  /* Cloudflare: alamatnya memuat ID akun, jadi disusun saat dipakai */
  const bawaanPenyedia = (namaAsli === 'cloudflare')
    ? (dasarCloudflare(env).dasar ? dasarCloudflare(env).dasar + '/v1' : p.dasar)
    : p.dasar;
  const dasar = String(env.AI_BASE_URL || bawaanPenyedia || ALAMAT_BAWAAN).replace(/\/+$/, '');
  const kunci = kunciDariEnv(env);
  const label = namakanTampilan(dasar, bawaanPenyedia || p.dasar, p.label);
  const kustom = (() => { try { return new URL(dasar).host !== new URL(bawaanPenyedia || p.dasar).host; } catch (e) { return false; } })();
  return {
    nama: namaAsli || PRESET_BAWAAN,
    label,        /* untuk pesan ke pengguna */
    kustom,       /* true = alamat lain lewat AI_BASE_URL */
    dasar,
    kunci,
    /* penyedia yang tidak butuh kunci (Pollinations) tetap boleh dipakai */
    adaKunci: !!kunci || p.kunci === 'bebas',
    visi: p.visi !== false,       /* bisa melihat gambar yang dikirim? */
    stream: p.stream !== false,   /* bisa menjawab mengalir (SSE)? */
    gratis: !!p.gratis,
    modelBawaan: (p.model || []).slice(),
    gambarBawaan: p.gambar || null,
    catatanPenyedia: p.catatan || '',
    /* 9Router melayani protokol OpenAI: Authorization: Bearer + /chat/completions */
    gaya: 'openai',
    /* daftar model diambil dari penyedia itu sendiri (GET /models) */
    router: true,
    lokal: false,
    dasarLokal: false,
  };
}

/* Pembuat gambar.
   Bawaan: **Pollinations** — gratis dan TIDAK butuh kunci, jadi fitur gambar
   langsung hidup tanpa setelan apa pun (gambarnya diberi tanda air).
   Pilihan lain: 'off' (dimatikan), 'cloudflare' (gratis 10.000 neuron/hari, FLUX),
   atau penyedia apa pun yang protokolnya OpenAI (/images/generations). */
export function penyediaGambar(env = {}) {
  const teks = penyediaTeks(env);
  const minta = String(env.IMAGE_PROVIDER || '').trim().toLowerCase();
  const kunci = String(env.IMAGE_API_KEY || '').trim();

  if (minta === 'off' || minta === 'mati') {
    return { nama: 'off', label: 'dimatikan', mode: 'off', dasar: '', kunci: '', model: '', siap: false, catatan: 'Pembuat gambar dimatikan lewat IMAGE_PROVIDER=off.' };
  }
  if (minta === 'cloudflare') {
    const dasar = String(env.IMAGE_BASE_URL || 'https://api.cloudflare.com/client/v4/accounts/<ID_AKUN>/ai').replace(/\/+$/, '');
    const model = String(env.IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell');
    return {
      nama: 'cloudflare', label: 'Cloudflare Workers AI', mode: 'cloudflare', dasar, kunci, model,
      siap: !!kunci && !/<ID_AKUN>/.test(dasar),
      catatan: 'Cloudflare Workers AI: gratis 10.000 neuron/hari, tanpa kartu. Butuh IMAGE_API_KEY (API token) dan IMAGE_BASE_URL berisi ID akun.',
    };
  }
  /* tanpa IMAGE_PROVIDER: ikuti penyedia teks kalau dia punya pembuat gambar
     (Cloudflare → FLUX gratis; Gemini → berbayar), selain itu Pollinations gratis. */
  const cf = dasarCloudflare(env);
  if (!minta && teks.gambarBawaan && teks.gambarBawaan.mode === 'cloudflare' && cf.siap) {
    return {
      nama: 'cloudflare', label: 'Cloudflare Workers AI', mode: 'cloudflare',
      dasar: cf.dasar, kunci: cf.token, model: String(env.IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell'),
      siap: true,
      catatan: 'Cloudflare Workers AI — FLUX, gratis 10.000 neuron/hari. Tanpa tanda air.',
    };
  }
  if (minta === 'gemini' || (!minta && teks.gambarBawaan && teks.gambarBawaan.mode === 'gemini' && kunci)) {
    const dasar = String(env.IMAGE_BASE_URL || PRESET.gemini.dasar).replace(/\/+$/, '');
    const model = String(env.IMAGE_MODEL || PRESET.gemini.gambar.model);
    return { nama: 'gemini', label: 'Google AI Studio (Gemini)', mode: 'openai', dasar, kunci: kunci || teks.kunci, model, siap: !!(kunci || teks.kunci), catatan: 'Pembuatan gambar di Google berbayar; kunci gratis biasanya ditolak dengan pesan yang jujur.' };
  }
  if (minta === 'pollinations' || !minta) {
    /* 'sana' = model yang sekarang benar-benar dilayani kuota anonim Pollinations
       (uji 2026-10-01: sana 6/6 berhasil, flux 4/6, dan tanpa model 0/6). */
    const model = String(env.IMAGE_MODEL || 'sana');
    return {
      nama: 'pollinations', label: 'Pollinations', mode: 'pollinations', dasar: 'https://image.pollinations.ai', kunci: '', model,
      siap: true,
      catatan: 'GRATIS tanpa kunci (Pollinations, model ' + model + '). Gambarnya diberi tanda air kecuali kamu mendaftar di auth.pollinations.ai.',
    };
  }
  /* sisanya: penyedia gambar protokol OpenAI (/images/generations) */
  const dasar = String(env.IMAGE_BASE_URL || '').replace(/\/+$/, '');
  const model = String(env.IMAGE_MODEL || 'gpt-image-1');
  return { nama: minta, label: minta, mode: 'openai', dasar, kunci, model, siap: !!kunci && !!dasar, catatan: 'Penyedia gambar protokol OpenAI: butuh IMAGE_BASE_URL + IMAGE_API_KEY.' };
}

/* Dasar alamat Cloudflare Workers AI (satu akun untuk teks, gambar, suara).
   ID akun + token bisa ditulis dengan nama apa pun yang lazim dipakai. */
export function dasarCloudflare(env = {}) {
  const id = String(env.CF_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const token = String(env.CF_API_TOKEN || env.CLOUDFLARE_API_TOKEN || env.IMAGE_API_KEY || '').trim();
  const dasar = String(env.CF_BASE_URL || (id ? 'https://api.cloudflare.com/client/v4/accounts/' + id + '/ai' : '')).replace(/\/+$/, '');
  return { id, token, dasar, siap: !!token && !!dasar };
}

export function penyediaSuara(env = {}, jenis = 'tts') {
  const awalan = jenis === 'tts' ? 'TTS' : 'STT';
  const nama = String(env[awalan + '_PROVIDER'] || '').toLowerCase();
  const cf = dasarCloudflare(env);
  if (nama === 'cloudflare') {
    const dasar = String(env[awalan + '_BASE_URL'] || cf.dasar).replace(/\/+$/, '');
    const model = jenis === 'tts' ? String(env.TTS_MODEL || '@cf/myshell-ai/melotts') : String(env.STT_MODEL || '@cf/openai/whisper');
    return {
      nama: 'cloudflare', label: 'Cloudflare Workers AI', mode: 'cloudflare',
      dasar, kunci: String(env[awalan + '_API_KEY'] || cf.token).trim(), model,
      suara: String(env.TTS_VOICE || 'id-ID'), siap: !!dasar && !!(String(env[awalan + '_API_KEY'] || cf.token).trim()),
      catatan: 'Cloudflare Workers AI (gratis 10.000 neuron/hari, tanpa kartu) — Whisper untuk dengar, MeloTTS untuk suara.',
    };
  }
  const kunci = String(env[awalan + '_API_KEY'] || '').trim();
  const dasar = String(env[awalan + '_BASE_URL'] || '').replace(/\/+$/, '');
  const model = jenis === 'tts' ? String(env.TTS_MODEL || 'gpt-4o-mini-tts') : String(env.STT_MODEL || 'whisper-1');
  return {
    nama, label: nama, mode: 'openai', dasar, kunci, model, suara: String(env.TTS_VOICE || 'alloy'),
    siap: !!nama && !!kunci,
    catatan: nama ? 'Penyedia suara protokol OpenAI.' : 'Belum diatur — aplikasi memakai suara bawaan browser.',
  };
}

/* ── kepala permintaan bersama ─────────────────────────────────────── */
function kepala(penyedia) {
  const h = { 'Content-Type': 'application/json' };
  if (penyedia.kunci) h.Authorization = 'Bearer ' + penyedia.kunci;
  return h;
}

/* 9Router mewajibkan kunci pada setiap permintaan (tanpa kunci dijawab 401). */
function bolehJalan(p) { return p.adaKunci; }
function pesanButuhKunci(p) {
  return 'Kunci 9Router belum dipasang. Isi AI_API_KEY di berkas .env.local (lokal) atau di '
    + 'Environment Variables hosting (Vercel → Settings → Environment Variables → Redeploy). '
    + 'Alamat yang dipakai: ' + p.dasar + '.';
}

async function gagalAmbil(r) {
  const t = await r.text();
  let pesan = t.slice(0, 300);
  try {
    const j = JSON.parse(t);
    pesan = (j.error && (j.error.message || j.error)) || j.message || pesan;
  } catch (e) { /* biarkan teks mentah */ }
  return { ok: false, status: r.status, pesan: String(pesan) };
}

/* ── 1. generateText ───────────────────────────────────────────────── */
export async function generateText({ env = {}, model, pesan, suhu = 0.6, maksToken = 2000, signal }) {
  const p = penyediaTeks(env);
  if (!bolehJalan(p)) return { ok: false, butuhKunci: true, pesan: pesanButuhKunci(p) };
  const r = await fetch(p.dasar + '/chat/completions', {
    method: 'POST',
    headers: kepala(p),
    body: JSON.stringify({ model, messages: pesan, temperature: suhu, max_tokens: maksToken, stream: false }),
    signal,
  });
  if (!r.ok) return gagalAmbil(r);
  const d = await r.json();
  const c = d && d.choices && d.choices[0];
  return { ok: true, teks: (c && c.message && c.message.content) || (c && c.text) || '', model, penyedia: p.nama };
}

/* ── 2. streamText ─────────────────────────────────────────────────── */
export async function streamText({ env = {}, model, pesan, suhu = 0.6, maksToken = 2000 }) {
  const p = penyediaTeks(env);
  if (!bolehJalan(p)) return { ok: false, butuhKunci: true, pesan: pesanButuhKunci(p) };
  const ac = new AbortController();
  const r = await fetch(p.dasar + '/chat/completions', {
    method: 'POST',
    headers: kepala(p),
    body: JSON.stringify({ model, messages: pesan, temperature: suhu, max_tokens: maksToken, stream: true }),
    signal: ac.signal,
  });
  if (!r.ok) return gagalAmbil(r);
  return { ok: true, upstream: r, model, penyedia: p.nama, batalkan: () => ac.abort() };
}

/* ── 3. analyzeImage (vision) ──────────────────────────────────────── */
export async function analyzeImage({ env = {}, model, prompt, gambar = [], suhu = 0.5, maksToken = 1500 }) {
  const pesan = [{
    role: 'user',
    content: [
      { type: 'text', text: String(prompt || '') },
      ...gambar.map((g) => ({ type: 'image_url', image_url: { url: g } })),
    ],
  }];
  return generateText({ env, model, pesan, suhu, maksToken });
}

/* ── 4. generateImage ──────────────────────────────────────────────── */
export async function generateImage({ env = {}, prompt, rasio = '1:1', kualitas = 'standar' }) {
  const p = penyediaGambar(env);
  if (!p.siap) {
    return {
      ok: false,
      butuhKunci: true,
      pesan: p.catatan || 'Pembuat gambar belum aktif — isi IMAGE_PROVIDER + IMAGE_API_KEY, atau biarkan kosong untuk memakai Pollinations (gratis).',
    };
  }
  const ukuran = petaUkuran(rasio, kualitas);
  const tanyaBersih = String(prompt || '').slice(0, 1500);

  /* Pollinations: satu alamat GET, tanpa kunci (model harus disebut — default-nya berbayar) */
  if (p.mode === 'pollinations') {
    const [w, h] = ukuran.split('x').map((n) => parseInt(n, 10));
    const alamatGambar = (model) => p.dasar + '/prompt/' + encodeURIComponent(tanyaBersih)
      + '?model=' + encodeURIComponent(model)
      + '&width=' + (w || 1024) + '&height=' + (h || 1024)
      + '&nologo=true&referrer=vanchatspy';
    /* Kuota anonim Pollinations ketat (±1 permintaan / 15 detik) dan kadang
       menjawab 402/429 secara acak. Karena itu: coba ulang beberapa kali dan
       ganti ke model lain yang masih dilayani sebelum menyerah — supaya fitur
       gambar gratis ini benar-benar hidup, bukan cuma teori. */
    const utama = String(p.model || 'sana');
    const cadangan = utama === 'sana' ? 'flux' : 'sana';
    const daftarCoba = [utama, utama, cadangan];
    const tunggu = (ms) => new Promise((selesai) => setTimeout(selesai, ms));
    const mulai = Date.now();
    let galatTerakhir = 'tidak ada jawaban';
    let modelTerpakai = utama;
    for (let i = 0; i < daftarCoba.length; i++) {
      modelTerpakai = daftarCoba[i];
      /* Pollinations membatasi ±1 permintaan / 15 detik untuk pemakai anonim:
         jeda 6 detik lalu 10 detik memberi kesempatan nyata sebelum menyerah. */
      if (i > 0) await tunggu(i === 1 ? 6000 : 10000);
      if (Date.now() - mulai > 100000) { galatTerakhir = 'waktu tunggu habis'; break; }
      let r;
      try {
        r = await fetch(alamatGambar(modelTerpakai), {
          headers: { Accept: 'image/*' },
          signal: AbortSignal.timeout ? AbortSignal.timeout(45000) : undefined,
        });
      } catch (e) {
        galatTerakhir = String((e && e.message) || e);
        continue;
      }
      if (!r.ok) {
        galatTerakhir = r.status === 402
          ? 'kuota gratis Pollinations penuh (402)'
          : (r.status === 429 ? 'terlalu banyak permintaan (429)' : ('HTTP ' + r.status));
        continue;
      }
      const jenis = String(r.headers.get('content-type') || 'image/jpeg').split(';')[0];
      const buf = await r.arrayBuffer();
      if (!buf || buf.byteLength < 500) { galatTerakhir = 'jawaban kosong'; continue; }
      let biner = '';
      const bytes = new Uint8Array(buf);
      for (let x = 0; x < bytes.length; x += 8192) biner += String.fromCharCode.apply(null, bytes.subarray(x, x + 8192));
      return { ok: true, dataUrl: 'data:' + jenis + ';base64,' + btoa(biner), model: modelTerpakai, rasio, kualitas, penyedia: p.label };
    }
    return {
      ok: false,
      pesan: 'Pollinations belum bisa membuat gambar sekarang (' + galatTerakhir + ') setelah '
        + daftarCoba.length + ' percobaan. Kuota gratisnya ±1 permintaan/15 detik — tunggu sebentar lalu coba lagi, '
        + 'atau pakai Cloudflare Workers AI (IMAGE_PROVIDER=cloudflare, gratis 10.000 neuron/hari, tanpa tanda air).',
    };
  }

  /* Cloudflare Workers AI: POST /run/<model>, jawabannya JSON berisi base64 */
  if (p.mode === 'cloudflare') {
    const r = await fetch(p.dasar + '/run/' + p.model, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + p.kunci, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: tanyaBersih, width: parseInt(ukuran.split('x')[0], 10) || 1024, height: parseInt(ukuran.split('x')[1], 10) || 1024 }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(120000) : undefined,
    });
    if (!r.ok) return gagalAmbil(r);
    const jenisJawab = String(r.headers.get('content-type') || '');
    if (jenisJawab.indexOf('image/') === 0) {
      const buf = await r.arrayBuffer();
      let biner = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 8192) biner += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
      return { ok: true, dataUrl: 'data:' + jenisJawab.split(';')[0] + ';base64,' + btoa(biner), model: p.model, rasio, kualitas, penyedia: p.label };
    }
    const d = await r.json();
    const b64 = d && d.result && (d.result.image || d.result.b64_json);
    if (!b64) return { ok: false, pesan: 'Cloudflare tidak mengembalikan gambar: ' + JSON.stringify(d).slice(0, 160) };
    return { ok: true, dataUrl: 'data:image/png;base64,' + b64, model: p.model, rasio, kualitas, penyedia: p.label };
  }

  if (p.nama === 'stability') {
    const r = await fetch(p.dasar.replace(/\/v1$/, '') + '/v2beta/stable-image/generate/core', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + p.kunci, Accept: 'application/json' },
      body: (() => {
        const f = new FormData();
        f.append('prompt', String(prompt || '').slice(0, 2000));
        f.append('aspect_ratio', rasio === '1:1' ? '1:1' : rasio);
        f.append('output_format', 'png');
        return f;
      })(),
    });
    if (!r.ok) return gagalAmbil(r);
    const d = await r.json();
    const b64 = d && (d.image || (d.artifacts && d.artifacts[0] && d.artifacts[0].base64));
    if (!b64) return { ok: false, pesan: 'Penyedia tidak mengembalikan gambar.' };
    return { ok: true, dataUrl: 'data:image/png;base64,' + b64, model: p.model, rasio, kualitas, penyedia: p.nama };
  }

  const r = await fetch(p.dasar + '/images/generations', {
    method: 'POST',
    headers: kepala(p),
    body: JSON.stringify({
      model: p.model,
      prompt: String(prompt || '').slice(0, 2000),
      n: 1,
      size: ukuran,
      quality: kualitas === 'hd' ? 'hd' : 'standard',
      response_format: 'b64_json',
    }),
  });
  if (!r.ok) return gagalAmbil(r);
  const d = await r.json();
  const item = d && d.data && d.data[0];
  if (!item) return { ok: false, pesan: 'Penyedia tidak mengembalikan gambar.' };
  const dataUrl = item.b64_json ? 'data:image/png;base64,' + item.b64_json : item.url || '';
  if (!dataUrl) return { ok: false, pesan: 'Penyedia tidak mengembalikan gambar.' };
  return { ok: true, dataUrl, model: p.model, rasio, kualitas, penyedia: p.nama };
}

export function petaUkuran(rasio, kualitas) {
  const besar = kualitas === 'hd' ? '1792x1024' : '1024x1024';
  const peta = { '1:1': besar === '1792x1024' ? '1024x1024' : '1024x1024', '16:9': '1792x1024', '9:16': '1024x1792', '4:3': '1408x1024' };
  return peta[rasio] || besar;
}

/* ── 5. speechToText ───────────────────────────────────────────────── */
export async function speechToText({ env = {}, audioBase64, mime = 'audio/webm', bahasa = 'id' }) {
  const p = penyediaSuara(env, 'stt');
  if (!p.siap) {
    return {
      ok: false,
      butuhKunci: true,
      pesan: 'Transkripsi suara sisi-server belum aktif (butuh STT_PROVIDER + STT_API_KEY). ' +
        'Aplikasi tetap bisa mendengar lewat Web Speech API bawaan browser di perangkat yang mendukung.',
    };
  }
  const biner = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
  if (p.mode === 'cloudflare') {
    /* Cloudflare: kirim audio mentah ke /run/@cf/openai/whisper */
    const r = await fetch(p.dasar + '/run/' + p.model, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + p.kunci, 'Content-Type': mime || 'audio/webm' },
      body: biner,
    });
    if (!r.ok) return gagalAmbil(r);
    const d = await r.json();
    const teksCf = (d && d.result && (d.result.text || d.result.transcription)) || (d && d.text) || '';
    if (!teksCf) return { ok: false, pesan: 'Cloudflare tidak mengembalikan teks: ' + JSON.stringify(d).slice(0, 160) };
    return { ok: true, teks: String(teksCf), penyedia: p.label };
  }
  const f = new FormData();
  f.append('file', new Blob([biner], { type: mime }), 'rekaman.webm');
  f.append('model', p.model);
  f.append('language', bahasa);
  const r = await fetch(p.dasar + '/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + p.kunci }, body: f });
  if (!r.ok) return gagalAmbil(r);
  const d = await r.json();
  return { ok: true, teks: d.text || '', penyedia: p.nama };
}

/* ── 6. textToSpeech ───────────────────────────────────────────────── */
export async function textToSpeech({ env = {}, teks, suara }) {
  const p = penyediaSuara(env, 'tts');
  if (!p.siap) {
    return {
      ok: false,
      butuhKunci: true,
      pesan: 'Suara AI sisi-server belum aktif (butuh TTS_PROVIDER + TTS_API_KEY). ' +
        'Aplikasi tetap membacakan jawaban lewat suara bawaan browser (Web Speech API).',
    };
  }
  if (p.mode === 'cloudflare') {
    /* Cloudflare MeloTTS: jawabannya JSON berisi audio base64 */
    const r = await fetch(p.dasar + '/run/' + p.model, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + p.kunci, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: String(teks || '').slice(0, 2000), lang: String(suara || p.suara || 'id-ID') }),
    });
    if (!r.ok) return gagalAmbil(r);
    const d = await r.json();
    const b64 = (d && d.result && d.result.audio) || (d && d.audio) || '';
    if (!b64) return { ok: false, pesan: 'Cloudflare tidak mengembalikan suara: ' + JSON.stringify(d).slice(0, 160) };
    return { ok: true, dataUrl: 'data:audio/mpeg;base64,' + b64, model: p.model, suara: suara || p.suara, penyedia: p.label };
  }
  const r = await fetch(p.dasar + '/audio/speech', {
    method: 'POST',
    headers: kepala(p),
    body: JSON.stringify({ model: p.model, voice: suara || p.suara, input: String(teks || '').slice(0, 4000), format: 'mp3' }),
  });
  if (!r.ok) return gagalAmbil(r);
  const buf = await r.arrayBuffer();
  let biner = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 8192) biner += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return { ok: true, dataUrl: 'data:audio/mpeg;base64,' + btoa(biner), model: p.model, suara: suara || p.suara, penyedia: p.nama };
}

/* ── 7. daftarProvider — untuk halaman Pengaturan & Admin ──────────── */
export function daftarProvider(env = {}) {
  const t = penyediaTeks(env);
  const g = penyediaGambar(env);
  const s = penyediaSuara(env, 'stt');
  const v = penyediaSuara(env, 'tts');
  const samarkan = (k) => (k ? k.slice(0, 6) + '…' + k.slice(-4) : '');
  return {
    teks: {
      penyedia: t.nama, label: t.label, alamat: t.dasar, adaKunci: t.adaKunci, kunci: samarkan(t.kunci),
      modelTetap: env.AI_MODEL || null, lokal: t.lokal, kustom: t.kustom,
      gratis: !!t.gratis, lihatGambar: t.visi !== false, streaming: t.stream !== false,
      catatan: t.catatanPenyedia || ('Penyedia OpenAI-compatible di ' + t.dasar),
    },
    gambar: { penyedia: g.label || '(belum diatur)', nama: g.nama, mode: g.mode, model: g.model, siap: g.siap, kunci: samarkan(g.kunci), catatan: g.catatan || '' },
    suara: { stt: { penyedia: s.siap ? (s.label || s.nama) : '(bawaan browser)', siap: s.siap, model: s.model, catatan: s.catatan }, tts: { penyedia: v.siap ? (v.label || v.nama) : '(bawaan browser)', siap: v.siap, model: v.model, suara: v.suara, catatan: v.catatan } },
    deploy: { penyedia: env.DEPLOY_PROVIDER || '(belum diatur)', siap: !!env.DEPLOY_TOKEN },
    penjadwal: { penyedia: (env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL) ? 'penyimpanan KV' : '(belum diatur)', siap: !!(env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL) },
    catatan: 'Hanya status yang tampil di sini — kunci asli tidak pernah dikirim ke browser.',
  };
}

