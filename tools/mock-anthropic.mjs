/*
 * mock-anthropic.mjs — TIRUAN penyedia bergaya Anthropic (mis. gateway seperti
 * cc.freemodel.dev) untuk menguji aplikasi tanpa memakai saldo sungguhan.
 *
 *   GET  /v1/models    → daftar model (object: "model", supported_endpoint_types: ["anthropic"])
 *   POST /v1/messages  → jawaban gaya Anthropic (JSON) atau mengalir (SSE):
 *                        event: content_block_delta → data: {"delta":{"text":"…"}}
 *   --saldo-habis      → menjawab 401 {"error":"Insufficient balance"} (seperti akun tanpa saldo)
 *   --butuh-kunci      → wajib header x-api-key
 *
 *   node tools/mock-anthropic.mjs [--port 20140] [--butuh-kunci KUNCI] [--saldo-habis]
 */
import http from 'node:http';
import crypto from 'node:crypto';

const arg = (nama, bawaan) => {
  const i = process.argv.indexOf('--' + nama);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : (i >= 0 ? true : bawaan);
};
const PORT = Number(arg('port', 20140));
const HOST = String(arg('host', '127.0.0.1'));
const KUNCI = String(arg('butuh-kunci', '') === true ? '' : arg('butuh-kunci', ''));
const SALDO_HABIS = arg('saldo-habis', false) === true;

const MODEL = [
  'claude-opus-5-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-sonnet-5',
  'claude-sonnet-4-6', 'claude-haiku-4-5-20251001',
];

const kirim = (res, status, isi) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(typeof isi === 'string' ? isi : JSON.stringify(isi));
};

/* ambil teks & gambar dari bentuk pesan Anthropic */
function bacaPesan(messages) {
  let teks = '';
  let gambar = false;
  const daftar = Array.isArray(messages) ? messages : [];
  for (let i = daftar.length - 1; i >= 0; i--) {
    const m = daftar[i];
    if (!m || m.role !== 'user') continue;
    if (typeof m.content === 'string') { teks = m.content; break; }
    const bagian = Array.isArray(m.content) ? m.content : [];
    teks = bagian.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('\n');
    gambar = bagian.some((b) => b && b.type === 'image' && b.source && /iVBOR|\/9j\//.test(String(b.source.data || '')));
    break;
  }
  return { teks, gambar };
}

function balas(teks, gambar, sistem) {
  if (/warna latar|bentuk apa|gambar ini|foto ini|melihat gambar/i.test(teks)) {
    return gambar
      ? 'Latar belakang merah dengan lingkaran putih di tengah dan batang vertikal biru.'
      : 'Saya tidak menerima gambar apa pun di pesan ini.';
  }
  if (/tiga kata/i.test(teks)) return 'Kopi adalah minuman.';
  if (/lima kata/i.test(teks)) return 'Minuman hangat dari daun teh.';
  if (/daftar bernomor/i.test(teks)) return '1. Teh berasal dari daun Camellia sinensis.\n2. Teh mengandung kafein dan antioksidan.';
  if (/hanya kode|hanya kodenya/i.test(teks)) return '```python\nprint("halo dari penyedia anthropic")\n```';
  if (/in english|bahasa inggris/i.test(teks)) return 'Coffee is a brewed drink made from roasted coffee beans.';
  /* permintaan AI Builder dikenali dari system prompt-nya (bukan dari kata di pesan),
     supaya tidak salah tangkap seperti instruksi bentuk milik aplikasi sendiri */
  if (/berkas HTML utuh|Mulai dari <!DOCTYPE html>/i.test(String(sistem || ''))) {
    return '<!DOCTYPE html>\n<html lang="id"><head><meta charset="utf-8"><title>Halaman Uji</title>'
      + '<style>body{background:#0c0c0e;color:#eee;font:16px system-ui;padding:40px}h1{color:#fa0102}</style></head>'
      + '<body><h1>Halaman dari penyedia gaya Anthropic</h1><p>Halaman ini dibuat lewat /v1/messages.</p>'
      + '<button onclick="this.textContent=\'Diklik\'">Klik saya</button></body></html>';
  }
  return 'Jawaban dari penyedia anthropic tiruan untuk: ' + String(teks).slice(0, 60);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');

  if (url.pathname === '/v1/models' && req.method === 'GET') {
    /* seperti penyedia aslinya: daftar model boleh dibaca tanpa kunci */
    return kirim(res, 200, {
      data: MODEL.map((id) => ({ id, object: 'model', created: 1626777600, owned_by: 'anthropic', supported_endpoint_types: ['anthropic'] })),
    });
  }

  if (url.pathname === '/v1/messages' && req.method === 'POST') {
    const bagian = [];
    for await (const c of req) bagian.push(c);
    let badan = {};
    try { badan = JSON.parse(Buffer.concat(bagian).toString('utf8')); } catch (e) { /* biarkan */ }

    if (KUNCI) {
      const dikirim = String(req.headers['x-api-key'] || '');
      if (dikirim !== KUNCI) return kirim(res, 401, { type: 'error', error: { type: 'authentication_error', message: 'x-api-key tidak sah (tiruan anthropic)' } });
    }
    if (SALDO_HABIS) return kirim(res, 401, { error: 'Insufficient balance' });
    if (String(req.headers['anthropic-version'] || '') === '') {
      return kirim(res, 400, { type: 'error', error: { type: 'invalid_request_error', message: 'header anthropic-version wajib' } });
    }

    const { teks, gambar } = bacaPesan(badan.messages);
    const jawab = balas(String(teks || ''), gambar, badan.system);
    const model = badan.model || MODEL[0];
    const id = 'msg_' + crypto.randomBytes(6).toString('hex');

    if (badan.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      const tulis = (peristiwa, isi) => res.write('event: ' + peristiwa + '\ndata: ' + JSON.stringify(isi) + '\n\n');
      tulis('message_start', { type: 'message_start', message: { id, model, role: 'assistant', content: [], usage: { input_tokens: 12, output_tokens: 0 } } });
      tulis('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
      for (const potong of (jawab.match(/[\s\S]{1,22}/g) || [''])) {
        tulis('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: potong } });
      }
      tulis('content_block_stop', { type: 'content_block_stop', index: 0 });
      tulis('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 24 } });
      tulis('message_stop', { type: 'message_stop' });
      return res.end();
    }

    return kirim(res, 200, {
      id, type: 'message', role: 'assistant', model,
      content: [{ type: 'text', text: jawab }],
      stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 12, output_tokens: 24 },
    });
  }

  return kirim(res, 404, { type: 'error', error: { type: 'not_found_error', message: 'endpoint tiruan belum ada: ' + url.pathname } });
});

server.listen(PORT, HOST, () => {
  console.log('  penyedia Anthropic TIRUAN jalan di http://' + HOST + ':' + PORT + '/v1');
  console.log('  model: ' + MODEL.length + ' · kunci: ' + (KUNCI ? 'diwajibkan' : 'bebas') + ' · saldo: ' + (SALDO_HABIS ? 'sengaja dikosongkan' : 'ada'));
});
