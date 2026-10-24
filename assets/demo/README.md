# Demo source

`story.html` is the 1280×800 stage used for the GIFs. Open it with
`?story=showcase` (12 s) or `?story=proof` (10 s). `record.cjs` captures the
frames at 15 fps with Playwright and encodes them with ffmpeg.

`shots/` contains the real built big screen in light and dark, plus the real
popup with a seeded local state. The big screen is captured through its
`?preview=` modes. No network is used.

```bash
NODE_PATH=/path/to/playwright/node_modules node record.cjs
```
