(() => {
'use strict';

/* ======================= ค่าตั้งต้น ======================= */
const BREATH = { inMs: 4000, outMs: 5000, rounds: 3 };   // หายใจเข้า 4 วิ · ออก 5 วิ · 3 รอบ
const PER_SOURCE = 6;        // เลือกผู้สมัครสูงสุดต่อแหล่ง
const SOURCES = {
  yai: { badge: 'คำสอนยาย', who: 'คุณยายอาจารย์ มหารัตนอุบาสิกาจันทร์ ขนนกยูง' },
  lp:  { badge: 'หลวงพ่อธัมมชโย', who: 'โอวาทหลวงพ่อธัมมชโย (คุณครูไม่ใหญ่)' },
  lpu: { badge: 'หลวงปู่วัดปากน้ำ', who: 'พระมงคลเทพมุนี (สด จนฺทสโร)' }
};
const CRISIS_RE = /ฆ่าตัวตาย|อยากตาย|ไม่อยากมีชีวิต|ไม่อยากอยู่แล้ว|ทำร้ายตัวเอง|จบชีวิต|อยากหายไปจากโลก|หมดอาลัยตายอยาก|suicide|kill myself/i;
const STOP = new Set(('ฉัน ผม เรา คือ ที่ และ ของ ไม่ ได้ มี เป็น จะ แต่ กับ ใน ให้ แล้ว อยาก ทำ ไป มา ว่า นี้ เลย ' +
  'มาก มัน เขา ก็ ยัง เพราะ จึง หรือ อะไร ยังไง ทำไง ดี คน เรื่อง ตอนนี้ วันนี้ รู้สึก คิด อยู่ ค่ะ ครับ คะ นะ จัง ' +
  'เหมือน แบบ ๆ จน ถึง จาก โดย ซึ่ง นั้น นี่ นั่น อีก ต้อง ควร สัก หน่อย บ้าง ทั้ง เอง ด้วย ไหม มั้ย ยังไงดี แค่ เพียง').split(/\s+/));

const $ = (s) => document.querySelector(s);
const TOPICS = window.TOPICS || [];
const DOCS = window.TEACHINGS || [];
const TOPIC_BY_ID = Object.fromEntries(TOPICS.map(t => [t.id, t]));

for (const d of DOCS) {
  d._t = d.t.toLowerCase();
  d._s = (d.t + ' ' + d.x + ' ' + (d.k || '')).toLowerCase();
}

/* ======================= จับคู่ปัญหา → คำสอน ======================= */
const segmenter = (typeof Intl !== 'undefined' && Intl.Segmenter) ? new Intl.Segmenter('th', { granularity: 'word' }) : null;

function queryWords(q) {
  let ws;
  if (segmenter) ws = [...segmenter.segment(q)].filter(x => x.isWordLike).map(x => x.segment);
  else ws = q.split(/[\s,.;:!?()"'“”]+/);
  return [...new Set(ws.map(w => w.trim()).filter(w => w.length >= 2 && !STOP.has(w)))];
}

// คำในพจนานุกรมทั้งหมด เรียงจากยาวไปสั้น เพื่อให้ "ลูกน้อง" ไม่ถูกนับเป็น "ลูก" + "น้อง"
// หัวข้อที่เป็น "ความรู้สึก" ให้น้ำหนักมากกว่าหัวข้อที่เป็น "เรื่องราว" (โมโหลูกน้อง → เน้นโมโห มากกว่างาน)
const FEELING = new Set(['stress', 'anger', 'discouraged', 'fear', 'lonely', 'regret', 'pride', 'death']);
const LEXICON = [];
for (const t of TOPICS) {
  const boost = FEELING.has(t.id) ? 1.5 : 1;
  for (const [term, w] of t.terms) LEXICON.push({ term: term.toLowerCase(), id: t.id, w: Math.max(w, 1.5) * boost });
  for (const term of t.q) LEXICON.push({ term: term.toLowerCase(), id: t.id, w: 2.5 * boost });
}
LEXICON.sort((a, b) => b.term.length - a.term.length);

function detectTopics(q) {
  const raw = {};
  const used = new Uint8Array(q.length);          // ตำแหน่งที่ถูกคำยาวกว่าจับไปแล้ว
  const claimed = new Map();                       // term -> [start,end] ที่จับได้
  for (const { term, id, w } of LEXICON) {
    let span = claimed.get(term);
    if (span === undefined) {
      span = null;
      let from = 0, at;
      while ((at = q.indexOf(term, from)) !== -1) {
        let free = false;
        for (let i = at; i < at + term.length; i++) if (!used[i]) { free = true; break; }
        if (free) { span = [at, at + term.length]; break; }
        from = at + 1;
      }
      // จองตำแหน่งทันที คำสั้นที่อยู่ข้างในจะไม่ถูกนับซ้ำ (คำเดียวกันในหัวข้ออื่นใช้ผลจาก cache)
      if (span) for (let i = span[0]; i < span[1]; i++) used[i] = 1;
      claimed.set(term, span);
    }
    if (!span) continue;
    raw[id] = (raw[id] || 0) + w;
  }
  return normalizeTopics(raw);
}

function normalizeTopics(raw) {
  const max = Math.max(0, ...Object.values(raw));
  const out = {};
  Object.entries(raw).sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([id, sc]) => {
    if (sc / max >= 0.35) out[id] = sc / max;
  });
  return out;
}

const shown = new Set();
try { (JSON.parse(sessionStorage.getItem('shown') || '[]')).forEach(i => shown.add(i)); } catch (_) {}
function remember(id) {
  shown.add(id);
  try { sessionStorage.setItem('shown', JSON.stringify([...shown])); } catch (_) {}
}

function pick(text, chipIds) {
  const q = text.toLowerCase();
  // ถ้าข้อความส่อว่าคิดทำร้ายตัวเอง: ไม่ส่งคำสอนเรื่องความตาย ให้คำสอนปลอบใจ/ให้กำลังใจแทน
  const crisis = CRISIS_RE.test(text);
  const qt = crisis ? { discouraged: 1, stress: 0.8, lonely: 0.6 } : detectTopics(q);
  for (const id of chipIds) qt[id] = Math.max(qt[id] || 0, 1);   // หัวข้อที่เลือกเอง น้ำหนักเต็ม
  if (crisis) delete qt.death;
  const words = crisis ? [] : queryWords(q);

  // ความถี่ของคำ (idf) — คำที่เจอทั่วไปมีน้ำหนักน้อย
  const idf = {};
  for (const w of words) {
    let df = 0;
    for (const d of DOCS) if (d._s.includes(w)) df++;
    idf[w] = df === 0 ? 0 : Math.log((DOCS.length + 1) / (df + 1));
  }

  const scored = [];
  for (const d of DOCS) {
    if (crisis && d.tp.death) continue;
    let topicPart = 0;
    for (const id in qt) {
      const s = d.tp[id];
      if (s) topicPart += qt[id] * (1 - Math.exp(-s / 8)) * 10;
    }
    if (d.s === 'lpu') topicPart *= 1.5;             // การ์ดคัดมือ ให้เท่าเทียมกับบทความยาว
    let wordPart = 0;
    for (const w of words) {
      if (!idf[w]) continue;
      if (d._t.includes(w)) wordPart += 3 * idf[w];
      else if (d._s.includes(w)) wordPart += idf[w];
    }
    wordPart = Math.min(wordPart, 18);
    let score = topicPart + wordPart;
    if (d.x.length > 3000) score *= 0.85;             // เอียงไปทางคำสอนกระชับ
    if (shown.has(d.i)) score *= 0.15;                // เลี่ยงซ้ำที่เพิ่งเห็น
    if (score > 0) scored.push([d, score, topicPart]);
  }
  // ถ้ารู้หัวข้อของปัญหาแล้ว ให้เลือกเฉพาะคำสอนที่อยู่ในหัวข้อนั้น (คำที่บังเอิญตรงกันอย่างเดียวไม่พอ)
  if (Object.keys(qt).length && scored.some(x => x[2] > 0)) {
    for (let i = scored.length - 1; i >= 0; i--) if (scored[i][2] <= 0) scored.splice(i, 1);
  }

  const best = scored.reduce((m, x) => Math.max(m, x[1]), 0);
  const fallback = best < 4;
  let pool;
  if (fallback) {
    const base = DOCS.filter(d => !shown.has(d.i) && (d.tp.direction || d.tp.stress || d.tp.discouraged || d.tp.meditation));
    pool = (base.length ? base : DOCS).map(d => [d, 1]);
  } else {
    pool = [];
    for (const src of Object.keys(SOURCES)) {
      pool.push(...scored.filter(x => x[0].s === src).sort((a, b) => b[1] - a[1]).slice(0, PER_SOURCE));
    }
    pool = pool.filter(x => x[1] >= best * 0.4);
  }
  // สุ่มแบบถ่วงน้ำหนัก
  const weights = pool.map(x => Math.pow(x[1], 1.5));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  let chosen = pool[pool.length - 1];
  for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) { chosen = pool[i]; break; } }
  const doc = chosen[0];
  const matched = Object.keys(qt).filter(id => doc.tp[id]);
  return { doc, matched, fallback };
}

/* ======================= หน้าจอ ======================= */
const views = { home: $('#home'), breath: $('#breath'), result: $('#result') };
const finePointer = !!(window.matchMedia && matchMedia('(pointer: fine)').matches);
function show(name, { firstLoad = false } = {}) {
  for (const [k, el] of Object.entries(views)) el.hidden = k !== name;
  window.scrollTo(0, 0);
  // ตอนเปิดหน้าครั้งแรก ให้เคอร์เซอร์รอในช่องพิมพ์เฉพาะจอที่ใช้เมาส์ — บนมือถือจะไม่เด้งคีย์บอร์ดบังหน้าจอ
  if (name === 'home' && (!firstLoad || finePointer)) $('#problem').focus({ preventScroll: true });
}

const selected = new Set();
const chipsBox = $('#chips');
for (const t of TOPICS) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'chip'; b.textContent = t.chip;
  b.setAttribute('aria-pressed', 'false'); b.dataset.id = t.id;
  b.addEventListener('click', () => {
    const on = !selected.has(t.id);
    on ? selected.add(t.id) : selected.delete(t.id);
    b.setAttribute('aria-pressed', String(on));
    $('#form-hint').textContent = '';
  });
  chipsBox.appendChild(b);
}

let current = { text: '', chips: [], surprise: false };

$('#ask-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('#problem').value.trim();
  if (!text && selected.size === 0) {
    const h = $('#form-hint');
    h.textContent = 'เล่าเรื่องในใจสั้น ๆ หรือแตะเลือกหัวข้อด้านบนก่อนนะ';
    h.classList.remove('shake'); void h.offsetWidth; h.classList.add('shake');
    return;
  }
  start({ text, chips: [...selected], surprise: false });
});
$('#surprise').addEventListener('click', () => start({ text: '', chips: [], surprise: true }));
$('#again').addEventListener('click', () => start(current));
$('#new').addEventListener('click', () => { $('#problem').value = ''; selected.clear(); chipsBox.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', 'false')); show('home'); });

/* ======================= หายใจเข้า–ออก 3 รอบ ======================= */
const orb = $('.orb'), rings = [$('.ring.r1'), $('.ring.r2'), $('.ring.r3')];
const phaseEl = $('#phase'), countEl = $('#count'), roundEl = $('#round'), dots = [...$('#dots').children];
const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ประกายดาวรอบวง
(() => {
  const box = $('.sparks');
  for (let i = 0; i < 14; i++) {
    const s = document.createElement('i');
    const a = (i / 14) * Math.PI * 2, r = 48 + (i % 3) * 2.5;
    s.style.left = (50 + Math.cos(a) * r) + '%';
    s.style.top = (50 + Math.sin(a) * r) + '%';
    s.style.animationDelay = (i * 0.37) + 's';
    box.appendChild(s);
  }
})();

const ease = (p) => 0.5 - 0.5 * Math.cos(Math.PI * p);    // easeInOutSine
let raf = 0, timers = [];

function runBreath(onDone) {
  const cycle = BREATH.inMs + BREATH.outMs, total = cycle * BREATH.rounds;
  const prep = reduceMotion ? 300 : 1200;               // เวลาเตรียมตัวก่อนเริ่มนับรอบจริง
  const amp = reduceMotion ? 0.12 : 0.45;
  let t0 = null, lastLabel = '';
  dots.forEach(d => d.className = '');
  phaseEl.textContent = 'ตั้งใจ แล้วหายใจตามวง';
  countEl.textContent = ' ';
  roundEl.textContent = `รอบที่ 1 จาก ${BREATH.rounds}`;

  const finish = () => {
    cancelAnimationFrame(raf);
    dots.forEach(d => d.className = 'on');
    phaseEl.textContent = 'ใจนิ่ง ๆ…';
    countEl.textContent = ' ';
    const fl = $('.flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
    timers.push(setTimeout(onDone, reduceMotion ? 50 : 650));
  };

  const frame = (now) => {
    if (t0 === null) t0 = now + prep;
    const el = now - t0;
    if (el < 0) { raf = requestAnimationFrame(frame); return; }
    if (el >= total) return finish();
    const round = Math.floor(el / cycle), within = el - round * cycle;
    const inhale = within < BREATH.inMs;
    const p = inhale ? within / BREATH.inMs : (within - BREATH.inMs) / BREATH.outMs;
    const e = ease(p);
    const k = inhale ? e : 1 - e;                          // 0 = หายใจออกสุด, 1 = หายใจเข้าสุด
    orb.style.transform = `scale(${((1 - amp) + amp * k).toFixed(4)})`;
    rings.forEach((r, i) => {
      const kk = Math.max(0, Math.min(1, k - i * 0.08));   // วงนอกตามหลังเล็กน้อย
      r.style.transform = `scale(${(1 - amp + amp * kk + 0.38 * (i + 1) * kk).toFixed(4)})`;
      r.style.opacity = (0.12 + 0.38 * kk).toFixed(3);
    });
    const label = (inhale ? 'in' : 'out') + round;
    if (label !== lastLabel) {
      lastLabel = label;
      phaseEl.textContent = inhale ? 'หายใจเข้า…' : 'หายใจออก…';
      roundEl.textContent = `รอบที่ ${round + 1} จาก ${BREATH.rounds}`;
      dots.forEach((d, i) => { d.className = i < round ? 'on' : (i === round ? 'now' : ''); });
    }
    const phaseMs = inhale ? within : within - BREATH.inMs;
    const sec = Math.floor(phaseMs / 1000) + 1;             // 1 2 3 4 …
    countEl.textContent = Array.from({ length: sec }, (_, i) => i + 1).join(' ');
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
}

function stopBreath() {
  cancelAnimationFrame(raf); raf = 0;
  timers.forEach(clearTimeout); timers = [];
}

function start(req) {
  current = req;
  stopBreath();
  const echo = req.surprise ? 'ปล่อยใจให้ว่าง แล้วรอรับคำสอนที่ใช่…' :
    (req.text || req.chips.map(id => TOPIC_BY_ID[id].chip).join(' · '));
  $('#echo').textContent = echo;
  orb.style.transform = `scale(${1 - 0.45})`;
  show('breath');
  const done = () => { stopBreath(); reveal(req); };
  $('#skip').onclick = done;
  runBreath(done);
}

/* ======================= แสดงผล ======================= */
let shownDoc = null;
function reveal(req) {
  const { doc, matched, fallback } = pick(req.text, req.chips);
  shownDoc = doc;
  remember(doc.i);
  const src = SOURCES[doc.s];
  $('#badge').textContent = src.badge;
  $('#who').textContent = src.who;
  $('#r-title').textContent = doc.t;
  $('#crisis').hidden = !CRISIS_RE.test(req.text);

  const note = $('#fallback-note');
  if (req.surprise) { note.hidden = false; note.textContent = 'คำสอนที่สุ่มมาให้วันนี้'; }
  else if (fallback) { note.hidden = false; note.textContent = 'ยังไม่เจอหัวข้อที่ตรงเป๊ะ — ลองคำสอนนี้ดู ใช้ได้กับหลายสถานการณ์'; }
  else note.hidden = true;

  const body = $('#body'), more = $('#more'), figure = $('#card-img');
  body.classList.remove('clamp'); more.hidden = true;
  if (doc.m) {
    $('#img').src = doc.m; $('#img').alt = doc.t;
    figure.hidden = false;
    $('#img-btn').onclick = () => { $('#lb-img').src = doc.m; $('#lb-img').alt = doc.t; $('#lightbox').hidden = false; };
    body.textContent = '';
  } else {
    figure.hidden = true;
    body.textContent = doc.x.replace(/\n{3,}/g, '\n\n');
    if (doc.x.length > 750) {
      body.classList.add('clamp'); more.hidden = false; more.textContent = 'อ่านต่อ';
      more.onclick = () => {
        const c = body.classList.toggle('clamp');
        more.textContent = c ? 'อ่านต่อ' : 'ย่อ';
      };
    }
  }
  const meta = [];
  if (doc.c) meta.push('หมวด' + doc.c);
  if (doc.d) meta.push(doc.d);
  $('#meta').textContent = meta.join(' · ');
  const tags = $('#tags'); tags.textContent = '';
  for (const id of matched) { const s = document.createElement('span'); s.textContent = TOPIC_BY_ID[id].chip; tags.appendChild(s); }
  $('#src').href = doc.u;
  $('#toast').textContent = '';

  const card = $('#card');
  card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
  show('result');
}

$('#copy').addEventListener('click', async () => {
  if (!shownDoc) return;
  const d = shownDoc, s = SOURCES[d.s];
  const text = d.m ? `${d.t}\n— ${s.who}\n${new URL(d.m, location.href).href}` : `${d.t}\n\n${d.x}\n\n— ${s.who}\nที่มา: ${d.u}`;
  try { await navigator.clipboard.writeText(text); $('#toast').textContent = 'คัดลอกแล้ว'; }
  catch (_) { $('#toast').textContent = 'คัดลอกไม่ได้ในเบราว์เซอร์นี้'; }
});

/* ======================= รูปใหญ่ ======================= */
const lb = $('#lightbox');
const closeLb = () => { lb.hidden = true; };
lb.addEventListener('click', closeLb);
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!lb.hidden) closeLb();
  else if (!views.breath.hidden) $('#skip').click();
});

window.dhamma = { pick };   // สำหรับทดสอบจากคอนโซล
show('home', { firstLoad: true });
})();
