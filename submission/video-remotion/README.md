# SELENARC demo film (Remotion)

Source used to render the 30-second submission video (`selenarc-16x9-final`).

Extracted from the shared Motion Remotion project at `/workspace/demos/remotion` on 15 November 2026. This folder includes the SELENARC final composition and earlier SITE//FORGE cuts, plus their public assets. Unrelated films from that project were left out.

## Compositions

- `selenarc-16x9-final` — final video for the NASA Space Apps submission (SELENARC rename; screenshots from `screens_v7`)
- `siteforge-16x9-final`, `siteforge-16x9-v2`, and `siteforge-16x9` — earlier cuts under the previous name

## Render the final film

```bash
npm install
npx remotion render src/index.ts selenarc-16x9-final out/selenarc-demo-16x9-final.mp4 --codec=h264 --crf=20
```

Remotion 4.0.290. The rendered file is also in `../video/selenarc-demo-16x9-final.mp4` (29.46 seconds).
