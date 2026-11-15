# SELENARC — final 30-second demo brief (v3, 15 Nov 2026, 12:20 ART)

Content only; styling and motion are up to the editor. Length **≤ 30 s** (hard limit in the Space Apps guide). Language: English.

- **URL on screen (end card):** siteforge-moon.vercel.app
- **Team:** Azotadores de Agentes · **Challenge:** Lunar Landing Site Navigator
- **Source frames:** `/workspace/siteforge/screens_v7/` (captured from main 11924de, local production build, 1600×900 desktop and 390 px mobile). The live URL may still show the older build until the blocked Vercel deploy is fixed, so record from these frames or from a local build, not from the live site, unless it shows the “View from mast” and “Sky paths” buttons.
- **SI disclosure:** the narration voice is AI-generated. Keep a visible “AI-generated voice” watermark for the whole video and say so in the video description. No NASA logos or NASA branding.

## Beats

| Time | Frame (screens_v7) | On-screen text | Narration |
|---|---|---|---|
| 0:00–0:04 | `desktop_01_hero.png` (3D Moon, “A 5 m mast makes Ridge A work.”) | SELENARC · Lunar Landing Site Navigator | “Azotadores de Agentes presents SELENARC. Don't find the perfect landing site. Engineer one.” |
| 0:04–0:09 | `desktop_05a_panorama_0m.png` (view from ground, Sun and Earth both “Blocked”) | Ridge A · 0 m · Sun 426 h · Earth 199 h of 720 h | “On Connecting Ridge, NASA LOLA terrain blocks the Sun and Earth. From the ground, Ridge A sees Earth for only 199 hours in November 2026.” |
| 0:09–0:15 | `desktop_05b_panorama_5m.png` (same view at 5 m, both “In view”) | 5 m mast · Sun 720 h (100%) · Earth 359.5 h | “Raise a five-meter mast and both come into view: Sun all 720 hours, Earth 359.5.” |
| 0:15–0:20 | `desktop_03_sky_paths_5m.png` (3D scene, Sun and Earth sky paths, green sky gained) | Sky gained at 5 m: Sun +294.0 h · Earth +160.5 h | “In 3D, the green band is the sky the mast gains.” |
| 0:20–0:23 | `desktop_04_raise_mast_20m.png` | 20 m · Earth 382 h · same as 10 m | “Twenty meters adds nothing over ten.” |
| 0:23–0:27 | `desktop_08_optimizer_result.png` | 130 configurations · 17 feasible · 5 m recommended | “Under a 360-hour outage limit, our optimizer picks the smallest mast that works: five meters.” |
| 0:27–0:30 | End card over `desktop_07_monthly_comparison.png` or `desktop_01_hero.png` | siteforge-moon.vercel.app · AI-generated voice | “SELENARC. Try it live.” |

Narration is about 70 words; trim the 0:15 line first if it runs long.

Optional inserts (if time allows, mobile or detail):
- `desktop_06b_mission_ops_panel.png`: countdown to the next sunset and Earthset, Export CSV, Copy link. If used, on-screen text only: “Mission ops: countdown, CSV, share link”. Do not narrate its hour values; they depend on the cursor time.
- `mobile_05b_panorama_5m.png`, `mobile_03_sky_paths_5m.png`, `mobile_01_hero.png`: “Runs in the browser, on a phone too.”

## Verified numbers (the only ones allowed on screen or in narration)

Ridge A, Connecting Ridge, 1 Nov–1 Dec 2026 UTC (720 h), live app engine, read from the app on the screens_v7 captures:

| Mast | Sun | Earth | Longest gap with Sun or Earth blocked |
|---|---|---|---|
| 0 m | 426 h (59.2%) | 199 h | 465 h |
| 5 m | 720 h (100%) | 359.5 h | 342.5 h |
| 10 m | 720 h | 382 h | 320 h |
| 20 m | 720 h | 382 h | 320 h |

- Sky gained vs 0 m in the 3D scene: 5 m Sun +294.0 h, Earth +160.5 h; 20 m Sun +294.0 h, Earth +183.0 h.
- Optimizer: 130 configurations evaluated, 17 feasible under a 360 h outage limit, recommends 5 m at the lander.
- Visibility is geometric line of sight only (not a link budget, not electrical power). The 3D scene uses 4× vertical exaggeration; the panorama has none.
- Do not show Ridge B or Point B numbers on a Ridge A shot.
