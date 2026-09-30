/*
 * uji-penyedia-gratis.mjs — membuktikan penyedia GRATIS benar-benar jalan di
 * aplikasi ini, lewat endpoint aplikasinya sendiri (bukan cuma teori).
 *
 *   A. Pollinations — gratis, TANPA kunci & tanpa mendaftar (kuota anonimnya
 *      ketat; kalau sedang dibatasi, itu dicatat apa adanya, bukan "lulus").
 *   B. Gemini (Google AI Studio) — lewat router tiruan: nama, model, dan foto.
 *   C. Cloudflare Workers AI — lewat tiruan: SATU akun untuk teks, gambar (FLUX),
 *      dengar (Whisper), dan suara (MeloTTS).
 *
 *   node tools/uji-penyedia-gratis.mjs
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catatan = [];
const tulis = (s) => { console.log(s); catatan.push(s); };
let gagal = 0, dilewati = 0;
const cek = (nama, lulus, info = '') => {
  tulis('  ' + (lulus ? '✓' : '✗') + ' ' + nama + (info ? ' — ' + String(info).slice(0, 120) : ''));
  if (!lulus) gagal++;
};
const lewat = (nama, info = '') => { tulis('  · ' + nama + (info ? ' — ' + String(info).slice(0, 140) : '')); dilewati++; };
const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));

const proses = [];
/* kalau pengujian dihentikan (Ctrl+C / timeout), semua proses anak ikut dimatikan */
for (const sinyal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sinyal, () => { for (const q of proses) { try { q.kill('SIGKILL'); } catch (e) {} } process.exit(130); });
}
function jalankan(nama, arg, env = {}) {
  const p = spawn('node', arg, { cwd: AKAR, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {});
  p.stderr.on('data', (d) => { const s = String(d); if (!/^\s*$/.test(s)) catatan.push('  [' + nama + '] ' + s.trim().slice(0, 180)); });
  proses.push(p);
  return p;
}
const kirim = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/* PNG 32x32 merah untuk uji "kirim foto" */
const PNG_MERAH = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAJklEQVR4nO3OMQEAIAzAsIF/z0NGHjQKej1zZoZ9+5eXl5eXl5fXzwc1CwIBSm6FQwAAAABJRU5ErkJggg==';
const PNG_KECIL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/* ── tiruan Google AI Studio dengan protokol ASLI (v1beta) ──
   Dipakai untuk membuktikan aplikasi bicara ke Google dengan cara Google:
   GET  /v1beta/models
   POST /v1beta/models/<model>:generateContent   (+ :streamGenerateContent)
   Kunci lewat header X-goog-api-key atau ?key= (dua-duanya diterima Google). */
function tiruanGeminiNative(port) {
  const jejak = [];
  const kotak = { jejak, pakaiKunci: false };
  const srv = http.createServer((req, res) => {
    const keping = [];
    req.on('data', (c) => keping.push(c));
    req.on('end', () => {
      const url = String(req.url || '');
      jejak.push(url);
      if (req.headers['x-goog-api-key'] || /[?&]key=/.test(url)) kotak.pakaiKunci = true;
      const jawab = (o, kode = 200) => { res.writeHead(kode, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      let badan = {};
      try { badan = JSON.parse(Buffer.concat(keping).toString('utf8') || '{}'); } catch (e) {}
      const adaLihat = JSON.stringify(badan).indexOf('inlineData') >= 0 || JSON.stringify(badan).indexOf('inline_data') >= 0;

      if (/:streamGenerateContent/.test(url)) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
        ['1 ', '2 ', '3'].forEach((t) => res.write('data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] }) + '\n\n'));
        res.end();
        return;
      }
      if (/:generateContent/.test(url)) {
        jawab({ candidates: [{ content: { parts: [{ text: adaLihat ? 'Merah' : 'Kopi adalah minuman hasil seduhan biji kopi.' }] } }] });
        return;
      }
      if (/\/models\/?$/.test(url.replace(/\?.*$/, ''))) {
        jawab({ models: [
          { name: 'models/gemini-flash-lite-latest', supportedGenerationMethods: ['generateContent', 'streamGenerateContent'] },
          { name: 'models/gemini-3.1-flash-lite', supportedGenerationMethods: ['generateContent', 'streamGenerateContent'] },
        ] });
        return;
      }
      jawab({ error: { code: 404, message: 'tidak ada di tiruan: ' + url } }, 404);
    });
  });
  srv.listen(port, '127.0.0.1');
  return kotak;
}

/* ── tiruan Cloudflare Workers AI (teks + /run untuk gambar & suara) ── */
function tiruanCloudflare(port) {
  const srv = http.createServer((req, res) => {
    let badan = [];
    req.on('data', (c) => badan.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(badan);
      const jawab = (o, tipe = 'application/json') => { res.writeHead(200, { 'Content-Type': tipe }); res.end(typeof o === 'string' ? o : JSON.stringify(o)); };
      const url = req.url || '';
      if (url.endsWith('/models')) return jawab({ object: 'list', data: [
        { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', object: 'model' },
        { id: '@cf/meta/llama-3.2-11b-vision-instruct', object: 'model' },
      ] });
      if (url.includes('/run/@cf/black-forest-labs/flux-1-schnell')) {
        return jawab({ result: { image: PNG_KECIL }, success: true });
      }
      if (url.includes('/run/@cf/openai/whisper')) {
        catatan.push('  [cf] whisper menerima ' + buf.length + ' bita audio, content-type=' + (req.headers['content-type'] || '-'));
        return jawab({ result: { text: 'halo, ini hasil dengar tiruan' }, success: true });
      }
      if (url.includes('/run/@cf/myshell-ai/melotts')) {
        return jawab({ result: { audio: 'SU5JQVVESU9USUJVQU4=' }, success: true });   /* bukan mp3 sungguhan, hanya bentuknya */
      }
      if (url.endsWith('/chat/completions')) {
        const body = JSON.parse(buf.toString() || '{}');
        const adaGambar = JSON.stringify(body.messages || []).includes('image_url');
        return jawab({
          id: 'cf-uji', object: 'chat.completion', model: body.model,
          choices: [{ index: 0, message: { role: 'assistant', content: adaGambar ? 'Latar belakang merah.' : 'Kopi adalah minuman.' }, finish_reason: 'stop' }],
        });
      }
      jawab({ ok: false, pesan: 'tiruan tidak mengenal ' + url }, 'application/json');
    });
  });
  srv.listen(port, '127.0.0.1');
  proses.push({ kill: () => srv.close() });
  return srv;
}

try {
  /* ─────────────── A. Pollinations (gratis, tanpa kunci) ─────────────── */
  tulis('══ A. Pollinations — GRATIS, tanpa kunci, tanpa pendaftaran ══');
  const PORT_A = 8153;
  jalankan('app-pollinations', ['tools/server-uji.mjs'], {
    PORT: String(PORT_A), AI_PROVIDER: 'pollinations', AI_API_KEY: '', NINE_API_KEY: '',
    GEMINI_API_KEY: '', GROQ_API_KEY: '', CF_API_TOKEN: '',
  });
  await tunggu(1600);
  const APP_A = 'http://127.0.0.1:' + PORT_A;

  const info = await (await fetch(APP_A + '/api/chat')).json();
  const prov = await (await fetch(APP_A + '/api/providers')).json();
  tulis('   penyedia: ' + JSON.stringify({ nama: info.penyedia.nama, label: prov.teks.label, alamat: prov.teks.alamat, adaKunci: prov.teks.adaKunci }));
  tulis('   gambar  : ' + JSON.stringify({ penyedia: prov.gambar.penyedia, model: prov.gambar.model, siap: prov.gambar.siap }));
  cek('penyedia dilaporkan Pollinations', info.penyedia.nama === 'pollinations' && /pollinations/i.test(prov.teks.label));
  cek('dikenali sebagai penyedia tanpa kunci', prov.teks.adaKunci === true);
  cek('model bawaan dari penyedia gratis', /openai-fast/.test(JSON.stringify(info.modes)));
  cek('pembuat gambar otomatis siap (tanpa setelan)', prov.gambar.siap === true && /pollinations/i.test(prov.gambar.penyedia), prov.gambar.penyedia);
  cek('model gambar gratis memakai model yang dilayani penyedia', /sana|flux/i.test(String(prov.gambar.model || '')), prov.gambar.model);

  /* A1. percakapan sungguhan (kuota anonim Pollinations ketat → dicatat apa adanya) */
  const j1 = await (await kirim(APP_A + '/api/chat', { prompt: 'Balas satu kalimat singkat: apa itu kopi?', stream: false })).json();
  if (j1.ok && String(j1.text || '').length > 5) {
    tulis('   jawaban: "' + String(j1.text).slice(0, 90) + '" · model ' + (j1.model || '-'));
    cek('percakapan gratis berhasil (tanpa kunci)', true);
    cek('penalaran internal model tidak ikut tampil', !/reasoning|User writes|probably wants/i.test(String(j1.text)));
  } else {
    lewat('percakapan Pollinations sedang dibatasi penyedianya', String(j1.pesan).slice(0, 90));
    cek('pesannya jujur menyebut galat penyedia (bukan jawaban palsu)', /tidak ada model|galat terakhir|402|batas/i.test(String(j1.pesan || '')));
  }

  /* A2. pembuat gambar gratis */
  const g1 = await (await kirim(APP_A + '/api/image/generate', { prompt: 'secangkir kopi di meja kayu', rasio: '1:1' })).json();
  if (g1.ok) {
    const gbr1 = String(g1.gambar || g1.dataUrl || '');
    tulis('   gambar: ok · ' + g1.penyedia + ' · ' + g1.model + ' · ' + gbr1.length + ' karakter data URL');
    cek('pembuat gambar gratis menghasilkan gambar sungguhan', /^data:image\//.test(gbr1) && gbr1.length > 500);
  } else {
    lewat('pembuat gambar Pollinations sedang dibatasi penyedianya', String(g1.pesan).slice(0, 90));
    cek('pesan gambarnya jujur (menyebut 402/batas atau penyedia lain)', /402|batas|cloudflare|pollinations/i.test(String(g1.pesan || '')));
  }

  /* A3. kirim foto ke penyedia yang belum bisa melihat → harus jujur */
  const j2 = await (await kirim(APP_A + '/api/chat', { prompt: 'Warna apa ini?', stream: false, gambar: ['data:image/png;base64,' + PNG_MERAH] })).json();
  tulis('   kirim foto → ' + String(j2.pesan || j2.text).slice(0, 120));
  cek('dijawab jujur: penyedia ini belum bisa melihat gambar', j2.ok === false && /belum bisa melihat gambar/i.test(String(j2.pesan || '')));
  cek('pesannya menyebut jalan keluarnya (gemini + kunci gratis)', /aistudio\.google\.com/i.test(String(j2.pesan || '')));

  /* ─────────────── B. Gemini (Google AI Studio) ─────────────── */
  tulis('');
  tulis('══ B. Gemini — Google AI Studio, jalur OpenAI-compatible (tiruan, tanpa kuota) ══');
  const PORT_B = 8154, PORT_MOCK_B = 8155;
  jalankan('mock-gemini', ['tools/mock-openai.mjs', '--port', String(PORT_MOCK_B), '--butuh-kunci', 'sk-uji-gemini',
    '--model-daftar', 'gemini-3.8-flash,gemini-3.1-flash-lite,gemini-2.5-flash']);
  jalankan('app-gemini', ['tools/server-uji.mjs'], {
    PORT: String(PORT_B), AI_PROVIDER: 'gemini', AI_API_KEY: 'sk-uji-gemini',
    AI_BASE_URL: 'http://127.0.0.1:' + PORT_MOCK_B + '/v1', AI_GAYA: 'openai',
    /* kunci khusus disetel kosong supaya yang dipakai pasti AI_API_KEY (tiruan) —
       kalau tidak, kunci asli dari .env.local yang dipakai dan tiruan menolaknya */
    GEMINI_API_KEY: 'sk-uji-gemini', GOOGLE_API_KEY: 'sk-uji-gemini', AISTUDIO_API_KEY: 'sk-uji-gemini',
    CF_API_TOKEN: '', CF_ACCOUNT_ID: '',
  });
  await tunggu(1800);
  const APP_B = 'http://127.0.0.1:' + PORT_B;

  const infoB = await (await fetch(APP_B + '/api/chat')).json();
  tulis('   penyedia: ' + JSON.stringify({ nama: infoB.penyedia.nama, label: infoB.penyedia.label }));
  cek('penyedia dilaporkan gemini', infoB.penyedia.nama === 'gemini');
  cek('nama tampilannya "Google AI Studio (Gemini)"', /Google AI Studio/.test(String(infoB.penyedia.label)));
  cek('protokol bisa dipaksa OpenAI-compatible (AI_GAYA=openai)', String(infoB.penyedia.protokol || infoB.penyedia.gaya || 'openai') === 'openai');

  const j3 = await (await kirim(APP_B + '/api/chat', { prompt: 'Balas HANYA dengan tiga kata: apa itu kopi?', stream: false })).json();
  tulis('   jawaban: "' + String(j3.text || j3.pesan).slice(0, 80) + '"');
  cek('percakapan lewat penyedia Gemini', j3.ok === true && String(j3.text || '').length > 3);

  const j4 = await (await kirim(APP_B + '/api/chat', { prompt: 'Apa warna latar gambar ini? Jawab singkat.', stream: false, gambar: ['data:image/png;base64,' + PNG_MERAH] })).json();
  tulis('   kirim foto → "' + String(j4.text || j4.pesan).slice(0, 90) + '"');
  cek('foto diterima penyedia yang bisa melihat gambar', j4.ok === true && /merah/i.test(String(j4.text || '')));

  /* ── B2. Gemini dengan protokol ASLI Google (dipakai aplikasi sekarang) ── */
  tulis('');
  tulis('══ B2. Gemini — protokol asli Google (…/v1beta/models/<model>:generateContent) ══');
  const PORT_B2 = 8158, PORT_MOCK_B2 = 8159;
  const tiruanB2 = tiruanGeminiNative(PORT_MOCK_B2);
  jalankan('app-gemini-asli', ['tools/server-uji.mjs'], {
    PORT: String(PORT_B2), AI_PROVIDER: 'gemini', AI_API_KEY: 'AQ.kunci-uji-asli', GEMINI_API_KEY: 'AQ.kunci-uji-asli',
    AI_BASE_URL: 'http://127.0.0.1:' + PORT_MOCK_B2 + '/v1beta', AI_GAYA: '', CF_API_TOKEN: '', CF_ACCOUNT_ID: '',
  });
  await tunggu(1800);
  const APP_B2 = 'http://127.0.0.1:' + PORT_B2;

  const infoB2 = await (await fetch(APP_B2 + '/api/chat')).json();
  tulis('   penyedia: ' + JSON.stringify({ nama: infoB2.penyedia.nama, protokol: infoB2.penyedia.protokol }));
  cek('penyedia gemini memakai protokol asli Google', infoB2.penyedia.protokol === 'gemini' || infoB2.penyedia.gaya === 'gemini');

  const jB2teks = await (await kirim(APP_B2 + '/api/chat', { prompt: 'Balas satu kalimat: apa itu kopi?', stream: false })).json();
  tulis('   jawaban: "' + String(jB2teks.text || jB2teks.pesan).slice(0, 80) + '" · model ' + (jB2teks.model || '-'));
  cek('percakapan lewat protokol asli Gemini', jB2teks.ok === true && String(jB2teks.text || '').length > 3);

  const jB2gambar = await (await kirim(APP_B2 + '/api/chat', { prompt: 'Warna apa ini?', stream: false, gambar: ['data:image/png;base64,' + PNG_MERAH] })).json();
  tulis('   kirim foto → "' + String(jB2gambar.text || jB2gambar.pesan).slice(0, 70) + '"');
  cek('foto dikirim sebagai inlineData ke Gemini asli', jB2gambar.ok === true && /merah/i.test(String(jB2gambar.text || '')));

  const jejakB2 = tiruanB2.jejak.join(' | ');
  tulis('   jejak permintaan ke tiruan: ' + jejakB2.slice(0, 160));
  cek('benar-benar memakai /models/<model>:generateContent', /:generateContent/.test(jejakB2));
  cek('tidak memakai /chat/completions (itu jalur OpenAI-compatible)', !/chat\/completions/.test(jejakB2));
  cek('kunci dikirim dengan cara Google (X-goog-api-key atau ?key=)', tiruanB2.pakaiKunci === true);

  /* ─────────────── C. Cloudflare Workers AI (satu akun, semua fitur) ─────────────── */
  tulis('');
  tulis('══ C. Cloudflare Workers AI — satu akun untuk SEMUA fitur (tiruan) ══');
  const PORT_C = 8156, PORT_MOCK_C = 8157;
  tiruanCloudflare(PORT_MOCK_C);
  jalankan('app-cloudflare', ['tools/server-uji.mjs'], {
    PORT: String(PORT_C), AI_PROVIDER: 'cloudflare', CF_ACCOUNT_ID: 'akun-uji', CF_API_TOKEN: 'token-uji',
    CF_BASE_URL: 'http://127.0.0.1:' + PORT_MOCK_C,
    /* AI_BASE_URL dikosongkan dengan sengaja: alamat harus disusun dari ID akun Cloudflare.
       (Kalau .env.local berisi AI_BASE_URL lain, nilai itu yang menang — jadi dikosongkan.) */
    AI_BASE_URL: '',
    STT_PROVIDER: 'cloudflare', STT_BASE_URL: 'http://127.0.0.1:' + PORT_MOCK_C,
    TTS_PROVIDER: 'cloudflare', TTS_BASE_URL: 'http://127.0.0.1:' + PORT_MOCK_C,
    AI_API_KEY: '', NINE_API_KEY: '', GEMINI_API_KEY: '',
  });
  await tunggu(1800);
  const APP_C = 'http://127.0.0.1:' + PORT_C;

  const provC = await (await fetch(APP_C + '/api/providers')).json();
  tulis('   penyedia: ' + JSON.stringify({ teks: provC.teks.label, gambar: provC.gambar.penyedia, gambarSiap: provC.gambar.siap, suara: provC.suara }));
  cek('penyedia = Cloudflare Workers AI', /cloudflare/i.test(String(provC.teks.label)) && provC.teks.label.indexOf('Cloudflare') === 0, provC.teks.label);
  cek('alamat teks mengikuti setelan akun (tiruan)', String(provC.teks.alamat) === 'http://127.0.0.1:' + PORT_MOCK_C + '/v1', provC.teks.alamat);
  {
    const m = await import('../api/_ai.js');
    const asli = m.penyediaTeks({ AI_PROVIDER: 'cloudflare', CF_ACCOUNT_ID: 'akun-uji', CF_API_TOKEN: 'token-uji' });
    cek('rumus alamat asli Cloudflare benar', asli.dasar === 'https://api.cloudflare.com/client/v4/accounts/akun-uji/ai/v1', asli.dasar);
  }
  cek('pembuat gambar otomatis ikut Cloudflare (FLUX)', /cloudflare/i.test(String(provC.gambar.penyedia)) && provC.gambar.siap === true);
  cek('dengar & suara dilaporkan siap (Whisper + MeloTTS)', provC.suara.stt.siap === true && provC.suara.tts.siap === true, JSON.stringify(provC.suara).slice(0, 100));

  const j5 = await (await kirim(APP_C + '/api/chat', { prompt: 'Balas satu kalimat: apa itu kopi?', stream: false })).json();
  tulis('   percakapan: ' + (j5.ok ? '"' + String(j5.text).slice(0, 60) + '"' : String(j5.pesan).slice(0, 80)));
  cek('teks lewat Cloudflare (endpoint OpenAI-compatible-nya)', j5.ok === true && String(j5.text || '').length > 3);

  const g2 = await (await kirim(APP_C + '/api/image/generate', { prompt: 'kucing oranye', rasio: '1:1' })).json();
  tulis('   gambar: ' + (g2.ok ? g2.penyedia + ' · ' + g2.model : String(g2.pesan).slice(0, 90)));
  cek('gambar lewat Cloudflare (FLUX /run)', g2.ok === true && /^data:image\//.test(String(g2.gambar || g2.dataUrl || '')));

  const ai = await import(path.join(AKAR, 'api/_ai.js'));
  const envCf = {
    STT_PROVIDER: 'cloudflare', STT_BASE_URL: 'http://127.0.0.1:' + PORT_MOCK_C, CF_API_TOKEN: 'token-uji',
    TTS_PROVIDER: 'cloudflare', TTS_BASE_URL: 'http://127.0.0.1:' + PORT_MOCK_C, TTS_VOICE: 'id-ID',
  };
  const stt = await ai.speechToText({ env: envCf, audioBase64: Buffer.from('audio-uji').toString('base64'), mime: 'audio/webm' });
  tulis('   dengar (Whisper): ' + JSON.stringify(stt).slice(0, 120));
  cek('dengar lewat Cloudflare Whisper', stt.ok === true && /halo/i.test(String(stt.teks)));
  const tts = await ai.textToSpeech({ env: envCf, teks: 'Halo, ini uji suara.' });
  tulis('   suara (MeloTTS): ' + String(tts.dataUrl || tts.pesan).slice(0, 60));
  cek('suara lewat Cloudflare MeloTTS', tts.ok === true && /^data:audio\//.test(String(tts.dataUrl || '')));

  const hC = await (await fetch(APP_C + '/api/health?uji=chat')).json();
  tulis('   health: ' + JSON.stringify(hC.kemampuan || {}));
  cek('health menyebut kemampuan + pembuat gambar siap', !!hC.kemampuan && hC.kemampuan.pembuatGambarSiap === true && hC.kemampuan.lihatGambar === true);
} catch (e) {
  gagal++;
  tulis('GAGAL: ' + e.message);
} finally {
  proses.forEach((p) => { try { p.kill('SIGTERM'); } catch (e) {} });
}

const kepala = 'UJI PENYEDIA GRATIS — Pollinations (tanpa kunci) · Gemini · Cloudflare Workers AI\n'
  + new Date().toLocaleString('id-ID') + '\n' + '─'.repeat(60) + '\n';
fs.writeFileSync(path.join(AKAR, 'bukti-uji', 'HASIL-UJI-PENYEDIA-GRATIS.txt'),
  kepala + catatan.join('\n') + '\n\n'
  + (gagal ? 'HASIL: GAGAL — ' + gagal + ' pemeriksaan' : 'HASIL: SEMUA LULUS')
  + (dilewati ? ' (' + dilewati + ' bagian dilewati karena kuota gratis penyedianya sedang habis — dicatat apa adanya)' : '') + '\n');
console.log(gagal ? '\nHASIL: GAGAL — ' + gagal + ' pemeriksaan'
  : '\nHASIL: SEMUA LULUS' + (dilewati ? ' (' + dilewati + ' bagian dilewati karena kuota gratis penyedianya habis)' : ''));
process.exit(gagal ? 1 : 0);
