# 09. README gallery and roadmap

## What was decided

The Bruegel hero stays. The README gains a Themes section that uses the lever stills already on `main`: 8 bots, 40 bots, and 8 bots asleep per theme, plus a link to each 20-second 16:9 clip.

The hosted demo link is `https://yuri-poliantsev.github.io/lorien-stack/`. One sentence states that it is the static client replaying bundled fixtures, with no gateway. Each theme heading also links that URL with `?theme=` set to the registry id. The ids are `starcraft`, `lorien`, and `mission-control`.

The gallery sits after the pitch and before Vision, so a stranger sees the three looks before setup.

Product lines that were now false were rewritten in the same file.

- Default theme is still StarCraft, named as the isometric outpost, with Lórien and Mission Control in the picker.
- Status lists three themes and the hosted demo, and drops "one default theme mount".
- The client table row names three themes, StarCraft default.
- Next steps drops "a second theme only after observation". The list is friction from real runs, optional auth, and the Lorien Bot template. Friction here means reconnect and presence.

The marketplace line keeps the three refusals. The sentence in front of it names the seam. Three themes share one roster and activity feed.

`docs/live.md` and the setup prompt were left alone. Neither claims a theme count.

## What evidence decided it

Q1, Q23, Q25, and Q26 in `docs/plans/2026-09-15-theme-night.md`. Step 8's entry already recorded the hosted URL and that `?theme=` and `?demo=` compose.

`origin/main` at `ad3afcb` already had the stills and clips. They were viewed at full size before the captions were written.

- `docs/images/themes/starcraft-8.png`, 1.5M, 1920x1080. Isometric canyon, eight plots, three workers.
- `starcraft-40.png`, 2.1M. Generative grid, strip 14 working and 26 idle.
- `starcraft-8-asleep.png`, 1.3M. Dark buildings, one red roof beacon each.
- `lorien-8.png`, 1.2M. Two mallorn levels, three elves working.
- `lorien-40.png`, 1.4M. Flets at four heights.
- `lorien-8-asleep.png`, 1.1M. Dark flets, sleeping figures, green lanterns.
- `mission-control-8.png`, 113K. Eight cards, three working, band 08 roster, 03 live, 00 asleep.
- `mission-control-40.png`, 206K. Dense grid, band 40 roster, 16 live, 00 asleep.
- `mission-control-8-asleep.png`, 97K. Dim cards, band 08 roster, 00 live, 08 asleep.
- `starcraft.mp4`, 5.2M, `lorien.mp4`, 3.5M, `mission-control.mp4`, 1.7M.

Registry labels live in `apps/client/src/themes/registry.ts`. The labels are StarCraft, Lórien, and Mission control. Captions use Mission Control to match the in-theme title.

`curl -sI https://yuri-poliantsev.github.io/lorien-stack/` returned HTTP/2 200 at 08:27Z. Saved as `/tmp/theme-night/09-readme/hosted-head.txt`.

`docs:smoke` already requires the observe-only sentence, Quick start before Live bots, and the live.md plus setup-prompt links. Those headings were kept. The Tests footer still said root `npm test` runs contracts only. Root `package.json` now runs every workspace, then the capture tests, so that sentence was updated.

Local gates at this PR head, saved under `/tmp/theme-night/09-readme/`. `test.txt` exit 0, TAP fail 0 across four runners, 11 then 164 then 45 then 6 tests. `typecheck.txt` and `build.txt` exit 0. `docs-smoke.txt` prints ok. GitHub's HTML for this branch has 4 tables and 10 images, saved as `github-readme.html`. The stale second-theme sentence is absent. Playwright full-page of the blob is `github-readme.png`. The hosted demo screenshot is `hosted-demo.png`. It shows StarCraft as default, with Lórien and Mission Control in the header picker.

CI run https://github.com/yuri-poliantsev/lorien-stack/actions/runs/35074860126 passed in 20s. The `pages` job skipped on the PR. That skip is the workflow's main-only deploy gate.

## What was rejected and why

Recapturing stills. The brief forbids it. The committed lever files are the marketing artifacts.

Replacing the Bruegel hero. Q23 keeps it.

A fourth theme, or an in-app gallery picker. Q14 keeps the header segmented control. Q6 forbids a fourth theme.

HTML `<video>` tags for the clips. GitHub README video support is unreliable, so each theme gets a file link.

Stacked full-width images. A three-column table keeps 8, 40, and asleep comparable at a glance.

Rewriting `docs/live.md`, the setup prompt, or `apps/client/README.md`. The live docs do not claim a theme count. The client README still correctly says StarCraft is the default mount.

A theme marketplace sentence. Three themes in a picker is not a marketplace. The three refusals stay.

## Next step

Theme night's delivery order is complete. Remaining product work is reconnect, presence feel, optional read-path auth, and the Lorien Bot template, as the README now lists.

The code follow-up named in step 8 is still a `packages/replay` that both the gateway and the client import, so the cross-check test can be deleted.
