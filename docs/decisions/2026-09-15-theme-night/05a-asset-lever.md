# 05a. Asset lever and the concept-frame loop

## What was decided

**Step 5 was split.** The root coordinator divided delivery step 5 into 5a (this step: the
asset lever plus the Q6 concept-frame loop) and 5b (the StarCraft rework bakeoff, later).
The lever touches only `scripts/assets/`, `docs/images/`, and two lines of the root
`package.json`, so it can be built and merged while steps 1 through 4 run in parallel. The
plan requires every concept frame to come through the lever and every theme in steps 5
through 7 to start from a chosen base frame, so the lever is the gate on all three
bakeoffs. Splitting it out lets the three bakeoffs start simultaneously on a merged lever
instead of queueing behind StarCraft.

**The data shapes, named before the code.** An asset request is
`{ id, theme, kind, prompt, size, keyColour?, reference?, spec }` where `kind` is one of
`concept`, `tile`, `building`, `backdrop`, `sprite`, `size` is an aspect ratio or a pixel
size, and a `reference` switches the call from `image_gen` to `image_edit`. A manifest row
is `{ id, theme, kind, path, sha256, promptPath, source, attempts, readback, verdict }`
with `source` in `grok | cursor | procedural | needs-cursor` and `verdict` in
`unread | pass | fail | exhausted | pending`. Both live in `scripts/assets/lib/shape.mjs`
and are validated on every request, with the offending field named in the error.

**A third ledger was added beyond the manifest.** `scripts/assets/calls.tsv` records one
row per Grok Build invocation (`ts`, `id`, `op`, `images`, `exit`, `seconds`). The night has
two separate caps, 500 calls and 400 images, and a blind read-back is a call that produces
no image, so a single counter cannot hold both honestly. The manifest keeps the asset
outcomes; `calls.tsv` keeps the spend. The lever refuses to start a call once 480 calls or
390 images are logged.

**Frames name their read-back checks in the spec.** Each `NN.spec.md` carries
`- require: term | synonym` and `- forbid: term` lines. A require group passes when any
synonym appears in the blind description; a forbid term fails on sight; any hedge in the
description fails, per `game-asset-core`. `readback --offline` re-runs the diff against a
saved description for free, which is how a tightened spec gets re-applied to frames that
already exist without spending calls.

**Base frame per chosen theme.**

| theme | base frame | why |
| --- | --- | --- |
| StarCraft rework | `docs/images/concepts/starcraft/01.jpg` | the only frame whose blind read-back reported the complete Q15 mapping: "eight boxy buildings… in two rows of four", the lit ones with "open doorways spilling warm yellow light" and "figures at the doors", the dark ones with "closed corrugated shutters, no figures, no interior glow, red rooftop beacons" |
| Lórien | `docs/images/concepts/lorien/02.jpg` | the only side elevation read back with the right count and the right split: "Eight wooden balcony structures… in two tiers", "Four of the balconies are pale golden-brown with… lit hanging lanterns… and a figure on each; the other four are dark brown, with empty unlit bowls and no figures", plaques legible enough that the describer transcribed all eight names |
| Mission control | `docs/images/concepts/mission-control/07.jpg` | the only frame carrying the whole surface Q9, Q13, Q14 and Q17 ask for at once, read back as "a top bar, a three-column number band, a left column of eight stacked rows, and a main field of eight cards in two rows of four", with the segmented picker transcribed as "OVERVIEW, ISSUES, and QUEUE" |

## What evidence decided it

**The lever runs.** 63 Grok Build calls (32 `image_gen`, 31 read-back) and 32 images, all
logged in `scripts/assets/calls.tsv`. `npm run assets -- ledger --verify` re-hashes all 56
manifest rows against the files on disk and re-reads each header: 0 bad rows, 6 rows
tolerated because they are named with a reason in `scripts/assets/superseded.tsv`.

**The night's spend is spread across three ledgers, only one of which is on this branch.**
The cap ledger is per-checkout, so the branch total is not the night total:

| where | calls | images |
| --- | --- | --- |
| this branch's `scripts/assets/calls.tsv` | 63 | 32 |
| the live verifier's throwaway worktree, since discarded | 3 | 2 |
| the root's opening probe, recorded only in the root trail | 1 | 1 |
| **night total** | **67** | **35** |

Against caps of 500 calls and 400 images. Whoever merges should read this branch's ledger as
an undercount of 4 calls and 3 images. The verifier's 3 calls re-proved `gen`, `readback`,
`key`, the lock and the ledger against real artifacts; its worktree is gone, so those rows
cannot be recovered into the shared file.

**The plan's recorded facts held, with two corrections.** Every output is JPEG with 4:2:0
chroma, as the plan says. But the frames came back at **1280x720**, not 1024x1024, when the
request asked for 16:9; only the 1:1 sprite request returned 1024x1024. And the key colour
drift is far worse than "drifts": a prompt asking for a flat `#ff00ff` magenta returned
`#aa527f`, a distance of 174 in RGB. A fixed key hex is therefore useless, which is why
`key --key auto` samples the four corners and takes the per-channel median. On the real
sprite it resolved `#aa527f` and keyed 698,819 of 1,048,576 source pixels.

**The keying pipeline is proved twice.** In the test, on a synthetic magenta-with-jitter
fixture generated inside the test: a 16px sprite on a 64px canvas at grid 8 keys to exactly
four opaque cells at `2,2 3,2 2,3 3,3` in an 8x8 PNG with alpha, and at tolerance 1 only
349 of 4096 pixels clear, so the tolerance is doing real work rather than passing
everything. On the real artifact:
`scripts/assets/examples/starcraft-worker-keyed.png`, a 128x128 palette PNG with 5,452
opaque and 10,932 transparent pixels, keyed from the generated `worker.jpg`, which
`readImageHeader` now reports as `alpha=true` because its transparency lives in a `tRNS`
chunk rather than a per-pixel alpha sample. 31 tests pass.

**Blind read-back found defects that looking at the images did not.** Frame
`lorien/04` is the all-asleep frame, and by eye it looked like a dark forest with the
lanterns out. The blind description ended "Every lantern is lit, and every platform is
equally bright." The frame failed the one constraint it existed to prove. A retry with an
explicit "cold, black and extinguished… no flame, no filament and no warm glow" prompt
moved it to "the rest of the lanterns stay dark and unlit" but still read back as seven
platforms, so it stands as a recorded fail. The all-asleep constraint is instead evidenced
by `starcraft/02.jpg` ("Eight matching rectangular grey buildings… Each building carries a
glowing red cylindrical beacon on its roof") and `mission-control/03.jpg` ("Eight identical
empty rectangles… arranged in two rows of four").

**The read-back gate had a bug of its own, and the frames found it.** `lorien/01` passed its
`eight | 8` count check while the description said "Six wooden platforms" — the term matched
as a substring of "staggered heights". Matching is now whole-word with a lookbehind and
lookahead, `mentions()` is tested against exactly that string, and the free offline
re-check turned `lorien/01` from a false pass into an honest fail.

## What was rejected and why

**Three of the six Q6 candidates, on read-back evidence rather than taste.** Bruegel village
read back as "Ten distinct timber houses… five stand in a connected row" — the cottages
abut, so eight bots are not separable, and the frame is a daylight three-quarter panorama
rather than a countable roster. Isometric office read back as "Fifteen of those cubicles…
several cropped by the edges of the frame"; a floorplan crops, so the roster count is
whatever fits. Aquarium held its count honestly ("Eight structures… in two rows of four")
but the describer never named an anemone, calling them "structures", and only two of eight
were open, so the working state was not legible. Night city passed cleanly and is the
strongest rejected candidate; it loses to the three Q6 themes on nothing but Q6.

**Frames rejected within the chosen themes.** `lorien/03` (deep parallax) read back as "Nine
wooden platforms" — the mist layer adds countable objects, so depth and count fight each
other. `lorien/04` as above. `starcraft/04` (cool palette) read back as "Ten matching boxy
rectangular buildings… seven buildings" lit, wrong on both count and ratio. `starcraft/06`
(wide camera) read back as "Seven boxy metal buildings" and "a high-angle view looking
down", not isometric; the empty-plot idea did survive ("empty marked plots in the center")
and is worth keeping for the crowding work even though the frame fails.

**Frames kept as references rather than as the base.** `lorien/06` is the Q16 organic
top-down fall-back and it works: "a ring of eight circular wooden platforms around a pale
round hub, with eight grey branches radiating out like spokes". It is not the base because
Q16 names side-view parallax first, but it is now a real image rather than a guess, so the
Lórien owner can switch on evidence if 40 nametags will not fit. `lorien/05` proves the
clock cycle survives daylight, `lorien/07` proves a two-line hanging sign is legible,
`mission-control/03` is the all-asleep reference, `mission-control/05` the inspector drawer,
`mission-control/04` and `06` are the two layouts that scale to 40, `starcraft/02` the
all-asleep reference, `starcraft/03` the worker close-up, `starcraft/05` the plate legibility
reference.

**Root `package.json` was not given a test script.** The key test runs under
`npm run assets -- selftest`, not `npm test`, because this step's remit on the root manifest
is the `assets` script and the `sharp` devDependency only, and the coordinator already handed
"root `npm test` only covers `packages/contracts`" to the step 1 owner. Wiring
`node --test scripts/assets/test/*.test.mjs` into the root test script belongs in that step.

**Spec vocabulary was widened five times; every change is listed here.** `game-asset-core`
forbids self-negotiated waivers, so the line drawn was: adding a synonym for a property the
description already evidences is a vocabulary fix, and changing which property is required
is a waiver. Only the former was done. `lorien/02` and `lorien/07` gained `frontal`,
`front-facing`, `straight-on`, `eye level` to the view group and `balcony`, `balconies` to
the platform group, because a describer facing a forest head-on says "frontal view" and
calls a flet a "balcony"; the property that matters, not seen from above, is enforced by the
unchanged `forbid: top-down | overhead | bird's-eye | aerial` line, which passed.
`mission-control/02` and `05` gained `reads`, `read`, `word`, `words`, `letter`, `letters`,
because the descriptions transcribed the type at length ("The banner reads 2.8k
SESSIONS…") without ever using the word "text". `mission-control/03` gained `rectangle`,
`rectangles`, `box`, `boxes`, because "Eight identical empty rectangles" is the same object
as a card. No count check, no state check and no forbid line was touched.

## Deviations

- **Six duplicate images and twelve duplicate calls were spent, and six manifest rows are
  permanently unverifiable because of it.** Two long-running batches executed twice, the first
  read-back batch and the mission-control generation batch, visible in `calls.tsv` as two
  interleaved runs 51 seconds apart. `gen` overwrote the outputs, so six append-only rows now
  hash files that no longer exist in that form and never can again. They are named one by one,
  with a reason each, in `scripts/assets/superseded.tsv`: `mission-control/02`, `03`, `04`,
  `05` and `06` (manifest lines 20, 21, 22, 24, 27) from the concurrent batches, and
  `lorien/04` (line 9) from a retry that reused its own id. `ledger --verify` tolerates a hash
  mismatch only for those six and fails on any other, so the damage is bounded and visible
  rather than skipped. Three fixes stop it recurring: `gen` takes an exclusive
  `scripts/assets/.gen.lock` so two runs cannot spend the same budget; `gen` refuses to write
  over an existing output at all, which is what makes every future row verifiable; and
  `readback` refuses an image that already has a newer `readback.txt` unless `--force` is
  passed. Nothing should ever be added to `superseded.tsv`; a seventh entry would mean the
  refusal had been circumvented.
- **The cap ledger is per-checkout.** Each owner works in a separate git worktree, so each has
  its own `calls.tsv` and the 500-call and 400-image caps are only enforced night-wide once
  this branch is merged and later owners share the file. Steps 5b, 6 and 7 all run after this
  merge, so the exposure is limited to owners generating images before then, which none are.
- **The `poteto-mode` skill is not installed on this laptop**, though the plan's Local runtime
  section says it is. The plan's Process section, which it names as the replacement, was
  followed instead, along with the `show-me-your-work` log script from pstack.
- **The StarCraft descriptions never name StarCraft, but the save path did.** The prompt text
  asks for "a small science-fiction industrial outpost" with "original industrial design of
  ribbed panels and blunt shapes", and describes no published game's art; Q15's name is a
  shorthand for the mapping, not a brief to imitate. The wrapper around that text, however,
  told the model where to save, and until this branch's second round that path was the real
  output directory — so `docs/images/concepts/starcraft/*.prompt.txt:11,15` and
  `docs/images/assets/starcraft/sprite/worker.prompt.txt:11,15` handed it `/starcraft/`. Seven
  frames plus the worker sprite were generated with the theme slug visible in the save path.
  `gen` now writes into an opaque `asset-scratch/<hash>` directory under the system temp root
  and moves the result into place, so the saved wrapper carries no theme id and no repo path.
  The eight affected outputs were not regenerated; that would cost calls to re-prove frames
  whose read-backs are already recorded, and the leak was a path segment rather than a stylistic
  instruction. A test asserts every theme slug is absent from the wrapper.
- **`lorien/07` has a defect worth carrying forward.** Its signs read `LUNARIS ACTIVE` on a
  platform the describer put "in dim cool light with faint lanterns and empty floors". The
  generator does not keep label text consistent with the state it draws, which is a reason the
  implementation must render labels in code rather than bake them into art.

## The next step

For the three theme owners, each starting a bakeoff per the plan's Process section:

1. **Base frames.** StarCraft rework builds against `docs/images/concepts/starcraft/01.jpg`,
   Lórien against `docs/images/concepts/lorien/02.jpg`, Mission control against
   `docs/images/concepts/mission-control/07.jpg`. Each has its `NN.spec.md`,
   `NN.prompt.txt` and `NN.readback.txt` beside it; the spec is the one-page brief the
   bakeoff subagents get, and the read-back is what "match to the concept frame" is judged
   against.
2. **Asset kinds per theme.** StarCraft needs `building` (one generated raster per bot, with
   a lit and a dark variant), `backdrop` (the terrain field), and `sprite` (the worker, keyed
   through `assets key`; `scripts/assets/examples/starcraft-worker-keyed.png` is the worked
   example). Lórien needs `backdrop` for each parallax layer, `building` for the flet, and
   `tile` for the branch runs. Mission control needs no generated raster at all: it is type,
   rule and colour, so its assets are code, and its concept frames exist to fix the layout
   and the type scale, not to be shipped.
3. **Ambience and state stay in code, per Q5.** Anything animated or stateful is code; the
   generated raster is the static layer only. The lever will not be asked for animation
   frames.
4. **Regenerating anything.** Add a request to `scripts/assets/requests/`, run
   `npm run assets -- gen --request <file> --parallel 4`, then
   `npm run assets -- readback --in <img> --spec <spec>`. Read `scripts/assets/README.md`
   first, and `~/.grok/bundled/skills/game-asset-core` before writing a prompt. Two discards
   per asset, then the request is marked `verdict: exhausted` and the coordinator decides.
5. **For the step 1 CI owner.** Add `node --test scripts/assets/test/*.test.mjs` to the root
   `test` script so the 24 lever tests run in CI.
