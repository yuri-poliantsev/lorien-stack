# Ship bot-space v1 gateway and StarCraft UI

Operators of Grok Bots get a thin local gateway and a StarCraft-inspired 2D reference UI. The program freezes Lauren's JSONL and webhook contracts behind a versioned event schema. Activity panel and slim wake prompt stay forever until a real duplex API exists. PR order is bs-contracts, bs-gateway, bs-client, bs-starcraft.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `pstack/skills/poteto-mode/playbooks/autopilot-stack.md`. The operator lands the Graphite stack. PR ids bs-contracts through bs-starcraft stop at merge-ready for the operator.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator, then stop. Start execution only on her explicit go.
- [ ] On her go, arm a `/goal` with this exact text. "docs/bot-space-v1-plan.md. PR order bs-contracts, bs-gateway, bs-client, bs-starcraft. Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Operator lands the Graphite stack. Done when every PR box is checked and the stack tip shows the StarCraft scene over demo replay."
- [ ] Read these from trunk at program start. Re-read them at every tick.
  - [ ] `git show origin/main:pstack/skills/poteto-mode/playbooks/autopilot-stack.md`
  - [ ] `git show origin/main:pstack/skills/swarm/SKILL.md`
  - [ ] `git show origin/main:pstack/skills/control-ui/SKILL.md`
  - [ ] `git show origin/main:pstack/skills/poteto-mode/playbooks/opening-a-pr.md`
  - [ ] `git show origin/main:pstack/skills/how/SKILL.md`
  - [ ] `git show origin/main:pstack/skills/show-me-your-work/SKILL.md`
- [ ] Arm the 30-minute audit tick. In a local session, a real terminal `/loop`. In a cloud root, a cloud-sleeper wake chain. Never leave the cadence to memory.
- [ ] Use this tick prompt, verbatim. "Re-read the execution playbook from trunk and the armed /goal. Audit the operation against both and fix drift in this tick. Probe every active lane and judge progress by side effects only. Stand down a stuck lane and dispatch its replacement now. Then send the operator a status message, whether or not anything changed, with the queue table of PR, owner, state, and head SHA, the verdicts since the last tick, what merged, open operator gates, and blockers."
- [ ] On the operator's hold or stand-down, send every owner a zero-writes order at once.

### Spawn owners

- [ ] Spawn one owner per PR with the full lifecycle the execution playbook names.
- [ ] Follow this dependency graph. Start dependent work only after its parent merges, or base it on the parent branch when the execution playbook stacks.
  - [ ] bs-contracts is first. Branch from `main`.
  - [ ] bs-gateway after bs-contracts.
  - [ ] bs-client after bs-gateway.
  - [ ] bs-starcraft after bs-client.
- [ ] Hold the file boundaries. bs-contracts touches only `packages/contracts/**`, `fixtures/**`, `docs/contracts.md`, and root package scaffolding for workspaces. bs-gateway touches only `apps/gateway/**` and root scripts that start it. bs-client touches only `apps/client/**`. bs-starcraft touches only `apps/client/src/themes/starcraft/**` and the theme registry wiring needed to select it.
- [ ] Hold the review gate. bs-client and bs-starcraft change an interaction. They wait for the operator's review in chat with screenshots and a video before merge.

### PR mechanics, for every PR

- [ ] Open the PR ready, never draft, with `gh pr create` and `draft: false`, or with Graphite `gt` for a stack.
- [ ] Run the repo's lint and typecheck once before the PR-facing push. Push with hooks on.
- [ ] Run `/deslop` before each commit and `/no-comments` before review.
- [ ] Triage every Bugbot and security-reviewer comment per `../references/bugbot-triage.md`.
- [ ] Rebase onto current trunk before babysit and again before the merge-ready report.

### Verdict and merge, for every PR

- [ ] At the merge-ready head SHA, run the swarm per `pstack/skills/swarm/SKILL.md`. One gates lane. The ten live lanes from the PR's **Verify, live** block. The perf lane from its **Verify, perf** block. One audit lane that reads the diff and the receipts and distrusts the PR body.
- [ ] Clean only when every lane is `PASS`. Findings go back to the owner. A new head gets a fresh swarm and a fresh verdict.
- [ ] Root appends the PR to the Graphite stack on a clean verdict. No owner merges. The operator lands the stack. Patch-id rules follow `playbooks/shipping.md`.

### Boot recipe, for every live lane

Each live lane runs on its own cloud VM at the PR head. Drive through `control-ui` or `control-cli` from `cursor-team-kit`.

- [ ] `git fetch origin <head-branch> && git checkout <head SHA>`.
- [ ] Install deps with the repo lockfile. Start gateway with `AGENT_DATA=fixtures/demo` and demo replay on. For bs-client and later, also start the Vite client and wait until both answer HTTP 200.
- [ ] Deliver input only through the control skill's commands. Name the read-only diagnostics.
- [ ] Save every screenshot to `/tmp/swarm-<pr-id>/worker-<n>/<slug>.png` and return the paths with the report.

## Publish contracts and fixtures (bs-contracts)

**Depends on.** None.

**Files.**

- [ ] Create `packages/contracts/src/index.ts`.
- [ ] Create `packages/contracts/package.json`.
- [ ] Create `fixtures/demo/agents/<uuid>/profile.json` for at least eight bots.
- [ ] Create `fixtures/demo/agent-transcripts/<uuid>/<uuid>.jsonl` with user, assistant, and tool roles.
- [ ] Create `docs/contracts.md`.
- [ ] Create root `package.json` workspaces and `tsconfig` scaffold.
- [ ] Edit `LICENSE` only if SPDX metadata must move. Prefer leave it alone.

**Build.**

- [ ] Define versioned types for `RosterSnapshot`, `BotRecord`, `ActivityEvent`, `PresenceHint`, and `WakeRequest` in `packages/contracts/src/index.ts`.
- [ ] Encode presence as a hint with `lastActivityAt`, `freshnessMs`, and `reason`, never as authoritative lifecycle.
- [ ] Keep spatial fields optional (`seatId` or `gridX` and `gridY`) so 2D and later 3D themes share events without a renderer host.
- [ ] Check in a recorded demo fixture that matches Lauren's `$AGENT_DATA` layout.
- [ ] Document the wire schema and wake payload in `docs/contracts.md`.

**You see.**

- [ ] `npm test -w packages/contracts` prints a passing summary. `docs/contracts.md` names every exported type.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add `packages/contracts/src/index.test.ts` covering parse of fixture JSONL into `ActivityEvent` and reject of unknown roles. Run `npm test -w packages/contracts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.6-fast-xhigh` at the PR head, per the boot recipe.

- [ ] Lane 1. Print exported type names from the built package. Save `contracts-exports.png`. Pass when the log lists `RosterSnapshot` and `WakeRequest`.
- [ ] Lane 2. Parse every demo profile under `fixtures/demo/agents`. Save `contracts-profiles.png`. Pass when count is at least 8 and each has `name`.
- [ ] Lane 3. Parse every demo JSONL file. Save `contracts-jsonl.png`. Pass when each file yields at least one `ActivityEvent`.
- [ ] Lane 4. Feed a truncated last line. Save `contracts-truncate.png`. Pass when the parser skips the partial line and keeps prior events.
- [ ] Lane 5. Feed an unknown role line. Save `contracts-unknown-role.png`. Pass when that line is skipped without throw.
- [ ] Lane 6. Build a `PresenceHint` from a quiet fixture clock. Save `contracts-presence.png`. Pass when `reason` is a string and `lastActivityAt` is set.
- [ ] Lane 7. Validate a `WakeRequest` with empty prompt. Save `contracts-wake-empty.png`. Pass when validation fails closed.
- [ ] Lane 8. Diff `docs/contracts.md` against exported symbols. Save `contracts-docs.png`. Pass when every export is named in the doc.
- [ ] Lane 9. Confirm optional spatial fields omit cleanly. Save `contracts-spatial.png`. Pass when a bot without `seatId` still typechecks.
- [ ] Lane 10. Confirm the fixture tree matches `agents/` and `agent-transcripts/` layout. Save `contracts-layout.png`. Pass when both dirs exist under `fixtures/demo`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time to parse the full demo fixture set once.
- [ ] Probe. `node --test` timed parse harness at trunk (empty or prior) and at the head, interleaved.
- [ ] Baseline. Record the trunk value first. If trunk has no harness, baseline is the first green head run.
- [ ] Rule. Head must stay under 200ms on the lane VM. Fail when head is at or above 200ms.

**Review gate.** None. bs-contracts is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] Root appends the PR to the Graphite stack. The operator lands it.

## Run the observation and wake gateway (bs-gateway)

**Depends on.** bs-contracts.

**Files.**

- [ ] Create `apps/gateway/src/main.ts`.
- [ ] Create `apps/gateway/src/tail.ts`.
- [ ] Create `apps/gateway/src/roster.ts`.
- [ ] Create `apps/gateway/src/wake.ts`.
- [ ] Create `apps/gateway/src/auth.ts`.
- [ ] Create `apps/gateway/src/replay.ts`.
- [ ] Create `apps/gateway/package.json`.
- [ ] Create `apps/gateway/README.md`.

**Build.**

- [ ] Serve `GET /api/bots` as a `RosterSnapshot` with a monotonic `revision`.
- [ ] Serve `GET /ws` that sends the snapshot then revisioned `ActivityEvent` deltas.
- [ ] Tail `$AGENT_DATA` (or `--data`) with coalesce around 250ms. Put the Grok reader behind a named driver.
- [ ] Add `--demo` replay over `fixtures/demo` with a time multiplier so sleep transitions do not wait on wall clock.
- [ ] Hold the webhook sender key only on the server. Expose `POST /api/prompt` that requires a client token and an allowlisted bot id, then POSTs the wake with an 8s timeout and one try.
- [ ] Bind `0.0.0.0` by default. Log wake ack, fail, and indeterminate without printing secrets.
- [ ] Name the write path `requestWake`. Never claim `sendToAgent` delivery.

**You see.**

- [ ] `npm run gateway -- --demo --listen :8040` prints `listening on 0.0.0.0:8040`. `curl /api/bots` returns bots. A WS client receives a snapshot then activity while replay runs.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add tests for tail offsets, partial lines, burst coalesce, roster spawn and gone, and auth reject. Run `npm test -w apps/gateway`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.6-fast-xhigh` at the PR head, per the boot recipe.

- [ ] Lane 1. Boot `--demo` and GET `/api/bots`. Save `gateway-roster.png`. Pass when bot count is at least 8.
- [ ] Lane 2. Connect WS and read the first message. Save `gateway-snapshot.png`. Pass when `type` is snapshot and `revision` is a number.
- [ ] Lane 3. Wait for a replay activity event. Save `gateway-activity.png`. Pass when an `ActivityEvent` arrives within 15s.
- [ ] Lane 4. POST `/api/prompt` without a token. Save `gateway-auth-deny.png`. Pass when status is 401 or 403.
- [ ] Lane 5. POST `/api/prompt` with token and allowlisted id against a stub webhook. Save `gateway-wake-ack.png`. Pass when response marks wake acknowledged.
- [ ] Lane 6. POST with a non-allowlisted id. Save `gateway-allowlist.png`. Pass when status is 403.
- [ ] Lane 7. Kill and restart the WS client. Save `gateway-reconnect.png`. Pass when the new connection receives a fresh snapshot.
- [ ] Lane 8. Confirm bind is not localhost-only via a non-loopback probe on the VM. Save `gateway-bind.png`. Pass when the probe gets HTTP 200.
- [ ] Lane 9. Force webhook timeout in the stub. Save `gateway-wake-fail.png`. Pass when the API returns failed or indeterminate and does not print the sender key.
- [ ] Lane 10. Run replay until a bot presence hint becomes sleep. Save `gateway-sleep.png`. Pass when a bot shows sleep reason without disappearing.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. p95 time from fixture append to WS event delivery under demo replay.
- [ ] Probe. Scripted append plus WS listener at trunk and head, interleaved.
- [ ] Baseline. Record trunk p95 first. If trunk has no gateway, baseline is the first green head run.
- [ ] Rule. Head p95 must stay under 500ms. Fail when head is at or above 500ms.

**Review gate.** None. bs-gateway is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] Root appends the PR to the Graphite stack. The operator lands it.

## Ship the thin client and activity panel (bs-client)

**Depends on.** bs-gateway.

**Files.**

- [ ] Create `apps/client/package.json`.
- [ ] Create `apps/client/index.html`.
- [ ] Create `apps/client/src/main.ts`.
- [ ] Create `apps/client/src/ws.ts`.
- [ ] Create `apps/client/src/ui/activityPanel.ts`.
- [ ] Create `apps/client/src/ui/promptBar.ts`.
- [ ] Create `apps/client/src/ui/botList.ts`.
- [ ] Create `apps/client/src/themeHost.ts`.

**Build.**

- [ ] Connect to gateway WS. Hold roster and activity in memory by bot id.
- [ ] Render a bot list with presence hint badges.
- [ ] Render a read-only activity panel for the selected bot. Show role chips and short safe snippets. Do not dump full tool payloads by default.
- [ ] Render a slim prompt bar disabled until a bot is selected. On send, clear input, show wake status, and call `POST /api/prompt` with the client token.
- [ ] Keep theme host dumb. It receives roster and activity only. No Chat kit. No SceneHost abstraction beyond a replaceable mount node.
- [ ] Ship a placeholder mount that lists bots as text so the panel works before the StarCraft theme.

**You see.**

- [ ] Opening the client against demo gateway shows bots, an activity panel on click, and a prompt bar that reports wake acknowledged against the stub.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add client unit tests for WS snapshot apply, delta apply, and prompt disabled state. Run `npm test -w apps/client`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.6-fast-xhigh` at the PR head, per the boot recipe.

- [ ] Lane 1. Open the client home. Save `client-home.png`. Pass when at least eight bot names are visible.
- [ ] Lane 2. Click the first bot. Save `client-select.png`. Pass when the activity panel shows that bot's name.
- [ ] Lane 3. Confirm the prompt bar enables after select. Save `client-prompt-enabled.png`. Pass when the input is not disabled.
- [ ] Lane 4. Send a short prompt. Save `client-wake.png`. Pass when status text includes acknowledged or equivalent.
- [ ] Lane 5. Confirm activity updates during demo replay without refresh. Save `client-live-activity.png`. Pass when a new row appears within 20s.
- [ ] Lane 6. Select a quiet bot and confirm a sleep or idle badge. Save `client-presence.png`. Pass when a presence label is visible.
- [ ] Lane 7. Reload the page. Save `client-reload.png`. Pass when roster returns without manual steps.
- [ ] Lane 8. Attempt prompt with an empty selection after reload. Save `client-prompt-disabled.png`. Pass when send is blocked.
- [ ] Lane 9. Confirm tool rows are summarized, not raw dumps. Save `client-tool-safe.png`. Pass when no absolute host path longer than 40 chars appears in the panel.
- [ ] Lane 10. Resize to a narrow viewport. Save `client-narrow.png`. Pass when the prompt bar and panel remain usable without horizontal page scroll.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time from page load to first roster paint.
- [ ] Probe. control-ui timing at trunk and head, interleaved.
- [ ] Baseline. Record trunk value first. If trunk has no client, baseline is the first green head run.
- [ ] Rule. Head must stay under 2s on the lane VM. Fail when head is at or above 2s.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1 and lane 5 screenshots into `/tmp/bot-space-media/bs-client-review-home.png` and `/tmp/bot-space-media/bs-client-review-live.png`.
- [ ] Record a 30 to 60 second video of select, activity update, and wake on a lane VM. Save it as `/tmp/bot-space-media/bs-client-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] Root appends the PR to the Graphite stack. The operator lands it after review.

## Add the StarCraft 2D theme (bs-starcraft)

**Depends on.** bs-client.

**Files.**

- [ ] Create `apps/client/src/themes/starcraft/scene.ts`.
- [ ] Create `apps/client/src/themes/starcraft/sprites.ts`.
- [ ] Create `apps/client/src/themes/starcraft/layout.ts`.
- [ ] Create `apps/client/src/themes/starcraft/README.md`.
- [ ] Edit `apps/client/src/themeHost.ts` to register the StarCraft theme as default.

**Build.**

- [ ] Draw a StarCraft-inspired 2D command view on canvas. Use original art. Do not copy Blizzard assets.
- [ ] Place each bot at a building or station from layout config. Working bots animate work. Idle bots stand down. Sleeping bots show a clear rest tell and stay visible.
- [ ] Click a unit or building to select the bot and drive the existing activity panel and prompt bar.
- [ ] Consume only roster and activity from the theme host. No gateway imports inside the theme.
- [ ] Keep 3D out of this PR. Leave optional spatial fields unused beyond 2D layout so a later Three.js consumer can mount the same events.

**You see.**

- [ ] Demo mode shows a StarCraft-like base with bots at structures. Click updates the activity panel. Presence matches gateway hints.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add layout tests that assign stable seats across roster reshuffles with the same ids. Run `npm test -w apps/client -- starcraft`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.6-fast-xhigh` at the PR head, per the boot recipe.

- [ ] Lane 1. Open the themed client. Save `sc-home.png`. Pass when the canvas shows a base and at least eight units or nametags.
- [ ] Lane 2. Click a working unit. Save `sc-select-work.png`. Pass when the activity panel matches that bot and a work tell is visible.
- [ ] Lane 3. Click a sleeping unit. Save `sc-select-sleep.png`. Pass when the unit is still on screen with a sleep tell.
- [ ] Lane 4. Send a wake from the prompt bar. Save `sc-wake.png`. Pass when wake status updates without shifting the canvas layout.
- [ ] Lane 5. Confirm activity during replay moves a unit into a work pose. Save `sc-work-anim.png`. Pass when pose or overlay changes within 20s.
- [ ] Lane 6. Mute or absence of audio files is fine. Confirm no network fetch of remote art CDNs. Save `sc-assets.png`. Pass when all scene assets are same-origin.
- [ ] Lane 7. Narrow viewport. Save `sc-narrow.png`. Pass when the canvas upscales or letterboxes without covering the prompt bar.
- [ ] Lane 8. Theme folder has no import from `apps/gateway`. Save `sc-boundary.png`. Pass when a ripgrep over the theme path finds no gateway import.
- [ ] Lane 9. Remove one bot from the replay roster mid-run if the harness supports it, else mark a stale bot. Save `sc-stale.png`. Pass when the unit becomes unavailable or stale without crashing.
- [ ] Lane 10. Compare placeholder theme removed or not default. Save `sc-default.png`. Pass when StarCraft is the default mount after load.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Average frame time with eight bots under demo replay.
- [ ] Probe. Client perf hook sampling 3s at trunk and head, interleaved.
- [ ] Baseline. Record trunk value first. If trunk has no theme, baseline is the first green head run.
- [ ] Rule. Head average frame time must stay under 20ms. Fail when head is at or above 20ms.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1 and lane 3 screenshots into `/tmp/bot-space-media/bs-starcraft-review-home.png` and `/tmp/bot-space-media/bs-starcraft-review-sleep.png`.
- [ ] Record a 30 to 60 second video of the base, a work transition, and a click-to-panel flow. Save it as `/tmp/bot-space-media/bs-starcraft-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] Root appends the PR to the Graphite stack. The operator lands it after review.

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] Reply to the operator with the report the execution playbook names.

## Appendix A. Prototype evidence

No prototype branch was cut. The investigation already locked the product shape from Lauren's prompt and four-model critique. Unproven until execution. Live `$AGENT_DATA` on the operator's machine. Exact StarCraft art direction inside original 2D constraints. control-ui path availability in this repo's plugin set.

## Appendix B. Alternatives rejected

Four-layer UI kit with SceneHost. Lost because 2D and 3D share events, not components.
Full Grok chat in v1. Lost because webhook plus transcript has no correlated duplex.
Generative themes as the default path. Lost because packaged themes cut token cost and review risk.
3D cabin as v1 showcase. Lost by operator choice. StarCraft 2D ships first.
Go-only gateway. Soft-rejected for OSS contributor fit. TypeScript gateway ships first. Language-neutral HTTP and WS keep a Go port possible.

## Appendix C. Risks

Upstream `$AGENT_DATA` layout drift. Watch in bs-gateway behind the driver. Fixture tests fail closed.
Tailscale open prompt without auth. Mitigated in bs-gateway with client token and allowlist.
Theme leaks Blizzard IP. Watch in bs-starcraft review. Original art only.
control-ui skill missing from trunk paths named above. If `git show` fails, treat as Appendix risk and drive live lanes with documented curl plus Playwright fallback noted in the owner report.
pstack skills absent from this repo's `origin/main`. Owners read skills from the installed pstack plugin path when trunk lacks them, and record that substitution in the status message.

## Appendix D. Links and reading list

Lauren botvillage prompt at `https://x.com/poteto/status/2093023536558555531`.
Make Bot UI skill for webhook sender key and Tailscale bind rules.
Investigation critique trail in the prior chat turn.
`how` on bs-gateway before edits if the owner did not write the contracts.
`interrogate` on bs-starcraft layout if seat assignment fights the activity panel.
Decision trail per `show-me-your-work` for each owner, local only.

## Appendix E. Execution status (2026-08-28)

Root ran `autopilot-stack`. Skills were read from the installed pstack plugin because `origin/main` has no `pstack/` tree. Live lanes used node/Playwright fallback because `control-ui` is absent. Graphite stack is tracked locally tip to trunk. `gt submit` often hangs in this environment; GitHub PR bases already encode the stack.

| PR | Head SHA | Root swarm | Review gate | Landed |
| --- | --- | --- | --- | --- |
| [#1](https://github.com/yuri-poliantsev/bot-space/pull/1) bs-contracts | `ce3c919c206ffaf8279a075035fc802681c8aa04` | CLEAN (unit+live+perf+audit) | none | no |
| [#2](https://github.com/yuri-poliantsev/bot-space/pull/2) bs-gateway | `5aae2f8820c0737e3e0668c3a9e928356440f1f6` | CLEAN | none | no |
| [#3](https://github.com/yuri-poliantsev/bot-space/pull/3) bs-client | `7656781928ad77fe17d7463379b1cdc7931b6f3f` | CLEAN | open ([media](https://github.com/yuri-poliantsev/bot-space/tree/review/bs-client-media/review-media/bs-client)) | no |
| [#4](https://github.com/yuri-poliantsev/bot-space/pull/4) bs-starcraft | `33b4ffc7a9db61443afdf0edfede6c0c54477e9a` | CLEAN (after `selectedBotId` host-contract fix) | open ([media](https://github.com/yuri-poliantsev/bot-space/tree/review/bs-starcraft-media/review-media/bs-starcraft)) | no |

Stack tip branch `cursor/bs-starcraft-8f8f` defaults the StarCraft canvas over demo replay. Goal remains open until the operator approves the two UI gates and lands the Graphite chain onto `main`.
