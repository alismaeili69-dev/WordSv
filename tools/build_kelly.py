"""Build data/kelly.json: the A1–C1 words from the Swedish Kelly list,
enriched with English translations, inflections and example phrases from Folkets lexikon.

Sources (download these yourself and pass the paths):
  - Swedish Kelly list (Språkbanken Text, CC BY 4.0), CSV as in github.com/codesue/kelly (sv.csv)
  - Folkets lexikon sv-en (KTH, CC BY-SA 2.5), folkets_sv_en_public.xml

Usage:
  python tools/build_kelly.py path/to/sv.csv path/to/folkets_sv_en_public.xml data/kelly.json
"""
import csv
import html
import json
import re
import sys
import xml.etree.ElementTree as ET

LEVELS = ("A1", "A2", "B1", "B2", "C1")

POS_MAP = {  # Kelly POS -> (Folkets class, label shown in the app)
    "noun-en": ("nn", "noun"), "noun-ett": ("nn", "noun"), "noun": ("nn", "noun"), "noun-en/-ett": ("nn", "noun"),
    "verb": ("vb", "verb"), "adjective": ("jj", "adjective"), "adverb": ("ab", "adverb"),
    "prep": ("pp", "preposition"), "interj": ("in", "interjection"), "pronoun": ("pn", "pronoun"),
    "subj": ("sn", "conjunction"), "particle": ("ab", "particle"), "det": ("pn", "determiner"),
    "numeral": ("rg", "numeral"), "proper name": ("pm", "proper name"),
}


def clean(s):
    """Folkets values are sometimes double-escaped (&amp;#39;)."""
    s = html.unescape(html.unescape(s or "")).strip()
    return re.sub(r"\s+", " ", s)


def load_folkets(path):
    idx = {}
    for w in ET.parse(path).getroot().iter("word"):  # compounds are written mål|tid
        idx.setdefault(clean(w.get("value")).replace("|", "").lower(), []).append(w)
    return idx


def lemma_variants(raw):
    """'vara (vardagl. va)' -> ['vara']; 'någon/något' -> ['någon/något', 'någon']"""
    base = re.sub(r"\s*\(.*?\)\s*", " ", raw).strip()
    out = [base]
    if "/" in base:
        out.append(base.split("/")[0].strip())
    return [v for v in out if v]


def noun_forms(marker, lemma, infl, kpos=""):
    article = marker if marker in ("en", "ett") else {"noun-en": "en", "noun-ett": "ett"}.get(kpos, "")
    if not article and not infl:
        return ""
    parts = [f"{article} {lemma}".strip()] + infl[:2]
    return ", ".join(parts)


def verb_forms(lemma, infl):
    forms = [f for f in infl if "|" not in f and f != lemma]
    present = next((f for f in forms if f.endswith("r")), None)
    supine = next((f for f in forms if f.endswith("it")), None) or next(
        (f for f in forms if f.endswith("t") and f != present), None)
    imperative = lemma[:-1] if lemma.endswith("a") else lemma
    rest = [f for f in forms if f not in (present, supine, imperative)]
    past = next((f for f in rest if re.search(r"(de|te)$", f)), None) or (rest[0] if rest else None)
    if not (present and past and supine):
        return ""
    return f"{present}, {past}, {supine}"


def mentions(text, words):
    t = text.lower()
    return any(w and w.lower() in t for w in words)


def build(kelly_csv, folkets_xml, out_path):
    import os
    here = os.path.dirname(os.path.abspath(__file__))
    # Hand-written translations for Kelly words that Folkets lexikon lacks
    import glob
    extra = {}
    for path in sorted(glob.glob(os.path.join(here, "kelly_extra_translations*.json"))):
        extra.update(json.load(open(path, encoding="utf-8")))
    lemma_fix = extra.pop("_lemma_overrides", {})
    # Words already in the hand-written list (data/words.json) are skipped: those have better examples
    try:
        own = {w["sv"].lower() for w in json.load(open(os.path.join(here, "..", "data", "words.json"), encoding="utf-8"))}
    except FileNotFoundError:
        own = set()
    folk = load_folkets(folkets_xml)
    rows = [r for r in csv.DictReader(open(kelly_csv, encoding="utf-8")) if r["CEFR Level"] in LEVELS]
    words, missing = [], []

    for r in rows:
        kpos = r["POS"].strip()
        fclass, label = POS_MAP.get(kpos, ("", kpos))
        lemma, entries = None, []
        if r["ID"] in lemma_fix:
            r["Lemma"] = lemma_fix[r["ID"]]
        for v in lemma_variants(r["Lemma"]):
            cands = folk.get(v.lower(), [])
            if cands:
                lemma = v
                same = [w for w in cands if w.get("class") == fclass]
                entries = same or cands
                break
        if lemma_variants(r["Lemma"])[0].lower() in own:
            continue
        if not entries:
            if r["ID"] in extra:
                lemma = lemma_variants(r["Lemma"])[0]
                words.append({
                    "id": f"kelly-{r['ID']}", "sv": lemma, "en": extra[r["ID"]], "pos": label,
                    "forms": noun_forms(r["Marker"].strip(), lemma, [], kpos) if fclass == "nn" else "",
                    "level": r["CEFR Level"], "examples": [], "source": "kelly",
                })
            else:
                missing.append(r["Lemma"])
            continue

        translations, examples, infl = [], [], []
        for w in entries:
            for t in w.findall("translation"):
                val = clean(t.get("value"))
                if val and val not in translations:
                    translations.append(val)
            if not infl:
                infl = [clean(i.get("value")).replace("|", "") for i in w.findall("paradigm/inflection")]
        if not translations and r["ID"] in extra:
            translations = [extra[r["ID"]]]
        if not translations:
            missing.append(r["Lemma"])
            continue

        keywords = [lemma] + infl + ([lemma[:-1]] if len(lemma) > 4 else [])
        pool = []
        for w in entries:
            for tag in ("example", "idiom"):
                for e in w.findall(tag):
                    sv = clean(e.get("value"))
                    tr = e.find("translation")
                    en = clean(tr.get("value")) if tr is not None else ""
                    if sv and en and len(sv) <= 110:
                        pool.append((not mentions(sv, keywords), tag == "idiom", {"sv": sv, "en": en}))
        seen = set()
        for _, _, ex in sorted(pool, key=lambda p: (p[0], p[1])):
            if ex["sv"] not in seen:
                seen.add(ex["sv"])
                examples.append(ex)
            if len(examples) == 3:
                break

        if fclass == "nn":
            forms = noun_forms(r["Marker"].strip(), lemma, infl, kpos)
        elif fclass == "vb":
            forms = verb_forms(lemma, infl)
        elif fclass == "jj":
            forms = ", ".join(infl[:2])
        else:
            forms = ""

        words.append({
            "id": f"kelly-{r['ID']}",
            "sv": lemma,
            "en": ", ".join(translations[:3]),
            "pos": label,
            "forms": forms,
            "level": r["CEFR Level"],
            "examples": examples,
            "source": "kelly",
        })

    # Hand-written example sentences (tools/examples/*.tsv):
    # kelly_id <TAB> sv1 <TAB> en1 <TAB> sv2 <TAB> en2 [<TAB> corrected English translation]
    written = {}
    for path in sorted(glob.glob(os.path.join(here, "examples", "*.tsv"))):
        for line in open(path, encoding="utf-8"):
            cols = line.rstrip("\n").split("\t")
            if len(cols) >= 5:
                written[cols[0]] = cols
    for w in words:
        cols = written.get(w["id"][len("kelly-"):])
        if not cols:
            continue
        mine = [{"sv": cols[1], "en": cols[2]}, {"sv": cols[3], "en": cols[4]}]
        w["examples"] = (mine + w["examples"])[:3]
        if len(cols) >= 6 and cols[5].strip():
            w["en"] = cols[5].strip()

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("[\n" + ",\n".join(json.dumps(w, ensure_ascii=False) for w in words) + "\n]\n")
    print(f"{len(rows)} Kelly rows -> {len(words)} words written, {len(missing)} without a dictionary match")
    return words, missing


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    _, miss = build(*sys.argv[1:])
    print("No match:", ", ".join(miss[:80]), "..." if len(miss) > 80 else "")
