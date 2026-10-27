"""Regenerate the checked-in recommendation order; not needed for normal builds.

python3 -m venv .work/frequency-venv
.work/frequency-venv/bin/pip install wordfreq==3.1.1
.work/frequency-venv/bin/python scripts/build-learning-order.py
"""

import json
from importlib.metadata import version
from pathlib import Path

from wordfreq import tokenize, zipf_frequency

ROOT = Path(__file__).resolve().parent.parent
LEVELS = ("beginner", "intermediate", "advanced", "business")

if version("wordfreq") != "3.1.1":
    raise SystemExit("Use wordfreq==3.1.1 for reproducible rankings.")

core = json.loads((ROOT / "content/learning-core.json").read_text())
output = {
    "version": 1,
    "source": "wordfreq 3.1.1 (Robyn Speer), English large wordlist; usage through about 2021",
    "license": "CC-BY-SA-4.0",
    "sourceUrl": "https://github.com/rspeer/wordfreq",
    "method": "Editorial core first in listed order; remaining entries by descending Zipf frequency, minus 1.0 for multi-token headwords. Phrase scores are token-based estimates, not measured phrase frequencies. Headword and ID break ties.",
    "levels": {},
}

for level in LEVELS:
    entries = [json.loads(line) for line in (ROOT / f"content/{level}.jsonl").read_text().splitlines() if line.strip()]
    by_headword = {entry["headword"].casefold(): entry for entry in entries}
    if len(core[level]) != len(set(h.casefold() for h in core[level])):
        raise SystemExit(f"{level}: duplicate core headword")
    missing = [h for h in core[level] if h.casefold() not in by_headword]
    if missing:
        raise SystemExit(f"{level}: missing core headwords: {missing}")
    first = [by_headword[h.casefold()] for h in core[level]]
    first_ids = {entry["id"] for entry in first}

    def sort_key(entry):
        headword = entry["headword"]
        # The library estimates multi-token frequencies from individual words.
        # A conservative editorial penalty reduces over-ranking of expressions
        # made entirely of common words. It is not a corpus-derived correction.
        penalty = 1.0 if len(tokenize(headword, "en")) > 1 else 0.0
        score = round(zipf_frequency(headword, "en", wordlist="large") - penalty, 2)
        return (-score, headword.casefold(), entry["id"])

    rest = sorted((entry for entry in entries if entry["id"] not in first_ids), key=sort_key)
    output["levels"][level] = [entry["id"] for entry in first + rest]
    print(f"{level}: {len(first)} core + {len(rest)} frequency-based = {len(entries)}")

(ROOT / "content/learning-order.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
