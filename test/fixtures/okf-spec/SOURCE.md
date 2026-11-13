# Source of these files

Copied unchanged from the Open Knowledge Format reference repository.

| | |
| --- | --- |
| Repository | https://github.com/GoogleCloudPlatform/knowledge-catalog |
| Folder | `okf/` |
| Commit | `7806b14cc9a6caffd93675e83f5b0b1141f592bd` (2026-11-13) |
| Spec version | OKF v0.2 |
| Licence | Apache-2.0, see `LICENSE.md` (copyright Google LLC; declared in `REUSE.toml`) |
| Copied on | 2026-11-13 |

## What was copied

- `okf/SPEC.md` → `SPEC.md`
- `okf/LICENSE.md` → `LICENSE.md`
- `okf/bundles/` → `bundles/` (the four official sample bundles: `acme_retail`, `crypto_bitcoin`, `ga4`, `stackoverflow`)

## What was left out, and why

- `okf/bundles/*/viz.html`: generated HTML viewers, linked only from the upstream README. They are not part of the format and are about 240 KB.
- Everything else in `okf/` (Python reference agent, tests, `samples/` seed lists): tooling, not spec or bundles.

## Updating

Copy the same files from a newer commit, update the commit and date above, and run `npm test`. The conformance suite (plan task 1.7) shows what changed.
