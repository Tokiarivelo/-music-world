# Reference images wanted for realism

The agent environment can only reach hosts its network policy allows (now: ambientCG, Poly Haven). Anything else has
to be fetched by a human. Put downloads in a new folder (for example `docs/reference/`, not committed) and say where
they are. Only CC0 / public domain images can be used in the repository; other photos are for looking at only.

## Where to search

Poly Haven (CC0): https://polyhaven.com · ambientCG (CC0): https://ambientcg.com · Pexels / Unsplash photos (free
licence, look only) · Wikimedia Commons (check the licence).

## Keywords per object

| Object | Search keywords (English) | What to keep |
|---|---|---|
| Tree | `oak tree photo`, `deciduous tree silhouette summer`, `tree trunk bark roots flare`, `tree crown leaves clusters` | whole tree from the side, trunk close-up, one leaf cluster |
| Conifer | `spruce tree photo`, `fir tree drooping branches`, `norway spruce silhouette`, `pine needles close up` | whole tree, branch tier close-up |
| Bush | `boxwood shrub`, `hedge bush green close up`, `shrub leaves texture` | clump shape and leaf color |
| Cloud | `cumulus clouds blue sky`, `cumulus humilis`, `stratocumulus sky`, `storm clouds cumulonimbus`, `anvil cloud` | side views with a flat base and a bright top |
| Car | `sedan car side view blueprint`, `car side profile orthographic`, `hatchback front view`, `car wheel alloy rim close up`, `car headlight close up` | front, side and rear orthographic views |
| Airplane | `light aircraft top view`, `Cessna 172 three view blueprint`, `small propeller airplane side view`, `airliner side view` | top, side, front |
| Bicycle | `city bicycle side view`, `bicycle frame geometry diagram`, `bicycle spokes wheel close up` | side view and wheel detail |
| Bird | `bird in flight silhouette wings up`, `seagull flight`, `swallow flight pose`, `flock of birds sky` | wing-up and wing-down poses, side and top |
| Sun and moon | `sun glare sky photo`, `sun rays through clouds`, `full moon clear sky` | disc and glow shape |
| Rain and storm | `rain streaks long exposure`, `heavy rain street night`, `lightning bolt photo`, `forked lightning`, `shelf cloud storm` | bolt shape, streak length and angle |
| Ground and hills | `grassland horizon photo`, `rolling hills mist`, `distant mountains haze layers`, `dry steppe landscape` | horizon line and haze |
| Aurora | `aurora borealis curtains photo`, `northern lights over snowy mountain` | curtain shape and colors (the reference photo of this request is one) |

## Poly Haven assets already used or good candidates

Skies (used, see `apps/web/public/sky/LICENSE.md`): `kloofendal_43d_clear_puresky`, `kloofendal_48d_partly_cloudy_puresky`,
`kloofendal_overcast_puresky`, `kloppenheim_01_puresky`, `qwantani_sunset_puresky`, `qwantani_night_puresky`,
`kloppenheim_07_puresky`. Candidates for more skies: `wasteland_clouds_puresky`, `table_mountain_1_puresky`,
`qwantani_dusk_1_puresky`, `syferfontein_1d_clear_puresky`, `snow_field_puresky`.
Candidates for models and textures (decimate before use, they are photogrammetry): `shrub_03`, `shrub_02`,
`fir_sapling`, `pine_sapling_small`, `jacaranda_tree`, `rock_07`, `rock_09`, `stone_01`; ambientCG `Bark014`, `Bark012`,
`Leaf001`, `Grass004`, `Rock064`, `Metal049A`, `PaintedMetal002`.

## Downloaded References Location

All reference images have been downloaded into the local non-committed folder `docs/reference/`:
- **Location:** `docs/reference/` (git-ignored via `.gitignore`)
- **Total assets:** 96 images (28.8 MB)
  - `01_tree/` (7 images: oak whole tree, silhouette, roots flare, crown clusters, Jacaranda CC0 render, Bark012/014 CC0 textures)
  - `02_conifer/` (6 images: Norway spruce whole tree, drooping branches, silhouette, needles, fir & pine sapling CC0 renders)
  - `03_bush/` (5 images: boxwood clump, hedge foliage, leaf texture, shrub_02/03 CC0 renders, Leaf001 CC0 texture)
  - `04_cloud/` (5 images: cumulus flat base, cumulus humilis, stratocumulus, cumulonimbus anvil, wasteland clouds pure sky)
  - `05_car/` (7 images: technical blueprint, sedan profile, hatchback front, alloy rim, headlight, Metal049A & PaintedMetal002 textures)
  - `06_airplane/` (14 images: Cessna 172 3-view, Piper Cherokee 3-view, A320 3-view, Concorde 3-view, Boeing 737 front orthographic, Cessna 172 front photo, Cirrus SR22 flight, light aircraft top, propeller plane side, airliner profile, A380 widebody, DHC-2 Beaver seaplane, Beech staggerwing biplane, propeller blade detail)
  - `07_bicycle/` (4 images: city bicycle side view, frame geometry diagram, wheel spokes and hub)
  - `08_bird/` (4 images: seagull wings-up, gull gliding wings-down, swallow flight, flock silhouette)
  - `09_sun_moon/` (5 images: sun rays crepuscular, full moon disc, crescent moon earthshine, Qwantani dusk & Syferfontein clear skies)
  - `10_rain_storm/` (5 images: forked lightning, cloud branch discharges, shelf cloud, rain streaks under lamp, downpour curtain)
  - `11_ground_hills/` (10 images: grassland horizon, rolling hills mist, distant mountains haze, Table Mountain & Snow Field skies, rock_07/09 & stone_01 models, Grass004 & Rock064 textures)
  - `12_aurora/` (4 images: green curtains, snowy mountain backdrop, green ribbon over snow, auroral corona)
  - `13_polyhaven_ambientcg/` (20 assets: all listed Poly Haven 3D models/skies and ambientCG PBR textures)
- **Catalog & License manifest:** See `docs/reference/README.md` and `docs/reference/metadata.json` for per-image licensing and source links.
