"""Build data.js (teachings + topic lexicon) from sources/*.json
usage: python3 -I tools/build_data.py   (run from project root)
"""
import json, re, os, math, collections

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = lambda *a: os.path.join(root, *a)
topics = json.load(open(S('tools', 'topics.json'), encoding='utf-8'))
for t in topics:
    t['terms'] = [x if isinstance(x, list) else [x, 1] for x in t['terms']]

yai = json.load(open(S('sources', 'yai.json'), encoding='utf-8'))
lp = json.load(open(S('sources', 'luangpor.json'), encoding='utf-8'))
cards = json.load(open(S('sources', 'luangpu_cards.json'), encoding='utf-8'))

YAI_CAT = {  # หมวดของคำสอนยาย -> หัวข้อที่เกี่ยวข้อง (เพิ่มคะแนน)
    'ตน': {'direction': 3, 'regret': 3},
    'คบคน': {'people': 4},
    'การใช้สมบัติ': {'money': 4},
    'ความสะอาด': {'lazy': 3},
    'ความไม่ประมาท': {'lazy': 3, 'death': 2},
    'ธรรม': {'meditation': 3},
    'บุญ กรรม': {'regret': 2, 'giving': 2},
    'ประพฤติพรหมจรรย์': {'vices': 3},
    'ระเบียบวินัย': {'lazy': 3, 'work': 2},
    'สันโดษ': {'pride': 4, 'money': 2},
    'อธิษฐาน': {'direction': 3, 'discouraged': 3},
    'อ่อนน้อม': {'pride': 3, 'people': 3},
}

def tag(title, text, cat=None):
    body = text.replace(' ', ' ')
    L = len(body)
    lf = 1 / (1 + max(0, L - 1200) / 2400)
    res = {}
    for t in topics:
        sc = 0.0
        for term, w in t['terms']:
            c = body.count(term) + 3 * title.count(term)
            if c: sc += w * min(3, c)
        sc *= lf
        if cat: sc += YAI_CAT.get(cat, {}).get(t['id'], 0)
        if sc >= (2.5 if L < 700 else 3.5): res[t['id']] = round(sc, 1)
    top = sorted(res.items(), key=lambda kv: -kv[1])[:3]
    return dict(top)

NON_TEACH = re.compile(r'(ประกาศ|กำหนดการ|ขอเชิญ|ลงทะเบียน|รับสมัคร|โครงการ.*(ขอเชิญ|รับสมัคร))')
data = []
for y in yai:
    if len(y['text']) < 30: continue
    data.append({'i': f"yai{y['n']:03d}", 's': 'yai', 't': y['title'], 'x': y['text'], 'd': y['date'],
                 'c': y['cat'], 'u': 'https://www.dmc.tv/article/17617', 'tp': tag(y['title'], y['text'], y['cat'])})
skipped = 0
seen_text = set()
for a in lp:
    key = re.sub(r'\s+', '', a['text'])[:160]
    if len(a['text']) < 60 or NON_TEACH.search(a['title']) or key in seen_text:
        skipped += 1; continue
    seen_text.add(key)
    data.append({'i': f"lp{a['id']}", 's': 'lp', 't': a['title'], 'x': a['text'], 'd': a['date'],
                 'u': f"https://kalyanamitra.org/th/article_detail.php?i={a['id']}", 'tp': tag(a['title'], a['text'])})
for c in cards:
    tp = {tid: (6 if k == 0 else 4) for k, tid in enumerate(c['topics'])}
    data.append({'i': c['id'], 's': 'lpu', 't': c['title'], 'x': '', 'k': c['kw'], 'm': c['img'],
                 'w': c['w'], 'h': c['h'], 'u': 'https://www.dmc.tv/card/free/56', 'tp': tp})

lex = [{'id': t['id'], 'chip': t['chip'], 'terms': t['terms'], 'q': t['q']} for t in topics]
out = 'window.TOPICS=' + json.dumps(lex, ensure_ascii=False, separators=(',', ':')) + ';\n'
out += 'window.TEACHINGS=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n'
open(S('data.js'), 'w', encoding='utf-8').write(out)

cnt = collections.Counter()
for d in data:
    for k in d['tp']: cnt[(d['s'], k)] += 1
print('docs', len(data), 'skipped', skipped, 'size KB', len(out.encode()) // 1024)
print('untagged', sum(1 for d in data if not d['tp']), 'by source',
      collections.Counter(d['s'] for d in data if not d['tp']))
for t in topics:
    print(f"{t['id']:12s}", {s: cnt[(s, t['id'])] for s in ('yai', 'lp', 'lpu')})
