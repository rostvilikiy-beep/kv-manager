#!/usr/bin/env python3
"""Static site generator for the new InView Medical / WzrokOK website.

Content comes from data/source.json (exported from the old inviewmedical.pl
and wzrokok.pl WordPress sites) plus the 12 "perspectives" defined below
(from the client's brief "Strona View1 View2").

Run:  python3 build.py      -> writes HTML files next to this script.
"""
import html
import json
import os
import re
import shutil

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = json.load(open(os.path.join(ROOT, "data", "source.json"), encoding="utf-8"))
PAGES = DATA["pages"]
IMG = "assets/img/"

CONTACT = {
    "company": "InView Medical",
    "street": "Pl. Powstańców Śląskich 17A/222",
    "city": "53-329 Wrocław",
    "phone": "71 787 75 45",
    "phone_href": "+48717877545",
    "email": "info@inviewmedical.pl",
    "shop_email": "sklep@inviewmedical.pl",
    "shop_mobile": "+48 519 171 402",
    "career_email": "rekrutacja@inviewmedical.pl",
    "shop_url": "https://wzrokok.pl/sklep/",
    "fb_inview": "https://www.facebook.com/InViewMedical",
    "fb_wzrokok": "https://www.facebook.com/WzrokOK",
    "ig_wzrokok": "https://www.instagram.com/wzrokok/",
}

e = html.escape


# ------------------------------------------------------------------ icons
def ico(name, cls="", stroke="currentColor", sw=1.6):
    p = ICONS[name]
    return (f'<svg class="{cls}" viewBox="0 0 48 48" fill="none" stroke="{stroke}" stroke-width="{sw}" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{p}</svg>')


ICONS = {
    "arrow": '<path d="M8 24h31M29 14l10 10-10 10"/>',
    "arrow-l": '<path d="M40 24H9M19 14 9 24l10 10"/>',
    "up": '<path d="M24 40V9M14 19 24 9l10 10"/>',
    "file": '<path d="M13 6h15l9 9v27H13z"/><path d="M28 6v9h9M18 26h12M18 32h12"/>',
    "phone": '<path d="M14 7h7l3 9-5 3a24 24 0 0 0 10 10l3-5 9 3v7a4 4 0 0 1-4 4C21 38 10 27 10 11a4 4 0 0 1 4-4z"/>',
    "mail": '<rect x="6" y="11" width="36" height="26" rx="4"/><path d="m7 13 17 13 17-13"/>',
    "pin": '<path d="M24 43s13-12 13-23a13 13 0 0 0-26 0c0 11 13 23 13 23z"/><circle cx="24" cy="20" r="5"/>',
    "cart": '<path d="M5 8h6l5 23h22l4-15H14"/><circle cx="19" cy="38" r="2.5"/><circle cx="35" cy="38" r="2.5"/>',
    "fb": '<path d="M27 42V26h6l1-7h-7v-4c0-2 1-3 3-3h4V6h-6c-6 0-8 4-8 9v4h-5v7h5v16"/>',
    "ig": '<rect x="8" y="8" width="32" height="32" rx="9"/><circle cx="24" cy="24" r="7.5"/><circle cx="34" cy="14" r="1.2"/>',
    "briefcase": '<rect x="6" y="14" width="36" height="25" rx="4"/><path d="M17 14v-4a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v4M6 25h36"/>',
    # perspectives
    "amd": '<circle cx="24" cy="24" r="16"/><circle cx="24" cy="24" r="7"/><circle cx="24" cy="24" r="2.5" fill="currentColor"/><path d="M5 24c5-8 11-12 19-12s14 4 19 12"/>',
    "jaskra": '<path d="M4 24c6-9 12-13 20-13s14 4 20 13c-6 9-12 13-20 13S10 33 4 24z"/><circle cx="24" cy="24" r="7"/><path d="M24 4v4M24 40v4M38 10l-3 3M10 10l3 3"/>',
    "zacma": '<circle cx="24" cy="24" r="15"/><path d="M15 18c5-5 13-5 18 0"/><circle cx="24" cy="24" r="7" stroke-dasharray="2 3"/>',
    "zso": '<path d="M24 6c6 9 12 15 12 22a12 12 0 0 1-24 0c0-7 6-13 12-22z"/><path d="M18 30a6 6 0 0 0 6 6"/>',
    "lipo": '<circle cx="24" cy="24" r="15"/><circle cx="24" cy="24" r="9"/><circle cx="19" cy="21" r="1.6" fill="currentColor"/><circle cx="28" cy="20" r="1.6" fill="currentColor"/><circle cx="25" cy="28" r="1.6" fill="currentColor"/>',
    "shield": '<path d="M24 5 9 11v11c0 10 7 17 15 21 8-4 15-11 15-21V11z"/><path d="m17 24 5 5 9-10"/>',
    "cornea": '<path d="M10 38c-4-8-4-20 4-28"/><path d="M18 36c-3-7-3-17 3-24"/><path d="M33 16l4-4M35 24h6M33 32l4 4"/><circle cx="29" cy="24" r="2" fill="currentColor"/>',
    "bio": '<circle cx="24" cy="24" r="6"/><circle cx="12" cy="13" r="3.5"/><circle cx="37" cy="14" r="3.5"/><circle cx="36" cy="36" r="3.5"/><circle cx="11" cy="35" r="3.5"/><path d="M15 15l5 5M34 16l-5 5M33 33l-5-5M14 33l5-5"/>',
    "lid": '<path d="M5 22c6 7 12 10 19 10s13-3 19-10"/><path d="M10 27l-3 5M17 30l-1 6M24 32v6M31 30l1 6M38 27l3 5"/>',
    "dcr": '<path d="M12 8c0 10 4 14 10 16s10 6 10 16"/><path d="M28 12c4 2 6 6 4 10"/><circle cx="12" cy="8" r="2.5"/><path d="m29 36 3 4 3-4"/>',
    "exam": '<path d="M8 15V8h7M33 8h7v7M40 33v7h-7M15 40H8v-7"/><path d="M12 24c4-6 8-8 12-8s8 2 12 8c-4 6-8 8-12 8s-8-2-12-8z"/><circle cx="24" cy="24" r="4"/>',
    "capsule": '<rect x="8" y="17" width="32" height="14" rx="7" transform="rotate(-35 24 24)"/><path d="m19 31 10-14" />',
    # misc illustrative
    "laser": '<path d="M6 30h20l6-6H12z"/><path d="M32 24l10-10M34 30l8 2M30 18l2-10"/>',
    "scope": '<circle cx="18" cy="20" r="9"/><path d="M25 27l13 13"/><path d="M14 20a4 4 0 0 1 4-4"/>',
    "scalpel": '<path d="M8 40 30 18l6 6L14 42z"/><path d="M30 18l8-10 4 4-6 12"/>',
    "edu": '<path d="M4 18 24 9l20 9-20 9z"/><path d="M12 22v10c4 4 20 4 24 0V22M44 18v12"/>',
    "it": '<rect x="6" y="9" width="36" height="24" rx="3"/><path d="M18 40h12M24 33v7M14 18l5 4-5 4M23 26h8"/>',
}

PERSP_ICON_GRAD = (
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>'
    '<linearGradient id="gi" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3d9bf5"/><stop offset="1" stop-color="#1747c9"/></linearGradient>'
    '<linearGradient id="lg1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7fd3ff"/><stop offset="1" stop-color="#3d9bf5"/></linearGradient>'
    '<linearGradient id="lg2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3d9bf5"/><stop offset="1" stop-color="#1747c9"/></linearGradient>'
    '<linearGradient id="lg3" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1747c9"/><stop offset="1" stop-color="#0a1f5c"/></linearGradient>'
    '<linearGradient id="mt1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b7cdee"/><stop offset="1" stop-color="#e6effc" stop-opacity="0"/></linearGradient>'
    '<linearGradient id="mt2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7f9fd0"/><stop offset="1" stop-color="#dbe8fb" stop-opacity="0"/></linearGradient>'
    '<linearGradient id="mt3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3f5f9c"/><stop offset=".7" stop-color="#9db7e0" stop-opacity=".3"/><stop offset="1" stop-color="#eef5ff" stop-opacity="0"/></linearGradient>'
    '</defs></svg>'
)


def gico(name, cls=""):
    return ico(name, cls, stroke="url(#gi)", sw=2)


def logo_svg():
    return ('<svg viewBox="0 0 48 48" aria-hidden="true">'
            '<path d="M6 16c6-6 30-6 36 0-6 5-30 5-36 0z" fill="url(#lg1)"/>'
            '<path d="M4 25c7-6 33-6 40 0-7 6-33 6-40 0z" fill="url(#lg2)"/>'
            '<path d="M6 34c6-5 30-5 36 0-6 6-30 6-36 0z" fill="url(#lg3)"/>'
            '</svg>')


def _ridge(seed, base, amp, peaks, rough, valley=None):
    """Smooth, natural-looking ridge line (deterministic pseudo-noise)."""
    import math
    import random
    rnd = random.Random(seed)
    phases = [rnd.random() * 6.28 for _ in range(4)]
    pts = []
    for i in range(0, 1441, 12):
        x = i / 1440
        y = (math.sin(x * peaks * 6.28 + phases[0]) * 0.55 + math.sin(x * peaks * 2.3 * 6.28 + phases[1]) * 0.3
             + math.sin(x * peaks * 5.1 * 6.28 + phases[2]) * rough + math.sin(x * 37 + phases[3]) * rough * 0.4)
        if valley is not None:  # open a valley where the road runs to the horizon
            y -= 0.9 * math.exp(-((x - valley) ** 2) / 0.012)
        pts.append(f"{i} {base - y * amp:.1f}")
    return "M" + " L".join(pts) + " V600 H0z"


MOUNTAINS = None


def mountains():
    global MOUNTAINS
    if MOUNTAINS is None:
        MOUNTAINS = ('<svg class="mountains" viewBox="0 0 1440 600" preserveAspectRatio="none" aria-hidden="true">'
                     f'<path d="{_ridge(3, 250, 90, 1.6, 0.12, 0.6)}" fill="url(#mt1)"/>'
                     f'<path d="{_ridge(7, 340, 80, 2.2, 0.16, 0.6)}" fill="url(#mt2)"/>'
                     f'<path d="{_ridge(11, 450, 70, 3.1, 0.22, 0.6)}" fill="url(#mt3)"/>'
                     '</svg>')
    return MOUNTAINS


def scene(road=True, hx=0.6, hy=0.58, curve=0.18, fade=True):
    c = f'<canvas class="road" data-hx="{hx}" data-hy="{hy}" data-curve="{curve}" aria-hidden="true"></canvas>' if road else ""
    return (f'<div class="scene" aria-hidden="true"><div class="sky"></div>{mountains()}<div class="mist"></div>{c}'
            + ('<div class="fade-b"></div>' if fade else "") + '</div>')


# ------------------------------------------------------------------ text → html
URL_RE = re.compile(r'(https?://[^\s<>"]+[^\s<>".,;:)])')


def inline(t):
    t = e(t)
    return URL_RE.sub(lambda m: f'<a href="{m.group(1)}" target="_blank" rel="noopener">{m.group(1)}</a>', t)


def md(text, hlevel=3):
    out, lst = [], []

    def flush():
        if lst:
            out.append("<ul>" + "".join(f"<li>{inline(x)}</li>" for x in lst) + "</ul>")
            lst.clear()
    for raw in (text or "").split("\n"):
        line = raw.strip()
        if not line:
            flush()
            continue
        if line.startswith("## "):
            flush()
            out.append(f"<h{hlevel}>{inline(line[3:])}</h{hlevel}>")
        elif line.startswith("- "):
            v = line[2:].strip()
            if v:
                lst.append(v)
        else:
            flush()
            out.append(f"<p>{inline(line)}</p>")
    flush()
    return "\n".join(out)


def excerpt(text, n=160):
    t = re.sub(r"^## .*$", "", text or "", flags=re.M)
    t = URL_RE.sub("", t)
    t = re.sub(r"\s+", " ", t.replace("- ", "")).strip()
    t = re.sub(r"\s+([,.;:])", r"\1", t)
    return t if len(t) <= n else t[:n].rsplit(" ", 1)[0] + "…"


def slugify(s):
    tr = str.maketrans("ąćęłńóśźżĄĆĘŁŃÓŚŹŻ", "acelnoszzACELNOSZZ")
    s = s.translate(tr).lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


# ------------------------------------------------------------------ catalog structure (from old site menus)
# each entry: ("page", old_slug) has its own detail page; ("item", name, img|None, link|None) is listed only
CATALOG = [
    dict(slug="diagnostyka", name="Diagnostyka", icon="exam", img="iv_2021_03_diagnostyka-inview-medical.webp", groups=[
        ("Testery wzroku", [("page", "tester-wzroku-optec-5000g"), ("page", "functional-vision-analyzer"),
                            ("item", "Wyświetlacze optotypów AOC", "iv_2025_12_AOC-mobile-e-stand-300x300-1.webp", None),
                            ("item", "Wideorefraktometr 2WIN", "iv_2025_12_MP-2WIN.webp", None),
                            ("item", "Wideorefraktometr 2WIN-S", None, None)]),
        ("Lampy szczelinowe", [("page", "przenosna-lampa-szczelinowa-hyperion")]),
        ("Fundus kamery", [("page", "funduskamera-z-optyka-adaptywna"), ("page", "cro"), ("page", "cro-plus"), ("page", "luna-plus")]),
        ("Badanie refrakcji", [("page", "foropter-visionfit"), ("page", "autorefraktometry")]),
        ("Tonometry", [("page", "tonometr-aplanacyjny-art"), ("page", "tonometr-przezpowiekowy")]),
        ("Perymetria", [("item", "Perymetry diodowe (z testami statycznymi)", None, None),
                        ("item", "Perymetry projektorowe (z testami statycznymi oraz dynamicznymi)", None, None)]),
        ("Visual behaviour", [("item", "Vivior – „Holter” widzenia", None, None)]),
    ]),
    dict(slug="zespol-suchego-oka", name="Zespół Suchego Oka", icon="zso", img="iv_2021_03_terapia-zachowawcza-inview-medical.webp", groups=[
        ("Diagnostyka filmu łzowego", [("page", "da-3-2"), ("page", "smtube"), ("page", "i-pen"), ("page", "droptest")]),
        ("Innowacyjne metody terapeutyczne", [("page", "urzadzenie-rexoneye-do-terapii-suchego-oka"), ("page", "jett-plasma-medical")]),
        ("Terapia zachowawcza", [("page", "zestawy-do-wytwarzania-i-porcjowania-surowicy-oraz-osocza-autologicznego"), ("page", "cliradex")]),
        ("Eradykacja nużeńca, blepharitis", [("item", "I-LID’N LASH PLUS", None, None), ("item", "I-LID’N LASH PRO", None, None),
                                              ("item", "Maska I-Relief (ciepło-zimno)", "iv_2021_03_irelief-inview-medical.webp", None),
                                              ("item", "Maska iRelief (USB)", "iv_2021_03_irelief-inview-medical.webp", None),
                                              ("item", "BlefOX", "wz_2025_06_BLEFOX-scaled.webp", "sklep/blefox.html"),
                                              ("item", "Ozolid", "wz_2025_06_OZOLID-scaled.webp", "sklep/ozolid.html")]),
    ]),
    dict(slug="chirurgia", name="Chirurgia okulistyczna", icon="scalpel", img="iv_2021_03_chirurgia-okulistyczna-inview-medical.webp", groups=[
        ("Obszary chirurgii", [("page", "chirurgia-zacmy"), ("page", "chirurgia-jaskry"), ("page", "chirurgia-drog-lzowych"),
                               ("page", "chirurgia-refrakcji"), ("page", "chirurgia-rogowki")]),
        ("Zaćma: soczewki i materiały", [("page", "soczewki-wewnatrzgalkowe"), ("page", "systemy-do-implantacji-soczewek"),
                                         ("page", "materialy-wiskoelastyczne"), ("page", "catapulse")]),
        ("Narzędzia", [("page", "noze-diamentowe-nano"), ("page", "separator-tkanek-vesalius-lx")]),
    ]),
    dict(slug="lasery", name="Lasery okulistyczne", icon="laser", img="iv_2018_06_lasery-okulistyczne.webp", groups=[
        ("Lasery", [("page", "laser-fox"), ("page", "laser-cito"), ("page", "lasery-vario"), ("page", "nd-yag"),
                    ("page", "laser-cetus"), ("page", "laser-ktp"), ("page", "lasery-co2")]),
    ]),
    dict(slug="edukacja", name="Edukacja i rozwiązania IT", icon="edu", img="iv_2021_03_edukacja-szkolenia-inview-medical.webp", groups=[
        ("Edukacja i szkolenia", [("page", "edukacja-i-szkolenia")]),
        ("Rozwiązania IT", [("page", "rozwiazania-it")]),
    ]),
]

# nicer titles + images for detail pages (old site titles were lower-case / generic)
PAGE_META = {
    "tester-wzroku-optec-5000g": ("Tester wzroku OPTEC 5000G", "iv_2015_08_tester-wzroku-optec.webp"),
    "functional-vision-analyzer": ("Functional Vision Analyzer", "iv_2015_08_functional-vision-analyzer.webp"),
    "przenosna-lampa-szczelinowa-hyperion": ("Przenośna lampa szczelinowa Hyperion", None),
    "funduskamera-z-optyka-adaptywna": ("Funduskamera z optyką adaptywną RTX-1e", "iv_2015_08_funduskamera.webp"),
    "cro": ("CRO", "iv_2021_08_PastedGraphic-2-285x300.webp"),
    "cro-plus": ("CRO Plus", "iv_2021_08_PastedGraphic-10-285x300.webp"),
    "luna-plus": ("Luna Plus", None),
    "foropter-visionfit": ("Przenośny elektroniczny foropter VisionFit", None),
    "autorefraktometry": ("Autorefraktometry", None),
    "tonometr-aplanacyjny-art": ("Tonometr aplanacyjny ART", "iv_2015_08_tonometry-aplanacyjne.webp"),
    "tonometr-przezpowiekowy": ("Tonometr przezpowiekowy", "iv_2015_08_tonometr-przezpowiekowy.webp"),
    "da-3-2": ("DA-3 tester powierzchni oka", "iv_2025_12_DA-3foto.webp"),
    "smtube": ("SMTube", None),
    "i-pen": ("I-Pen", None),
    "droptest": ("DropTest", None),
    "urzadzenie-rexoneye-do-terapii-suchego-oka": ("Rexon-Eye®", "iv_2025_12_rexon-eye-mask-n.webp"),
    "jett-plasma-medical": ("Jett Plasma Medical", "iv_2025_12_JPLM-4a-scaled.webp"),
    "zestawy-do-wytwarzania-i-porcjowania-surowicy-oraz-osocza-autologicznego": ("Zestawy do surowicy i osocza autologicznego", "iv_2015_08_biomed.webp"),
    "cliradex": ("Cliradex®", "iv_2021_03_cliradex-inview-medical.webp"),
    "chirurgia-zacmy": ("Chirurgia zaćmy", "iv_2015_08_chirurgia-zacmy.webp"),
    "chirurgia-jaskry": ("Chirurgia jaskry", "iv_2015_08_chirurgia-jaskry.webp"),
    "chirurgia-drog-lzowych": ("Chirurgia dróg łzowych", "iv_2015_08_chirurgia-drog-lzowych.webp"),
    "chirurgia-refrakcji": ("Chirurgia refrakcji", "iv_2015_08_chirurgia-refrakcji.webp"),
    "chirurgia-rogowki": ("Chirurgia rogówki", "iv_2015_08_chirurgia-okulistyczna1.webp"),
    "soczewki-wewnatrzgalkowe": ("Soczewki wewnątrzgałkowe", None),
    "systemy-do-implantacji-soczewek": ("Systemy do implantacji soczewek", None),
    "materialy-wiskoelastyczne": ("Materiały wiskoelastyczne", None),
    "catapulse": ("CataPulse", None),
    "noze-diamentowe-nano": ("Noże diamentowe NANO", "iv_2015_08_noze-diamentowe.webp"),
    "separator-tkanek-vesalius-lx": ("Separator tkanek VESALIUS LX", None),
    "laser-fox": ("Laser FOX", "iv_2018_06_fox.webp"),
    "laser-cito": ("SLT Laser CITO 532", "iv_2018_06_Product-CITO_3.webp"),
    "lasery-vario": ("Systemy VARIO", "iv_2018_06_Product-vario.webp"),
    "nd-yag": ("Nd:YAG Laser Q-LAS", "iv_2018_06_OphthaQ-LAS-5_m.webp"),
    "laser-cetus": ("Cetus", "iv_2018_06_cetus.webp"),
    "laser-ktp": ("KTP Laser CLASSIC", None),
    "lasery-co2": ("Lasery CO2", None),
    "edukacja-i-szkolenia": ("Modele oka BIONIKO", "iv_2015_08_edukacja-szkolenia1.webp"),
    "rozwiazania-it": ("IFA systems", "iv_2015_08_rozwiazania-it-okulistyka.webp"),
}

# extra items that the old category pages listed without own subpage — attach to detail pages
PAGE_ITEMS = {
    "soczewki-wewnatrzgalkowe": ["Lucidis 108M/124M", "Lucidis 108MT/124MT (soczewka toryczna)", "Eden 108M/124M",
                                 "Eden 108MT/124MT (soczewka toryczna)", "Harmonis"],
}

# PDFs that appear on many pages come from the old sidebar, not from the product itself
_pdf_count = {}
for _p in PAGES.values():
    for _d in _p.get("pdfs") or []:
        _pdf_count[_d["url"]] = _pdf_count.get(_d["url"], 0) + 1
for _p in PAGES.values():
    _p["pdfs"] = [d for d in (_p.get("pdfs") or []) if _pdf_count[d["url"]] <= 2]
    # bullet lines that only repeat a download name belong to the downloads panel
    _names = {d["name"].strip().lower() for d in _p["pdfs"]}
    _p["text"] = "\n".join(l for l in _p["text"].split("\n") if l.lstrip("- ").strip().lower() not in _names)

PAGES["soczewki-wewnatrzgalkowe"]["pdfs"].append(
    {"name": "Opis soczewek", "url": "https://www.inviewmedical.pl/wp-content/uploads/2021/08/opis-soczewek.pdf"})

PAGE_CAT = {}
for c in CATALOG:
    for gname, entries in c["groups"]:
        for en in entries:
            if en[0] == "page":
                PAGE_CAT.setdefault(en[1], (c, gname))


def page_title(slug):
    m = PAGE_META.get(slug)
    if m:
        return m[0]
    t = PAGES[slug]["title"]
    return t[:1].upper() + t[1:]


def page_img(slug):
    m = PAGE_META.get(slug)
    if m and m[1]:
        return m[1]
    imgs = PAGES[slug].get("imgs") or []
    return imgs[0] if imgs else None


# ------------------------------------------------------------------ shop
SHOP_SLUG = {
    "fridop-wspomaganie-hamowania-krotkowzrocznosci-40tabl": "fridop",
    "orcam-myreader-2-0-inteligentna-kamera-dla-osob-niewidomych-i-slabowidzacych-odczytuje-tekst-z-kazdej-powierzchni": "orcam-myreader-2-0",
    "innowacyjne-wymazowki-floqswabs-cena-za-1-sztuke": "floqswabs",
    "zestaw-testy-diagnostyczne-inflaeyez-innowacyjne-wymazowki-floqswabs-10-10": "zestaw-inflaeyez-floqswabs",
    "testy-diagnostyczne-inflaeyez-10-paskow": "inflaeyez",
    "ozodrop-gel-k-2": "ozodrop-gel-k",
    "icover-hygienic-eyelid-sheet-30-sztuk-w-opakowaniu": "icover",
}
EXTRA_CATS = {"orcam-myeye-2-0": "Wsparcie słabowidzących", "orcam-myreader-2-0": "Wsparcie słabowidzących",
              "fridop": "Suplementy diety", "i-drop-mgd": "Wyroby medyczne", "icover": "Maski"}
PRODUCTS = []
for p in DATA["products"]:
    p = dict(p)
    p["slug"] = SHOP_SLUG.get(p["slug"], p["slug"])
    cats = list(p["cats"]) or [EXTRA_CATS.get(p["slug"], "Pozostałe")]
    p["cats"] = cats
    p["name"] = p["name"].replace("&#8211;", "–")
    PRODUCTS.append(p)
PROD = {p["slug"]: p for p in PRODUCTS}
SHOP_CATS = []
for p in PRODUCTS:
    for c in p["cats"]:
        if c not in SHOP_CATS:
            SHOP_CATS.append(c)


def fmt_price(v):
    return f"{v:,.2f}".replace(",", " ").replace(".", ",") + " zł"


# ------------------------------------------------------------------ blog
POSTS = []
for p in DATA["posts"]:
    p = dict(p)
    p["out"] = p["slug"] if p["site"] == "wzrokok" else "aktualnosci-" + p["slug"]
    p["short_title"] = p["title"]
    POSTS.append(p)

# ------------------------------------------------------------------ 12 perspectives (client brief)
# links: "cat:<old_slug>" -> catalog page, "shop:<slug>" -> shop product, "ask:<name>" -> contact with topic
PERSPECTIVES = [
    dict(slug="amd", n="01", title="AMD", icon="amd", q="A jeśli w AMD jest jeszcze <strong>więcej do odkrycia?</strong>",
         layout="duo",
         panes=[dict(label="Dziś", h="Ta sama luteina.<br><strong>Nowe możliwości.</strong>", brandmark="IONTO<i>RETINA</i>®", cta=("Odkryj", "ask:IontoRetina")),
                dict(label="Jutro", future=True, h="A jeśli to dopiero<br><strong>początek roli prądu?</strong>", soon=True)],
         related=["shop:macushield-original", "shop:macushield-gold"]),
    dict(slug="jaskra", n="02", title="Jaskra", icon="jaskra", q="Nowy kurs między <strong>laserem a chirurgią.</strong>",
         layout="trio",
         panes=[dict(label="Laser", h="Sprawdzone rozwiązania dla <strong>terapii laserowej.</strong>",
                     brands=[("YAG / SLT", "Appasamy", "cat:nd-yag"), ("FOX", "A.R.C. Laser", "cat:laser-fox")]),
                dict(label="FLiGHT®", hl=True, h="Trzecia możliwość <strong>w leczeniu jaskry.</strong>", cta=("Odkryj", "ask:FLiGHT")),
                dict(label="Chirurgia", h="Wsparcie chirurgiczne dla <strong>drożności kąta.</strong>",
                     brands=[("Goniowash", "", "ask:Goniowash"), ("Nexa Vision", "", "ask:Nexa Vision")], cta=("Chirurgia jaskry", "cat:chirurgia-jaskry"))],
         related=["cat:laser-cito", "cat:nd-yag", "cat:laser-fox", "cat:chirurgia-jaskry"]),
    dict(slug="zacma", n="03", title="Zaćma", icon="zacma", q="A jeśli o efekcie decyduje <strong>więcej niż jeden moment?</strong>",
         layout="moments",
         moments=[("Moment 01", "Zabieg", "Cetus+", "cat:laser-cetus"), ("Moment 02", "Stabilizacja", "fixOflex+", "ask:fixOflex"),
                  ("Moment 03", "Kształtowanie widzenia", "LUCIDIS+", "cat:soczewki-wewnatrzgalkowe")],
         future=dict(label="Jutro", h="A jeśli o efekcie można decydować <strong>także po zabiegu?</strong>"),
         related=["cat:chirurgia-zacmy", "cat:soczewki-wewnatrzgalkowe", "cat:laser-cetus", "cat:materialy-wiskoelastyczne"]),
    dict(slug="zespol-suchego-oka", n="04", title="Zespół Suchego Oka w klinice", short="ZSO w klinice", icon="zso",
         q="ZSO nie ma jednego mechanizmu. <strong>Dlatego nie ma jednej odpowiedzi.</strong>",
         layout="steps",
         steps=[("exam", "Zobaczyć,", "zanim zaczniemy działać", "DA-3", "cat:da-3-2"),
                ("arrow", "Zmienić", "trajektorię", "RexonEye", "cat:urzadzenie-rexoneye-do-terapii-suchego-oka"),
                ("lid", "Wprowadzić", "terapię w codzienność", "EyeLys", "shop:eyelys"),
                ("zso", "Zbliżyć", "kroplę do naturalnych łez", "I-DROP MGD", "shop:i-drop-mgd")],
         related=["cat:da-3-2", "cat:urzadzenie-rexoneye-do-terapii-suchego-oka", "shop:eyelys", "shop:i-drop-mgd", "cat:i-pen", "cat:smtube"]),
    dict(slug="lipozoneye", n="05", title="LipozonEye®", icon="lipo", q="Formuła, która zmienia się <strong>wraz z miejscem i potrzebą.</strong>",
         layout="trio2",
         panes=[dict(label="01", h="Czym jest <strong>LipozonEye®?</strong>", cta=("Odkryj", "#produkty")),
                dict(label="02", hl=True, h="Jak jedna formuła staje się <strong>trzema rozwiązaniami?</strong>", cta=("Odkryj", "#produkty"))],
         related=["shop:ozodrop", "shop:ozodrop-gel-k", "shop:ozolid", "shop:blefox"],
         related_title="Produkty z LipozonEye® w składzie"),
    dict(slug="opieka-okolozabiegowa", n="06", title="Opieka okołozabiegowa", icon="shield",
         q="Czasem subtelny element opieki może mieć <strong>ogromne znaczenie.</strong>",
         layout="duo",
         panes=[dict(label="Przed zabiegiem", h="Wyjątkowo niska częstość endoftalmitis <strong>w protokołach obejmujących produkty LipozonEye®</strong>",
                     tag="PRO·PIO Study", cta=("Odkryj", "ask:PRO·PIO Study")),
                dict(label="Po zabiegu", future=True, h="Zabieg się kończy.<br><strong>Opieka trwa dalej.</strong>",
                     brands=[("IMMUNODROP SAKEI®", "", "shop:immunodrop")], cta=("Odkryj", "shop:immunodrop"))],
         related=["shop:ozodrop", "shop:ozolid", "shop:immunodrop"]),
    dict(slug="bol-rogowkowy", n="07", title="Ból rogówkowy", icon="cornea", q="A jeśli możemy działać <strong>bliżej jego źródła?</strong>",
         layout="duo",
         panes=[dict(label="Uszkodzenie powierzchni rogówki", h="Kiedy ból zaczyna się <strong>na powierzchni.</strong>",
                     brands=[("OZODROP GEL-K®", "", "shop:ozodrop-gel-k")], cta=("Odkryj", "shop:ozodrop-gel-k")),
                dict(label="Ból neuropatyczny", future=True, h="Kiedy źródło bólu <strong>nie jest oczywiste.</strong>",
                     brands=[("RexonEye®", "", "cat:urzadzenie-rexoneye-do-terapii-suchego-oka")], cta=("Odkryj", "cat:urzadzenie-rexoneye-do-terapii-suchego-oka"))],
         related=["shop:ozodrop-gel-k", "cat:urzadzenie-rexoneye-do-terapii-suchego-oka"]),
    dict(slug="strategie-paraprobiotyczne", n="08", title="Strategie paraprobiotyczne w klinice", short="Strategie paraprobiotyczne", icon="bio",
         q="Powierzchnia oka to więcej <strong>niż film łzowy.</strong>",
         layout="flow",
         flow=[dict(h="Komponent biologiczny", dim=True), dict(arrow="both"), dict(h="Komponent fizyczny", dim=True), dict(arrow=True),
               dict(tag="Immunodrop Sakei®", h="Pierwsze krople paraprobiotyczne.", hl=True, cta=("Odkryj", "shop:immunodrop"))],
         related=["shop:immunodrop"]),
    dict(slug="blefaroterapia", n="09", title="Blefaroterapia", icon="lid", q="A jeśli część terapii może stać się <strong>dobrym nawykiem?</strong>",
         layout="flow",
         flow=[dict(h="Klinika", brands=[("BlefOX®", "", "shop:blefox"), ("NuLids®", "", "ask:NuLids")]),
               dict(arrow="both", label="Klinika ↔ Dom"),
               dict(h="Dom", hl=True, brands=[("BlefOX®", "", "shop:blefox")], cta=("Odkryj", "shop:blefox"))],
         related=["shop:blefox", "shop:ozolid", "shop:eyelys", "cat:cliradex"]),
    dict(slug="dcr", n="10", title="DCR", icon="dcr", q="A jeśli nowa droga zaczyna się <strong>od tej, która już istnieje?</strong>",
         layout="flow",
         flow=[dict(tag="Niedrożność", h="Droga, która nie prowadzi dalej.", dim=True), dict(arrow=True),
               dict(h="Szukamy innej drogi.", brands=[("OFT-30", "", "cat:chirurgia-drog-lzowych"), ("Endo Optics E2", "", "cat:chirurgia-drog-lzowych"),
                                                                    ("FOX", "", "cat:laser-fox"), ("WOLF", "", "cat:chirurgia-drog-lzowych")]),
               dict(arrow=True), dict(h="Nowa droga odpływu.", hl=True, cta=("Odkryj", "cat:chirurgia-drog-lzowych"))],
         related=["cat:chirurgia-drog-lzowych", "cat:laser-fox"]),
    dict(slug="badanie-wzroku", n="11", title="Badanie wzroku", icon="exam", q="A jeśli badanie może być <strong>wspólnym doświadczeniem?</strong>",
         layout="flow",
         flow=[dict(h="Zobaczyć. Zrozumieć. Pokazać.", img="iv_2025_12_Kaleidos-_D8C5503_ok_4.webp",
                    brands=[("2WIN", "", "catcat:diagnostyka"), ("Kaleidos", "", "ask:Kaleidos"), ("AOC", "", "catcat:diagnostyka")]),
               dict(arrow=True),
               dict(h="Badanie, które łączy lekarza i pacjenta.", hl=True, cta=("Odkryj", "catcat:diagnostyka"))],
         related=["cat:tester-wzroku-optec-5000g", "cat:functional-vision-analyzer", "cat:foropter-visionfit", "cat:autorefraktometry"]),
    dict(slug="suplementacja", n="12", title="Suplementacja w praktyce okulistycznej", short="Suplementacja w praktyce", icon="capsule",
         q="Bo nawet to, co uzupełnia, <strong>warto wybierać świadomie.</strong>",
         layout="trio",
         panes=[dict(label="AMD", h="<strong>MacuShield®</strong>", sub="Plamka widzi 3.", cta=("Odkryj", "shop:macushield-original")),
                dict(label="Stan zapalny", hl=True, h="<strong>Norflo®</strong>", sub="Kurkumina, która dociera dalej.", cta=("Odkryj", "shop:norflo")),
                dict(label="ZSO", h="<strong>AsekOfta®</strong>", sub="Saszetka, która wspiera od środka.", cta=("Odkryj", "ask:AsekOfta"))],
         related=["shop:macushield-original", "shop:macushield-gold", "shop:norflo", "shop:fridop"]),
]


# ------------------------------------------------------------------ link resolution
def resolve(ref, root):
    if ref.startswith("#"):
        return ref, False
    kind, _, val = ref.partition(":")
    if kind == "cat":
        return f"{root}katalog/{val}.html", False
    if kind == "catcat":
        return f"{root}katalog/{val}.html", False
    if kind == "shop":
        return f"{root}sklep/{val}.html", False
    if kind == "ask":
        return f"{root}kontakt.html?temat={val.replace(' ', '%20')}#formularz", True
    return ref, False


# ------------------------------------------------------------------ layout
NAV = [("perspektywy/index.html", "Perspektywy", "persp"), ("katalog/index.html", "Katalog", "katalog"),
       ("blog/index.html", "Blog", "blog"), ("firma.html", "Firma", "firma"), ("kontakt.html", "Kontakt", "kontakt")]


def head(title, desc, root):
    return f"""<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<meta name="theme-color" content="#f4f8ff">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:type" content="website">
<link rel="icon" href="{root}assets/img/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{root}assets/css/style.css">
</head>"""


def header(root, active, solid=False):
    links = "".join(f'<a href="{root}{h}"{" aria-current=page" if k == active else ""}>{t}</a>' for h, t, k in NAV)
    return f"""<body>
{PERSP_ICON_GRAD}
<a class="skip" href="#main">Przejdź do treści</a>
<header class="site-header{' solid' if solid else ''}">
  <div class="wrap">
    <a class="brand" href="{root}index.html" aria-label="InView Medical — strona główna">{logo_svg()}
      <span class="brand-name">INVIEW <b>MEDICAL</b><small>Przyszłość w zasięgu wzroku</small></span></a>
    <nav class="nav" id="nav" aria-label="Główna nawigacja">{links}<a class="shop-link" href="{root}sklep/index.html"{" aria-current=page" if active == "sklep" else ""}>Sklep WzrokOK</a></nav>
    <span class="lang" aria-label="Język: polski">PL</span>
    <button class="burger" aria-label="Menu" aria-expanded="false" aria-controls="nav"><span></span><span></span><span></span></button>
  </div>
</header>
<main id="main">"""


def footer(root, gate=False):
    cats = "".join(f'<li><a href="{root}katalog/{c["slug"]}.html">{e(c["name"])}</a></li>' for c in CATALOG)
    g = ""
    if gate:
        g = f"""<div class="gate" id="gate" role="dialog" aria-modal="true" aria-labelledby="gate-t" hidden>
  <div class="gate-box">
    <p class="eyebrow">InView Medical</p>
    <h2 id="gate-t">Czy jesteś profesjonalistą (lekarzem, osobą wykonującą zawód medyczny lub obracającą wyrobami medycznymi)?</h2>
    <p>Zgodnie z obowiązującymi przepisami prawa (Ustawa z dn. 7 kwietnia 2022 r. o wyrobach medycznych), strona Inviewmedical.pl zawiera treści reklamowe dotyczące wyrobów medycznych przeznaczonych do używania przez użytkowników innych niż laicy.</p>
    <p>Wchodząc na tę stronę potwierdzasz, że jesteś osobą wykonującą zawód medyczny lub osobą prowadzącą obrót wyrobami medycznymi.</p>
    <div class="gate-actions">
      <button class="btn solid" data-yes>Tak, potwierdzam</button>
      <a class="btn" href="{root}sklep/index.html">Nie, chcę zobaczyć stronę dla pacjentów</a>
    </div>
  </div>
</div>"""
    return f"""</main>
<footer class="site-footer">
  <div class="wrap">
    <div class="foot-grid">
      <div>
        <a class="brand" href="{root}index.html">{logo_svg()}<span class="brand-name">INVIEW <b>MEDICAL</b><small>Przyszłość w zasięgu wzroku</small></span></a>
        <p style="margin-top:22px;max-width:36ch">InView Medical jest firmą specjalizującą się w dystrybucji urządzeń, akcesoriów i preparatów okulistycznych.</p>
        <div class="social">
          <a href="{CONTACT['fb_inview']}" target="_blank" rel="noopener" aria-label="InView Medical na Facebooku">{ico('fb')}</a>
          <a href="{CONTACT['ig_wzrokok']}" target="_blank" rel="noopener" aria-label="WzrokOK na Instagramie">{ico('ig')}</a>
        </div>
      </div>
      <div><h4>Katalog</h4><ul>{cats}</ul></div>
      <div><h4>Na skróty</h4><ul>
        <li><a href="{root}perspektywy/index.html">12 perspektyw</a></li>
        <li><a href="{root}sklep/index.html">Sklep WzrokOK</a></li>
        <li><a href="{root}blog/index.html">Blog i aktualności</a></li>
        <li><a href="{root}firma.html">Firma</a></li>
        <li><a href="{root}kariera.html">Kariera</a></li>
        <li><a href="{root}dokumenty.html">Dokumenty prawne</a></li>
      </ul></div>
      <div><h4>Kontakt</h4><ul>
        <li>{CONTACT['street']}<br>{CONTACT['city']}</li>
        <li><a href="tel:{CONTACT['phone_href']}">{CONTACT['phone']}</a></li>
        <li><a href="mailto:{CONTACT['email']}">{CONTACT['email']}</a></li>
        <li><a href="mailto:{CONTACT['shop_email']}">{CONTACT['shop_email']}</a></li>
      </ul></div>
    </div>
    <div class="foot-bottom"><span>© 2026 InView Medical. Wszelkie prawa zastrzeżone.</span><span>Wspólnie dla lepszego widzenia</span></div>
  </div>
</footer>
<button class="to-top" aria-label="Wróć na górę">{ico('up')}</button>
{g}
<script src="{root}assets/js/main.js" defer></script>
</body>
</html>"""


def write(rel, content):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def img_tag(name, alt, root, cls="", lazy=True, w=None, h=None):
    if not name:
        return ""
    wh = f' width="{w}" height="{h}"' if w else ""
    return f'<img src="{root}{IMG}{name}" alt="{e(alt)}"{" loading=lazy decoding=async" if lazy else ""}{wh}{" class=" + chr(34) + cls + chr(34) if cls else ""}>'


def arrow():
    return ico("arrow")


def crumbs(root, items):
    parts = [f'<a href="{root}index.html">Start</a>']
    for label, href in items:
        parts.append('<span aria-hidden="true">/</span>')
        parts.append(f'<a href="{href}">{e(label)}</a>' if href else f'<span aria-current="page">{e(label)}</span>')
    return f'<nav class="crumbs" aria-label="Okruszki">{"".join(parts)}</nav>'


def page_hero(root, title_html, lead="", crumb=None, eyebrow=""):
    return f"""<section class="page-hero">{scene(road=False)}
  <div class="wrap">{crumbs(root, crumb or [])}
    {f'<p class="eyebrow rv">{eyebrow}</p>' if eyebrow else ''}
    <h1 class="rv" style="--i:1">{title_html}</h1>
    {f'<p class="lead rv" style="--i:2">{lead}</p>' if lead else ''}
  </div>
</section>"""


# ------------------------------------------------------------------ cards
def ref_card(ref, root, i=0):
    kind, _, val = ref.partition(":")
    if kind == "shop" and val in PROD:
        return product_card(PROD[val], root, i)
    if kind == "cat" and val in PAGES:
        return catalog_card(val, root, i)
    return ""


def product_card(p, root, i=0):
    img = p["imgs"][0] if p["imgs"] else None
    promo = p["price"] < p["regular"]
    price = (f'<s>{fmt_price(p["regular"])}</s>' if promo else "") + fmt_price(p["price"])
    return f"""<a class="card pcard rv" style="--i:{i % 6}" href="{root}sklep/{p['slug']}.html" data-tags="{e('|'.join(p['cats']))}">
  {'<span class="badge">Promocja</span>' if promo else ''}
  <div class="media">{img_tag(img, p['name'], root)}</div>
  <div class="body"><span class="kicker">{e(p['cats'][0])}</span><h3>{e(p['name'])}</h3>
    <div class="foot"><span class="price">{price} <small>z VAT</small></span>{ico('cart', 'muted')}</div></div>
</a>"""


def catalog_card(slug, root, i=0):
    c, g = PAGE_CAT.get(slug, (None, ""))
    img = page_img(slug)
    media = (f'<div class="media">{img_tag(img, page_title(slug), root)}</div>' if img
             else f'<div class="media">{gico(c["icon"] if c else "exam", "glyph")}</div>')
    return f"""<a class="card rv" style="--i:{i % 6}" href="{root}katalog/{slug}.html">
  {media}
  <div class="body"><span class="kicker">{e(g or (c['name'] if c else ''))}</span><h3>{e(page_title(slug))}</h3>
    <p>{e(excerpt(PAGES[slug]['text'], 110))}</p>
    <div class="foot"><span class="link-arrow">Zobacz {arrow()}</span></div></div>
</a>"""


def post_card(p, root, i=0):
    media = (f'<div class="media">{img_tag(p["img"], p["title"], root)}</div>' if p.get("img")
             else f'<div class="media">{gico("edu" if "kurs" in p["slug"] else "zso", "glyph")}</div>')
    src = "WzrokOK" if p["site"] == "wzrokok" else "Aktualności InView"
    return f"""<a class="card post-card rv" style="--i:{i % 6}" href="{root}blog/{p['out']}.html" data-tags="{src}">
  {media}
  <div class="body"><span class="kicker">{src}</span><h3>{e(p['title'])}</h3>
    <p>{e(excerpt(p['text'], 120))}</p>
    <div class="foot"><span class="date">{date_pl(p['date'])}</span><span class="link-arrow">Czytaj {arrow()}</span></div></div>
</a>"""


MONTHS = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"]


def date_pl(d):
    y, m, dd = d.split("-")
    return f"{int(dd)} {MONTHS[int(m) - 1]} {y}"


# ------------------------------------------------------------------ pages
def build_home():
    root = ""
    persp_tiles = "".join(
        f'<a class="persp rv" style="--i:{i % 6}" href="perspektywy/{p["slug"]}.html"><span class="n">{p["n"]}</span>'
        f'<span class="bubble">{gico(p["icon"])}</span><span class="t">{e(p.get("short", p["title"]))}</span></a>'
        for i, p in enumerate(PERSPECTIVES))
    n_items = len(PAGE_CAT)
    cat_tiles = "".join(
        f"""<a class="cat-tile rv{' wide' if i < 2 else ''}" style="--i:{i}" href="katalog/{c['slug']}.html">
      {img_tag(c['img'], c['name'], root)}
      <div class="in"><span class="count">{sum(1 for k, v in PAGE_CAT.items() if v[0] is c)} pozycji</span><h3>{e(c['name'])}</h3><span class="link-arrow">Przeglądaj {arrow()}</span></div></a>"""
        for i, c in enumerate(CATALOG))
    shop = "".join(product_card(p, root, i) for i, p in enumerate(PRODUCTS))
    posts = "".join(post_card(p, root, i) for i, p in enumerate(POSTS[:3]))
    jo = [  # orbs along the road, revealed per stage
        ("exam", "50%", "62%", 110, 0), ("amd", "62%", "54%", 64, 0), ("zso", "38%", "70%", 88, 1),
        ("bio", "66%", "60%", 70, 1), ("shield", "30%", "62%", 96, 2), ("lid", "56%", "52%", 58, 2), ("capsule", "72%", "68%", 84, 2)]
    jorbs = "".join(f'<div class="jo" data-stage="{s}" style="--x:{x};--y:{y};--s:{sz}px"><div class="orb">{gico(icn)}</div></div>' for icn, x, y, sz, s in jo)
    body = f"""
<section class="hero">
  {scene(hx=0.62, hy=0.6, curve=0.22)}
  <div class="wrap">
    <div>
      <h1 class="rv"><span class="thin">Journey</span><span class="thin">through</span><span class="bold">InView<sup>®</sup></span></h1>
      <p class="lead rv" style="--i:1">Dwanaście obszarów okulistyki. Dwanaście perspektyw na to, co możemy odkryć, wdrożyć i rozwijać.</p>
      <a class="btn rv" style="--i:2" href="#podroz">Rozpocznij podróż {arrow()}</a>
    </div>
    <div class="hero-orb rv" style="--i:2"><div class="orb float">{logo_svg()}</div></div>
  </div>
  <a class="scroll-cue" href="#podroz">Przewiń<i></i></a>
</section>

<section class="journey" id="podroz" aria-label="Podróż przez InView">
  <div class="journey-stage">
    {scene(hx=0.5, hy=0.5, curve=0.12, fade=False)}
    <div class="journey-orbs" aria-hidden="true">{jorbs}</div>
    <div class="journey-copy">
      <div class="journey-step on"><h2>Odkrywamy.</h2><hr class="rule"><p>Ruszamy w drogę. Pojawia się pierwszy etap.</p></div>
      <div class="journey-step" aria-hidden="true"><h2>Wdrażamy.</h2><hr class="rule"><p>Podróż nabiera tempa. Otwierają się nowe możliwości.</p></div>
      <div class="journey-step" aria-hidden="true"><h2>Rozwijamy.</h2><hr class="rule"><p>Horyzont się otwiera. Zbliżamy się do celu.</p></div>
      <div class="journey-step" aria-hidden="true"><h2>12 perspektyw.</h2><hr class="rule"><p>Zobacz, dokąd prowadzi InView.</p></div>
    </div>
    <ul class="journey-words" aria-hidden="true"><li>Wiedza</li><li>Innowacje</li><li>Praktyka</li><li>Lepsze jutro</li></ul>
    <div class="journey-dots" aria-hidden="true"><i class="on"></i><i></i><i></i><i></i></div>
  </div>
</section>

<section class="section glow" id="perspektywy">
  <div class="wrap">
    <div class="section-head center">
      <h2 class="h-xl rv">12 <strong>perspektyw.</strong></h2>
      <hr class="rule c">
      <p class="lead rv" style="--i:1">Wybierz, od której zaczynasz.</p>
    </div>
    <div class="persp-grid">{persp_tiles}</div>
  </div>
</section>

<section class="section bg-ice" id="katalog">
  <div class="wrap">
    <div class="section-head" style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:24px">
      <div><p class="eyebrow rv">Katalog</p><h2 class="h-xl rv" style="--i:1">Zaawansowane technologie <strong>w ochronie wzroku</strong></h2></div>
      <a class="btn rv" href="katalog/index.html">Cały katalog {arrow()}</a>
    </div>
    <div class="cat-tiles">{cat_tiles}</div>
  </div>
</section>

<section class="section" id="sklep">
  <div class="wrap">
    <div class="section-head" style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:24px">
      <div><p class="eyebrow rv">Sklep WzrokOK</p><h2 class="h-xl rv" style="--i:1">Zaufaj ekspertom <strong>od pielęgnacji i ochrony wzroku</strong></h2>
      <p class="lead rv" style="--i:2">Pod okiem profesjonalistów zadbasz o swój wzrok każdego dnia i w każdej sytuacji.</p></div>
    </div>
    <div class="rail-wrap" data-rail>
      <div class="rail">{shop}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap">
        <div class="rail-nav"><button data-dir="-1" aria-label="Poprzednie produkty">{ico('arrow-l')}</button><button data-dir="1" aria-label="Następne produkty">{arrow()}</button></div>
        <a class="btn solid" href="sklep/index.html">Sprawdź ofertę {arrow()}</a>
      </div>
    </div>
  </div>
</section>

<section class="section bg-ice">
  <div class="wrap split">
    <div class="rv"><div class="portrait">{img_tag('iv_2026_01_Robert-Mercik-IVM-01-mini.webp', 'Robert Mercik, współwłaściciel InView Medical', root)}</div></div>
    <div>
      <p class="eyebrow rv">Firma</p>
      <blockquote class="quote rv" style="--i:1">Okulistyka nie jest dla nas hasłem w Wikipedii, lecz drogą, na którą weszliśmy lata temu wybierając kierunek studiów i specjalizację.</blockquote>
      <p class="signature rv" style="--i:2">Robert Mercik<small>współwłaściciel InView Medical</small></p>
      <p class="rv" style="--i:3;margin-top:22px">Z chęci dzielenia się wiedzą i pomagania środowisku okulistów zrodziła się InView Medical – firma, której misją jest promowanie zaawansowanych technologii w okulistyce.</p>
      <a class="btn rv" style="--i:4;margin-top:10px" href="firma.html">Poznaj nas {arrow()}</a>
    </div>
  </div>
</section>

<section class="section tight">
  <div class="wrap">
    <div class="facts">
      <div class="fact rv"><b>12</b><span>obszarów okulistyki</span></div>
      <div class="fact rv" style="--i:1"><b>{n_items}</b><span>rozwiązań w katalogu dla specjalistów</span></div>
      <div class="fact rv" style="--i:2"><b>{len(PRODUCTS)}</b><span>produktów w sklepie WzrokOK</span></div>
      <div class="fact rv" style="--i:3"><b>{len(POSTS)}</b><span>artykułów i aktualności</span></div>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head" style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:24px">
      <div><p class="eyebrow rv">Blog</p><h2 class="h-xl rv" style="--i:1">Wiedza <strong>w jednym miejscu</strong></h2>
      <p class="lead rv" style="--i:2">Wszystko, co musisz wiedzieć o ochronie i pielęgnacji oczu – praktyczne porady, nowinki i eksperckie artykuły.</p></div>
      <a class="btn rv" href="blog/index.html">Wszystkie wpisy {arrow()}</a>
    </div>
    <div class="cards">{posts}</div>
  </div>
</section>

{contact_band(root)}
"""
    write("index.html", head("InView Medical — Zaawansowane technologie w ochronie wzroku",
                             "Dwanaście obszarów okulistyki. Urządzenia, akcesoria i preparaty okulistyczne dla specjalistów oraz sklep WzrokOK dla pacjentów.", root)
          + header(root, "home") + body + footer(root, gate=True))


def contact_band(root):
    return f"""<section class="section tight"><div class="wrap"><div class="band rv">
  <h2>Porozmawiajmy <strong>o Twojej praktyce.</strong></h2>
  <p>Zapytaj o urządzenia, materiały informacyjne, szkolenia lub ofertę dla gabinetu.</p>
  <div class="actions"><a class="btn light" href="{root}kontakt.html">Napisz do nas {arrow()}</a>
  <a class="btn light" href="tel:{CONTACT['phone_href']}">{CONTACT['phone']}</a></div>
</div></div></section>"""


def pane_html(pn, root):
    label = pn.get("label", "")
    parts = [f'<p class="eyebrow">{e(label)}</p>' if label else ""]
    if pn.get("tag"):
        parts.append(f'<span class="chip">{e(pn["tag"])}</span>')
    parts.append(f'<h3>{pn["h"]}</h3>')
    if pn.get("sub"):
        parts.append(f'<p class="h-md" style="font-weight:300;margin:0">{e(pn["sub"])}</p>')
    if pn.get("brandmark"):
        parts.append(f'<div class="brandmark">{pn["brandmark"]}</div>')
    if pn.get("brands"):
        bs = []
        for name, sub, ref in pn["brands"]:
            href, ask = resolve(ref, root)
            bs.append(f'<a href="{href}">{e(name)}{f" <small>{e(sub)}</small>" if sub else ""}</a>')
        parts.append(f'<div class="brands">{"".join(bs)}</div>')
    parts.append('<div class="grow"></div>')
    if pn.get("soon"):
        parts.append('<span class="soon"><i></i>Wkrótce</span>')
    if pn.get("cta"):
        t, ref = pn["cta"]
        href, ask = resolve(ref, root)
        parts.append(f'<a class="btn{" light" if pn.get("hl") else ""}" href="{href}">{e(t)} {arrow()}</a>')
    return "".join(parts)


def v2_html(p, root):
    L = p["layout"]
    if L == "duo":
        panes = "".join(f'<div class="pane{" future" if pn.get("future") else ""}">{pane_html(pn, root)}</div>' for pn in p["panes"])
        return f'<div class="duo rv">{panes}</div>'
    if L in ("trio", "trio2"):
        panes = "".join(f'<div class="pane rv{" hl" if pn.get("hl") else ""}" style="--i:{i}">{pane_html(pn, root)}</div>' for i, pn in enumerate(p["panes"]))
        style = ' style="grid-template-columns:repeat(2,1fr)"' if L == "trio2" else ""
        return f'<div class="trio"{style}>{panes}</div>'
    if L == "steps":
        st = []
        for i, (icon, a, b, prod, ref) in enumerate(p["steps"]):
            href, _ = resolve(ref, root)
            st.append(f'<a class="step rv" style="--i:{i}" href="{href}"><span class="sn">0{i + 1}</span>{ico(icon)}'
                      f'<span class="sl"><b>{e(a)}</b>{e(b)}</span><span class="sp">{e(prod)}</span><span class="plus" aria-hidden="true">+</span></a>')
        return f'<div class="steps" style="--n:{len(st)}">{"".join(st)}</div>'
    if L == "moments":
        ms = []
        for i, (lab, what, prod, ref) in enumerate(p["moments"]):
            href, _ = resolve(ref, root)
            ms.append(f'<a class="step rv" style="--i:{i}" href="{href}"><span class="sn">0{i + 1}</span>'
                      f'<span class="sl"><b>{e(lab)}</b>{e(what)}</span><span class="sp">{e(prod)}</span><span class="plus" aria-hidden="true">+</span></a>')
        fut = p["future"]
        return (f'<p class="eyebrow rv">Dziś</p><div class="steps" style="--n:3;margin:30px 0 60px">{"".join(ms)}</div>'
                f'<div class="duo rv" style="grid-template-columns:1fr"><div class="pane future" style="min-height:340px">'
                f'<p class="eyebrow">{fut["label"]}</p><h3>{fut["h"]}</h3><span class="soon"><i></i>Wkrótce</span></div></div>')
    if L == "flow":
        out = []
        for i, nd in enumerate(p["flow"]):
            if "arrow" in nd:
                lab = f'<p class="tag" style="margin:6px 0">{e(nd["label"])}</p>' if nd.get("label") else ""
                out.append(f'<div class="arrow{" both" if nd["arrow"] == "both" else ""}" aria-hidden="true"></div>{lab}'
                           + (f'<div class="arrow both" aria-hidden="true"></div>' if nd.get("label") else ""))
                continue
            cls = "node rv" + (" dim" if nd.get("dim") else "") + (" hl" if nd.get("hl") else "")
            inner = (f'<p class="tag">{e(nd["tag"])}</p>' if nd.get("tag") else "") + f'<p class="h-md">{e(nd["h"])}</p>'
            if nd.get("img"):
                inner = f'<div style="max-width:320px;margin:0 auto 20px;border-radius:20px;overflow:hidden">{img_tag(nd["img"], nd["h"], root)}</div>' + inner
            if nd.get("brands"):
                bs = "".join(f'<a href="{resolve(r, root)[0]}">{e(n)}</a>' for n, s, r in nd["brands"])
                inner += f'<div class="brands">{bs}</div>'
            if nd.get("cta"):
                t, ref = nd["cta"]
                inner += f'<p style="margin:22px 0 0"><a class="btn{" light" if nd.get("hl") else ""}" href="{resolve(ref, root)[0]}">{e(t)} {arrow()}</a></p>'
            out.append(f'<div class="{cls}">{inner}</div>')
        return f'<div class="flow">{"".join(out)}</div>'
    return ""


def build_perspectives():
    root = "../"
    for i, p in enumerate(PERSPECTIVES):
        prev_p = PERSPECTIVES[i - 1]
        next_p = PERSPECTIVES[(i + 1) % len(PERSPECTIVES)]
        rel = "".join(ref_card(r, root, j) for j, r in enumerate(p.get("related", [])))
        rel_sec = (f"""<section class="section bg-ice" id="produkty"><div class="wrap">
  <div class="section-head"><p class="eyebrow rv">{e(p['n'])} · {e(p['title'])}</p><h2 class="h-lg rv">{e(p.get('related_title', 'Powiązane rozwiązania'))}</h2></div>
  <div class="cards">{rel}</div></div></section>""" if rel else "")
        q_plain = re.sub("<[^>]+>", "", p["q"])
        body = f"""
<section class="v1">
  {scene(hx=0.7, hy=0.62, curve=0.1)}
  <div class="wrap">
    <div>
      {crumbs(root, [("Perspektywy", root + "perspektywy/index.html"), (p['title'], None)])}
      <div class="num-big rv" aria-hidden="true">{p['n']}</div>
      <h1 class="rv" style="--i:1">{e(p['title'])}</h1>
      <p class="q rv" style="--i:2">{p['q']}</p>
      <a class="btn rv" style="--i:3" href="#view2">Odkryj {arrow()}</a>
    </div>
    <div class="orb float rv" style="--i:2">{gico(p['icon'])}</div>
  </div>
</section>
<section class="v2" id="view2"><div class="wrap">{v2_html(p, root)}</div></section>
{rel_sec}
<section class="section tight"><div class="wrap persp-nav">
  <a href="{prev_p['slug']}.html"><small>← {prev_p['n']}</small><b>{e(prev_p['title'])}</b></a>
  <a class="next" href="{next_p['slug']}.html"><small>{next_p['n']} →</small><b>{e(next_p['title'])}</b></a>
</div></section>
{contact_band(root)}
"""
        write(f"perspektywy/{p['slug']}.html", head(f"{p['n']} {p['title']} — InView Medical", q_plain, root)
              + header(root, "persp") + body + footer(root, gate=True))

    tiles = "".join(
        f'<a class="persp rv" style="--i:{i % 6}" href="{p["slug"]}.html"><span class="n">{p["n"]}</span>'
        f'<span class="bubble">{gico(p["icon"])}</span><span class="t">{e(p.get("short", p["title"]))}</span></a>'
        for i, p in enumerate(PERSPECTIVES))
    rows = "".join(
        f"""<a class="card plain rv" style="--i:{i % 3}" href="{p['slug']}.html"><div class="body">
<span class="kicker">{p['n']} · {e(p['title'])}</span><h3 style="font-weight:300;font-size:24px">{p['q']}</h3>
<div class="foot"><span class="link-arrow">Odkryj {arrow()}</span></div></div></a>"""
        for i, p in enumerate(PERSPECTIVES))
    body = f"""{page_hero(root, '12 <strong>perspektyw.</strong>', 'Dwanaście obszarów okulistyki. Wybierz, od której zaczynasz.', [("Perspektywy", None)], 'Journey through InView®')}
<section class="section tight"><div class="wrap"><div class="persp-grid">{tiles}</div></div></section>
<section class="section bg-ice"><div class="wrap"><div class="cards">{rows}</div></div></section>
{contact_band(root)}"""
    write("perspektywy/index.html", head("12 perspektyw — InView Medical", "Dwanaście obszarów okulistyki: od AMD po suplementację.", root)
          + header(root, "persp") + body + footer(root, gate=True))


def build_catalog():
    root = "../"
    # index
    blocks = []
    for c in CATALOG:
        cards = []
        for g, entries in c["groups"]:
            for en in entries:
                if en[0] == "page" and PAGE_CAT[en[1]][0] is c:
                    cards.append(catalog_card(en[1], root, len(cards)))
        blocks.append(f"""<div class="group" id="{c['slug']}"><div class="group-head"><h2 class="rv">{e(c['name'])}</h2>
<a class="link-arrow" href="{c['slug']}.html">Zobacz kategorię {arrow()}</a></div><div class="cards">{''.join(cards)}</div></div>""")
    chips = "".join(f'<a class="chip" href="#{c["slug"]}">{e(c["name"])}</a>' for c in CATALOG)
    body = f"""{page_hero(root, 'Katalog <strong>dla specjalistów</strong>', 'Urządzenia, akcesoria i preparaty okulistyczne dystrybuowane przez InView Medical.', [("Katalog", None)], 'Produkty')}
<section class="section tight"><div class="wrap"><div class="filters" style="gap:8px">{chips}</div>{''.join(blocks)}</div></section>
{contact_band(root)}"""
    write("katalog/index.html", head("Katalog — InView Medical", "Diagnostyka, zespół suchego oka, chirurgia okulistyczna, lasery, edukacja i rozwiązania IT.", root)
          + header(root, "katalog") + body + footer(root, gate=True))

    # category pages
    for c in CATALOG:
        groups = []
        for g, entries in c["groups"]:
            cards, items = [], []
            for en in entries:
                if en[0] == "page":
                    cards.append(catalog_card(en[1], root, len(cards)))
                else:
                    _, name, img, link = en
                    im = img_tag(img, "", root) if img else ""
                    items.append(f'<li><a href="{root}{link}">{im}{e(name)}</a></li>' if link else f'<li><span>{im}{e(name)}</span></li>')
            groups.append(f"""<div class="group"><div class="group-head"><h2 class="rv">{e(g)}</h2></div>
{f'<div class="cards">{"".join(cards)}</div>' if cards else ''}
{f'<ul class="items">{"".join(items)}</ul>' if items else ''}</div>""")
        body = f"""{page_hero(root, e(c['name']), '', [("Katalog", root + "katalog/index.html"), (c['name'], None)], 'Katalog')}
<section class="section tight"><div class="wrap">{''.join(groups)}</div></section>{contact_band(root)}"""
        write(f"katalog/{c['slug']}.html", head(f"{c['name']} — InView Medical", f"{c['name']}: oferta InView Medical dla specjalistów.", root)
              + header(root, "katalog") + body + footer(root, gate=True))

    # detail pages
    for slug, (c, g) in PAGE_CAT.items():
        pg = PAGES[slug]
        title = page_title(slug)
        img = page_img(slug)
        text = pg["text"]
        items = PAGE_ITEMS.get(slug)
        items_html = ("<h3>W naszej ofercie</h3><ul>" + "".join(f"<li>{e(x)}</li>" for x in items) + "</ul>") if items else ""
        pdfs = pg.get("pdfs") or []
        dl = ""
        if pdfs:
            dl = '<div class="panel"><h3>Materiały do pobrania</h3><ul class="downloads">' + "".join(
                f'<li><a href="{e(d["url"])}" target="_blank" rel="noopener">{ico("file")}<span>{e(d["name"])}</span></a></li>' for d in pdfs) + "</ul></div>"
        gallery_imgs = [x for x in (pg.get("imgs") or []) if x != img]
        gallery = ""
        if gallery_imgs:
            gallery = '<div class="gallery">' + "".join(f'<a href="{root}{IMG}{x}" target="_blank" rel="noopener">{img_tag(x, title, root)}</a>' for x in gallery_imgs) + "</div>"
        media = (f'<div class="hero-media rv">{img_tag(img, title, root, lazy=False)}</div>' if img
                 else f'<div class="hero-media rv">{gico(c["icon"], "glyph")}</div>')
        siblings = [s for gg, ens in c["groups"] for en in ens if en[0] == "page" for s in [en[1]] if s != slug and PAGE_CAT[s][0] is c][:3]
        sib = "".join(catalog_card(s, root, i) for i, s in enumerate(siblings))
        body = f"""
<section class="page-hero">{scene(road=False)}
  <div class="wrap">{crumbs(root, [("Katalog", root + "katalog/index.html"), (c['name'], root + f"katalog/{c['slug']}.html"), (title, None)])}
    <div class="hero-grid">
      <div><p class="eyebrow rv">{e(g)}</p><h1 class="rv" style="--i:1">{e(title)}</h1>
        <p class="lead rv" style="--i:2">{e(excerpt(text, 200))}</p>
        <a class="btn solid rv" style="--i:3" href="{root}kontakt.html?temat={e(title)}#formularz">Zapytaj o ofertę {arrow()}</a></div>
      {media}
    </div>
  </div>
</section>
<section class="section tight"><div class="wrap layout">
  <article class="prose rv">{md(text) or '<p class="notice">Szczegółowe informacje o produkcie przekażemy na zapytanie.</p>'}{items_html}{gallery}</article>
  <aside class="aside">
    <div class="panel cta"><h3>Zapytanie</h3><p>Skontaktuj się z nami w sprawie oferty, prezentacji lub materiałów.</p>
      <p style="margin:0"><a class="btn light sm" href="{root}kontakt.html?temat={e(title)}#formularz">Napisz {arrow()}</a></p>
      <p style="margin:16px 0 0"><a style="color:#fff;font-weight:700;text-decoration:none" href="tel:{CONTACT['phone_href']}">{CONTACT['phone']}</a><br>
      <a style="color:#fff;text-decoration:none" href="mailto:{CONTACT['email']}">{CONTACT['email']}</a></p></div>
    {dl}
  </aside>
</div></section>
{f'<section class="section bg-ice"><div class="wrap"><div class="section-head"><h2 class="h-lg rv">Zobacz także</h2></div><div class="cards">{sib}</div></div></section>' if sib else ''}
"""
        write(f"katalog/{slug}.html", head(f"{title} — InView Medical", excerpt(text, 155) or title, root)
              + header(root, "katalog") + body + footer(root, gate=True))


def build_shop():
    root = "../"
    btns = '<button aria-pressed="true" data-filter="*">Wszystkie</button>' + "".join(
        f'<button aria-pressed="false" data-filter="{e(c)}">{e(c)}</button>' for c in SHOP_CATS)
    cards = "".join(product_card(p, root, i) for i, p in enumerate(PRODUCTS))
    body = f"""{page_hero(root, 'Sklep <strong>WzrokOK</strong>', 'Zaufaj ekspertom od pielęgnacji i ochrony wzroku. Pod okiem profesjonalistów zadbasz o swój wzrok każdego dnia i w każdej sytuacji.', [("Sklep WzrokOK", None)], 'Dla pacjentów')}
<section class="section tight"><div class="wrap">
  <div class="filters" data-filter-group="#shop-grid" role="group" aria-label="Filtruj kategorie">{btns}</div>
  <div class="cards" id="shop-grid">{cards}</div>
  <p class="notice" style="margin-top:40px">Zamówienia realizowane są w sklepie internetowym <a href="{CONTACT['shop_url']}" target="_blank" rel="noopener">wzrokok.pl</a>. Produkty wymagające tego wysyłane są w temperaturze kontrolowanej.</p>
</div></section>
{contact_band(root)}"""
    write("sklep/index.html", head("Sklep WzrokOK — InView Medical", "Krople, żele, maski, suplementy i urządzenia dla pacjentów. Sklep WzrokOK.", root)
          + header(root, "sklep") + body + footer(root))

    for p in PRODUCTS:
        promo = p["price"] < p["regular"]
        imgs = p["imgs"]
        main = img_tag(imgs[0], p["name"], root, lazy=False) if imgs else gico("zso", "glyph")
        thumbs = ('<div class="gallery" style="grid-template-columns:repeat(4,1fr);margin-top:14px">' + "".join(
            f'<a href="{root}{IMG}{x}" target="_blank" rel="noopener">{img_tag(x, p["name"], root)}</a>' for x in imgs[1:]) + "</div>") if len(imgs) > 1 else ""
        others = [q for q in PRODUCTS if q is not p and set(q["cats"]) & set(p["cats"])][:4] or [q for q in PRODUCTS if q is not p][:4]
        rel = "".join(product_card(q, root, i) for i, q in enumerate(others))
        price = (f'<s>{fmt_price(p["regular"])}</s>' if promo else "") + fmt_price(p["price"])
        body = f"""
<section class="page-hero">{scene(road=False)}
  <div class="wrap">{crumbs(root, [("Sklep WzrokOK", root + "sklep/index.html"), (p['name'], None)])}
    <div class="hero-grid">
      <div class="rv"><div class="hero-media contain" style="position:relative">{'<span class="badge">Promocja</span>' if promo else ''}{main}</div>{thumbs}</div>
      <div>
        <p class="eyebrow rv">{e(' · '.join(p['cats']))}</p>
        <h1 class="rv" style="--i:1;font-size:clamp(34px,4.4vw,60px)">{e(p['name'])}</h1>
        {f'<p class="lead rv" style="--i:2">{e(p["short"])}</p>' if p['short'] else ''}
        <p class="price rv" style="--i:3;font-size:32px;margin:10px 0 26px">{price} <small>z VAT</small></p>
        <div class="rv" style="--i:4;display:flex;flex-wrap:wrap;gap:12px">
          <a class="btn solid" href="{e(p['url'])}" target="_blank" rel="noopener">Kup w sklepie WzrokOK {ico('cart')}</a>
          <a class="btn" href="{root}kontakt.html?temat={e(p['name'])}#formularz">Zapytaj</a>
        </div>
      </div>
    </div>
  </div>
</section>
<section class="section tight"><div class="wrap layout">
  <article class="prose rv">{md(p['desc'])}</article>
  <aside class="aside"><div class="panel"><h3>Pytania o produkt?</h3>
    <p style="font-size:15px;color:var(--ink-2)">Napisz do nas lub zadzwoń – doradzimy i odpowiemy na każde pytanie.</p>
    <ul class="downloads">
      <li><a href="mailto:{CONTACT['shop_email']}">{ico('mail')}<span>{CONTACT['shop_email']}</span></a></li>
      <li><a href="tel:{CONTACT['phone_href']}">{ico('phone')}<span>{CONTACT['phone']}</span></a></li>
      <li><a href="tel:+48519171402">{ico('phone')}<span>{CONTACT['shop_mobile']}</span></a></li>
    </ul></div></aside>
</div></section>
<section class="section bg-ice"><div class="wrap"><div class="section-head"><h2 class="h-lg rv">Może Cię zainteresować</h2></div><div class="cards">{rel}</div></div></section>
"""
        write(f"sklep/{p['slug']}.html", head(f"{p['name']} — Sklep WzrokOK", p["short"] or excerpt(p["desc"], 155), root)
              + header(root, "sklep") + body + footer(root))


def build_blog():
    root = "../"
    btns = ('<button aria-pressed="true" data-filter="*">Wszystkie</button>'
            '<button aria-pressed="false" data-filter="WzrokOK">Porady WzrokOK</button>'
            '<button aria-pressed="false" data-filter="Aktualności InView">Aktualności InView</button>')
    cards = "".join(post_card(p, root, i) for i, p in enumerate(POSTS))
    body = f"""{page_hero(root, 'Blog <strong>i aktualności</strong>', 'Wszystko, co musisz wiedzieć o ochronie i pielęgnacji oczu – praktyczne porady, nowinki i eksperckie artykuły w jednym miejscu.', [("Blog", None)], 'Wiedza')}
<section class="section tight"><div class="wrap">
  <div class="filters" data-filter-group="#blog-grid" role="group" aria-label="Filtruj wpisy">{btns}</div>
  <div class="cards" id="blog-grid">{cards}</div>
</div></section>"""
    write("blog/index.html", head("Blog — InView Medical i WzrokOK", "Porady i artykuły o zdrowiu oczu oraz aktualności InView Medical.", root)
          + header(root, "blog") + body + footer(root))
    for i, p in enumerate(POSTS):
        others = [q for q in POSTS if q is not p][:3]
        hero_img = f'<figure class="article-hero-img rv">{img_tag(p["img"], p["title"], root, lazy=False)}</figure>' if p.get("img") else ""
        src = "WzrokOK" if p["site"] == "wzrokok" else "Aktualności InView"
        body = f"""{page_hero(root, e(p['title']), '', [("Blog", root + "blog/index.html"), (p['title'], None)], src + ' · ' + date_pl(p['date']))}
<section class="section tight"><div class="wrap" style="max-width:900px">{hero_img}<article class="prose rv">{md(p['text'])}</article></div></section>
<section class="section bg-ice"><div class="wrap"><div class="section-head"><h2 class="h-lg rv">Czytaj dalej</h2></div><div class="cards">{''.join(post_card(q, root, j) for j, q in enumerate(others))}</div></div></section>"""
        write(f"blog/{p['out']}.html", head(f"{p['title']} — Blog", excerpt(p["text"], 155), root)
              + header(root, "blog") + body + footer(root))


def build_static():
    root = ""
    firma = PAGES["firma"]["text"]
    firma = re.sub(r"\n## Robert Mercik.*", "", firma, flags=re.S)
    body = f"""{page_hero(root, 'Zaawansowane technologie <strong>w ochronie wzroku</strong>', 'Mówią, że potrzeba jest matką wynalazków. W naszym przypadku ta reguła potwierdza się doskonale.', [("Firma", None)], 'O nas')}
<section class="section tight"><div class="wrap split">
  <div class="rv"><div class="portrait">{img_tag('iv_2026_01_Robert-Mercik-IVM-01-mini.webp', 'Robert Mercik', root)}</div>
    <p class="signature" style="margin-top:20px">Robert Mercik<small>współwłaściciel InView Medical</small></p></div>
  <article class="prose rv">{md(firma.replace('## Zaawansowane technologie w ochronie wzroku', '').replace('Mówią, że potrzeba jest matką wynalazków. W naszym przypadku ta reguła potwierdza się doskonale.', ''))}</article>
</div></section>
<section class="section bg-ice"><div class="wrap">
  <div class="section-head"><p class="eyebrow rv">Czym się zajmujemy</p><h2 class="h-lg rv">InView Medical jest firmą specjalizującą się w dystrybucji <strong>urządzeń, akcesoriów i preparatów okulistycznych.</strong></h2>
  <p class="lead rv">Okulistyka to dla nas dużo więcej niż tylko hasło w Wikipedii czy nazwa branży – to droga, którą konsekwentnie podążamy od lat i nasza szczera pasja.</p></div>
  <div class="cat-tiles">{''.join(f'<a class="cat-tile rv" style="--i:{i}" href="katalog/{c["slug"]}.html">{img_tag(c["img"], c["name"], root)}<div class="in"><h3>{e(c["name"])}</h3><span class="link-arrow">Przeglądaj {arrow()}</span></div></a>' for i, c in enumerate(CATALOG))}</div>
</div></section>
{contact_band(root)}"""
    write("firma.html", head("Firma — InView Medical", "InView Medical – firma, której misją jest promowanie zaawansowanych technologii w okulistyce.", root)
          + header(root, "firma") + body + footer(root, gate=True))

    maps = "https://www.google.com/maps?q=" + "Pl.+Powsta%C5%84c%C3%B3w+%C5%9Al%C4%85skich+17A,+53-329+Wroc%C5%82aw" + "&output=embed"
    body = f"""{page_hero(root, 'Jesteśmy tu, <strong>by Ci pomóc.</strong>', 'Napisz do nas lub zadzwoń – doradzimy i odpowiemy na każde pytanie.', [("Kontakt", None)], 'Kontakt')}
<section class="section tight"><div class="wrap contact-grid">
  <div>
    <ul class="contact-list">
      <li class="rv">{ico('pin')}<div><small>Adres</small>{CONTACT['company']}<br>{CONTACT['street']}<br>{CONTACT['city']}</div></li>
      <li class="rv" style="--i:1">{ico('phone')}<div><small>Telefon</small><a href="tel:{CONTACT['phone_href']}">{CONTACT['phone']}</a></div></li>
      <li class="rv" style="--i:2">{ico('mail')}<div><small>E-mail</small><a href="mailto:{CONTACT['email']}">{CONTACT['email']}</a></div></li>
      <li class="rv" style="--i:3">{ico('cart')}<div><small>Sklep WzrokOK</small><a href="mailto:{CONTACT['shop_email']}">{CONTACT['shop_email']}</a><br><a href="tel:+48519171402">{CONTACT['shop_mobile']}</a></div></li>
      <li class="rv" style="--i:4">{ico('briefcase')}<div><small>Rekrutacja</small><a href="mailto:{CONTACT['career_email']}">{CONTACT['career_email']}</a></div></li>
    </ul>
    <div class="map rv" style="margin-top:22px"><iframe src="{maps}" title="Mapa: {CONTACT['street']}, {CONTACT['city']}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>
  </div>
  <form class="form rv" id="formularz" data-mailto="{CONTACT['email']}" novalidate>
    <h2 class="h-md" style="font-weight:700">Formularz kontaktu</h2>
    <div class="row2">
      <div class="field"><label for="f-name">Imię i nazwisko</label><input id="f-name" name="name" autocomplete="name" required></div>
      <div class="field"><label for="f-org">Placówka / firma <span class="muted">(opcjonalnie)</span></label><input id="f-org" name="org" autocomplete="organization"></div>
    </div>
    <div class="row2">
      <div class="field"><label for="f-email">Twój e-mail</label><input id="f-email" name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label for="f-phone">Telefon <span class="muted">(opcjonalnie)</span></label><input id="f-phone" name="phone" type="tel" autocomplete="tel"></div>
    </div>
    <div class="field"><label for="f-subject">Temat</label><input id="f-subject" name="subject" value="Zapytanie ze strony"></div>
    <div class="field"><label for="f-msg">Treść wiadomości</label><textarea id="f-msg" name="message" required></textarea></div>
    <button class="btn solid" type="submit">Prześlij {arrow()}</button>
    <p class="field hint">Po kliknięciu otworzy się Twój program pocztowy z gotową wiadomością.</p>
    <p class="notice status" role="status" hidden>Jeśli program pocztowy się nie otworzył, napisz bezpośrednio na {CONTACT['email']}.</p>
  </form>
</div></section>"""
    write("kontakt.html", head("Kontakt — InView Medical", f"{CONTACT['street']}, {CONTACT['city']} · {CONTACT['phone']} · {CONTACT['email']}", root)
          + header(root, "kontakt") + body + footer(root))

    body = f"""{page_hero(root, 'Kariera <strong>w InView Medical</strong>', '', [("Kariera", None)], 'Dołącz do nas')}
<section class="section tight"><div class="wrap split">
  <div class="rv"><div class="card" style="padding:0;max-width:440px">{img_tag('iv_2018_01_Ogłoszenie-PMS.webp', 'Ogłoszenie: Przedstawiciel Medyczny', root)}</div></div>
  <div><p class="eyebrow rv">Aktualna rekrutacja</p><h2 class="h-xl rv" style="--i:1"><strong>Przedstawiciel Medyczny</strong></h2>
    <p class="lead rv" style="--i:2">Zgłoszenia prosimy wysyłać na adres:</p>
    <a class="btn solid rv" style="--i:3" href="mailto:{CONTACT['career_email']}">{CONTACT['career_email']} {arrow()}</a></div>
</div></section>"""
    write("kariera.html", head("Kariera — InView Medical", "Rekrutacja: Przedstawiciel Medyczny.", root) + header(root, "") + body + footer(root))

    docs = [("Polityka prywatności", "https://wzrokok.pl/privacy-policy/polityka-prywatnosci/", "https://wzrokok.pl/wp-content/uploads/2025/09/POLITYKA-PRYWATNOSCI.docx"),
            ("Regulamin sklepu", "https://wzrokok.pl/privacy-policy/regulamin-sklepu/", "https://wzrokok.pl/wp-content/uploads/2025/09/REGULAMIN-SKLEPU.docx"),
            ("Odstąpienie od zakupu", "https://wzrokok.pl/privacy-policy/odstapienie-od-zakupu/", "https://wzrokok.pl/wp-content/uploads/2025/09/ODSTAPIENIE-OD-ZAKUPU.docx"),
            ("Metody i koszty wysyłki", "https://wzrokok.pl/privacy-policy/metody-i-koszty-wysylki/", "https://wzrokok.pl/wp-content/uploads/2025/09/Metody-i-koszty-wysylki.docx")]
    rows = "".join(f"""<div class="card plain rv" style="--i:{i}"><div class="body">{ico('file', 'muted')}<h3>{e(t)}</h3>
<div class="foot"><a class="link-arrow" href="{v}" target="_blank" rel="noopener">Czytaj {arrow()}</a><a class="link-arrow" href="{d}">Pobierz</a></div></div></div>""" for i, (t, v, d) in enumerate(docs))
    body = f"""{page_hero(root, 'Dokumenty <strong>prawne</strong>', '', [("Dokumenty prawne", None)], 'Sklep WzrokOK')}
<section class="section tight"><div class="wrap"><div class="cards">{rows}</div></div></section>"""
    write("dokumenty.html", head("Dokumenty prawne — WzrokOK", "Polityka prywatności, regulamin sklepu, odstąpienie od zakupu, metody i koszty wysyłki.", root)
          + header(root, "") + body + footer(root))


def build_favicon():
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs>'
           '<linearGradient id="a" x1="0" x2="1"><stop offset="0" stop-color="#7fd3ff"/><stop offset="1" stop-color="#3d9bf5"/></linearGradient>'
           '<linearGradient id="b" x1="0" x2="1"><stop offset="0" stop-color="#3d9bf5"/><stop offset="1" stop-color="#1747c9"/></linearGradient>'
           '<linearGradient id="c" x1="0" x2="1"><stop offset="0" stop-color="#1747c9"/><stop offset="1" stop-color="#0a1f5c"/></linearGradient></defs>'
           '<path d="M6 16c6-6 30-6 36 0-6 5-30 5-36 0z" fill="url(#a)"/><path d="M4 25c7-6 33-6 40 0-7 6-33 6-40 0z" fill="url(#b)"/>'
           '<path d="M6 34c6-5 30-5 36 0-6 6-30 6-36 0z" fill="url(#c)"/></svg>')
    write("assets/img/favicon.svg", svg)


def build_404():
    root = "/"
    body = f"""{page_hero('', 'Tej strony <strong>nie ma.</strong>', 'Mogła zostać przeniesiona podczas odświeżania serwisu. Zacznij od strony głównej lub katalogu.', [], '404')}
<section class="section tight"><div class="wrap" style="display:flex;gap:14px;flex-wrap:wrap"><a class="btn solid" href="/index.html">Strona główna {arrow()}</a><a class="btn" href="/katalog/index.html">Katalog</a></div></section>"""
    write("404.html", head("Nie znaleziono — InView Medical", "Strona nie istnieje.", root) + header(root, "") + body + footer(root))


if __name__ == "__main__":
    for d in ("perspektywy", "katalog", "sklep", "blog"):
        shutil.rmtree(os.path.join(ROOT, d), ignore_errors=True)
    build_favicon()
    build_home()
    build_perspectives()
    build_catalog()
    build_shop()
    build_blog()
    build_static()
    build_404()
    n = sum(len([f for f in fs if f.endswith(".html")]) for _, _, fs in os.walk(ROOT))
    print(f"built {n} pages")
