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

/* 9Router: satu-satunya penyedia yang dikenal aplikasi ini. */
const NAMA_PENYEDIA = '9router';
const LABEL_PENYEDIA = '9Router';
const ALAMAT_BAWAAN = 'https://rqacwx8.abc-tunnel.us/v1';

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
function namakanTampilan(dasar, alamatBawaan) {
  const host = (() => { try { return new URL(dasar).host; } catch (e) { return dasar; } })();
  const bawaan = (() => { try { return new URL(alamatBawaan).host; } catch (e) { return ''; } })();
  if (!bawaan || host === bawaan) return LABEL_PENYEDIA;
  return LABEL_PENYEDIA + ' (' + host + ')';
}

export function penyediaTeks(env = {}) {
  const dasar = String(env.AI_BASE_URL || ALAMAT_BAWAAN).replace(/\/+$/, '');
  /* kunci: AI_API_KEY (NINE_API_KEY diterima sebagai alias) */
  const kunci = String(env.AI_API_KEY || env.NINE_API_KEY || '').trim();
  const label = namakanTampilan(dasar, ALAMAT_BAWAAN);
  const kustom = (() => { try { return new URL(dasar).host !== new URL(ALAMAT_BAWAAN).host; } catch (e) { return false; } })();
  return {
    nama: NAMA_PENYEDIA,
    label,        /* untuk pesan ke pengguna */
    kustom,       /* true = alamat lain lewat AI_BASE_URL */
    dasar,
    kunci,
    adaKunci: !!kunci,
    /* 9Router melayani protokol OpenAI: Authorization: Bearer + /chat/completions */
    gaya: 'openai',
    /* daftar model diambil dari penyedia itu sendiri (GET /models) */
    router: true,
    lokal: false,
    dasarLokal: false,
  };
}

export function penyediaGambar(env = {}) {
  const nama = String(env.IMAGE_PROVIDER || '').toLowerCase();
  const kunci = String(env.IMAGE_API_KEY || '').trim();
  const dasar = String(env.IMAGE_BASE_URL || '').replace(/\/+$/, '');
  const model = String(env.IMAGE_MODEL || 'gpt-image-1');
  return { nama, label: nama ? nama : '', dasar, kunci, model, siap: !!nama && !!kunci && !!dasar };
}

export function penyediaSuara(env = {}, jenis = 'tts') {
  const awalan = jenis === 'tts' ? 'TTS' : 'STT';
  const nama = String(env[awalan + '_PROVIDER'] || '').toLowerCase();
  const kunci = String(env[awalan + '_API_KEY'] || '').trim();
  const dasar = String(env[awalan + '_BASE_URL'] || '').replace(/\/+$/, '');
  const model = jenis === 'tts' ? String(env.TTS_MODEL || 'gpt-4o-mini-tts') : String(env.STT_MODEL || 'whisper-1');
  return { nama, dasar, kunci, model, suara: String(env.TTS_VOICE || 'alloy'), siap: !!nama && !!kunci };
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
      pesan:
        'Pembuat gambar belum aktif: gambar dihitung per kredit oleh penyedia, jadi kuncinya harus dipasang dulu. ' +
        'Isi Environment Variable IMAGE_PROVIDER=9router dan IMAGE_API_KEY (kunci 9Router), lalu fitur ini langsung jalan.',
    };
  }
  const ukuran = petaUkuran(rasio, kualitas);

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
      catatan: t.kustom
        ? '9Router di alamat pilihanmu (' + t.dasar + ') — daftar model dibaca dari router itu sendiri.'
        : '9Router (' + ALAMAT_BAWAAN + ') — model yang tampil diambil dari daftar model 9Router-mu.',
    },
    gambar: { penyedia: g.nama || '(belum diatur)', model: g.model, siap: g.siap, kunci: samarkan(g.kunci) },
    suara: { stt: { penyedia: s.nama || '(bawaan browser)', siap: s.siap }, tts: { penyedia: v.nama || '(bawaan browser)', siap: v.siap, suara: v.suara } },
    deploy: { penyedia: env.DEPLOY_PROVIDER || '(belum diatur)', siap: !!env.DEPLOY_TOKEN },
    penjadwal: { penyedia: (env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL) ? 'penyimpanan KV' : '(belum diatur)', siap: !!(env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL) },
    catatan: 'Hanya status yang tampil di sini — kunci asli tidak pernah dikirim ke browser.',
  };
}

