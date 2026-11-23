import sys, base64
three = open(sys.argv[1], encoding='utf8').read()
nl = three.index('\n')
assert three[:nl].startswith("console.warn")
three = 'void 0' + three[three.index('),', 0, nl + 1) + 1:]
assert '</script' not in three.lower()
s = open('src.html', encoding='utf8').read().replace('/*THREE*/', three, 1)
for key, f in [('HALO', 'halo.jpg'), ('COFFEE', 'coffee.jpg'), ('CERAMICS', 'ceramics.jpg'), ('STAR1', 'star1.jpg'), ('STAR2', 'star2.jpg'), ('STAR3', 'star3.jpg'), ('STAR4', 'star4.jpg'), ('SHOT_FAQ', 'shot-faq.jpg'), ('SHOT_CONTACTS', 'shot-contacts.jpg'), ('SHOT_MOBILE', 'shot-mobile.jpg'), ('AVATAR', 'avatar.jpg'), ('BS_HERO', 'bs-hero.jpg'), ('BS_BLOND', 'bs-blond.jpg'), ('BS_GALERIA', 'bs-galeria.jpg'), ('BS_CENNIK', 'bs-cennik.jpg'), ('BS_OPINIE', 'bs-opinie.jpg'), ('BS_MOBILE', 'bs-mobile.jpg')]:
    data = base64.b64encode(open('assets/' + f, 'rb').read()).decode()
    s = s.replace(f'__IMG_{key}__', 'data:image/jpeg;base64,' + data)
open('index.html', 'w', encoding='utf8').write(s)
import re
left = re.findall(r'__IMG_[A-Z_0-9]+__', s)
assert not left, left
print(len(s))
