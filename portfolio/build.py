import sys, base64
three = open(sys.argv[1], encoding='utf8').read()
nl = three.index('\n')
assert three[:nl].startswith("console.warn")
three = 'void 0' + three[three.index('),', 0, nl + 1) + 1:]
assert '</script' not in three.lower()
s = open('src.html', encoding='utf8').read().replace('/*THREE*/', three, 1)
for key, f in [('HALO', 'halo.jpg'), ('COFFEE', 'coffee.jpg'), ('CERAMICS', 'ceramics.jpg')]:
    data = base64.b64encode(open('assets/' + f, 'rb').read()).decode()
    s = s.replace(f'__IMG_{key}__', 'data:image/jpeg;base64,' + data, 1)
open('index.html', 'w', encoding='utf8').write(s)
print(len(s))
