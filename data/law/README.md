# Rule & law

How each state was governed, and the laws that changed who was free, who could vote and who could worship.
Built by `python3 ingest/law/build_law.py` (see ingest/law/README.md); do not edit these files by hand.

| File | What | Status |
| --- | --- | --- |
| `forms.jsonl` | 12 families (`idea:gov_family:*`, what the map colours by), 29 precise forms (`idea:gov:*`), 10 policies (`idea:policy:*`), and a stub for classical Athens | draft |
| `government.jsonl` | `governed_as` spans, polity -> form. `basis: curated`: about 170 hand-written spans for major states, with a note and the Wikipedia article the dates were checked against. `basis: wikidata`: Wikidata P122 for 711 polities, `rank` 0 is the most specific form; undated ones cover the polity's whole life and say so | curated draft, Wikidata sourced |
| `laws.jsonl` | `event` subtype `law`: about 90 hand-written laws, codes, edicts and reforms (draft, Wikipedia-cited), plus the first year of universal male and female suffrage in each country from the Lexical Index (sourced) | mixed |
| `regimes.jsonl` | `regime_lied` per polity, 1789 on: Lexical Index of Electoral Democracy class 0-7, change points only | sourced |
| `seshat.jsonl` | Seshat Equinox-2020 law and legitimacy variables per polity (1 present, 0 absent, inferred values included) | sourced |

Precision rules:

- Families are for colour; cards always name the form, its years and the note. "Monarchy (kind not recorded)" and
  "Republic (kind not recorded)" mean the source did not say more, not that we decided it.
- Curated spans win over Wikidata when both cover a year. From 1789 the Lexical Index decides the colour when it says
  one-party (1), exclusive democracy (4) or democracy (5 to 7).
- Abolishing the slave trade and abolishing slavery are separate policies, as are male and female suffrage.
- Laws carry `effect` on the institution named: "Slavery Abolition Act" is `slavery` / `abolish`; "Code Noir" is `slavery` / `adopt`.
