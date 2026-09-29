/*
 * _ai.js — abstraksi penyedia AI (provider abstraction).
 *
 * Semua kemampuan AI lewat satu pintu, supaya aplikasi tidak terkunci pada
 * satu penyedia. Ganti penyedia cukup dengan Environment Variable:
 *
 *   AI_PROVIDER = openrouter (bawaan) | openai | groq | together | ollama | bynara | 9router
 *   AI_BASE_URL = alamat OpenAI-compatible sendiri (mis. http://localhost:11434/v1)
 *   AI_API_KEY  = kunci penyedia lain (kalau kosong → kunci bawaan OpenRouter)
 *   AI_MODEL    = model tunggal (kalau kosong → daftar per mode di chat.js)
 *
 *   IMAGE_PROVIDER = openai | stability | together | openrouter
 *   IMAGE_API_KEY  = kunci penyedia gambar (kalau kosong → fitur gambar mati, jujur)
 *   IMAGE_MODEL    = nama model gambar
 *
 *   STT_PROVIDER / STT_API_KEY  = transkripsi suara (OpenAI-compatible)
 *   TTS_PROVIDER / TTS_API_KEY  = suara AI (OpenAI-compatible)
 *   TTS_MODEL / TTS_VOICE
 *
 * Fungsi yang disediakan (sesuai daftar permintaan):
 *   generateText() · streamText() · analyzeImage() · generateImage()
 *   speechToText() · textToSpeech() · daftarProvider()
 *
 * Catatan jujur: kalau kunci tidak tersedia, fungsi mengembalikan
 * { ok:false, pesan: "...", butuhKunci: true } — BUKAN gambar/teks palsu.
 */

const KUNCI_BAWAAN_OPENROUTER = 'sk-or-v1-DIHAPUS-F27';

const ALAMAT = {
  openrouter: 'https://openrouter.ai/api/v1',
  openai: 'https://api.openai.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  together: 'https://api.together.xyz/v1',
  deepseek: 'https://api.deepseek.com/v1',
  mistral: 'https://api.mistral.ai/v1',
  ollama: 'http://127.0.0.1:11434/v1',
  /* 9Router — router AI lokal (https://github.com/decolua/9router).
     Dijalankan di komputer sendiri lewat CMD/terminal: `9router`
     → API OpenAI-compatible di http://localhost:20128/v1
     → kunci diambil dari dashboard http://localhost:20128/dashboard
       (kalau REQUIRE_API_KEY=false, kunci boleh kosong). */
  '9router': 'http://127.0.0.1:20128/v1',
  ninerouter: 'http://127.0.0.1:20128/v1',
  lmstudio: 'http://127.0.0.1:1234/v1',
  /* Anthropic resmi (juga gaya yang dipakai relay Claude Code seperti cc.freemodel.dev) */
  anthropic: 'https://api.anthropic.com/v1',
  claude: 'https://api.anthropic.com/v1',
  /* NaraRouter (https://router.bynara.id) — gateway multi-model OpenAI-compatible
     + Anthropic-compatible. Header: Authorization: Bearer sk-nry-… ; daftar model
     dibaca dari GET /v1/models miliknya sendiri (tergantung paket akun). */
  bynara: 'https://router.bynara.id/v1',
  nararouter: 'https://router.bynara.id/v1',
};

/* penyedia yang jalan di komputer sendiri: kunci TIDAK wajib */
const LOKAL = ['9router', 'ninerouter', 'ollama', 'lmstudio', 'llamacpp'];

/* penyedia bergaya "router": daftar modelnya dibaca dari penyedia itu sendiri
   (GET /models). Berlaku juga kalau 9Router tidak di localhost — misalnya
   9Router di rumah yang dibuka lewat tunnel, atau 9Router di VPS. */
const ROUTER = ['9router', 'ninerouter', 'ollama', 'lmstudio', 'llamacpp', 'lokal', 'bynara', 'nararouter'];

/* Penyedia bergaya ANTHROPIC: endpoint POST {dasar}/messages, header x-api-key
   + anthropic-version (bukan Authorization: Bearer), dan bentuk jawaban
   { content: [ { type: "text", text: … } ] }. Beberapa gateway (mis. relay
   Claude Code seperti cc.freemodel.dev) HANYA melayani gaya ini.
   Bisa dipaksa untuk penyedia apa pun dengan env AI_GAYA=anthropic. */
const ANTROPIS = ['anthropic', 'claude', 'claude-code', 'cc', 'freemodel'];

export function penyediaTeks(env = {}) {
  const nama = String(env.AI_PROVIDER || (env.AI_BASE_URL ? 'lokal' : 'openrouter')).toLowerCase();
  const dasar = String(env.AI_BASE_URL || ALAMAT[nama] || ALAMAT.openrouter).replace(/\/+$/, '');
  const dasarLokal = /(^|\/\/)(127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\])(:|\/)/.test(dasar);
  const lokal = LOKAL.indexOf(nama) >= 0 || dasarLokal;   /* kunci tidak wajib */
  const gaya = (String(env.AI_GAYA || env.AI_STYLE || '').toLowerCase() === 'anthropic' || ANTROPIS.indexOf(nama) >= 0)
    ? 'anthropic' : 'openai';
  const paksaRouter = ['1', 'true', 'ya', 'on'].indexOf(String(env.AI_ROUTER || '').toLowerCase()) >= 0;
  const router = ROUTER.indexOf(nama) >= 0 || dasarLokal || gaya === 'anthropic' || paksaRouter;  /* daftar model dari penyedia */
  const kunci = String(
    env.AI_API_KEY || env.ROUTER_API_KEY || env.NINEROUTER_API_KEY
    || (nama === 'openrouter' ? env.OPENROUTER_KEY || KUNCI_BAWAAN_OPENROUTER : '')
    || ''
  ).trim();
  return { nama, dasar, kunci, adaKunci: !!kunci, lokal, router, dasarLokal, gaya };
}

export function penyediaGambar(env = {}) {
  const nama = String(env.IMAGE_PROVIDER || '').toLowerCase();
  const kunci = String(env.IMAGE_API_KEY || '').trim();
  const dasar = String(env.IMAGE_BASE_URL || ALAMAT[nama] || ALAMAT.openai).replace(/\/+$/, '');
  const model = String(env.IMAGE_MODEL || (nama === 'stability' ? 'sd3.5-large' : nama === 'together' ? 'black-forest-labs/FLUX.1-schnell-Free' : 'gpt-image-1'));
  return { nama, dasar, kunci, model, siap: !!nama && !!kunci };
}

export function penyediaSuara(env = {}, jenis = 'tts') {
  const awalan = jenis === 'tts' ? 'TTS' : 'STT';
  const nama = String(env[awalan + '_PROVIDER'] || '').toLowerCase();
  const kunci = String(env[awalan + '_API_KEY'] || '').trim();
  const dasar = String(env[awalan + '_BASE_URL'] || ALAMAT[nama] || ALAMAT.openai).replace(/\/+$/, '');
  const model = jenis === 'tts' ? String(env.TTS_MODEL || 'gpt-4o-mini-tts') : String(env.STT_MODEL || 'whisper-1');
  return { nama, dasar, kunci, model, suara: String(env.TTS_VOICE || 'alloy'), siap: !!nama && !!kunci };
}

/* ── kepala permintaan bersama ─────────────────────────────────────── */
function kepala(penyedia) {
  const h = { 'Content-Type': 'application/json' };
  if (penyedia.kunci) h.Authorization = 'Bearer ' + penyedia.kunci;
  if (penyedia.nama === 'openrouter') {
    h['HTTP-Referer'] = 'https://van-chat-spy.vercel.app';
    h['X-Title'] = 'Van Chat.SPY';
  }
  return h;
}

/* penyedia lokal (9Router/Ollama/LM Studio) boleh tanpa kunci; yang penting
   kuncinya KALAU ADA tetap dikirim, karena 9Router bisa memasang
   REQUIRE_API_KEY=true untuk membatasi akses. */
function bolehJalan(p) { return p.adaKunci || p.lokal; }
function pesanButuhKunci(p) {
  return p.lokal
    ? 'Penyedia lokal ' + p.nama + ' di ' + p.dasar + ' — jalankan dulu di terminal.'
    : 'Kunci penyedia teks belum dipasang (AI_API_KEY / OPENROUTER_KEY).';
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
        'Pembuat gambar belum aktif: penyedia gambar AI semuanya berbayar, jadi kunci harus dipasang dulu. ' +
        'Isi Environment Variable IMAGE_PROVIDER (openai/stability/together) dan IMAGE_API_KEY, lalu fitur ini langsung jalan.',
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
      penyedia: t.nama, alamat: t.dasar, adaKunci: t.adaKunci, kunci: samarkan(t.kunci),
      modelTetap: env.AI_MODEL || null, lokal: t.lokal,
      catatan: t.lokal
        ? (t.nama === '9router'
          ? 'Router AI lokal (9Router) di komputer ini — harus dijalankan dulu di terminal, lalu buka dashboard http://localhost:20128/dashboard untuk kunci/model.'
          : 'Penyedia AI lokal di komputer ini — harus jalan sebelum dipakai.')
        : null,
    },
    gambar: { penyedia: g.nama || '(belum diatur)', model: g.model, siap: g.siap, kunci: samarkan(g.kunci) },
    suara: { stt: { penyedia: s.nama || '(bawaan browser)', siap: s.siap }, tts: { penyedia: v.nama || '(bawaan browser)', siap: v.siap, suara: v.suara } },
    deploy: { penyedia: env.DEPLOY_PROVIDER || '(belum diatur)', siap: !!env.DEPLOY_TOKEN },
    penjadwal: { penyedia: (env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL) ? 'penyimpanan KV' : '(belum diatur)', siap: !!(env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL) },
    catatan: 'Hanya status yang tampil di sini — kunci asli tidak pernah dikirim ke browser.',
  };
}

export const KUNCI_BAWAAN = KUNCI_BAWAAN_OPENROUTER;
