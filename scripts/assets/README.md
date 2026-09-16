# Asset lever

Generates static raster layers through Grok Build headless, keys them to transparent
PNG at the true pixel grid, and verifies each one with a blind read-back. Every prompt
lands on disk beside its output before the call, so any frame in the repo can be traced
back to the exact text that produced it.

Run everything from the repo root.

## Before the first run

`npm ci`. `key` and `selftest` import `sharp`, which is a root devDependency, and a
checkout that has never installed will fail with `Cannot find package 'sharp'` rather than
with anything that points at the lever.

`gen` and `readback` need Grok Build signed in. If it is not, `gen` writes
`source: needs-cursor` in the manifest, prints the exact
`~/.grok/bin/grok login --device-auth` command, and exits 3 for that request without
stopping the others in the batch. The script never reaches for Cursor's image tool; only
the root coordinator has it.

Check the wiring without spending a call: `npm run assets -- selftest` and
`npm run assets -- ledger --verify`.

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

`keyColour` and `spec` are records, not wiring. Nothing reads them: `key` takes its colour
from `--key` and `readback` takes its spec from `--spec`, both on the command line. They
are in the request so that a frame's intended key and intended checks travel with the
frame, but writing a `spec` path into a request does not make `gen` enforce it.

## Commands

```
npm run assets -- gen --request <file.json> [--out-dir <dir>] [--parallel <1-4>] [--dry-run]
npm run assets -- key --in <img> --out <png> --key <auto|#rrggbb> --tolerance <n> --grid <px> [--levels 16]
npm run assets -- readback --in <img> --spec <file> [--offline] [--force]
npm run assets -- ledger [--verify]
npm run assets -- concepts
npm run assets -- selftest
```

### gen

Writes `<id>.prompt.txt`, calls Grok Build once per request, verifies the file landed by
reading its header, and prints format, dimensions, chroma and sha256. Output directory
defaults to `docs/images/concepts/<theme>` for concepts and
`docs/images/assets/<theme>/<kind>` for everything else; `--out-dir` overrides it for
every request in the file. `--parallel` defaults to 3 and is capped at 4.

**What actually comes back.** Every output is JPEG with 4:2:0 chroma whatever the
requested extension, so `gen` reads the header and renames `<id>.png` to `<id>.jpg`; a
script that expects the path it asked for will not find the file. A `16:9` request returns
**1280x720**, not 1024x1024; only a `1:1` request returned 1024x1024. Nothing is upscaled,
so treat those as the native sizes and design the layers around them.

**A batch looks hung.** Nothing prints for a request until that request finishes, and each
call takes 40 to 300 seconds. Run long batches detached and watch `scripts/assets/calls.tsv`
rather than sitting on a foreground shell that a tool or a timeout might re-execute. That
re-execution is not hypothetical: it cost this step six duplicate images and left six
manifest rows permanently unverifiable, which is what `superseded.tsv` records.

**The lock.** `gen` takes an exclusive `scripts/assets/.gen.lock` for the batch so two runs
cannot spend the same budget, and releases it on normal exit. A run that dies without
unwinding leaves the file behind, and the next run refuses with the holder's pid and
timestamp; delete it once you have confirmed that run is gone.

**Refusing an existing output.** `gen` exits non-zero, names the path, spends no call and
writes no row when `<id>.jpg` or `<id>.png` already exists in the output directory. This is
settled before the lock is taken, so a stale lock cannot hide it. A discarded frame
therefore stays on disk to back its manifest row, and a retry of `04` is requested as
`04-2`. The discard cap counts the stem before that suffix, so a retry cannot reset its own
budget.

**`--dry-run`** writes `<id>.prompt.txt` and prints the output path without calling Grok or
taking the lock. It is the cheapest way to read the exact wrapper the model will get, but it
does touch the output directory, and it still refuses an id whose output exists.

**What the model is told.** The wrapper tells the model where to save, so that path is
something the model reads. It points at `asset-scratch/<hash>` under the system temp root,
never at the output directory, because the output directory is named after the theme and the
bakeoff depends on the model not knowing which theme it is drawing for. `gen` moves the
result into place afterwards. A `reference` image is copied into the same scratch directory
as `source.<ext>` for the same reason. If you add a request whose prompt names its own
theme, none of that helps you.

### key

Removes the key colour with an RGB distance tolerance, quantises the surviving colours to a
`levels` ladder (default 16 steps per channel), then downsamples nearest-neighbour by cell
centre to `width/grid` by `height/grid` and writes a palette PNG with alpha.

**Use `--key auto`.** A fixed hex is close to useless, because the generator does not
produce the colour you asked for: a prompt demanding a flat `#ff00ff` magenta came back as
`#aa527f`, a distance of 174 in RGB. `auto` samples the four corners and takes the
per-channel median, which is the only reliable way to learn what the flat background
actually is. Pass a hex only when you made the background yourself.

`--tolerance` is the RGB distance from the key colour that still counts as background; it
has to absorb the per-pixel jitter in a JPEG-compressed flat field. `--grid` is the size of
one true pixel in the source, so the output is the source divided by it. Read the
`keyed N of M source pixels` and `opaque / transparent` lines to tell whether the tolerance
is doing real work: too low leaves a halo, too high eats the sprite.

The committed example reproduces exactly:

```
npm run assets -- key \
  --in docs/images/assets/starcraft/sprite/worker.jpg \
  --out scripts/assets/examples/starcraft-worker-keyed.png \
  --key auto --tolerance 40 --grid 8
```

From a 1024x1024 source that resolves the key to `#aa527f`, keys 698,819 of 1,048,576
source pixels, and writes a 128x128 palette PNG with 5,452 opaque and 10,932 transparent
pixels at sha256 `e72a752607ab38f7b2fb925fc2fc6a389f207b7c34b5c3c83109b95d57174107`, byte
for byte the file in the repo. Tolerances 40 through 42 give that same output. The opaque
count moves slowly either side of it, 5,651 at tolerance 8 down to 5,384 at 64, so the
halo thins gradually; past that it falls off a cliff to 4,689 at 72 as the sprite itself
starts keying out. Sweep, and read the counts rather than trusting a single number.

### readback

Runs a second Grok Build call that describes the image without seeing the prompt, writes the
description to `<name>.readback.txt`, and diffs it against the spec named by `--spec`. The
spec declares its checks as lines in any Markdown file:

```
- require: side view | side-on
- require: eight | 8
- forbid: crt | scanline
```

A `require` group passes when any of its synonyms appears. A `forbid` term fails on sight.
Any hedge in the description ("appears to", "seems", "possibly", "some kind of") is a
failure, per `game-asset-core`: a hedge means the property is not actually legible.

**Terms match as whole words, so list every form you will accept.** `lantern` does not match
"lanterns" and `card` does not match "cards"; a require group needs both the singular and
the plural. Prefer the shortest form the describer will actually write, so `three-quarter`
rather than `three-quarter view`, because the description says "three-quarter viewpoint".
The strict boundary is the point: it is what stops `eight` from passing on "staggered
heights" or "eighteen".

**`--offline`** re-runs the diff against the saved description without spending a call,
which is how a tightened spec gets re-applied to frames that already exist. **`--force`**
spends a fresh call on an image that already has a newer `readback.txt`; without it the
command declines and says so, which is easy to mistake for a no-op.

Exit codes: 0 on pass, 1 on any failed check, 3 on an auth failure.

### ledger and concepts

`ledger --verify` re-hashes every manifest row against the file on disk and re-reads each
header, so a manifest claim can never outlive its artifact. A row whose file no longer
hashes to the recorded value fails the command; the only tolerated exceptions are the hashes
named with a reason in `scripts/assets/superseded.tsv`, which holds the six rows written
before `gen` learned to refuse an overwrite. Nothing new belongs in that file: a seventh
entry would mean the refusal had been circumvented.

`concepts` rewrites `docs/images/concepts/manifest.tsv` as a roll-up of every theme's
concept frames. It is derived from the authoritative rows, so it is rewritten rather than
appended to. Run it after adding frames.

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

The ledger is per-checkout, so a worktree that has not merged is counting only its own
spend. Read the night's total from the root's trail, not from your `calls.tsv`.

Discards are capped at two per asset. On the third attempt the request is written as
`verdict: exhausted` and the coordinator decides whether to change the prompt, key the
best of the three, or build the layer procedurally.
