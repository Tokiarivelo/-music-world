# I32 — Nemo Reef underwater mode

- New template field `fx.environment` (`land` default, `underwater`). Underwater: the environment view draws a water column
  (bright surface light above, deep blue at the horizon, slow light shafts), a sandy seabed, low rounded dunes, denser fog
  and 260 rising bubbles (one extra draw call). No sky, sun, clouds, birds or rain (weather view hidden); the dome
  landscapes are ignored. View only: `worldStateAt` is untouched; light shafts and bubbles freeze with reduced motion.
- Limits raised: 28 recipes, 40 scenery items per template (the director stays held to 4 recipes).
- Nemo Reef gains flora (kelp, seagrass, staghorn coral, brain coral, tube sponge, sea urchin) and fauna (manta ray,
  pufferfish, fish school, dolphin): 26 recipes, 31 kinds on the plate before the first note. Land-like kinds
  (ridge, building, crystal, cluster, spike) stay but are rarer and no longer spawn from notes.
