# Scholarship: sources, debates, primary sources, why chains

The layer that makes the Atlas argue like a seminar and cite like a monograph. Schema: `schema/SCHEMA.md`
(v0.6, "Scholarship"). Everything here is checked by `ingest/scholarship/verify.py` against the outside world,
and by `tools/build.py` and `ingest/judge/audit.py` like every other record.

| File | Kind | What |
| --- | --- | --- |
| `sources-*.jsonl` | `source` | Real works: books, articles, chapters, primary texts, datasets. |
| `debates-*.jsonl` | `debate` | Questions historians argue about, with 2 to 5 named positions. |
| `quotes-*.jsonl` | `quote` | Primary-source excerpts, verbatim from public-domain translations. |
| `links-*.jsonl` | `relation` | Causal links (`caused`, `contributed_to`, `prevented`) that cross lenses. |
| `chains-*.jsonl` | `chain` | Ordered paths through those links: climate → harvest → prices → revolt → ideas. |
| `nodes-*.jsonl` | any | Stubs (`"stub": true`) or new events the links need that the kernel lacks. |
| `series-*.jsonl` | `measure` | Quantitative series with low/high bands and a `method`. |
| `VERIFY.md` | | The last citation check: what could not be verified. |

The `*` is a batch name (`ancient`, `asia`, `africa`, ...), so parallel authors never write the same file.

## Rules of the house

1. **Never invent a work, a DOI, an ISBN, a page or a quote.** A citation you are not sure exists is worse than none.
   Put a DOI only when you know it; the verifier finds missing DOIs for articles itself. After writing, run the
   verifier and fix or delete every source it cannot verify (books it cannot find at OpenLibrary may stay if you
   are certain they exist; say so in `note`).
2. **Quotes are verbatim** from a public-domain translation you can point at as plain text (`check_url`: a Project
   Gutenberg `.txt` file such as `https://www.gutenberg.org/cache/epub/7142/pg7142.txt`, or a Wikisource page with
   `?action=raw`). Fetch the text and copy the excerpt from it; do not quote from memory. Mark cuts with `...`.
   Every quote gets a `witness` note: who wrote it, when, for whom, what to discount.
3. **Every position names real scholars and their real works** (`works`: src ids). Standing is where the field is
   *now*: `leading`, `strong`, `contested`, `minority`, `discredited`.
4. **The world is not Europe.** Use the historiography of each region: Pomeranz, Wong, Elvin, von Glahn for China;
   Bayly, Subrahmanyam, Habib, Alam, Chaudhuri, Roy, Parthasarathi for South Asia; Hodgson, Kennedy, Lapidus,
   Tezcan, Quataert, Pamuk for the Islamic world; Thornton, Vansina, Ehret, Austen, Inikori, Nunn for Africa;
   Restall, Townsend, Mann, Lockhart for the Americas; Reid, Lieberman for Southeast Asia.
5. **Causal links cross lenses.** A link's `lenses` are the cause's lens then the effect's lens, and a chain crosses
   at least two. Each link has `confidence` (0 to 1: how strongly the evidence supports this step), `conf` (the
   class: `attested` when contemporaries record the link, `estimated` when inferred from data, `approximate` when
   argued and disputed), `view` (whose explanation; competing explanations are separate links with different views),
   `mech` (the mechanism in one sentence), `lag` (years), `debate` (if it belongs to one), and sources with `src`.
6. **Use existing kernel ids** for `from`, `to` and `about` (`python3 tools/build.py` then grep `dist/ids.txt`).
   Add a node only when none fits, in your own `nodes-<batch>.jsonl`, as a full event with year, lat/lon and a
   source, or as a `"stub": true` for a record another workstream owns.
7. Numbers carry uncertainty: `[year, value, low, high]`, and the `method` says how they were made.

## Shapes

```json
{"id":"src:heather_2005_fall","kind":"source","type":"book","authors":["Heather, Peter"],"year":2005,"title":"The Fall of the Roman Empire: A New History","publisher":"Macmillan","isbn":"9780330491365","school":"external shock","lenses":["military","order"],"status":"sourced"}
{"id":"debate:fall_of_rome","kind":"debate","name":"Why did the Western Roman Empire fall?","start":376,"end":476,"bbox":[-10,30,40,55],"lat":41.9,"lon":12.5,"about":["event:fall_of_western_roman_empire_476"],"lenses":["order","military","economy"],"positions":[{"id":"shock","school":"External shock","scholars":["Peter Heather"],"claim":"...","mech":"...","for":["..."],"against":["..."],"works":["src:heather_2005_fall"],"lenses":["military"],"standing":"leading","rels":["rel:..."]}],"state":"...","settle":"...","fun":"...","sources":[{"src":"src:heather_2005_fall","cite":"Heather 2005"}],"status":"sourced"}
{"id":"quote:procopius_plague_542","kind":"quote","name":"Procopius on the plague in Constantinople","text":"...","author":"Procopius","work":"History of the Wars, II.22","written":550,"start":542,"place":"place:istanbul","src":"src:procopius_dewing_1914","check_url":"https://www.gutenberg.org/cache/epub/16764/pg16764.txt","about":["event:plague_of_justinian"],"lenses":["disease"],"witness":"...","sources":[{"src":"src:procopius_dewing_1914","cite":"Procopius, tr. Dewing (1914)"}],"status":"sourced"}
{"id":"rel:x_contributed_to_y_parker","kind":"relation","type":"contributed_to","from":"event:x","to":"event:y","start":1640,"end":1650,"confidence":0.6,"conf":"estimated","view":"Geoffrey Parker","mech":"...","lag":2,"debate":"debate:general_crisis","lenses":["geography","order"],"sources":[{"src":"src:parker_2013_global","cite":"Parker 2013","pages":"..."}],"status":"sourced"}
{"id":"chain:bread_to_bastille","kind":"chain","name":"From a hailstorm to the Bastille","blurb":"...","start":1788,"end":1789,"links":["rel:...","rel:..."],"debates":["debate:french_revolution_causes"],"lenses":["geography","economy","order"],"sources":[{"src":"src:...","cite":"..."}],"status":"sourced"}
```

## Check

```sh
python3 ingest/scholarship/verify.py            # every scholarship file; writes `verified` onto each record + VERIFY.md
python3 ingest/scholarship/verify.py data/scholarship/sources-asia.jsonl
python3 tools/build.py && python3 ingest/judge/audit.py dist/kernel.json
```
