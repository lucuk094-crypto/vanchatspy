/*
 * /api/search — pencarian web untuk Van Chat.SPY.
 *
 * Jujur soal batasnya: mesin pencari umum (Google/Bing/Brave) mewajibkan
 * kunci API berbayar, dan halaman HTML mereka menolak permintaan otomatis
 * (diuji: DuckDuckGo HTML/Lite membalas halaman "anomaly/challenge").
 *
 * Karena itu endpoint ini memakai beberapa penyedia NYATA yang terbuka tanpa
 * kunci, dan setiap hasil selalu menyebutkan dari mana asalnya:
 *   • Wikipedia Indonesia  — ensiklopedia (artikel + ringkasan)
 *   • DuckDuckGo Instant   — jawaban ringkas/definisi (sering kosong)
 *   • Stack Exchange       — pertanyaan & jawaban pemrograman
 *   • Hacker News (Algolia)— diskusi teknologi
 *   • GitHub               — repositori kode
 *
 * Kalau nanti ada kunci pencarian resmi, isi env `SEARCH_API_KEY`
 * (+ opsional `SEARCH_API_URL` untuk Brave/SerpAPI) → penyedia itu otomatis
 * dipakai lebih dulu sebagai "web umum".
 */

const UA = 'VanChatSPY/1.0 (alat bantu belajar; keyless search aggregator)';
const JEDA = 8000;

import { siapkan } from './_aman.js';

const J = (data, status = 200, tambahan = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...tambahan },
  });

async function ambil(url, opsi = {}) {
  const r = await fetch(url, {
    ...opsi,
    headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*', ...(opsi.headers || {}) },
    signal: AbortSignal.timeout ? AbortSignal.timeout(JEDA) : undefined,
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r;
}

const bersih = (s) => String(s == null ? '' : s)
  .replace(/<[^>]*>/g, ' ')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

/* ── penyedia ─────────────────────────────────────────────────────────── */
/* Wikipedia kadang menjawab 429 ("too many requests") saat beberapa pencarian
   beruntun. Sekali lagi dicoba setelah jeda pendek; kalau tetap ditolak,
   penyedia ini dilewati dan alasannya dicatat (penyedia lain tetap jalan). */
async function wikipedia(q) {
  const alamatCari = 'https://id.wikipedia.org/w/api.php?action=query&list=search&srsearch=' +
    encodeURIComponent(q) + '&srlimit=3&format=json&origin=*';
  let jawab;
  for (let i = 0; i < 2; i++) {
    try {
      jawab = await (await ambil(alamatCari)).json();
      break;
    } catch (e) {
      const pesan = String((e && e.message) || e);
      if (i === 1 || !/429|503|timeout|abort/i.test(pesan)) throw e;
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  const cari = jawab;
  const judul = (cari.query && cari.query.search ? cari.query.search : []).map((x) => x.title);
  if (!judul.length) return [];
  const isi = await (await ambil('https://id.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&format=json&origin=*&titles=' +
    encodeURIComponent(judul.join('|')))).json();
  const hal = (isi.query && isi.query.pages) || {};
  return Object.keys(hal).map((k) => {
    const p = hal[k];
    return {
      penyedia: 'Wikipedia Indonesia',
      jenis: 'ensiklopedia',
      judul: p.title,
      url: 'https://id.wikipedia.org/wiki/' + encodeURIComponent(String(p.title).replace(/ /g, '_')),
      cuplikan: bersih(p.extract || '').slice(0, 420),
    };
  }).filter((x) => x.judul);
}

async function duck(q) {
  const d = await (await ambil('https://api.duckduckgo.com/?q=' + encodeURIComponent(q) + '&format=json&no_html=1&skip_disambig=1')).json();
  const keluar = [];
  const dasar = bersih(d.AbstractText || d.Answer || '');
  if (dasar) {
    keluar.push({
      penyedia: 'DuckDuckGo',
      jenis: 'ringkasan',
      judul: bersih(d.Heading || q),
      url: d.AbstractURL || ('https://duckduckgo.com/?q=' + encodeURIComponent(q)),
      cuplikan: dasar.slice(0, 420),
    });
  }
  (d.RelatedTopics || []).slice(0, 4).forEach((t) => {
    const isi = bersih(t.Text || '');
    if (isi && t.FirstURL) keluar.push({ penyedia: 'DuckDuckGo', jenis: 'terkait', judul: isi.split(' - ')[0].slice(0, 90), url: t.FirstURL, cuplikan: isi.slice(0, 300) });
  });
  return keluar;
}

async function stack(q) {
  const d = await (await ambil('https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&pagesize=4&site=stackoverflow&filter=withbody&q=' +
    encodeURIComponent(q))).json();
  return (d.items || []).map((it) => ({
    penyedia: 'Stack Overflow',
    jenis: 'tanya-jawab kode',
    judul: bersih(it.title),
    url: it.link,
    cuplikan: bersih(it.body || '').slice(0, 400),
  }));
}

async function hackernews(q) {
  const d = await (await ambil('https://hn.algolia.com/api/v1/search?hitsPerPage=4&query=' + encodeURIComponent(q))).json();
  return (d.hits || []).filter((h) => h.title).map((h) => ({
    penyedia: 'Hacker News',
    jenis: 'diskusi teknologi',
    judul: bersih(h.title),
    url: h.url || ('https://news.ycombinator.com/item?id=' + h.objectID),
    cuplikan: bersih(h.story_text || ('poin ' + (h.points || 0) + ' · ' + (h.num_comments || 0) + ' komentar')).slice(0, 300),
  }));
}

async function github(q) {
  const d = await (await ambil('https://api.github.com/search/repositories?per_page=3&q=' + encodeURIComponent(q))).json();
  return (d.items || []).map((r) => ({
    penyedia: 'GitHub',
    jenis: 'repositori',
    judul: r.full_name,
    url: r.html_url,
    cuplikan: bersih((r.description || '') + ' · ' + (r.stargazers_count || 0) + ' bintang · ' + (r.language || '')).slice(0, 300),
  }));
}

/* Penyedia web umum opsional (kalau kunci diset di hosting) */
async function webUmum(q) {
  const kunci = process.env.SEARCH_API_KEY;
  if (!kunci) return [];
  const dasar = process.env.SEARCH_API_URL || 'https://api.search.brave.com/res/v1/web/search';
  const r = await ambil(dasar + '?q=' + encodeURIComponent(q) + '&count=5', { headers: { 'X-Subscription-Token': kunci, Accept: 'application/json' } });
  const d = await r.json();
  return ((d.web && d.web.results) || []).map((x) => ({
    penyedia: 'Web (kunci penyedia)',
    jenis: 'web umum',
    judul: bersih(x.title),
    url: x.url,
    cuplikan: bersih(x.description || x.snippet || '').slice(0, 400),
  }));
}

const PENYEDIA = [
  ['web', webUmum],
  ['wikipedia', wikipedia],
  ['duckduckgo', duck],
  ['stackoverflow', stack],
  ['hackernews', hackernews],
  ['github', github],
];

export default async function handler(req) {
  /* batas 30 permintaan/menit + hanya asal yang dikenal (kueri panjang dijaga di bawah) */
  const s = siapkan(req, (typeof process !== 'undefined' && process.env) || {}, { nama: 'search', maks: 30 });
  if (s.jawab) return s.jawab;
  const url = new URL(req.url);
  let q = url.searchParams.get('q') || '';
  if (!q && req.method === 'POST') {
    try { const b = await req.json(); q = b.q || ''; } catch (e) { /* biarkan kosong */ }
  }
  q = String(q).trim();
  if (!q) return J({ ok: false, pesan: 'parameter q wajib diisi' }, 400, s.tambahan);
  if (q.length > 300) return J({ ok: false, pesan: 'kueri terlalu panjang (maks 300 karakter)' }, 400, s.tambahan);

  const hasil = await Promise.allSettled(PENYEDIA.map(([, fn]) => fn(q)));
  const sumber = [];
  const status = {};
  hasil.forEach((h, i) => {
    const nama = PENYEDIA[i][0];
    if (h.status === 'fulfilled') {
      status[nama] = h.value.length;
      sumber.push(...h.value);
    } else {
      status[nama] = 'gagal: ' + String((h.reason && h.reason.message) || h.reason).slice(0, 80);
    }
  });

  /* penyedia yang menolak/membatasi dicatat apa adanya untuk pengguna */
  const dilewati = Object.keys(status).filter((k) => typeof status[k] === 'string' && /429|503/.test(status[k]));
  const catatanDasar = process.env.SEARCH_API_KEY
    ? 'Termasuk penyedia web umum dari kunci yang dipasang.'
    : 'Tanpa kunci pencarian: sumbernya Wikipedia, DuckDuckGo, Stack Overflow, Hacker News, dan GitHub — bukan indeks web umum (itu butuh kunci berbayar).';

  /* buang duplikat alamat */
  const terlihat = new Set();
  const rapi = sumber.filter((s) => {
    if (!s.url || terlihat.has(s.url)) return false;
    terlihat.add(s.url); return true;
  }).slice(0, 12);

  return J({
    ok: true,
    q,
    penyedia: PENYEDIA.map((p) => p[0]),
    status,
    jumlah: rapi.length,
    sumber: rapi,
    catatan: catatanDasar + (dilewati.length
      ? ' Penyedia yang membatasi permintaan sesaat ini: ' + dilewati.join(', ') + ' (hasil dari penyedia lain tetap dipakai).'
      : ''),
  }, 200, s.tambahan);
}
