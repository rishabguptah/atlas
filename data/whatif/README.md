# What if (simulate)

Curated counterfactuals for the one-page Atlas's What if tab (`views/atlas/lenses/whatif.js`).
Each file in `scenarios/` plays real history up to a turning point, then a branch.

| field | what |
| --- | --- |
| `question`, `short` | the what-if and a 3-4 sentence best guess |
| `divergence` | `{year, text}`: the one thing that changes |
| `plausibility`, `plausibility_note` | how plausible the premise and main branch are (0-1), and why |
| `steps` | guide-tour steps (`lens, title, year, view, pins, routes, layers, text, confidence, sources`) plus `branch`: `false` for real history (confidence = how sure the facts are), `true` for the branch (confidence = plausibility) |
| `views`, `unknowns` | competing historians or schools; what nobody can settle |
| `model` | optional: a run of the Order and Chaos lab's toy demographic-fiscal model with the real shocks (`real`) and the branch's (`alt`), years absolute |

Rules: real steps cite sources; branch steps follow what the actors wanted and could do and say how sure
they are. The toy model is not fitted to any state; its note must say what it can and cannot tell.

All seven scenarios are drafts written by Claude from the cited works, waiting for the judge.

Predict reads `data/order-chaos/` (fragility scores and the backtest); nothing extra is stored here.
