/*
 * uji-anthropic.mjs — membuktikan Van Chat.SPY bisa memakai penyedia AI yang
 * HANYA melayani protokol ANTHROPIC (seperti gateway cc.freemodel.dev):
 *   POST {base}/messages + header x-api-key + anthropic-version,
 *   jawaban { content: [ { type: "text", … } ] } dan SSE content_block_delta.
 *
 * Yang diperiksa:
 *   1. daftar model dibaca dari penyedia itu (bukan daftar model OpenRouter)
 *   2. percakapan biasa lewat /v1/messages
 *   3. perintah bentuk ("tepat tiga kata") tetap dipatuhi
 *   4. jawaban mengalir (SSE Anthropic) diterjemahkan ke bentuk yang dipahami halaman
 *   5. foto (blok image base64) benar-benar terkirim dan "dilihat"
 *   6. AI Builder menerima halaman dari penyedia yang sama
 *   7. saldo habis ("Insufficient balance") → pesan jujur, bukan jawaban palsu
 *
 *   node tools/uji-anthropic.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT_APP = 8136;
const PORT_PENYEDIA = 20140;
const KUNCI = 'kunci-antropis';
const URL_APP = 'http://127.0.0.1:' + PORT_APP + '/';
const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));

const catatan = [];
const tulis = (s) => { console.log(s); catatan.push(s); };
let gagal = 0;
const cek = (nama, benar, ket) => {
  tulis((benar ? '  ✓ ' : '  ✗ ') + nama + (ket ? ' — ' + ket : ''));
  if (!benar) gagal++;
};

const proses = [];
function jalankan(nama, argv, env = {}) {
  const p = spawn('node', [path.join(AKAR, argv[0]), ...argv.slice(1)], { cwd: AKAR, env: { ...process.env, ...env } });
  const alir = (d) => { if (process.env.RIUH) process.stdout.write('[' + nama + '] ' + d); };
  p.stdout.on('data', alir); p.stderr.on('data', alir);
  proses.push(p);
  return p;
}

/* PNG kecil: latar merah, lingkaran putih, batang biru */
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAADs0lEQVR42u3csVHrQBRAUbzjOqTAdZC4cFViB6ISEkICZrDxontO9DNg9109mWH+6bYsb1A1HAECAAGAAEAAIAAQAAgABAACAAGAAEAAIAAQAAgABAACAAGAAEAAIAAQAMzl7Age67psz/4S28fVOdsAIAAQAAgABAACAAGAAEAAIAAQAAgABAACAAEgABAACAAEAAIAAYAAQAAgABAAHIr/Ge4xLvv+9a/3+599rfu6OnkBTDD0E3wDYhBAZe6tBQGYeyUIwOj/4NuWgQByoy8DARh9GQjA6MtAAEZfBgIw+jL4nj+FKE6/n90GcP1WQXsDmH6nEd0ARt8q6G4A0+98ugGYfqcUfQUy+l6HuhvA9Du3bgCm3+l1AzD9zrAbgOl3kt0ATL/z7AZg+p1qNwDT72y7AZh+J9wNwPQ7524Apt9pdwMw/c7cKxAkA/D4d/LdAEy/8+8GYPrdglcgSAbg8e8uugGYfjfiFQiSAXj8u5duAKbf7XgFgmQAHv/uyAaAZAAe/27KBoBkAB7/loANAMkAPP4tARsAkgF4/FsCNgAkA/D4twRsABAA1ALw/uMtyAYAAUAtAO8/3oJsABAACABCAfgA4GOADQACAAFAKAAfAHwMsAFAACAAEAAIAAQARw7A70CPbbb7tQGwAUAAIAAQAAgABAACAAGAAEAAIAAQAAgABAACAAH82n1d3cqBzXa/NgA2AAgABAACAAGAAF7Db0KPasKbtQGwAUAAIAAvi7Tu1AbABgABgAC8MtK6TRsAGwAEYG8SvEcbABsABGB7ErxBGwAbwCOE6t3ZANgAHiRUb80GwAbwOKF6XzYANoCHCtWbsgGwATxaqN6RDYAN4AFD9XaGU6Z8L16B8ArkYUP1RoYTp3wXXoHwCuTBQ/UWhtOnfP7DHVA+eZ8B8BnAo4jqmQ/3Qfm0h1uhfM7D3VA+4eGGKJ/tcE+UT3W4LcrnOdwZ5ZMcbo7yGQ73R/n0hlukfG7n1F1e9t1YG/3cBrAKnJIANOB8wq9AXoeMvg3gvp2GDWAVGH0bwAT42W2A9Cow+gKIZmD0BRDNwOgLIJqB0RdANAOjL4BoBkZfAE+Zp8lLMPcCKJZg7gXwypl7SQyGXgDzxbBs5v4f8acQCAAEAAIAAYAAQAAgABAACAAEAAIAAYAAQAAgABAACAAEAAIAAYAAQAAgABAATOF0WxangA0AAgABgABAACAAEAAIAAQAAgABgABAACAAEAAIAAQAAgABgABAACAAmMgncSZChSCaxNAAAAAASUVORK5CYII=';

try {
  tulis('══ uji: penyedia bergaya ANTHROPIC (seperti cc.freemodel.dev) ══');

  let penyedia = jalankan('anthropic', ['tools/mock-anthropic.mjs', '--port', String(PORT_PENYEDIA), '--butuh-kunci', KUNCI]);
  const app = jalankan('app', ['tools/server-uji.mjs'], {
    PORT: String(PORT_APP), AI_PROVIDER: 'freemodel', AI_GAYA: 'anthropic',
    AI_BASE_URL: 'http://127.0.0.1:' + PORT_PENYEDIA + '/v1', AI_API_KEY: KUNCI,
  });
  await tunggu(1600);

  /* 1. daftar model dari penyedia anthropic */
  let info = await (await fetch(URL_APP + 'api/chat')).json();
  for (let i = 0; i < 12 && !(info.penyedia && info.penyedia.modelDariRouter); i++) {
    await tunggu(1000);
    info = await (await fetch(URL_APP + 'api/chat')).json();
  }
  tulis('   penyedia: ' + JSON.stringify(info.penyedia));
  tulis('   model: ' + JSON.stringify(info.daftarModel.fast) + ' ' + JSON.stringify(info.daftarModel.think));
  cek('penyedia dikenali bergaya anthropic', info.penyedia.gaya === 'anthropic' || /anthropic|claude/i.test(JSON.stringify(info.daftarModel)));
  cek('daftar model dibaca dari penyedia itu (claude-*)', /claude/i.test(JSON.stringify(info.daftarModel)) && !/:free/.test(JSON.stringify(info.daftarModel)));

  const kirim = (body) => fetch(URL_APP + 'api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  /* 2 & 3. percakapan + perintah bentuk */
  const j1 = await (await kirim({ prompt: 'Balas HANYA dengan tiga kata: apa itu kopi?', stream: false })).json();
  tulis('   jawaban: "' + String(j1.text || j1.pesan).slice(0, 70) + '"');
  cek('percakapan lewat /v1/messages', j1.ok === true);
  cek('perintah bentuk "tepat tiga kata" dipatuhi', /^kopi adalah minuman\.?$/i.test(String(j1.text || '').trim()), String(j1.text || j1.pesan).slice(0, 50));

  /* 4. jawaban mengalir (SSE Anthropic → bentuk OpenAI) */
  const rStream = await kirim({ prompt: 'Sebut satu fakta singkat tentang kopi.', stream: true });
  const sse = await rStream.text();
  const potongan = sse.split('\n\n').filter((b) => b.startsWith('data: ') && !b.includes('[DONE]')).map((b) => { try { return JSON.parse(b.slice(6)); } catch { return null; } }).filter(Boolean);
  const teksAlir = potongan.map((p) => (p.choices && p.choices[0] && p.choices[0].delta && p.choices[0].delta.content) || '').join('');
  tulis('   aliran: ' + potongan.length + ' potongan → "' + teksAlir.slice(0, 60) + '"');
  cek('jawaban mengalir diterjemahkan ke bentuk halaman', rStream.ok && teksAlir.length > 5 && /\[DONE\]/.test(sse));
  cek('potongan berisi isi jawaban (bukan kosong)', /penyedia anthropic|Jawaban/i.test(teksAlir), teksAlir.slice(0, 40));

  /* 5. visi lewat blok gambar */
  const j2 = await (await kirim({ prompt: 'Apa warna latar dan bentuk apa yang ada di gambar ini? Jawab singkat.', stream: false, gambar: ['data:image/png;base64,' + PNG] })).json();
  tulis('   visi: "' + String(j2.text || j2.pesan).slice(0, 90) + '"');
  cek('foto terkirim sebagai blok image & "dilihat"', /merah/i.test(String(j2.text || '')) && /lingkaran|batang|biru/i.test(String(j2.text || '')), String(j2.text || j2.pesan).slice(0, 50));

  /* 6. AI Builder lewat penyedia yang sama */
  const bgn = await (await fetch(URL_APP + 'api/builder', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Buat halaman sambutan sederhana.', mode: 'think' }),
  })).json();
  tulis('   builder: ' + (bgn.ok ? bgn.bytes + ' bita dari ' + bgn.model : 'gagal — ' + String(bgn.pesan).slice(0, 60)));
  cek('AI Builder jalan lewat penyedia anthropic', bgn.ok === true && /<!DOCTYPE html/i.test(String(bgn.html || '')));

  /* 7. saldo habis → pesan jujur */
  try { penyedia.kill('SIGTERM'); } catch (e) {}
  await tunggu(700);
  penyedia = jalankan('anthropic-habis', ['tools/mock-anthropic.mjs', '--port', String(PORT_PENYEDIA), '--butuh-kunci', KUNCI, '--saldo-habis']);
  await tunggu(1200);
  const j3 = await (await kirim({ prompt: 'halo', stream: false })).json();
  tulis('   saldo habis → "' + String(j3.pesan || '').slice(0, 150) + '"');
  cek('saldo habis dijawab jujur (menyebut pesan penyedia)', j3.ok === false && /Insufficient balance/i.test(String(j3.pesan || '')), String(j3.pesan || '').slice(0, 60));
  cek('ditandai sebagai masalah saldo, bukan kuota harian paket', j3.saldo === true && !j3.kuota);
} catch (e) {
  gagal++;
  tulis('GAGAL: ' + e.message);
} finally {
  proses.forEach((p) => { try { p.kill('SIGTERM'); } catch (e) {} });
}

const kepala = 'UJI PENYEDIA GAYA ANTHROPIC (cc.freemodel.dev dan sejenisnya)\n' + new Date().toLocaleString('id-ID') + '\n' + '─'.repeat(58) + '\n';
fs.writeFileSync(path.join(AKAR, 'bukti-uji', 'HASIL-UJI-ANTHROPIC.txt'), kepala + catatan.join('\n') + '\n\n'
  + (gagal ? 'HASIL: GAGAL — ' + gagal + ' pemeriksaan' : 'HASIL: SEMUA LULUS') + '\n');
console.log(gagal ? '\nHASIL: GAGAL — ' + gagal + ' pemeriksaan' : '\nHASIL: SEMUA LULUS');
process.exit(gagal ? 1 : 0);
