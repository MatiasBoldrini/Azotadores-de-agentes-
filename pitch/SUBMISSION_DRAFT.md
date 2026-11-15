# SITE//FORGE — NASA Space Apps Challenge 2026 Submission Package

**Team:** Azotadores de Agentes
**Project:** SITE//FORGE
**Tagline:** Don't find the perfect landing site. Engineer one.
**Challenge:** Lunar Landing Site Navigator
**Language:** English (required on the submission page and in all linked materials)

This file is organized to match the official 2026 Project Submission Guide fields, retrieved on 14 November 2026 from [https://www.spaceappschallenge.org/resources/project-submission-guide/](https://www.spaceappschallenge.org/resources/project-submission-guide/). The public website sometimes returns HTTP 500; the same guide was fetched successfully with curl. Official judging criteria (scored 1–5) are from the [2026 Judging and Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/).

**How to use this document:** copy each form-field block into the Project tab on the team page. The demo and repository URLs below are filled in. Test both links in a private browser window. The repository must be **public** before Submit for Judging — it may still be private at the time this package was updated. Save Progress often, then click **Submit for Judging** only after an explicit team yes, and before the official close: Sunday, 15 November 2026, 11:59 p.m. local time of the team’s Local Event (or of the Team Owner’s residence, if registered for the Universal Event). The team’s internal working cutoff of 15:00 America/Buenos_Aires is earlier than the official close.

Sections after the form fields (30-second demo script, 3-minute local pitch, likely judge questions, and unverified items) are for production and judging, not additional form boxes.

---

## Official form fields

### Project Name

SITE//FORGE

### High-Level Project Summary

*(Official guide: “Provide a high-level summary of your project. What did you develop? How does it address the challenge? Why is it important?” No published word or character limit was found in the 2026 guide. This draft is kept to 150 words.)*

SITE//FORGE is an interactive tool for comparing lunar south-pole landing sites and dates, and how mast height changes power and communication potential. Built for Lunar Landing Site Navigator, it combines NASA LOLA topography with JPL Horizons Sun and Earth positions, shows both bodies against a terrain-derived horizon, and reports illumination, Earth visibility, and outages. Users place a solar-and-communications mast, change its location and height, and watch the windows recalculate. A discrete optimizer searches 130 configurations; under a 360-hour outage limit, 17 are feasible and it recommends a 5-meter mast. At Ridge A on Connecting Ridge (November 2026, 720 hours), modeled Earth visibility rises from 199 hours at the surface to 359.5 hours at 5 meters, and plateaus at 382 hours from 10 meters. Visibility is geometric line of sight only, not a link budget or power; Earth caps near 53% of the month due to libration.

### Link to Project Demo

https://siteforge-moon.vercel.app

*Paste a publicly accessible, no-login link to a video of 30 seconds or less (YouTube unlisted or equivalent is fine) or to a slide deck of at most seven slides, including title and introductory slides. Test the link in a private browser window. If a 30-second video is ready, use that as the Project Demo link and keep the live app as the Final Project link. If the video uses Super Intelligence–generated imagery or audio, it must carry a visible watermark and descriptive acknowledgment, per the official guide. Do not use NASA logos or other NASA branding in generated content. Until the video is published, the seven-slide deck (pitch/pitch.pdf in the repository, branch `pitch-deck`) or the public web app may be used, provided the link opens with no login.*

### Link to Final Project

https://siteforge-moon.vercel.app

*Recommended: the public, no-login web app as the primary Final Project link. Also keep the repository public (required for submission; a private repository cannot be judged) and mention it in the Detailed Project Description. If judges cannot open a link, they cannot evaluate the work.*

Public web app: https://siteforge-moon.vercel.app
Source repository: https://github.com/MatiasBoldrini/Azotadores-de-agentes-


### Detailed Project Description

*(Official guide prompts: What exactly does it do? How does it work? What benefits does it have? What do you hope to achieve? What tools, coding languages, hardware, or software did you use?)*

**What it does**

SITE//FORGE helps mission planners, educators, and the public compare landing sites and dates at the lunar south pole, and then go one step further: ask what minimum infrastructure would improve a site’s power and communication potential. The application lets a user:

- Explore a real region of the lunar south pole, using NASA LOLA topography for Site01 Connecting Ridge.
- Compare locations and dates in a 1 November–1 December 2026 analysis window (720 hours).
- See the Sun and Earth plotted against a terrain-derived local horizon.
- Read periods of solar illumination and direct geometric visibility of Earth, including longest outages and hours when Sun and Earth are visible together.
- Place a combined solar-and-communications mast on the terrain, change its location and height (0, 2, 5, 10, or 20 meters), and recalculate the windows.
- Run a discrete optimizer over candidate configurations and compare the results.

The product question is: “What is the minimum infrastructure configuration that improves a lunar landing site’s power and communication potential?” SITE//FORGE does not simulate a launch, certify landing safety, or guarantee a complete mission design.

**How it works**

A Python science engine does the heavy work offline, before the demo, so the public app can stay static and fast.

1. Terrain. Near-field topography comes from the 5 meters/pixel LOLA digital elevation model for PGDA product 78, Site01 Connecting Ridge. Distant terrain, which can block a low polar Sun or Earth from tens of kilometers away, comes from the regional LOLA digital elevation model in PGDA product 90, used out to 150 kilometers. Horizon profiles are traced a full 360 degrees by ray-marching these DEMs, including lunar curvature, at mast heights of 0, 2, 5, 10, and 20 meters.
2. Ephemerides. Sun and Earth azimuth and elevation are taken from the JPL Horizons API for lunar surface coordinates at two sites in the app (Ridge A and Ridge B), for 1 November 2026 00:00 UTC through 1 December 2026 00:00 UTC.
3. Visibility. A body is treated as visible when its elevation exceeds the horizon elevation at its azimuth. This is a disk-center, geometric line-of-sight test only. It is not a radio link budget, and solar exposure is not converted into electrical power. Earth visibility caps near 53% of this month because libration takes Earth’s center below the astronomical horizon; no mast can fix that.
4. Windows. From those visibility flags the engine builds time windows, longest outages, and simultaneous Sun-plus-Earth hours.
5. Optimization. A discrete search evaluates 130 configurations (26 candidate locations × 5 mast heights). Under the app’s default constraints, including a 360-hour outage limit, 17 configurations are feasible, and the optimizer recommends a 5-meter mast at Ridge A.
6. Interface. Precomputed results are exported as compact data files and loaded by a static web application with a Three.js 3D view, deployed at https://siteforge-moon.vercel.app. Sliders and comparisons run in the browser against the precomputed engine output, so the demo does not depend on a live science server. If an external API is unavailable at runtime, the app continues to use the already computed, documented results. Failed calculations are never silently replaced with invented numbers.

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

Existing specialist tools such as LROC QuickMap, NASA Moon Trek, and JPL Horizons, which the official challenge itself identifies, already provide the underlying data, but they are built for detailed analysis rather than rapid “what if we land here, or later, or with a taller mast?” comparison. SITE//FORGE is meant to close that gap for CLPS and other south-pole mission teams that have to reopen site and date decisions when schedules slip, and for educators and the public who want to see why a few meters of height or a few kilometers of location can change operational windows. The intended impact is faster, more honest trade studies: a planner gets a quantitative recommendation and a clear statement of what the numbers are not.

**Tools, languages, and software**

- Science engine: Python, NumPy, and rasterio, with precomputed exports consumed by the interface.
- Interface: a static TypeScript application with Three.js, deployed on Vercel at https://siteforge-moon.vercel.app.
- Source: https://github.com/MatiasBoldrini/Azotadores-de-agentes-
- Verification: 35 tests pass (29 Python and 6 Node). A `validation_report.md` in the repository documents angular sensitivity of the method. Units, coordinate systems, methods, versions, and sources are documented with the engine and that report.

**Known limitations (stated in the product and in this submission)**

- Visibility is geometric line of sight only, evaluated at the disk center. It is not a communications link budget and not generated electrical power.
- Earth visibility caps near 53% of November 2026 at every sufficient height because libration takes Earth’s center below the astronomical horizon; a taller mast cannot remove that cap.
- Results in the live app are for two sites (Ridge A and Ridge B) and a single 720-hour window (1 November–1 December 2026), not a multi-year illumination climatology. The independent Point A / Point B cross-check uses two further locations on the same tile.
- This tool does not claim that a configuration is safe or certified for a real mission.
- Connecting Ridge was an Artemis III candidate region in 2022 and was not on NASA’s refined 2024 list. We do not claim it is a current Artemis III landing region.

### Use of Super Intelligence (SI)

*(Official 2026 field name. The guide states that this question is for data-collection purposes and is not shown to judges, but SI-generated images, video, and audio in the project itself must still be watermarked or acknowledged, and NASA branding must not be used or modified in generated content.)*

Yes. AI coding agents assisted software development, testing, documentation, and this submission text.

They did not invent scientific numbers. All quantitative results shown in the application and cited in this submission as Ridge A results — including Earth visibility of 199 hours at 0 meters, 359.5 hours at 5 meters, and 382 hours at 10 and 20 meters; Sun exposure of 426 hours (59.2%) at 0 meters and 100% from 5 meters; simultaneous Sun+Earth hours of 54 hours at 0 meters; joint outages of 465 / 391 / 342.5 / 320 / 320 hours at 0 / 2 / 5 / 10 / 20 meters; the 130-configuration search; the 17 feasible configurations under a 360-hour outage limit; and the 5-meter recommendation — come from the project’s science engine, which is driven by NASA LOLA topography and JPL Horizons ephemerides. The Point B figures (0 h → 297.5 h joint Sun+Earth at 10 m) come from a clearly labeled independent cross-check, not from the app’s Ridge A run. If a required input is missing, the product does not display a fabricated measurement.

If the 30-second Project Demo includes SI-generated imagery, animation, or narration, it will carry a visible watermark and descriptive acknowledgment, as required. Screen recordings of the live application, and plots rendered from LOLA topography and Horizons ephemerides, are recordings of software and data output, not invented scenery. No NASA logos, flags, or mission identifiers are used or modified in SI-generated content.

### NASA Data

To be eligible for a Global Award, a project must use at least one NASA data or resource. SITE//FORGE uses the following NASA data as core computational inputs, not as decoration.

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

### Space Agency Partner Data and Other References

**Space Agency Partner data.** This project does not use a Space Agency Partner dataset as a computational input. Partner portals listed on the challenge page, including the Canadian Space Agency Moon Exploration site, were reviewed as background only.

**NASA and scientific references**

- Barker, M. K., et al. (2021). Improved LOLA Elevation Maps for South Pole Landing Sites: Error Estimates and Their Impact on Illumination Conditions. *Planetary and Space Science*, 203, 105119. [https://doi.org/10.1016/j.pss.2020.105119](https://doi.org/10.1016/j.pss.2020.105119). Required citation for PGDA product 78.
- NASA GSFC Planetary Geology, Geophysics and Geochemistry Laboratory. High-Resolution LOLA Topography for Lunar South Pole Sites (PGDA product 78). [https://pgda.gsfc.nasa.gov/products/78](https://pgda.gsfc.nasa.gov/products/78)
- NASA GSFC Planetary Geology, Geophysics and Geochemistry Laboratory. A New View of the Lunar South Pole from LOLA (PGDA product 90). [https://pgda.gsfc.nasa.gov/products/90](https://pgda.gsfc.nasa.gov/products/90)
- NASA Jet Propulsion Laboratory. Horizons System and Horizons API. [https://ssd.jpl.nasa.gov/horizons/](https://ssd.jpl.nasa.gov/horizons/) and [https://ssd-api.jpl.nasa.gov/doc/horizons.html](https://ssd-api.jpl.nasa.gov/doc/horizons.html)
- NASA. “NASA Identifies Candidate Regions for Landing Next Americans on Moon” (13 April 2022). Lists Connecting Ridge among the original 13 Artemis III candidate regions. [https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/](https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/)
- NASA. “NASA Provides Update on Artemis III Moon Landing Regions” (28 October 2024). Documents the later refinement to nine candidate regions; Connecting Ridge is not on the updated list. [https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/](https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/)
- Mazarico, E., Neumann, G. A., Smith, D. E., Zuber, M. T., and Torrence, M. H. (2011). Illumination conditions of the lunar polar regions using LOLA topography. *Icarus*, 211(2), 1066–1081. [https://doi.org/10.1016/j.icarus.2010.10.030](https://doi.org/10.1016/j.icarus.2010.10.030). Prior scientific work on LOLA-based polar illumination and the effect of small height gains above the surface; PGDA product 78 notes that its site numbering follows this paper. Used as literature context, not as a substitute for our engine results.
- NASA Space Apps Challenge 2026. Lunar Landing Site Navigator challenge statement and resources (QuickMap, Moon Trek, Horizons). [https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/)
- Arizona State University / LROC. QuickMap. [https://quickmap.lroc.asu.edu/](https://quickmap.lroc.asu.edu/) (challenge-listed prior tool; not a computational input to this engine).
- NASA / JPL. Moon Trek. [https://trek.nasa.gov/moon/](https://trek.nasa.gov/moon/) (challenge-listed prior tool; not a computational input to this engine).

**Software and libraries used**

- Python, NumPy, rasterio
- TypeScript, Three.js
- Vercel (static hosting): https://siteforge-moon.vercel.app
- JPL Horizons API client access as documented in the repository

**Not cited.** An “Ohio University Lunar Planner” was suggested as prior art. A source of that name could not be verified from public, citable records at the time of writing, so it is omitted rather than invented. If the team later locates a stable citation, it may be added before submission.

---

## 30-second Project Demo script

**Format:** English voiceover, on-screen text, picture of the live SITE//FORGE app. Hard limit: 30.00 seconds. Projects that exceed 30 seconds are not eligible for Global Judging. Target narration is 69 words (~135–145 words/minute, about 28–30 seconds). Do not add unscripted numbers.

If any shot, animation, or voice is Super Intelligence–generated, add a visible watermark such as “SI-generated” and acknowledge it in the video description and metadata. Prefer a screen recording of the real application. Do not use NASA logos.

**Voiceover (read as written)**

Azotadores de Agentes presents SITE//FORGE: Don't find the perfect landing site. Engineer one. At Connecting Ridge, NASA LOLA terrain shows a limit: Ridge A sees Earth for 199 hours from the surface in November 2026. A 10-meter mast raises that to 382 hours. Twenty meters adds nothing. Over 130 configurations, our optimizer recommends a 5-meter mast under a 360-hour outage limit — the minimum infrastructure that improves the site.

**Timed beats**

| Time | On screen | Voiceover | Story beat |
| --- | --- | --- | --- |
| 0:00–0:05 | Title card: team name “Azotadores de Agentes”; challenge name “Lunar Landing Site Navigator”; cut to the real Connecting Ridge terrain in the app. | “Azotadores de Agentes presents SITE//FORGE.” Challenge name stays on screen only. | Open on a real NASA site, not a generic globe. |
| 0:05–0:09 | Product lockup: **SITE//FORGE** and the tagline “Don't find the perfect landing site. Engineer one.” | “SITE//FORGE: Don't find the perfect landing site. Engineer one.” | Name and tagline. |
| 0:09–0:16 | App view of Ridge A at 0 m. Sun and Earth against the terrain horizon. Timeline shows the surface Earth-visibility window. On-screen text: “Ridge A · 0 m · Earth visibility 199 h · Sun 426 h · Nov 2026”. | “At Connecting Ridge, NASA LOLA terrain shows a limit: Ridge A sees Earth for 199 hours from the surface in November 2026.” | Limitation found, with NASA data on screen. |
| 0:16–0:22 | The mast rises to 10 m. Horizon profile drops relative to Earth; the window lengthens. On-screen text: “10 m mast · Earth 382 h”. A brief 20 m tick shows the same 382 h. On-screen text: “20 m · no further gain”. Optional 5 m beat: “5 m · 359.5 h Earth · 100% Sun”. | “A 10-meter mast raises that to 382 hours. Twenty meters adds nothing.” | Infrastructure changes the horizon and the windows; more height is not automatically better. |
| 0:22–0:30 | Optimizer result card: “130 configurations · 17 feasible at a 360 h outage limit · recommended mast: 5 m”. End card: SITE//FORGE tagline and https://siteforge-moon.vercel.app. | “Over 130 configurations, our optimizer recommends a 5-meter mast under a 360-hour outage limit — the minimum infrastructure that improves the site.” | Minimum-infrastructure answer. |

**Production notes**

- Time a table read with a stopwatch before recording. If the take is over 28 seconds, tighten pauses rather than cutting numbers. Keep the challenge name on screen even though it is not spoken.
- Every number on screen must match the live app engine for **Ridge A** (not Point B): Sun 426 h (59.2%) at 0 m and 100% (720/720 h) from 5 m; Earth 199 h at 0 m, 359.5 h at 5 m, 382 h at 10 m and 20 m; simultaneous Sun+Earth 54 h at 0 m; longest joint outage 465 / 391 / 342.5 / 320 / 320 h at 0 / 2 / 5 / 10 / 20 m; 130 configurations, 17 feasible, 5 m recommended, 360 h outage limit. Do not display Point B’s 0 → 297.5 h joint-visibility figures on a Ridge A shot.
- If a Point B visual (horizon or timeline) appears, label it clearly: “Point B, a flat shoulder 290 m from the summit, chosen to show mast effect.” The figure files round 297.5 h to 298 h; prefer 297.5 h in captions if there is room.
- End by 0:29.5, with a short hold, so the file never exceeds 30.00 seconds after encoding.

---

## 3-minute local pitch outline

Judges score every project 1–5 on Impact, Creativity, Validity, Relevance, and Presentation ([2026 Judging and Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/)). This outline is a spoken local pitch, not a substitute for the 30-second submission demo. Keep a live or recorded walkthrough of the app ready, and do not introduce numbers that are not in this package. Never quote Point B hours as if they were Ridge A.

### 0:00–0:25 — Presentation (hook)

“We’re Azotadores de Agentes, and this is SITE//FORGE: Don't find the perfect landing site. Engineer one. The official Lunar Landing Site Navigator challenge asks for a clear way to compare south-pole sites and dates, and to see the Sun and Earth against the horizon. We built that — and then asked a harder question: what is the minimum mast that actually improves the site?”

### 0:25–0:50 — Relevance

“Every window you will see is computed from NASA data. Near terrain is LOLA 5 meters/pixel for Site01 Connecting Ridge. Far terrain, out to 150 kilometers, is the regional LOLA 80-meter map, because at the pole a distant ridge can block a low Sun or Earth. Sun and Earth positions come from JPL Horizons, for two sites in the app, from 1 November to 1 December 2026 — 720 hours. The app compares sites and dates, plots both bodies against the horizon, and reports illumination and Earth-visibility windows. That is the challenge, answered directly.”

### 0:50–1:20 — Impact

“When a landing date slips, planners should not have to start from scratch in three specialist tools. SITE//FORGE is built for that moment: compare the original site and date, try a nearby point, raise a mast, and get a decision, not just a chart. Educators and the public can use the same view to see why south-pole operations are so sensitive to height and location. We are not certifying a mission. We are shortening an honest trade study.”

### 1:20–1:50 — Creativity

“Most landing-site tools stop at ‘this spot gets this much Sun or Earth.’ We treat infrastructure as part of the site. A combined solar-and-communications mast can be moved and raised through 0, 2, 5, 10, and 20 meters, and the engine recalculates the windows. A discrete optimizer then searches 130 configurations. Under a 360-hour outage limit, 17 are feasible, and the recommendation is a 5-meter mast. The creative move is not a taller tower. It is finding the smallest one that meets the constraint.”

### 1:50–2:35 — Validity (show the live result)

Open Ridge A at 0 meters, then 5 meters, then 10 meters, then 20 meters.

“Here is the evidence, not a slide claim. At Ridge A, in November 2026, modeled Earth visibility goes from 199 hours at the surface to 359.5 hours at 5 meters and 382 hours at 10 meters. Twenty meters adds nothing. Sun exposure at the surface is 426 hours — 59.2 percent of the month — and 100 percent from 5 meters, because the mast clears the local horizon in this window. The longest stretch with neither Sun nor Earth falls from 465 hours at the surface to 342.5 hours at 5 meters, which is what lets 5 meters meet the 360-hour outage limit. Visibility is geometric line of sight only — not a radio link budget, and not watts from a solar array. Earth caps near 53 percent of the month because of libration; no mast fixes that. Thirty-five tests pass, and `validation_report.md` documents angular sensitivity. We also checked the Athena IM-2 point on Mons Mouton; it lies outside Site01 coverage, so we did not use it. An independent cross-check at Point B — a flat shoulder 290 meters from the summit, chosen to show the mast effect — goes from zero to 297.5 hours of joint Sun and Earth visibility at 10 meters. That is a different point from Ridge A.”

### 2:35–3:00 — Presentation close

“So the story is simple. A real NASA site. A real limit. A mast that changes the horizon. An optimizer that returns the minimum infrastructure, and a hard stop where more height stops helping. That is SITE//FORGE. I’m happy to take questions, and the public demo is at siteforge-moon.vercel.app.”

---

## Eight likely judge questions

**1. Is 382 hours of Earth visibility the same thing as a working radio link?**
No. It is geometric, disk-center line of sight: Earth’s elevation is above the terrain horizon at that azimuth. It is not a link budget, and it does not include antenna pattern, frequency, or occultation by the lander itself. We label it that way in the product. Earth also caps near 53% of this month because libration takes its center below the astronomical horizon; a taller mast cannot remove that cap.

**2. Are you reporting electrical power?**
No. Solar elevation and illumination windows describe geometric exposure of the Sun. We do not convert that into watts, array efficiency, or battery state.

**3. Why include a 150-kilometer regional map if you already have a 5-meter tile?**
At the south pole the Sun and Earth stay low. A mountain tens of kilometers away can still occupy the horizon. The 5 meters/pixel Site01 tile only covers a few kilometers, so we ray-march the PGDA product 90 regional LOLA DEM out to 150 kilometers and include lunar curvature. Leaving that out would systematically overstate visibility.

**4. Why is the recommended mast 5 meters if 10 meters reaches 382 hours and 20 meters adds nothing?**
Those two results answer different questions. At Ridge A, Earth visibility is 199 hours at 0 meters, 359.5 hours at 5 meters, and 382 hours at 10 meters and at 20 meters. The longest joint Sun+Earth outage falls from 465 hours at the surface to 342.5 hours at 5 meters, which meets the 360-hour outage limit; 10 meters and 20 meters only shorten that outage to 320 hours. From 5 meters up, Sun exposure is already 100% in this window. The optimizer searches 130 configurations under the default constraints, including that 360-hour limit; 17 are feasible, and it recommends the 5-meter mast at Ridge A as the minimum infrastructure. More height is not automatically better.

**5. Did you validate against NASA’s published south-pole illumination maps?**
What we can stand behind today is this: `validation_report.md` documents angular sensitivity of the method, and 35 automated tests (29 Python, 6 Node) pass. An independent cross-check at Point B — a flat shoulder 290 m from the summit, chosen to show the mast effect, and not the app’s Ridge A — finds joint Sun+Earth visibility rising from 0 hours at the surface to 297.5 hours at 10 meters, using the same LOLA and Horizons inputs. A direct, quantitative match to published PGDA/LOLA illumination maps is not claimed in this submission. If that comparison is completed and documented before we submit, we will add it; we will not describe it as done until it is.

**6. Why didn’t you use the IM-2 / Athena landing site? That would have been a powerful story.**
We checked. The Athena IM-2 landing point on Mons Mouton lies outside the Site01 Connecting Ridge 5 meters/pixel coverage we used, so we did not build the hero case around it. Using it would have required inventing local high-resolution terrain we did not have.

**7. Connecting Ridge was dropped from the later Artemis III candidate list. Does that weaken the work?**
Connecting Ridge was one of the 13 candidate Artemis III regions NASA announced in 2022. NASA’s October 2024 update refined that list to nine regions, and Connecting Ridge is not on the updated list. We still use Site01 because it is a real, published LOLA 5 meters/pixel product over a scientifically important south-pole ridge, and because the method is not limited to a single program’s current shortlist. We do not claim it is a current Artemis III landing region.

**8. What happens if Horizons or another API is down during judging?**
The public app at https://siteforge-moon.vercel.app is a static site that reads precomputed engine output. Horizons and the DEM processing already ran offline. Judges do not need a live ephemeris call for the demo to work, and we do not substitute fictional numbers if a calculation was not completed.

---

## Unverified or still open (do not paste unconfirmed claims into the form)

Mark these clearly so the team does not over-claim.

- **The repository** at https://github.com/MatiasBoldrini/Azotadores-de-agentes- must be **public** before Submit for Judging. A private repository cannot be judged. Confirm this in a logged-out browser.
- **The 30-second demo video** may not be published yet. Until it is, use the live app or the seven-slide deck as the Project Demo link, and replace it if a video URL becomes available.
- **Ohio University Lunar Planner** could not be verified as a citable prior-art source and is not referenced above.
- **A completed comparison against published NASA/PGDA illumination maps** is not claimed. Only angular-sensitivity documentation, the passing tests, and the labeled Point B cross-check are.
- **Voice / “mission control” briefing** is not described as a shipped feature in this package because it was not in the verified build facts used here.
- **Local Event name, team-member names for the spoken intro, and whether the team is in a Local Event or the Universal Event** are not filled in.
- Official confirmation checkboxes, which a human must tick on the site, are:
  - “I have read and understand the project submission requirements as contained in the NASA Space Apps Project Submission Guide, and I agree to the Participant Terms and Conditions and Privacy Policy.”
  - “I confirm that the submitted project represents my team’s original work and that all external resources including code, text and images (even if they are open source or freely available) used in the project are listed in the References field of the project submission form. In creating our solution, my team has not used any copyrighted materials (i.e., music, images, text, etc.) that we don’t have permission to use.”
- Demo and final-project materials may not include images, video, audio, or other likenesses of persons under 18, per the official Terms and Conditions.
- If a new website hosts the demo, the guide recommends submitting a FortiGuard Web Filter Classification request so judges are less likely to be blocked, with Company Name “N/A”.
- Do not submit the project without an explicit yes from Steven.

---

## Word count check (High-Level Project Summary)

The High-Level Project Summary above is 146 words, under the 150-word target used for this draft. Re-count after any edit before pasting it into the form.
