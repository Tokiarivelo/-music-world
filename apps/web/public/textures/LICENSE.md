# Detail textures

Tileable 256 x 256 maps derived (grayscale detail from the color map, normal map, roughness map; resized and
re-encoded) from **ambientCG** materials, all **CC0 1.0** (public domain, https://docs.ambientcg.com/license/).

| Files | Source material | Used for |
|---|---|---|
| `bark-*` | [Bark014](https://ambientcg.com/a/Bark014) | trees, conifers |
| `foliage-*` | [Leaf001](https://ambientcg.com/a/Leaf001) | bushes, canopy detail |
| `paint-*` | [Metal049A](https://ambientcg.com/a/Metal049A) | cars, bicycles |
| `metal-*` | [Metal064](https://ambientcg.com/a/Metal064) | airplanes |
| `rock-*` | [Rock064](https://ambientcg.com/a/Rock064) | clusters, crystals, recipes |

`-detail` multiplies the vertex and instance colors (so templates keep control of the hue), `-normal` adds relief and
`-rough` modulates the surface roughness (see `src/xr/shapes/polished-materials.ts`).
