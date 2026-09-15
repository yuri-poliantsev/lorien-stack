# Theme night, 2026-09-15

Overnight program for lorien-stack. Settled in a grill session on the evening of 2026-09-15. The coordinator agent that runs this reads it first, in full, and does not stop. It runs as a Cursor Cloud Agent because the owner's laptop loses network at night.

## Cloud runtime

The environment is `.cursor/environment.json`. Install prepares Node 22, `npm ci`, Grok Build, `gh`, `ffmpeg`, `jq`, and a Playwright Chromium. Start writes the Grok Build session from the `GROK_AUTH_JSON_B64` secret. `GH_TOKEN` gives `gh` merge and admin rights on the repo.

First actions, in order, before any delivery step.

1. `export PATH="$HOME/.local/node22/bin:$HOME/.grok/bin:$PATH"`. Confirm `node -v` is 22 or newer.
2. `gh auth status` and `gh api repos/yuri-poliantsev/lorien-stack --jq .permissions`. Admin must be true. If not, write that in the first decision entry and continue. PRs will be opened but not merged, and the owner merges in the morning.
3. Grok Build probe. `grok -p 'Use image_gen once ... save into /tmp/probe/ and print only the path' --output-format json`. If it works, Grok Build is the primary image source. If auth is missing, run `grok login --device-auth`, print the URL and code in the transcript so the owner can finish it from a phone, and continue with Cursor's image tool. If Cursor's image tool is not available in this environment either, static layers become procedural or SVG and the plan proceeds. Record which source is live in the first decision entry.
4. `npm test && npm run typecheck && npm run build -w apps/client`. A clean baseline before the first change.

Skills that exist on the owner's laptop (poteto, pstack playbooks) do not exist here. The Process section below is the replacement. Grok Build's own bundled skills at `~/.grok/bundled/skills/` are present once Grok Build is installed and are the source of asset discipline.

Owner visibility. The owner watches from cursor.com/agents on a phone. Every merged PR and every decision entry is the status report. Nothing waits on the owner.

## Goal

Three themes good enough to be the marketing. A stranger who sees a two-second clip on X wants to install it. The measure is the recording and the still per theme, the README gallery, and a hosted demo link.

Constraints that hold under that goal. The person watching 18 real bots all day, mostly asleep, must still read status at a glance. Roster 1 to 40. Zero runtime dependencies in the client. Themes consume roster and activity only.

The theme seam (`ThemeRegistry`, shared action table, camera utility, asset lever) is the enabling condition, not the goal. It is what lets three themes exist by morning.

## How the budget converts to quality

Spend is not a target. Spend buys best-of-N.

- Concept exploration. One frame per candidate theme, then five to eight per chosen theme, then a base chosen by blind read-back.
- Implementation bakeoffs. For each theme, three or four parallel implementations from different models against the same concept frame and the same spec. Judge by screenshots at 8 and 40 bots. Keep the best, graft the best parts of the others.
- Asset iteration. `image_edit` chains on every base asset until read-back passes. Cap discards per asset at two.
- Depth over width. Building variants per kind, more action animations, weather, day and night, particles. No fourth theme.

## Settled decisions

| # | Decision |
| --- | --- |
| Q1 | Override the README roadmap. Reframe as "prove the theme seam". Rewrite the roadmap and the "not a marketplace" line in the same stack. |
| Q2 | Revised. Objective is the frame a stranger sees for two seconds. Hero is demo mode with bots active. Watcher legibility and a good all-asleep state are constraints. Every visual choice still carries status. |
| Q3 | The scene already fills the viewport (PR #4). The bot list becomes a translucent overlay panel the theme styles and the user can collapse. |
| Q4 | Roster 1 to 40. No overlap up to 24, graceful crowding above. Generative layout replaces the 12 fixed stations. |
| Q5 | Hybrid assets. Generated raster for static layers (tiles, buildings, backdrops). Code for anything animated or stateful. Repeal "no sprite sheets" in the theme README. |
| Q6 | StarCraft rework, Lórien forest, Mission control. One concept frame per candidate (Lórien, Bruegel village, Mission control, Night city, Aquarium, Isometric office) before committing, then five to eight frames per chosen theme. |
| Q7 | Shared action vocabulary derived from `toolName` and role (reading, writing, shell, talking, thinking, unknown). One table module, tested with literal expectations. |
| Q8 | `ThemeRegistry` with id, label, mount, preview. Picker in the header, `?theme=` param, localStorage. Client only. |
| Q9 | Full shell redesign. Overlay roster, header with picker, inspector drawer, stats strip, bundled fonts, reduced motion. |
| Q10 | Stacked PRs. The coordinator merges each on green. |
| Q11 | Grok Build headless (`~/.grok/bin/grok -p`) is the primary image source. Cursor `GenerateImage` is the fallback. |
| Q12 | First PR adds a GitHub Actions workflow (typecheck, test, build) and branch protection requiring it. |
| Q13 | Inspector drawer, closed by default. Tape rows show tool name, path, role, timestamp, one truncated text line. Global strip shows working, idle, asleep counts and events per minute. |
| Q14 | Picker is a compact segmented control in the header with thumbnail on hover, plus a keyboard shortcut to cycle. No gallery. |
| Q15 | StarCraft. One generated building per bot in a generative grid. A worker appears and works when active. Asleep is a dark building with one blinking beacon. |
| Q16 | Lórien. Side view, layered parallax forest, one flet per bot at varying heights, dusk with a real-clock cycle. Fall back to organic top-down along mallorn branches if 40 nametags do not fit. |
| Q17 | Mission control. Modern editorial dark dashboard. Big type, cards, restrained colour. No CRT, no game skin. |
| Q18 | In-scene label is pose plus action plus file path when present. Never transcript text. |
| Q19 | NFKC-normalise names for in-scene nametags. Keep the original in the roster panel. |
| Q20 | Camera utility in the host. Drag to pan, wheel to zoom, zoom-to-fit default. Shared by all themes. |
| Q21 | Ambience. Real-clock day and night, particles, slow drift, idle animations on sleepers. Gated by `prefers-reduced-motion`. Frame budget 4ms average at 40 bots via the `avgFrameMs` dataset. |
| Q22 | Demo mode is a product surface. Gateway gains `--bots N`. Replay is tuned so something is always happening on screen. Fixtures get richer tool names and paths. |
| Q23 | README keeps the Bruegel hero, adds a themes gallery from the recording lever's stills, links the hosted demo, rewrites roadmap and marketplace lines. |
| Q25 | Marketing artifacts are deliverables produced by a lever. Per theme, a 20-second 16:9 recording and a still, at the demo roster. |
| Q26 | Hosted demo. Static client build on GitHub Pages replaying bundled fixture events in the browser, no gateway. Owner may strike this step. |
| Q24 | Never stop. Only cap is 400 generated images and 500 headless `grok -p` calls for the night. |

## Facts gathered

- Real host runs 18 bots. Demo has 8. Fixture tool names are `read_file`, `shell`, `grep`, `list_dir`. The action table needs an unknown default.
- No `.github` directory. `main` has no branch protection.
- `styles.css` names `IBM Plex Mono` with no `@font-face`. No `prefers-reduced-motion` handling exists.
- Client has zero runtime dependencies. Keep it that way. `sharp` is allowed as a devDependency for the asset lever.
- Both image sources return 1024x1024 JPEG with 4:2:0 chroma even when the filename says `.png`. The requested key colour drifts. The keying lever needs colour tolerance, palette quantisation, and nearest-neighbour downsampling to the true pixel grid.
- Grok Build 1.0.5 is installed and signed in. Headless probe took 33 seconds per image. Run 3 to 4 calls in parallel. Bundled skills at `~/.grok/bundled/skills/` include `game-asset-core`, `game-animation-frames`, `game-tilesets`, `game-character-consistency`, `game-ui-icons`, `imagine`. Read `game-asset-core` and `imagine` before writing prompts. `image_edit` with a reference image is the consistency mechanism.
- The headless call hands a coding agent a prompt. Constrain it to one `image_gen` call, a fixed output path, and a manifest line. Verify the file landed.
- Probe outputs: `/tmp/lorien-probe/elven-treetop-platform.jpg` (Grok Build) and the Cursor assets folder `probe-bunker.png` (Cursor tool).

## Delivery order

1. CI workflow and branch protection.
2. Action vocabulary table and `ThemeRegistry` with picker, URL param, localStorage.
3. Shell redesign. Overlay roster, header, inspector drawer, stats strip, camera utility, bundled fonts, reduced motion.
4. Demo as a product surface. `--bots N`, richer fixtures, replay tuning. Screenshot and recording lever (demo gateway plus client, capture each theme at 1, 8, 18, 40, plus a 20-second 16:9 recording).
5. Asset lever and the StarCraft rework, via bakeoff.
6. Lórien, via bakeoff.
7. Mission control, via bakeoff.
8. Hosted demo on GitHub Pages. In-browser replay of bundled fixtures, deployed by the CI workflow from step 1.
9. README gallery from the lever's stills, hosted demo link, roadmap and marketplace lines rewritten.

Before 5 through 7, run the concept-frame loop from Q6. Choose each base by blind read-back against the spec, per `game-asset-core`. Each of 5 through 7 runs as a bakeoff. Three or four parallel implementations, judged by screenshots at 8 and 40 bots, best kept, best parts grafted.

## Process

Replaces the playbooks that are not present in the cloud environment.

**One PR per delivery step.** Branch from `main`, name it `theme-night/<step>`. Small commits with conventional messages, matching the existing history. The PR body has three parts. What the watcher or the maintainer notices. Screenshots from the lever, once it exists. The decision entry link.

**Merge gate.** All of: CI green on the PR, `npm test`, `npm run typecheck`, `npm run build -w apps/client` pass locally, the screenshot lever output was viewed and judged, and the PR has no unresolved review threads from Bugbot. Then `gh pr merge --squash --delete-branch`. Pull `main` before branching the next step.

**Bakeoff, used for each theme.** Write a one-page spec: the concept frame, the metaphor mapping (bot, working, idle, asleep, action labels), roster 1 to 40, nametag rule, camera, ambience, frame budget. Launch three or four subagents in isolated environments with different models if available, each producing a complete implementation on its own branch against that spec. When they return, run the screenshot lever on each at 8 and 40 bots. Judge on: match to the concept frame, legibility at 40, all-asleep state, frame time, code size. Pick the base. Graft specific wins from the others by cherry-pick or by hand. Record the verdict, with the losing screenshots, in the decision entry. Delete the losing branches.

**Concept frames.** Generate through the asset lever, not by hand, so every frame's prompt is on disk. Blind read-back per `game-asset-core`. Write what the image shows, then compare against the spec. A hedge is a fail.

**Decision trail.** `docs/decisions/2026-09-15-theme-night/NN-<step>.md`, one per step, appended to as the step runs. Sections: what was decided, what evidence decided it, what was rejected and why, the next step. Commit the entry in the step's PR.

**Subagent hygiene.** Subagents get file pointers, the spec, and the do-not-touch list (contracts, gateway except `--bots`, other themes). The coordinator reviews the diff and writes its own summary. A subagent's "done" is not evidence. The lever's output is.

**Comments.** Only a non-obvious why. No phase-narrating comments in scripts.

## Pickup

The agent that runs this will fill its context over the night. Durable state lives outside the chat, so any fresh agent can resume from one line.

State sources, in order. `gh pr list --state all` for what merged and what is open. `docs/decisions/` for every fork already settled and the next step written at the end of the latest entry. This file for the plan. `scripts/assets/` manifests for which assets exist.

Pickup prompt for a fresh chat:

```
Session pickup. Read docs/plans/2026-09-15-theme-night.md in full, then docs/decisions/, then gh pr list --state all. Run the Cloud runtime first actions. Find the first delivery step that is not merged and continue from there under the Process section. Don't stop.
```

The coordinator keeps its own context small. Code writing goes to subagents with file pointers. The coordinator reads diff stats, test output, and screenshots, not whole files. After each merge it appends the decision entry and the explicit next step before starting the next PR, so a pickup never has to reconstruct intent.

## Working rules

- Every PR carries screenshots from the lever and a decision trail entry under `docs/decisions/`.
- Comments only for a non-obvious why. Verification scripts document steps through assertion strings, not comments.
- Nothing irreversible beyond merging to `main`. No force-push. No deleting anything the owner wrote.
- Themes import nothing from the gateway or the websocket client.
