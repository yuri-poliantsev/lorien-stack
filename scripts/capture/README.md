# Capture lever

```
npm run capture -- --theme starcraft [--bots 1,8,18,40] [--out docs/images/themes] [--record 20]
```

`--bots 8` also shoots `starcraft-8-asleep.png` (`--replay-idle`, every `theme-unit` `data-pose=sleeping`). That asleep wait is why N=8 takes about 34 s: quiet units stay idle until `SLEEP_MS` (22 s) before they pose-sleep. N=40 is a working still only. With a 300 ms stagger it reaches `ceil(40/3)=14` working poses in about 11 s.

## Environment

| Variable | Default | Role |
| --- | --- | --- |
| `CAPTURE_GATEWAY_PORTS` | `8044,8045,8046,8047,8048,8049` | Gateway listen pool |
| `CAPTURE_PREVIEW_PORTS` | `5184,5185,5186,5187,5188,5189` | Vite preview pool |
| `CAPTURE_CHROME` | Playwright Chromium, or the mac cache build if present | Browser binary |
| `FFMPEG` | `ffmpeg` on `PATH`, else `/opt/homebrew/bin/ffmpeg` | Used only with `--record` |

Port lists are comma-separated integers from 1 to 65535. Both lists must have the same length. A lane with a reserved budget sets both, for example `CAPTURE_GATEWAY_PORTS=8060,8061 CAPTURE_PREVIEW_PORTS=5160,5161`.
