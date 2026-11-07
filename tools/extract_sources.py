"""Extract teachings from cached HTML into sources/*.json
usage: python3 -I extract_sources.py <raw_dir> <out_dir>
raw_dir contains: a.txt (Yai page as text), lp/items.json + lp/det/<id>.html (Luang Por)
"""
import re, json, sys, html, os

raw, out = sys.argv[1], sys.argv[2]

def clean(s):
    s = s.replace('\xa0', ' ').replace('​', '')
    s = re.sub(r'[ \t]+', ' ', s)
    s = re.sub(r' *\n *', '\n', s)
    return s.strip()

# ---------- Yai ----------
t = open(os.path.join(raw, 'a.txt'), encoding='utf-8').read()
body = t[t.find('คำสอนยาย หมวด'):t.find('ดูบทความเพิ่มเติม')]
hdr = re.compile(r'^คำสอนยาย หมวด\s*(.+?)\s*:\s*(\d+)\)\s*(.*)$')
sep = re.compile(r'^คำสอนยาย\s*:')
items, cur = [], None
for ln in body.split('\n'):
    ln = clean(ln)
    m = hdr.match(ln)
    if m:
        if cur: items.append(cur)
        cur = {'cat': m.group(1), 'n': int(m.group(2)), 'title': clean(m.group(3)), 'lines': []}
    elif sep.match(ln):
        continue
    elif cur is not None and ln:
        cur['lines'].append(ln)
if cur: items.append(cur)

date_re = re.compile(r'(\d{1,2}\s*[ก-๙\.]+\s*(พ\.ศ\.\s*)?\d{4}|ไม่ได้บันทึกวันที่)\s*$')
yai = []
for it in items:
    ls = it['lines']
    # footnotes like "1 หลวงพ่อธัมมะ ปัจจุบันคือ ..."
    ls = [l for l in ls if not re.match(r'^\d\s+หลวงพ่อ.*ปัจจุบันคือ', l)]
    date = ''
    # date may be split over two lines ("11 กุมภาพันธ์" / "พ.ศ.2534")
    if len(ls) >= 2 and re.match(r'^พ\.ศ\.\s*\d{4}$', ls[-1]) and re.match(r'^\d{1,2}\s*[ก-๙\.]+$', ls[-2]):
        date = ls[-2] + ' ' + ls[-1]; ls = ls[:-2]
    elif ls and date_re.fullmatch(ls[-1]) and len(ls[-1]) < 40:
        date = ls.pop()
    if date == 'ไม่ได้บันทึกวันที่': date = ''
    yai.append({'n': it['n'], 'cat': it['cat'], 'title': it['title'],
                'text': '\n'.join(ls), 'date': date})
json.dump(yai, open(os.path.join(out, 'yai.json'), 'w'), ensure_ascii=False, indent=1)
print('yai', len(yai))

# ---------- Luang Por ----------
lp = json.load(open(os.path.join(raw, 'lp', 'items.json'), encoding='utf-8'))
res = []
for it in lp:
    p = os.path.join(raw, 'lp', 'det', it['id'] + '.html')
    if not os.path.exists(p): continue
    s = open(p, encoding='utf-8', errors='ignore').read()
    k = s.find('<nav aria-label=""')
    if k > 0: s = s[:k]
    j = s.rfind('Tweet')
    if j > 0: s = s[j:]
    s = re.sub(r'<(script|style)[\s\S]*?</\1>', '', s)
    s = re.sub(r'<br\s*/?>', '\n', s)
    s = re.sub(r'</(p|div|h\d|li)>', '\n', s)
    s = html.unescape(re.sub(r'<[^>]+>', '', s))
    s = clean(s)
    s = re.sub(r'\n{2,}', '\n', s)
    lines = [l for l in s.split('\n') if l.strip() and l.strip() not in ('Tweet', '-->')]
    # drop leading title echo
    while lines and lines[0].strip() == it['title']:
        lines.pop(0)
    # date line at the top: "วันที่ 23 มีค. พ.ศ.2562"
    date = ''
    if lines and lines[0].startswith('วันที่'):
        date = lines.pop(0)[len('วันที่'):].strip()
    while lines and lines[0].strip() == it['title']:
        lines.pop(0)
    source = ''
    if lines and re.match(r'^(จากหนังสือ|ที่มา|เรียบเรียง)', lines[-1]):
        source = lines.pop()
    res.append({'id': it['id'], 'title': it['title'], 'date': date, 'source': source,
                'text': '\n'.join(lines)})
json.dump(res, open(os.path.join(out, 'luangpor.json'), 'w'), ensure_ascii=False, indent=1)
print('luangpor', len(res))
