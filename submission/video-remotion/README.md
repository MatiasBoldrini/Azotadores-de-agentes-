# SITE//FORGE demo film (Remotion)

Source used to render the 30-second submission video (`siteforge-16x9-final`).

Extracted from the shared Motion Remotion project at `/workspace/demos/remotion` on 2026-11-15. Only the SITE//FORGE compositions and their public assets are included. Unrelated films from that project were left out.

## Compositions

- `siteforge-16x9-final` — final video submitted to NASA Space Apps (screenshots from `screens_v7`)
- `siteforge-16x9-v2` and `siteforge-16x9` — earlier cuts

## Render the final film

```bash
npm install
npx remotion render src/index.ts siteforge-16x9-final out/siteforge-demo-16x9-final.mp4 --codec=h264 --crf=20
```

Remotion 4.0.290. The rendered file is also in `../video/siteforge-demo-16x9-final.mp4`.
