# SELENARC — paste-ready Space Apps 2026 submission fields

Prepared 15 November 2026, 13:35 America/Argentina/Salta, from `/workspace/siteforge/submission.md` and the official [2026 Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/) (fetched this turn).

**How to use.** On the team page, open the Project tab, click Edit, and paste each block below into the matching field. Save Progress often. Steven submits the project himself; do not click Submit for Judging without his explicit yes. Official close is Sunday 15 November 2026, 11:59 p.m. local time of the Local Event (or of the Team Owner, if Universal). The team's internal cutoff is 15:00 ART.

**Limits.** The official 2026 guide lists the fields below and the demo limits (video ≤ 30 seconds, or a slide deck of at most 7 slides including title and intro). It does **not** publish character or word limits for the text fields. Counts below are of the exact paste text (characters include spaces and punctuation, not a trailing newline). The High-Level Summary is kept to 146 words as a conservative target. If the form rejects a paste, trim that field and re-count.

**Links must open with no login.** The guide accepts YouTube, Google Drive, GitHub, OneDrive, Dropbox, or a public website. Google Drive is explicitly allowed; YouTube is not required. **Before pasting, set every Drive file to “Anyone with the link” → Viewer**, then open the link in a private/incognito window. As of 13:30 ART, `SELENARC-demo-video.mp4` was uploaded but still private to the Drive owner (Steven Molina). The same check is needed for the pitch PDF and this file.

**Live app (checked 13:29 ART):** https://siteforge-moon.vercel.app now serves title and `og:title` “SELENARC”, tagline “Lunar Landing Site Navigator”, and JS bundle `index-BZtHmO56.js` containing `SELENARC` and no `SITE//FORGE`. Favicon path `/siteforge.svg` is an unchanged asset filename.

---

## Challenge

Lunar Landing Site Navigator

The official form does not have a free-text Challenge box. Confirm on the team/project page that this challenge is already selected. Challenge page: https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/

---

## Project Name

**Paste this (8 characters, 1 word):**

```
SELENARC
```

---

## High-Level Project Summary

**Paste this (932 characters, 146 words):**

```
SELENARC is an interactive tool for comparing lunar south-pole landing sites and dates, and how mast height changes power and communication potential. Built for Lunar Landing Site Navigator, it combines NASA LOLA topography with JPL Horizons Sun and Earth positions, shows both bodies against a terrain-derived horizon, and reports illumination, Earth visibility, and outages. Users place a solar-and-communications mast, change its location and height, and watch the windows recalculate. A discrete optimizer searches 130 configurations; under a 360-hour outage limit, 17 are feasible and it recommends a 5-meter mast. At Ridge A on Connecting Ridge (November 2026, 720 hours), modeled Earth visibility rises from 199 hours at the surface to 359.5 hours at 5 meters, and plateaus at 382 hours from 10 meters. Visibility is geometric line of sight only, not a link budget or power; Earth caps near 53% of the month due to libration.
```

---

## Link to Project Demo

This field is for the **30-second video or the 7-slide deck**, not the live app.

**Paste this (83 characters):**

```
https://github.com/MatiasBoldrini/Azotadores-de-agentes-/blob/main/submission/video/selenarc-demo-16x9-final.mp4
```

- File: `SELENARC-demo-video.mp4` (29.46 seconds, under the 30.00-second hard limit).
- Hosting: Google Drive, which the official guide lists as an accepted host (YouTube is also accepted, not required).
- After sharing is set to “Anyone with the link”, test in a private window.
- Backup if you prefer slides instead of the video: the 7-slide pitch at https://github.com/MatiasBoldrini/Azotadores-de-agentes-/blob/main/submission/pitch_v3/pitch.pdf (`SELENARC-pitch.pdf`). Do not paste both; the form takes one demo link.
- The video uses an SI-generated voice and must keep its visible watermark and acknowledgment, per the guide. No NASA logos are used in generated content.

---

## Link to Final Project

**Paste this (33 characters):**

```
https://siteforge-moon.vercel.app
```

The official guide uses this field for the product itself (website, repo, or cloud host). Use the public web app here. Put the source repository in References (already included below):

`https://github.com/MatiasBoldrini/Azotadores-de-agentes-`

The repository is public. Confirm it still opens while logged out.

---

## Detailed Project Description

The official guide asks: What exactly does it do? How does it work? What benefits does it have? What do you hope to achieve? What tools, coding languages, hardware, or software did you use? Tools and tech are part of this field (not a separate box). The paste covers all of those prompts.

**Paste this (13864 characters, 2334 words):**

```
**What it does**

SELENARC helps mission planners, educators, and the public compare landing sites and dates at the lunar south pole, and then go one step further: ask what minimum infrastructure would improve a site’s power and communication potential. The application lets a user:

- Start on a 3D Moon (LROC WAC mosaic with NASA LOLA relief), fly down to Connecting Ridge with one click, and hand over to a close-up of the Site01 5 m LOLA terrain at real scale.
- Explore a real region of the lunar south pole, using NASA LOLA topography for Site01 Connecting Ridge.
- Compare locations and dates in a 1 November–1 December 2026 analysis window (720 hours).
- See the Sun and Earth plotted against a terrain-derived local horizon.
- Read periods of solar illumination and direct geometric visibility of Earth, including longest outages and hours when Sun and Earth are visible together.
- Place a combined solar-and-communications mast on the terrain, change its location and height (0, 2, 5, 10, or 20 meters), and recalculate the windows.
- Run a discrete optimizer over candidate configurations and compare the results.
- See the Sun and Earth paths drawn in the 3D sky over the real terrain horizon, raise the mast from 0 to 20 m inside the scene, and see the sky gained in green (at Ridge A, a 5 m mast gains +294.0 h of Sun and +160.5 h of Earth over the ground).
- Open “View from mast”: a 360° panorama of the real horizon seen from the mast top, with the Sun and Earth tracks; at Ridge A both are blocked at 0 m and both are in view at 5 m.
- Read a mission-ops countdown to the next sunset and next Earthset from the computed visibility timeline, export the timeline as CSV, and copy a share link that reopens the same site, station cell, mast height, time window, and view.
- Compare Ridge A and Ridge B side by side. Every percentage shows the exact UTC window it covers. A Monthly comparison extends the two fixed sites to six UTC calendar months (November 2026 through April 2027) at 0, 2, 5, 10 and 20 m and shows the lowest tested mast height that meets the limits in each month.

The product question is: “What is the minimum infrastructure configuration that improves a lunar landing site’s power and communication potential?” SELENARC does not simulate a launch, certify landing safety, or guarantee a complete mission design.

**How it works**

A Python science engine does the heavy work offline, before the demo, so the public app can stay static and fast.

1. Terrain. Near-field topography comes from the 5 meters/pixel LOLA digital elevation model for PGDA product 78, Site01 Connecting Ridge. Distant terrain, which can block a low polar Sun or Earth from tens of kilometers away, comes from the regional LOLA digital elevation model in PGDA product 90, used out to 150 kilometers. Horizon profiles are traced a full 360 degrees by ray-marching these DEMs, including lunar curvature, at mast heights of 0, 2, 5, 10, and 20 meters.
2. Ephemerides. Sun and Earth azimuth and elevation are taken from the JPL Horizons API for lunar surface coordinates at two sites in the app (Ridge A and Ridge B), for 1 November 2026 00:00 UTC through 1 December 2026 00:00 UTC.
3. Visibility. A body is treated as visible when its elevation exceeds the horizon elevation at its azimuth. This is a disk-center, geometric line-of-sight test only. It is not a radio link budget, and solar exposure is not converted into electrical power. Earth visibility caps near 53% of this month because libration takes Earth’s center below the astronomical horizon; no mast can fix that.
4. Windows. From those visibility flags the engine builds time windows, longest outages, and simultaneous Sun-plus-Earth hours.
5. Optimization. A discrete search evaluates 130 configurations (26 candidate locations × 5 mast heights). Under the app’s default constraints, including a 360-hour outage limit, 17 configurations are feasible, and the optimizer recommends a 5-meter mast at Ridge A.
6. Interface. Precomputed results are exported as compact data files and loaded by a static web application with a Three.js 3D view. It opens on a 3D Moon built from the LROC WAC mosaic with LOLA relief, flies to Connecting Ridge, and hands over to a close-up of the Site01 5 m LOLA terrain at real scale. In the workspace, analysis results sit in a collapsible, reorderable right sidebar (panels can also be undocked and floated). A compact visibility timeline is docked in that sidebar and along the bottom of the scene. Earth is textured with the Apollo 17 Blue Marble photograph; when a body is hidden by terrain, its sightline is drawn as an animated occluded ray. The interface uses a grayscale glass design across every tab. The app is deployed at https://siteforge-moon.vercel.app. Sliders and comparisons run in the browser against the precomputed engine output, so the demo does not depend on a live science server. If an external API is unavailable at runtime, the app continues to use the already computed, documented results. Failed calculations are never silently replaced with invented numbers.

**Hero result — Ridge A (live app engine)**

Ridge A is a point on Site01 Connecting Ridge at 89.46316°S, 137.50198°W, elevation 1944.8 m. All figures below are from the live app engine for 1 November–1 December 2026 (720 hours) and were rechecked against https://siteforge-moon.vercel.app/data/snapshot.json (generated 14 November 2026, 23:24 UTC).

| Mast height | Sun | Earth | Simultaneous Sun+Earth | Longest joint Sun+Earth outage |
| --- | --- | --- | --- | --- |
| 0 m | 426 h (59.2%) | 199 h | 54 h | 465 h |
| 2 m | 564 h | 291.5 h | 173 h | 391 h |
| 5 m | 720 h (100%) | 359.5 h | 359.5 h | 342.5 h |
| 10 m | 720 h (100%) | 382 h | 382 h | 320 h |
| 20 m | 720 h (100%) | 382 h | 382 h | 320 h |

From 5 meters up, modeled solar exposure is 100% (720/720 h) because the mast clears the local horizon in this window. Modeled Earth visibility rises from 199 hours at the surface to 359.5 hours at 5 meters and 382 hours at 10 meters. Raising the mast from 10 meters to 20 meters adds no further modeled Earth-visibility time — a plateau at about 53% of the month, set by libration. That is the point of “minimum infrastructure”: more height is not automatically better.

We evaluated whether the Athena IM-2 landing point on Mons Mouton fell inside Site01 coverage. It does not, so IM-2 is not used as a case in this project.

**Independent cross-check — Point B (not Ridge A)**

Separately, an independent engine run computed two other points on the same Site01 tile. These are **not** the app’s Ridge A or Ridge B, and their hours must not be mixed with the table above.

- Point A (independent summit) is the highest DEM cell in the central 8×8 km of Site01. It is already well clear of the local horizon; a mast adds essentially nothing there.
- **Point B, a flat shoulder 290 m from the summit, chosen to show mast effect**, sits at 89.43376°S, 222.037°E, elevation 1946.3 m, slope 3.1°. At Point B, joint Sun+Earth visibility goes from **0 h at the surface to 297.5 h at a 10-meter mast**. Earth hours at Point B are 129.5 h at 0 m, 218.5 h at 5 m, 297.5 h at 10 m, and 377.5 h at 20 m. Figures in the pitch-deck visuals round 297.5 h to 298 h.

This cross-check uses the same data sources (PGDA 78, PGDA 90, JPL Horizons) and the same geometric definition of visibility. It was produced to illustrate the mast effect at a nearby flat point, not to replace the Ridge A numbers in the live app.

**Benefits and intended impact**

Existing specialist tools such as LROC QuickMap, NASA Moon Trek, and JPL Horizons, which the official challenge itself identifies, already provide the underlying data, but they are built for detailed analysis rather than rapid “what if we land here, or later, or with a taller mast?” comparison. SELENARC is meant to close that gap for CLPS and other south-pole mission teams that have to reopen site and date decisions when schedules slip, and for educators and the public who want to see why a few meters of height or a few kilometers of location can change operational windows. The intended impact is faster, more honest trade studies: a planner gets a quantitative recommendation and a clear statement of what the numbers are not.

**Why SELENARC is different**

SELENARC is built on NASA LOLA terrain at 5 meters/pixel (PGDA product 78, Site01) and a regional LOLA horizon out to 150 kilometers (PGDA product 90), so distant ridges can still block a low polar Sun or Earth. The product question is the minimum mast that meets the cap: under a 360-hour outage limit, 17 of 130 configurations are feasible, and the optimizer recommends 5 meters at Ridge A, where the longest joint Sun+Earth outage falls from 465 hours on the ground to 342.5 hours. Twenty meters adds no further Earth visibility in this window. We document angular sensitivity and 91 passing automated tests; we cross-checked ground-level results against NASA's PGDA 69 long-term maps over a full 18.6-year cycle at 462 points: Earth visibility agrees closely (r = 0.978, RMSE 5.1 pp), solar illumination agrees on average with larger scatter (r = 0.63, RMSE 9.8 pp); mast-height results are not validated by this comparison, since NASA publishes no height maps.

The 30-second Project Demo uses an SI-generated (AI-generated) voice. That use is acknowledged in the video description and metadata, and with a visible watermark, as required by the 2026 Project Submission Guide.

**Prior work and positioning**

SELENARC does not invent polar illumination science. Long-term average solar illumination and Earth-visibility maps at the surface are published as PGDA product 69 ([https://pgda.gsfc.nasa.gov/products/69](https://pgda.gsfc.nasa.gov/products/69)), following Mazarico et al. (2011, [doi:10.1016/j.icarus.2010.10.030](https://doi.org/10.1016/j.icarus.2010.10.030)). Those products are typically averages over a lunar nutation cycle (~18.6 years). The PGDA 69 product page itself notes that further analysis is preferable to assess the effect of shorter time periods, higher resolution, and height above the surface (for potential rovers or habitats). Height-dependent illumination is treated in the literature, including Gläser et al. (2014, [doi:10.1016/j.icarus.2014.08.013](https://doi.org/10.1016/j.icarus.2014.08.013)) and the improved LOLA site maps of Barker et al. (2021) that underpin PGDA product 78 ([https://pgda.gsfc.nasa.gov/products/78](https://pgda.gsfc.nasa.gov/products/78)). What we add is a public, interactive, mission-month (November 2026) what-if: mast heights from 0 to 20 m, joint Sun+Earth outage, and a smallest-mast optimizer. Moon Trek and LROC QuickMap remain the specialist browsers for the same terrain; they do not run that mast trade. The live app also goes beyond one month for the two fixed sites. Its Monthly comparison covers Ridge A and Ridge B for six UTC calendar months, November 2026 through April 2027, at 0, 2, 5, 10 and 20 m, using JPL Horizons tables at each site through 1 May 2027. The lowest tested mast height that meets the demo limits is 5 m at Ridge A from November 2026 to January 2027 and 10 m in February and March 2027. At Ridge B it is 10 m from November 2026 to February 2027 and 20 m in March 2027. In April 2027 no tested height qualifies at either site: at 20 m, Ridge A has 495 h of Sun and Ridge B 371 h, versus the 504 h required. In November 2026 at ground level, Ridge A has 426 h of Sun and 199 h of Earth visibility, and Ridge B has 295 h and 381 h. The smallest mast that works changes with the month and differs between the two sites.

**Tools, languages, and software**

- Science engine: Python, NumPy, and rasterio, with precomputed exports consumed by the interface.
- Interface: a static TypeScript application with Three.js, deployed on Vercel at https://siteforge-moon.vercel.app.
- Source: https://github.com/MatiasBoldrini/Azotadores-de-agentes-
- Verification: 91 automated tests (37 Python and 54 Node) pass on main at commit 11924de. A `validation_report.md` in the repository documents angular sensitivity of the method. Units, coordinate systems, methods, versions, and sources are documented with the engine and that report.

**Known limitations (stated in the product and in this submission)**

- Visibility is geometric line of sight only, evaluated at the disk center. It is not a communications link budget and not generated electrical power.
- Earth visibility caps near 53% of November 2026 at every sufficient height because libration takes Earth’s center below the astronomical horizon; a taller mast cannot remove that cap.
- The full what-if (26 candidate positions × 5 heights, timelines and the optimizer) opens on November 2026 (1 November–1 December UTC, the guided demo window) and accepts any custom UTC window from 1 November 2026 to 1 May 2027. Later months reuse the cached terrain horizons with precomputed JPL Horizons Sun/Earth directions (linear horizon interpolation, observer parallax omitted). The Monthly comparison covers the two fixed sites, Ridge A and Ridge B, at five heights, for six calendar months (November 2026–April 2027). Neither is a multi-year illumination climatology. The independent Point A / Point B cross-check uses two further locations on the same tile.
- This tool does not claim that a configuration is safe or certified for a real mission.
- Connecting Ridge was an Artemis III candidate region in 2022 and was not on NASA’s refined 2024 list. We do not claim it is a current Artemis III landing region.
- Next steps: extend the same pipeline to Artemis III candidate regions that already have PGDA 78 5 m LOLA tiles, such as Malapert, Nobile Rim 1 and 2, Haworth, and de Gerlache. NASA publishes candidate regions, not exact landing points, so each region would need its own set of evaluated candidate points.
```

---

## Use of Super Intelligence (SI)

Official 2026 field name. The guide says this answer is for data collection and is not shown to judges, but SI-generated video/audio in the project must still be watermarked or acknowledged.

**Paste this (1471 characters, 245 words):**

```
Yes. AI coding agents assisted software development, testing, documentation, and this submission text.

They did not invent scientific numbers. All quantitative results shown in the application and cited in this submission as Ridge A results — including Earth visibility of 199 hours at 0 meters, 359.5 hours at 5 meters, and 382 hours at 10 and 20 meters; Sun exposure of 426 hours (59.2%) at 0 meters and 100% from 5 meters; simultaneous Sun+Earth hours of 54 hours at 0 meters; joint outages of 465 / 391 / 342.5 / 320 / 320 hours at 0 / 2 / 5 / 10 / 20 meters; the 130-configuration search; the 17 feasible configurations under a 360-hour outage limit; and the 5-meter recommendation — come from the project’s science engine, which is driven by NASA LOLA topography and JPL Horizons ephemerides. The Point B figures (0 h → 297.5 h joint Sun+Earth at 10 m) come from a clearly labeled independent cross-check, not from the app’s Ridge A run. If a required input is missing, the product does not display a fabricated measurement.

The 30-second Project Demo uses an SI-generated (AI-generated) voice. It carries a visible watermark and is acknowledged in the video description and metadata, as required. Screen recordings of the live application, and plots rendered from LOLA topography and Horizons ephemerides, are recordings of software and data output, not invented scenery. No NASA logos, flags, or mission identifiers are used or modified in SI-generated content.
```

---

## NASA Data

**Paste this (2170 characters, 283 words):**

```
To be eligible for a Global Award, a project must use at least one NASA data or resource. SELENARC uses the following NASA data as core computational inputs, not as decoration.

1. **High-resolution LOLA topography for lunar south pole sites (PGDA product 78), Site01 Connecting Ridge, 5 meters/pixel.**
   Source: NASA Planetary Geology, Geophysics and Geochemistry Laboratory / LRO Lunar Orbiter Laser Altimeter (LOLA).
   URL: [https://pgda.gsfc.nasa.gov/products/78](https://pgda.gsfc.nasa.gov/products/78)
   How it is used: this local digital elevation model supplies near-field terrain for 360-degree horizon profiles at each candidate point and mast height, and for the 3D site visualization.

2. **Regional LOLA topography of the lunar south pole (PGDA product 90), 80 meters/pixel, queried out to 150 kilometers.**
   Source: NASA Planetary Geology, Geophysics and Geochemistry Laboratory / LRO LOLA.
   URL: [https://pgda.gsfc.nasa.gov/products/90](https://pgda.gsfc.nasa.gov/products/90)
   How it is used: this regional digital elevation model supplies distant terrain that can occupy the horizon at polar Sun and Earth elevations. Horizons are ray-marched with lunar curvature so that mountains well outside the 5 meters/pixel tile can still block a body.

3. **JPL Horizons Sun and Earth azimuth and elevation as seen from lunar surface coordinates.**
   Source: NASA Jet Propulsion Laboratory Solar System Dynamics.
   URLs: [https://ssd-api.jpl.nasa.gov/doc/horizons.html](https://ssd-api.jpl.nasa.gov/doc/horizons.html) and [https://ssd.jpl.nasa.gov/horizons/](https://ssd.jpl.nasa.gov/horizons/)
   How it is used: Horizons provides the ephemerides for the analysis sites in the 1 November–1 December 2026 window. A body is counted as geometrically visible when its elevation exceeds the terrain horizon at the corresponding azimuth.

LOLA and Horizons are the computational backbone of every visibility window, outage, and optimizer result in the product. The official challenge also lists LROC QuickMap and NASA Moon Trek as NASA resources for this problem; they are treated here as prior specialist tools, not as computational inputs to our engine.
```

---

## Space Agency Partner Data and Other References

**Paste this (5275 characters, 592 words):**

```
**Space Agency Partner data.** This project does not use a Space Agency Partner dataset as a computational input. Partner portals listed on the challenge page, including the Canadian Space Agency Moon Exploration site, were reviewed as background only.

**NASA and scientific references**

- Barker, M. K., et al. (2021). Improved LOLA Elevation Maps for South Pole Landing Sites: Error Estimates and Their Impact on Illumination Conditions. *Planetary and Space Science*, 203, 105119. [https://doi.org/10.1016/j.pss.2020.105119](https://doi.org/10.1016/j.pss.2020.105119). Required citation for PGDA product 78.
- NASA GSFC Planetary Geology, Geophysics and Geochemistry Laboratory. High-Resolution LOLA Topography for Lunar South Pole Sites (PGDA product 78). [https://pgda.gsfc.nasa.gov/products/78](https://pgda.gsfc.nasa.gov/products/78)
- NASA GSFC Planetary Geology, Geophysics and Geochemistry Laboratory. A New View of the Lunar South Pole from LOLA (PGDA product 90). [https://pgda.gsfc.nasa.gov/products/90](https://pgda.gsfc.nasa.gov/products/90)
- NASA Jet Propulsion Laboratory. Horizons System and Horizons API. [https://ssd.jpl.nasa.gov/horizons/](https://ssd.jpl.nasa.gov/horizons/) and [https://ssd-api.jpl.nasa.gov/doc/horizons.html](https://ssd-api.jpl.nasa.gov/doc/horizons.html)
- NASA. “NASA Identifies Candidate Regions for Landing Next Americans on Moon” (13 April 2022). Lists Connecting Ridge among the original 13 Artemis III candidate regions. [https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/](https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/)
- NASA. “NASA Provides Update on Artemis III Moon Landing Regions” (28 October 2024). Documents the later refinement to nine candidate regions; Connecting Ridge is not on the updated list. [https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/](https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/)
- Mazarico, E., Neumann, G. A., Smith, D. E., Zuber, M. T., and Torrence, M. H. (2011). Illumination conditions of the lunar polar regions using LOLA topography. *Icarus*, 211(2), 1066–1081. [https://doi.org/10.1016/j.icarus.2010.10.030](https://doi.org/10.1016/j.icarus.2010.10.030). Prior scientific work on LOLA-based polar illumination and the effect of small height gains above the surface; PGDA product 78 notes that its site numbering follows this paper. Used as literature context, not as a substitute for our engine results.
- NASA GSFC Planetary Geology, Geophysics and Geochemistry Laboratory. Lunar Polar Illumination (PGDA product 69): long-term average solar illumination, Earth visibility, and permanent-shadow maps, typically over a ~18.6-year nutation cycle. The product page states that further analysis is preferable to assess shorter time periods, higher resolution, and height above the surface. [https://pgda.gsfc.nasa.gov/products/69](https://pgda.gsfc.nasa.gov/products/69)
- Gläser, P., Scholten, F., De Rosa, D., Figuera, R. M., Oberst, J., Mazarico, E., Neumann, G. A., and Robinson, M. S. (2014). Illumination conditions at the lunar south pole using high resolution Digital Terrain Models from LOLA. *Icarus*, 243, 78–90. [https://doi.org/10.1016/j.icarus.2014.08.013](https://doi.org/10.1016/j.icarus.2014.08.013). Height-dependent illumination on Connecting Ridge over a ~19-year cycle (including 2 m and 10 m above the surface). Used as literature context, not as a substitute for our November 2026 engine results.
- NASA Space Apps Challenge 2026. Lunar Landing Site Navigator challenge statement and resources (QuickMap, Moon Trek, Horizons). [https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/)
- Arizona State University / LROC. QuickMap. [https://quickmap.lroc.asu.edu/](https://quickmap.lroc.asu.edu/) (challenge-listed prior tool; not a computational input to this engine).
- NASA / GSFC / Arizona State University. LROC WAC global mosaic, and NASA Scientific Visualization Studio CGI Moon Kit ([https://svs.gsfc.nasa.gov/4720](https://svs.gsfc.nasa.gov/4720)). Imagery and relief for the app's 3D Moon landing view only, not a computational input.
- NASA Johnson Space Center. Apollo 17, photograph AS17-148-22727 (Blue Marble), 7 December 1972. Used as the Earth texture in the 3D site view only, not a computational input.
- NASA / JPL. Moon Trek. [https://trek.nasa.gov/moon/](https://trek.nasa.gov/moon/) (challenge-listed prior tool; not a computational input to this engine).

**Software and libraries used**

- Python, NumPy, rasterio
- TypeScript, Three.js
- Vercel (static hosting): https://siteforge-moon.vercel.app
- Source repository: https://github.com/MatiasBoldrini/Azotadores-de-agentes-
- JPL Horizons API client access as documented in the repository

**Not cited.** An “Ohio University Lunar Planner” was suggested as prior art. A source of that name could not be verified from public, citable records at the time of writing, so it is omitted rather than invented. If the team later locates a stable citation, it may be added before submission.
```

---

## Confirmation checkboxes (do not paste; tick on the form)

1. “I have read and understand the project submission requirements as contained in the NASA Space Apps Project Submission Guide, and I agree to the Participant Terms and Conditions and Privacy Policy.”
2. “I confirm that the submitted project represents my team’s original work and that all external resources including code, text and images (even if they are open source or freely available) used in the project are listed in the References field of the project submission form. In creating our solution, my team has not used any copyrighted materials (i.e., music, images, text, etc.) that we don’t have permission to use.”

Then click **Submit for Judging** only after Steven’s explicit yes. You can edit and resubmit until the official close; judges review the last submission.

---

## Fields not filled / not on the official form

- **Character limits** for the text fields are not published in the 2026 Project Submission Guide. If the website enforces a hidden max, the High-Level Summary (932 characters) is the one to keep intact first; trim the Detailed Description or References if needed.
- **Challenge** is not a typed field; confirm it is already set to Lunar Landing Site Navigator.
- **Team name and members** (Azotadores de Agentes: Steven Molina, Matías Boldrini, Federico Tavano) live on the team page, not on this form.
- **YouTube URL** — not created. Drive is an accepted host. A YouTube unlisted upload is optional, not required.
- **Drive public access** — not set from here. Steven (or anyone with the Drive file) must switch `SELENARC-demo-video.mp4`, and ideally `SELENARC-pitch.pdf` and this file, to “Anyone with the link” before submitting.
