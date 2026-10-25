# peoples-languages

Who spoke what, where, and how we know: languages, scripts, the spread of language families, and what ancient DNA
showed about who moved. Records follow `schema/SCHEMA.md` (v0.2 added the kinds used here). Shown on the one-page
Atlas as the **Peoples & languages** lens (`views/atlas/lenses/peoples.*`), in the Peoples family next to People.

| File | What | Status |
| --- | --- | --- |
| `languages.jsonl` | Glottolog 5: 7,802 languages with location, family, first-level branch, endangerment and documented years; 238 families and 378 branches. | `sourced` |
| `dna.jsonl` | 9,344 dated ancient genomes from the Allen Ancient DNA Resource v54.1.p1 (AADR "PASS" only), each citing its paper. | `sourced` |
| `spread.jsonl` | 19 language-family spreads (Indo-European, Austronesian, Bantu, Afroasiatic, Sino-Tibetan, Uralic, Turkic...), each with competing homeland theories (`hypotheses`: view, strength, claim, for, against, sources) and dated `stages`. | `draft` |
| `scripts.jsonl` | 51 writing systems with origin place and date, and `derived_from` links back to the parent script (hieroglyphs to Proto-Sinaitic to Phoenician to Greek to Latin...). | `draft` |
| `events.jsonl` | First writings of ancient languages, last speakers (Manx 1974, Dalmatian 1898, Eyak 2008...), script reforms (Turkey 1928...). | `draft` |
| `findings.jsonl` | 33 ancient-DNA findings (steppe ancestry into Europe, Beaker Britain, Iberian Y turnover, Harappan genome, Anglo-Saxons, Avars...), with ancestry shares where the paper gives one. | `draft` |

Rebuild: put the raw files in `raw/peoples-languages/` (copies in the project's `atlas/raw/peoples-languages/`), then
`python3 ingest/peoples-languages/glottolog.py`, `aadr.py` and `curated.py`.

- Glottolog CLDF: `cldf/languages.csv` and `cldf/values.csv` from https://github.com/glottolog/glottolog-cldf (CC BY 4.0).
- AADR via Poseidon: `*.janno` and `*.bib` for the `1240K_EuropeAncient` and `1240K_BeyondAncient` packages from
  https://github.com/poseidon-framework/aadr-archive. Genomes older than 100,000 BCE (a few Neanderthals) are left out,
  as the kernel's year range stops there. Data versions of one person (`.SG`, `.DG`, `_snpAD`) are merged.

## Not duplicated

Migrations (Bantu, Austronesian, Yamnaya, Indo-Aryan, Norse, Magyar, Anglo-Saxon...) live in `data/economy-trade`;
spreads and findings link to those `group:` and `route:` ids instead of repeating them. Religions that carried scripts
are in `data/religion-ideas`.

## Caveats

Glottolog points are where a language is (or was last) spoken, so before about 1500 the lens hides them and shows
spreads, first writings and genomes instead. Its "first/last year of documentation" is kept as Glottolog gives it;
the curated `attestation` events give the dates specialists use for ancient languages. The curated records are
model-written from the works cited on each and stay `draft` until the judge checks them.
