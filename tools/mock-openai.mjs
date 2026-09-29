/*
 * mock-openai.mjs — TIRUAN gateway OpenAI-compatible (dipakai untuk meniru
 * NaraRouter pada pengujian: alamat, kunci, daftar model, jawaban & streaming).
 *
 * Tujuannya: membuktikan Van Chat.SPY benar-benar bisa berjalan dengan
 * penyedia sungguhan — tanpa memakai kuota asli.
 * Tiruan ini meniru bagian yang dipakai aplikasi:
 *   GET  /v1/models            → daftar model (OpenAI format)
 *   POST /v1/chat/completions  → jawaban biasa & mengalir (SSE), termasuk
 *                                "melihat" gambar (kalau base64 gambar valid)
 * Kunci: kalau dijalankan dengan --butuh-kunci, wajib Bearer token.
 *
 *   node tools/mock-openai.mjs [--port 20128] [--butuh-kunci kunci-rahasia]
 *   node tools/mock-openai.mjs --model-daftar "agnes-2.5-flash,agnes-3-flash" 
 */
import http from 'node:http';
import crypto from 'node:crypto';

const arg = (nama, bawaan) => {
  const i = process.argv.indexOf('--' + nama);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : bawaan;
};
const PORT = Number(arg('port', process.env.MOCK_OPENAI_PORT || 20128));
const KUNCI = arg('butuh-kunci', '');
const HOST = arg('host', process.env.MOCK_OPENAI_HOST || '127.0.0.1');

/* model tiruan bawaan.
   Bisa diganti lewat --model-daftar "a,b,c" supaya tiruan yang sama bisa dipakai
   untuk gateway OpenAI-compatible apa pun (mis. NaraRouter: agnes-2.5-flash, …). */
const MODEL = (() => {
  const daftar = arg('model-daftar', '');
  if (daftar) return String(daftar).split(',').map((s) => s.trim()).filter(Boolean);
  return [
    'kr/claude-sonnet-4.5',
    'cc/claude-opus-4-7',
    'gh/gpt-5-mini',
    'if/glm-4.7',
    'if/kimi-k2-thinking',
    'vertex/gemini-3-flash',
    'oc/opencode-flash',
  ];
})();

const kirim = (res, status, isi, jenis = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': jenis, 'Cache-Control': 'no-store' });
  res.end(typeof isi === 'string' ? isi : JSON.stringify(isi));
};

function kunciSah(req) {
  if (!KUNCI) return true;
  const h = String(req.headers.authorization || '');
  return h === 'Bearer ' + KUNCI;
}

/* ── baca pesan terakhir dari pengguna (bukan seluruh isi permintaan) ── */
function pesanTerakhir(messages) {
  const daftar = Array.isArray(messages) ? messages : [];
  for (let i = daftar.length - 1; i >= 0; i--) {
    const m = daftar[i];
    if (!m || m.role !== 'user') continue;
    if (typeof m.content === 'string') return { teks: m.content, gambar: false };
    const bagian = Array.isArray(m.content) ? m.content : [];
    const teks = bagian.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('\n');
    const gambar = bagian.some((b) => b && b.type === 'image_url' && /iVBOR|\/9j\/|data:image/i.test(JSON.stringify(b.image_url || {})));
    return { teks, gambar };
  }
  return { teks: '', gambar: false };
}

/* balasan tiruan: mengikuti perintah sederhana supaya uji kepatuhan bisa jalan */
function balas(messages) {
  const { teks, gambar } = pesanTerakhir(messages);
  if (/melihat gambar|warna latar|bentuk apa|gambar ini|foto ini/i.test(teks)) {
    /* kalau gambarnya benar-benar terkirim → sebut isinya; kalau tidak → jujur */
    return gambar
      ? 'Latar belakang merah dengan lingkaran putih di tengah dan batang vertikal biru.'
      : 'Saya tidak menerima gambar apa pun di pesan ini.';
  }
  if (/tiga kata/i.test(teks)) return 'Kopi adalah minuman.';
  if (/lima kata/i.test(teks)) return 'Minuman hangat dari daun teh.';
  if (/daftar bernomor/i.test(teks)) return '1. Teh berasal dari daun Camellia sinensis.\n2. Teh mengandung kafein dan antioksidan.';
  if (/hanya kode|hanya kodenya/i.test(teks)) return '```python\nprint("halo dari gateway")\n```';
  if (/in english|bahasa inggris/i.test(teks)) return 'Coffee is a brewed drink made from roasted coffee beans.';
  if (/Bangun proyek web dari permintaan|AI Builder di Van Chat/i.test(teks)) {
    return JSON.stringify({
      nama: 'KartuUlangTahun',
      deskripsi: 'Kartu ucapan ulang tahun satu halaman (dibuat lewat gateway).',
      berkas: [
        { path: 'index.html', isi: '<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Kartu Ulang Tahun</title><link rel="stylesheet" href="styles.css"></head><body><main class="kartu"><h1>Selamat Ulang Tahun!</h1><p>Semoga tahun ini penuh hal baik.</p><button id="b">Kejutkan</button></main><script src="app.js"></script></body></html>' },
        { path: 'styles.css', isi: 'body{margin:0;background:#0c0c0e;color:#fff;font:16px system-ui;display:grid;place-items:center;height:100vh}.kartu{border:1px solid #333;border-radius:16px;padding:32px;text-align:center}button{margin-top:18px;padding:10px 18px;border:0;border-radius:10px;background:#fa0102;color:#fff;font:inherit}' },
        { path: 'app.js', isi: 'document.getElementById("b").onclick=function(){document.querySelector("h1").textContent="Selamat Ulang Tahun!";};' },
      ],
    });
  }
  if (/perbaiki berkas/i.test(teks)) return 'console.log("berkas diperbaiki lewat gateway");\n';
  if (/pertanyaan riset/i.test(teks)) return '1. Sejarah kopi\n2. Budidaya kopi\n3. Pengolahan kopi\n4. Konsumsi kopi';
  if (/laporan riset/i.test(teks)) return '## Pendahuluan\n\nKopi arabika tumbuh di dataran tinggi [1].\n\n## Simpulan\n\nSelesai.';
  return 'Jawaban dari gateway tiruan untuk: ' + String(teks).slice(0, 60);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/dashboard') {
    return kirim(res, 200, '<!doctype html><meta charset="utf-8"><title>Gateway (tiruan)</title>'
      + '<body style="font:16px system-ui;background:#0c0c0e;color:#eee;padding:32px">'
      + '<h1>Gateway OpenAI-compatible — tiruan untuk pengujian</h1>'
      + '<p>Ini bukan layanan asli. Dipakai untuk membuktikan Van Chat.SPY bisa berjalan lewat gateway OpenAI-compatible. '
      + 'Model tiruan: ' + MODEL.length + ' · kunci: ' + (KUNCI ? 'diwajibkan' : 'bebas') + '.</p>'
      + '<p>API: <code>http://127.0.0.1:' + PORT + '/v1</code></p></body>', 'text/html; charset=utf-8');
  }
  if (!url.pathname.startsWith('/v1/')) return kirim(res, 404, { error: { message: 'bukan endpoint gateway (tiruan)' } });
  if (!kunciSah(req)) return kirim(res, 401, { error: { message: 'API key tidak sah (gateway tiruan)' } });

  if (url.pathname === '/v1/models') {
    return kirim(res, 200, { object: 'list', data: MODEL.map((id) => ({ id, object: 'model', owned_by: id.split('/')[0] })) });
  }

  if (url.pathname === '/v1/chat/completions' && req.method === 'POST') {
    const potongan = [];
    for await (const c of req) potongan.push(c);
    let badan = {};
    try { badan = JSON.parse(Buffer.concat(potongan).toString('utf8')); } catch (e) { /* biarkan */ }
    const jawab = balas(badan.messages);
    const ringkas = pesanTerakhir(badan.messages);
    if (process.env.RIUH_MOCK) console.log('  [masuk] model=' + (badan.model || '-') + ' alir=' + (badan.stream ? 'ya' : 'tidak') + ' gambar=' + (ringkas.gambar ? 'ya' : 'tidak') + ' pesan="' + ringkas.teks.replace(/\s+/g, ' ').slice(0, 60) + '"');
    const model = badan.model || MODEL[0];
    const id = 'chatcmpl-' + crypto.randomBytes(4).toString('hex');
    if (badan.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      const bagi = jawab.match(/[\s\S]{1,24}/g) || [''];
      res.write('data: ' + JSON.stringify({ id, object: 'chat.completion.chunk', model, choices: [{ index: 0, delta: { role: 'assistant' } }] }) + '\n\n');
      for (const b of bagi) {
        res.write('data: ' + JSON.stringify({ id, object: 'chat.completion.chunk', model, choices: [{ index: 0, delta: { content: b } }] }) + '\n\n');
      }
      res.write('data: ' + JSON.stringify({ id, object: 'chat.completion.chunk', model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) + '\n\n');
      res.write('data: [DONE]\n\n');
      return res.end();
    }
    return kirim(res, 200, {
      id, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model,
      choices: [{ index: 0, message: { role: 'assistant', content: jawab }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 12, completion_tokens: 24, total_tokens: 36 },
    });
  }

  return kirim(res, 404, { error: { message: 'endpoint tiruan belum dibuat: ' + url.pathname } });
});

server.listen(PORT, HOST, () => {
  console.log('  gateway TIRUAN jalan di http://' + HOST + ':' + PORT + '/v1');
  console.log('  model: ' + MODEL.length + ' · kunci: ' + (KUNCI ? 'diwajibkan' : 'bebas'));
});
