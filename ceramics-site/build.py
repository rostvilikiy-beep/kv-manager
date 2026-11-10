import sys
three = open(sys.argv[1], encoding='utf8').read()
first_nl = three.index('\n')
assert three[:first_nl].startswith("console.warn"), "unexpected header"
three = 'void 0' + three[three.index('),', 0, first_nl+1)+1:]
assert '</script' not in three.lower()
src = open('src.html', encoding='utf8').read()
out = src.replace('/*THREE*/', three, 1)
open('index.html', 'w', encoding='utf8').write(out)
print(len(out))
