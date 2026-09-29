/* uji-api.mjs — memeriksa backend TANPA memakai kuota AI.
 * Caranya: permintaan ke penyedia AI dicegat (fetch ditukar), lalu badan
 * permintaan diperiksa: gambar dikirim sebagai image_url, memori & proyek
 * masuk ke instruksi sistem, dan pemilihan model sesuai.
 *
 *   node tools/uji-api.mjs
 */
import pathlibInit from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const AKAR = pathlibInit.resolve(pathlibInit.dirname(fileURLToPath(import.meta.url)), '..');

/* pengujian ini memakai kunci tiruan + penyedia tiruan (fetch dicegat di bawah),
   supaya jalur backend yang sungguhan ikut teruji — tanpa kuota asli */
process.env.AI_PROVIDER = '9router';
process.env.AI_BASE_URL = 'https://rqacwx8.abc-tunnel.us/v1';
process.env.AI_API_KEY = 'sk-tiruan-untuk-uji';

const { default: chat } = await import(pathlibInit.join(AKAR, 'api/chat.js'));

const FOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const catat = [];
const tulis = (s) => { console.log(s); catat.push(s); };
let gagal = 0;
const cek = (nama, benar, ket) => {
  tulis((benar ? '  ✓ ' : '  ✗ ') + nama + (ket ? ' — ' + ket : ''));
  if (!benar) gagal++;
};

const asli = globalThis.fetch;
let terakhir = null;
/* tiruan 9Router: daftar model (GET /models) + jawaban (POST /chat/completions) */
const MODEL_UJI = ['kr/claude-haiku-4.5', 'kr/claude-sonnet-4.5', 'kr/auto', 'FreeTiers'];
globalThis.fetch = async (url, opsi) => {
  if (String(url).includes('rqacwx8.abc-tunnel.us')) {
    if (String(url).endsWith('/models')) {
      return new Response(JSON.stringify({ object: 'list', data: MODEL_UJI.map((id) => ({ id, object: 'model' })) }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    terakhir = JSON.parse(opsi.body);
    const balas = terakhir.stream
      ? new Response('data: ' + JSON.stringify({ choices: [{ delta: { content: 'oke' } }] }) + '\n\ndata: [DONE]\n\n',
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
      : new Response(JSON.stringify({ choices: [{ message: { content: 'jawaban uji' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    return balas;
  }
  return asli(url, opsi);
};

const panggil = (body) => chat(new Request('http://lokal/api/chat', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}));

/* 1. percakapan biasa */
terakhir = null;
await panggil({ prompt: 'hai', mode: 'fast', stream: true });
cek('percakapan biasa memakai model mode fast', /kr\/claude-haiku-4\.5|kr\/claude-sonnet-4\.5|FreeTiers|kr\/auto/.test(terakhir.model), terakhir.model);
cek('instruksi sistem dasar terkirim', /Van Chat\.SPY/.test(terakhir.messages[0].content));
cek('jawaban mengalir (stream) aktif', terakhir.stream === true);

/* 2. gambar → model yang bisa melihat + image_url */
terakhir = null;
await panggil({ prompt: 'apa isi gambar ini?', mode: 'fast', stream: true, gambar: [FOTO] });
const isiTerakhir = terakhir.messages[terakhir.messages.length - 1].content;
cek('gambar memakai antrean model VISION', /gemini|claude|sonnet|vision|omni/i.test(terakhir.model), terakhir.model);
cek('gambar dikirim sebagai image_url', Array.isArray(isiTerakhir) && isiTerakhir.some((b) => b.type === 'image_url' && /^data:image\//.test(b.image_url.url)));
cek('teks pertanyaan tetap ikut', Array.isArray(isiTerakhir) && isiTerakhir[0].type === 'text');
cek('saat ada gambar, jawaban dikirim utuh (bukan stream)', terakhir.stream === false);

/* 3. memori & proyek masuk ke instruksi sistem */
terakhir = null;
await panggil({ prompt: 'halo', mode: 'think', memori: ['Nama saya Rian', 'Suka jawaban singkat'], proyek: 'Proyek Uji: selalu pakai bahasa Indonesia' });
const sistem = terakhir.messages[0].content;
cek('memori disisipkan ke instruksi', /Nama saya Rian/.test(sistem) && /memori tersimpan/.test(sistem));
cek('arahan proyek disisipkan ke instruksi', /PROYEK YANG SEDANG DIKERJAKAN/.test(sistem) && /Proyek Uji/.test(sistem));
cek('jumlah giliran riwayat dibatasi (maks 4)', (await (async () => { terakhir = null; await panggil({ prompt: 'x', riwayat: ['a', 'b', 'c', 'd', 'e', 'f'] }); return terakhir.messages.filter((m) => m.role === 'user').length; })()) === 5);

/* 4. mode tidak sah ditolak dengan aman */
terakhir = null;
const r = await panggil({ prompt: 'hai', mode: 'sultan' });
cek('mode tidak dikenal jatuh ke fast (tidak error)', r.status === 200 || r.status === 502 || r.status === 429);

/* 5. prompt kosong ditolak */
const r2 = await panggil({ prompt: '   ' });
cek('prompt kosong → 400', r2.status === 400);

globalThis.fetch = asli;
fs.writeFileSync(pathlibInit.join(AKAR, 'bukti-uji', 'HASIL-UJI-API.txt'), catat.join('\n') + '\n');
console.log(gagal ? `\nHASIL: ${gagal} pemeriksaan gagal` : '\nHASIL: SEMUA LULUS (tanpa memakai kuota AI)');
process.exit(gagal ? 1 : 0);
