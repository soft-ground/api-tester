# Screenshots

Drop PNG screenshots here, then uncomment the image block near the top of the root
[README.md](../../README.md).

## Recommended captures

Four shots cover the story: what the app is, the headline feature, the automation, and the
recorded-history value. Capture the first three at minimum; the fourth is a strong extra.

| Priority | File | What to capture |
|----------|------|-----------------|
| Essential | `collections.png` | The **APIs view** as a hero shot: the collection tree on the left and the request builder + a response on the right. |
| Essential | `fields-view.png` | A request with a JSON body, the **Fields** view open, showing required/optional badges, nested fields, and the per-value type picker. (The Fields view is the headline feature — lead with it.) |
| Essential | `scenario-run.png` | A scenario after **Run**, showing chained steps with pass/fail and extracted values. |
| Nice extra | `history-export.png` | The **History** list (folders + a couple of recorded calls) with the `⋯` menu open showing **Excel / CSV** export. |

Optional beyond these: `environments.png` (an environment's variables + a dynamic-value rule such as
`sequence`/`uuid`/`expression`) if you want to show the no-code automation directly.

## Capture tips

- **Use English UI.** The README is in English — switch the language toggle to English before
  capturing so the screenshots match the surrounding text.
- **Pick one theme and stay consistent.** Dark is the default and looks polished; use it for every
  shot so the set looks like one product.
- **No real secrets.** History and requests can contain real tokens/API keys — use the bundled
  `test-api` or obviously-dummy values, and double-check no live credential is visible before saving.
- **Size:** roughly `< 300 KB`, ~`1400px` wide, so the README stays light.
