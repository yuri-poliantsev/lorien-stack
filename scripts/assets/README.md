# Asset lever

Generates static raster layers through Grok Build headless, keys them to transparent
PNG at the true pixel grid, and verifies each one with a blind read-back. Every prompt
lands on disk beside its output before the call, so any frame in the repo can be traced
back to the exact text that produced it.

Run everything from the repo root.

## Data shapes

An asset request:

```json
{
  "id": "01",
  "theme": "lorien",
  "kind": "concept",
  "prompt": "A side view of a layered mallorn forest at dusk...",
  "size": "16:9",
  "keyColour": "#ff00ec",
  "reference": "docs/images/concepts/lorien/01.jpg",
  "spec": "docs/images/concepts/lorien/01.spec.md"
}
```

`kind` is one of `concept`, `tile`, `building`, `backdrop`, `sprite`. `size` is an aspect
ratio (`16:9`) or a pixel size (`1024x1024`), reduced to a ratio for the generator.
`keyColour` and `reference` are optional; a `reference` switches the call from `image_gen`
to `image_edit`, which is how a recurring subject stays consistent. A request file holds
one request, an array, or `{ "requests": [...] }`.

## Commands

```
npm run assets -- gen --request <file.json> [--out-dir <dir>] [--parallel 4] [--dry-run]
npm run assets -- key --in <img> --out <png> --key <#rrggbb> --tolerance <n> --grid <px> [--levels 16]
npm run assets -- readback --in <img> --spec <file>
npm run assets -- ledger [--verify]
npm run assets -- selftest
```

`gen` writes `<id>.prompt.txt`, calls Grok Build once per request, verifies the file
landed by reading its header, and prints format, dimensions, chroma and sha256. Output
directory defaults to `docs/images/concepts/<theme>` for concepts and
`docs/images/assets/<theme>/<kind>` for everything else. At most 4 calls run in parallel;
each takes roughly 40 to 300 seconds.

`key` removes the key colour with an RGB distance tolerance (the generator's magenta
drifts by several points per pixel), quantises the surviving colours to a `levels` ladder,
then downsamples nearest-neighbour by cell centre to `width/grid` by `height/grid` and
writes a palette PNG with alpha.

`readback` runs a second Grok Build call that describes the image without seeing the
prompt, writes the description to `<name>.readback.txt`, and diffs it against the spec.
The spec declares its checks as lines in any Markdown file:

```
- require: side view | side-on
- require: eight | 8
- forbid: crt | scanline
```

A `require` group passes when any of its synonyms appears. A `forbid` term fails on sight.
Any hedge in the description ("appears to", "possibly", "some kind of") is a failure, per
`game-asset-core`: a hedge means the property is not actually legible.

`ledger --verify` re-hashes every manifest row against the file on disk and re-reads each
header, so a manifest claim can never outlive its artifact.

## Manifests

`scripts/assets/manifest.tsv` is the append-only record of asset outcomes, and the same
row is appended to a `manifest.tsv` next to the outputs. Columns:

| column | meaning |
| --- | --- |
| `id` | request id, filename-safe |
| `theme` | theme slug the asset belongs to |
| `kind` | `concept`, `tile`, `building`, `backdrop`, `sprite` |
| `path` | repo-relative path to the artifact, empty when nothing landed |
| `sha256` | hash of that file |
| `promptPath` | repo-relative path to the prompt handed to the generator |
| `source` | `grok`, `cursor`, `procedural`, or `needs-cursor` when auth failed |
| `attempts` | how many generation attempts this id has consumed |
| `readback` | read-back verdict once `readback` has run |
| `verdict` | `unread`, `pass`, `fail`, `exhausted`, `pending` |

`scripts/assets/calls.tsv` is the append-only call ledger, one row per Grok Build
invocation: `ts`, `id`, `op` (`image_gen`, `image_edit`, `readback`), `images`, `exit`,
`seconds`. Read-backs are calls that produce no image, so calls and images need separate
counters to hold both night caps honestly.

## Caps

The night allows 500 headless calls and 400 generated images across every owner. The
lever refuses to start a call once 480 calls or 390 images are logged, leaving headroom
for whoever is mid-batch. Every command prints the running total.

Discards are capped at two per asset. On the third attempt the request is written as
`verdict: exhausted` and the coordinator decides whether to change the prompt, key the
best of the three, or build the layer procedurally.

## When Grok Build is not signed in

`gen` writes `source: needs-cursor` in the manifest, prints the exact
`~/.grok/bin/grok login --device-auth` command, and exits 3 for that request without
stopping the others in the batch. The script never reaches for Cursor's image tool; only
the root coordinator has it.

Read-back terms match as whole words, so a spec names the stem: `three-quarter`, not
`three-quarter view`, because the describer writes "three-quarter viewpoint". The strict
boundary is what stops `eight` from passing on "staggered heights" or "eighteen".

`readback --offline` re-runs the spec diff against the saved description without spending
a call, which is how a tightened spec gets re-applied to frames that already exist.

`assets concepts` rewrites `docs/images/concepts/manifest.tsv` as a roll-up of every
theme's concept frames. It is derived from the authoritative rows, so it is rewritten
rather than appended to.
