# Fabrique src/data/ciqual2020.json à partir de la table officielle Ciqual 2020 (ANSES, Licence Ouverte Etalab 2.0).
# Source : https://www.data.gouv.fr/fr/datasets/table-de-composition-nutritionnelle-des-aliments-ciqual/
#          fichier XML_2020_07_07.zip (alim, alim_grp, compo).
# Utilisation : python scripts/ciqual_build.py <dossier où le zip a été extrait>
#
# Règles de lecture des teneurs (pour 100 g) :
#   « traces »  -> 0
#   « < x »     -> x / 2 (moitié de la limite de détection)
#   « - » / vide -> inconnu (null) : jamais inventé
import io, json, os, re, sys, xml.etree.ElementTree as ET

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'ciqual2020.json')

# Clé courte -> code Ciqual. L'ordre est celui des valeurs dans le fichier produit.
NUTRIENTS = [
    ('kcal', 328), ('prot', 25000), ('gluc', 31000), ('sucres', 32000), ('fibres', 34100), ('lip', 40000),
    ('ags', 40302), ('agmi', 40303), ('agpi', 40304), ('ala', 41833), ('la', 41826), ('epa', 42053), ('dha', 42263),
    ('sel', 10004), ('ca', 10200), ('fe', 10260), ('mg', 10120), ('zn', 10300), ('iode', 10530), ('k', 10190), ('se', 10340),
    ('vitc', 55100), ('b9', 56700), ('b12', 56600), ('vitd', 52100), ('vite', 53100), ('retinol', 51200), ('bcarotene', 51330),
    ('b2', 56200), ('chol', 75100),
]
CODE_INDEX = {code: i for i, (_, code) in enumerate(NUTRIENTS)}

def text(el, tag):
    v = el.findtext(tag)
    return v.strip() if v else ''

def value(raw):
    s = raw.strip().replace(',', '.')
    if s in ('', '-'):
        return None
    if s.lower() == 'traces':
        return 0
    if s.startswith('<'):
        try:
            return round(float(s[1:].strip()) / 2, 4)
        except ValueError:
            return None
    try:
        return round(float(s), 4)
    except ValueError:
        return None

def file_named(prefix):
    # Les fichiers officiels contiennent des « < » non échappés dans le texte (« <1° alc. », « < 0,5 ») : on les échappe à la lecture.
    for f in os.listdir(SRC):
        if f.startswith(prefix):
            raw = open(os.path.join(SRC, f), 'rb').read().decode('windows-1252')
            raw = re.sub(r'&(?!(amp|lt|gt|quot|apos|#\d+);)', '&amp;', raw)
            raw = re.sub(r'<(?![A-Za-z/?!])', '&lt;', raw).replace('encoding="windows-1252"', 'encoding="utf-8"')
            return io.BytesIO(raw.encode('utf-8'))
    raise SystemExit(f'Fichier {prefix}* introuvable dans {SRC}')

groups = {}
for g in ET.parse(file_named('alim_grp_')).getroot():
    code = text(g, 'alim_ssgrp_code') or text(g, 'alim_grp_code')
    groups[text(g, 'alim_grp_code')] = text(g, 'alim_grp_nom_fr')

# Énergie : la valeur « Règlement UE » (328) quand elle existe, sinon celle calculée avec les fibres (333).
KCAL_FALLBACK = 333
fallback = {}

foods = {}
for a in ET.parse(file_named('alim_2')).getroot():
    code = int(text(a, 'alim_code'))
    foods[code] = {'name': text(a, 'alim_nom_fr'), 'grp': text(a, 'alim_grp_code'), 'v': [None] * len(NUTRIENTS)}

for _, el in ET.iterparse(file_named('compo_'), events=('end',)):
    if el.tag != 'COMPO':
        continue
    c = int(text(el, 'const_code'))
    if c == KCAL_FALLBACK:
        fallback[int(text(el, 'alim_code'))] = value(el.findtext('teneur') or '')
    if c in CODE_INDEX:
        f = foods.get(int(text(el, 'alim_code')))
        if f is not None:
            f['v'][CODE_INDEX[c]] = value(el.findtext('teneur') or '')
    el.clear()

I = {k: i for i, (k, _) in enumerate(NUTRIENTS)}
for code, f in foods.items():
    v = f['v']
    if v[0] is None and fallback.get(code) is not None:
        v[0] = fallback[code]
    # Sinon, calculée comme le règlement UE 1169/2011 : 4 kcal/g de protéines et de glucides, 9 de lipides, 2 de fibres.
    if v[0] is None and None not in (v[I['prot']], v[I['gluc']], v[I['lip']]):
        v[0] = round(4 * v[I['prot']] + 4 * v[I['gluc']] + 9 * v[I['lip']] + 2 * (v[I['fibres']] or 0), 1)

data = {
    'source': 'Anses. 2020. Table de composition nutritionnelle des aliments Ciqual (version 2020-07-07). Licence Ouverte Etalab 2.0.',
    'nutrients': [k for k, _ in NUTRIENTS],
    'groups': groups,
    # Chaque aliment : [code, nom, groupe, valeurs pour 100 g dans l'ordre de « nutrients » (null = inconnu)]
    'foods': [[code, f['name'], f['grp'], f['v']] for code, f in sorted(foods.items()) if any(x is not None for x in f['v'])],
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w', encoding='utf-8') as fh:
    json.dump(data, fh, ensure_ascii=False, separators=(',', ':'))
print(len(data['foods']), 'aliments ->', os.path.abspath(OUT), os.path.getsize(OUT) // 1024, 'Ko')
