# MUSIC WORLD — Générateur d'univers 3D pilotés par la musique

> **Vision :** transformer un morceau audio en un univers 3D vivant, explorable sur le web et en réalité virtuelle (Meta Quest), construit progressivement à partir des notes, des accords, du rythme, des paroles et de l'ambiance — selon des **templates** que la communauté peut publier dans un store.

> **Contexte :** projet développé avec **Kiro** pour le hackathon **Kiroween 2026** (catégorie visée : **Frankenstein**).
> Soumission avant le **4 décembre 2026, 14:00 PT**. Les documents Kiro (`.kiro/`) sont en anglais, comme l'exigent les règles.

Dernière mise à jour : 26 novembre 2026.

---

## 1. Vision du produit

Le projet n'est pas un visualiseur audio à barres. C'est un **générateur d'univers 3D piloté par la musique** :

1. L'utilisateur importe un fichier audio (MP3, WAV, FLAC).
2. Le backend analyse le morceau : notes, accords, tempo, tonalité, énergie, sections, paroles.
3. Un LLM (Meta Muse) interprète l'ambiance et les thèmes des paroles, et propose un **template de monde**.
4. L'utilisateur choisit ce template, un template du **store**, ou le template par défaut.
5. Pendant la lecture, les notes défilent sur une portée lumineuse, tombent sur le terrain et construisent le monde.
6. L'utilisateur explore le monde à la souris ou **en immersion dans un Meta Quest** (WebXR).

**Principe central : la musique devient un monde que l'on peut observer, explorer et partager.**

---

## 2. Direction artistique — design par défaut

Le fichier `assets/reference-image-original.png` est la référence du **template par défaut `neon-nocturne`**. Tant qu'aucun autre template n'est choisi, le rendu doit reprendre fidèlement cette image : disposition, couleurs et notes.

### Composition (fidèle à l'image)

- **Caméra isométrique** au-dessus d'une plaque de terrain carrée, sombre, craquelée (fissures légèrement lumineuses).
- **Petites montagnes** basses sur les bords de la plaque.
- **Portée musicale** : 5 lignes lumineuses blanc-cyan qui traversent la plaque **en diagonale**, avec une légère courbe. Une **clé de sol** au début et une à la fin.
- **Notes** : glyphes blancs lumineux (noires, croches, doubles croches liées) posés sur la portée, avec un halo.
- **Ville** : côté gauche de la plaque, des immeubles éclairés et des **pics verticaux type égaliseur**, en dégradé **violet → magenta → cyan**. Ce sont les notes qui les font naître.
- **Arcs de lumière** courbes qui entourent la portée, et **particules** lumineuses qui flottent.
- **Fond** noir bleuté, bloom maîtrisé.

### Palette par défaut

| Rôle | Couleur |
|---|---|
| Fond | `#07051a` |
| Terrain | `#1a1533` |
| Primaire (violet) | `#b04cff` |
| Accent (magenta) | `#ff4fd8` |
| Secondaire (cyan) | `#22d3ee` |
| Portée et notes | `#e8f7ff` |

### Personnalisation

Tout est réglable par template : palette, style du terrain, tracé et style de la portée, formes générées, effets.
Trois modes de palette :
- **Automatique** : palette tirée de l'ambiance détectée.
- **Aléatoire** : palette harmonisée, avec une `seed` pour retrouver le même résultat.
- **Personnalisée** : choisie par l'utilisateur.

Les notes et leur disposition restent celles de l'image tant que le template ne les change pas.

**Rendu des notes :** police musicale **Bravura** (SMuFL, licence OFL) : les contours des glyphes sont extraits de la police (`scripts/extract_bravura_glyphs.py`) et affichés en géométrie instanciée. C'est net en VR et peu coûteux.

---

## 3. Architecture

### Pipeline

```text
Audio (MP3 / WAV / FLAC)
   │  upload
   ▼
API FastAPI (OVHcloud) ──► file de tâches Redis ──► Worker d'analyse (Python)
                                                     ├─ Demucs      : séparation voix / instruments
                                                     ├─ Basic Pitch : notes (MIDI)
                                                     ├─ librosa     : tempo, battements, tonalité, énergie, sections
                                                     ├─ accords     : déduits des notes (règles)
                                                     └─ Muse Voice Transcribe : paroles (sur la piste voix)
   ▼
AnalysisResult (JSON versionné)
   ▼
AI World Director — Muse Spark 1.3 ou Claude via Bedrock (une seule fois, avant la lecture)
   résumé musical + paroles ─► WorldTemplate JSON (validé par schéma)
   ▼
Next.js + IWSDK (navigateur / Meta Quest)
   horloge audio ─► worldState(t) ─► systèmes ECS ─► Three.js / WebXR
```

### Règles d'architecture (non négociables)

1. **Les algorithmes trouvent les notes ; le LLM interprète.** Aucun LLM ne détecte les notes : ils n'en sont pas capables avec précision. Le LLM reçoit un **résumé textuel** de l'analyse.
2. **Le LLM ne produit que des données** (JSON validé par schéma), jamais du code exécuté. C'est vrai aussi pour la 3D (voir § 6).
3. **Le LLM ne participe pas à la boucle de lecture.** Il est appelé avant la lecture, et le résultat est mis en cache.
4. **L'horloge audio est la seule référence de temps** (`AudioContext.currentTime`). Jamais `setTimeout` pour synchroniser.
5. **Le monde est une fonction pure du temps :** `worldState(t) = f(événements, template, seed, t)`. Ça rend possibles le seek, le retour en arrière, le « voyage dans le temps » et la reproductibilité.
6. **Les templates sont des données**, jamais du code. Un template publié ne peut rien exécuter chez un autre utilisateur.

---

## 4. Stack technique

### Frontend — `apps/web`

| Technologie | Rôle |
|---|---|
| **Next.js** (App Router) + React + TypeScript | Pages, store, upload, éditeur, lecteur |
| **IWSDK** (`@iwsdk/core`) | Monde 3D : ECS, Three.js, session WebXR, entrées XR |
| **IWER** (`iwer`) | Émulation d'un Meta Quest 3 dans le navigateur en développement |
| Three.js | Géométries, `InstancedMesh`, matériaux, post-traitement |
| Web Audio API | Lecture et horloge |
| Zustand | État de l'interface 2D |
| zod | Validation des templates et des résultats d'analyse côté client |
| Vitest + fast-check | Tests unitaires et tests basés sur les propriétés |

**Points importants pour IWSDK + Next.js** (vérifiés dans la documentation officielle IWSDK v0.5.3) :
- La documentation officielle ne décrit **que Vite**. Le module `virtual:iwsdk-project`, l'injection automatique d'IWER, le HTTPS géré et l'éditeur de scène viennent du plugin Vite. **Ils ne sont pas disponibles sous Next.js.**
- Solution retenue :
  - le monde est chargé dans un composant client (`dynamic(..., { ssr: false })`) ;
  - les options sont passées en code à `World.create(container, { xr: … })` ;
  - IWER est installé à la main en développement (`new XRDevice(metaQuest3).installRuntime()` **avant** `World.create`) ;
  - le HTTPS local passe par `next dev --experimental-https`.
- **Pas de React Three Fiber.** IWSDK gère lui-même le renderer et la boucle ; React ne gère que l'interface 2D.
- Physique Havok et locomotion en worker désactivées au départ (risque avec le bundler de Next.js).
- **Solution de repli** si l'intégration casse : application IWSDK séparée sous Vite, servie sur `/world`.

### Backend — `apps/api` (Python)

| Technologie | Rôle | Licence |
|---|---|---|
| FastAPI | API REST | MIT |
| Worker (arq ou RQ) + Redis | Analyses longues en tâche de fond | MIT / BSD |
| **Spotify Basic Pitch** | Audio → notes (MIDI) | Apache-2.0 |
| **librosa** | Tempo, battements, chroma, tonalité, énergie, segmentation | ISC |
| **Demucs** (htdemucs) | Séparation voix / batterie / basse / autres | MIT |
| pretty_midi | Manipulation MIDI, regroupement en accords | MIT |
| pydantic | Schémas, source de vérité exportée en JSON Schema | MIT |
| Hypothesis | Tests basés sur les propriétés côté Python | MPL-2.0 |
| PostgreSQL | Projets, analyses, templates, utilisateurs | — |
| Object Storage S3 (OVHcloud) | Audio, pistes séparées, assets de templates | — |

**Exclu :** Essentia (AGPLv3, incompatible avec un dépôt sous licence MIT).

### Hébergement — OVHcloud (MVP minimal)

- **Une seule machine** (VPS ou instance Public Cloud, CPU uniquement, idéalement ≥ 8 vCPU et 16 à 32 Go de RAM), en **Docker Compose** :
  - `web` (Next.js), `api` (FastAPI), `worker`, `postgres`, `redis` ;
  - `caddy` en reverse proxy avec **HTTPS Let's Encrypt** (indispensable : WebXR ne fonctionne qu'en HTTPS sur le Quest).
- **OVHcloud Object Storage** (compatible S3) pour les fichiers.
- Demucs sur CPU prend plusieurs minutes par morceau. Pour le MVP : **morceaux limités à 3 minutes**, analyse asynchrone avec barre de progression, et un **morceau de démo pré-analysé** en cache pour que les jurés voient le résultat immédiatement.
- Le service doit rester en ligne jusqu'à la fin du jugement (**29 janvier 2027**).

---

## 5. Les modèles IA (Meta Model API — Muse)

API compatible OpenAI, `https://api.meta.ai/v1`, clé dans `META_API_KEY` (côté serveur uniquement, jamais exposée au navigateur). L'API est en **préversion publique** : vérifier les identifiants et formats dans la documentation Meta avant de coder.

| Besoin | Modèle | Comment | Statut |
|---|---|---|---|
| **Paroles** | `muse-voice-transcribe-1.0` | Transcrit la **piste voix isolée par Demucs**, avec horodatage par segment | ⚠️ Conçu pour la parole : qualité sur le chant **à tester le jour 1** |
| **Interprétation musicale** (ambiance, thèmes, narration) | `muse-spark-1.3-contributor` | Reçoit un **résumé texte** : tonalité, tempo, progression d'accords, courbe d'énergie, sections, tessiture, paroles. Renvoie un `WorldTemplate` en JSON structuré. | ✅ Rôle principal |
| **Écoute directe d'un extrait** (optionnel) | `muse-spark-1.3-contributor` avec entrée audio | Extrait de 30 s joint, seulement comme **indice d'ambiance** | ⚠️ Support audio de Spark 1.3 annoncé comme incomplet : expérimental |
| **Formes 3D sur mesure** (§ 6) | `muse-wonder-1.0` (ou Spark 1.3 si le coût est trop élevé) | Produit une **recette de forme** dans un langage fermé, jamais du code | ✅ Optionnel pour le MVP |
| **Textures / ciel** (optionnel) | `muse-image-1.0` | Texture de fond ou motif émissif d'un template | Extension |
| **Repli hors ligne** (futur) | Muse Glimmer (poids ouverts, Apache-2.0) | Auto-hébergé sur un GPU OVHcloud | Après le hackathon |

### Choix du fournisseur : Muse ou Claude (Bedrock)

Le directeur artistique passe par une interface `LLMProvider`. On change de fournisseur dans l'interface (sélecteur) ou par défaut avec `LLM_PROVIDER` :

| `LLM_PROVIDER` | Service | Remarque |
|---|---|---|
| `muse` (défaut) | Meta Model API | Muse Spark / Wonder |
| `bedrock` | **Amazon Bedrock — modèles Claude** | La même famille de modèles que celle utilisée par Kiro dans l'IDE |
| `mock` | Règles déterministes | Sans clé, toujours disponible en secours |

**Pourquoi pas « le modèle de Kiro » directement :**
- Kiro est l'outil de **développement**. Ses modèles servent à l'agent de l'IDE, et les crédits Kiro ne paient que cet usage.
- À notre connaissance, Kiro ne fournit pas d'API d'inférence pour une application en production.
- Pour utiliser Claude dans l'application, on passe donc par **Amazon Bedrock** (AWS, le sponsor de Kiroween).

**Fonctionnement commun :**
- Mêmes prompts, même validation de schéma et même cache pour les deux fournisseurs. La clé de cache est (hash audio, fournisseur, modèle, version du prompt).
- Chaîne de secours : fournisseur choisi → l'autre fournisseur s'il est configuré → mock.
- L'interface indique quel fournisseur a produit le template. L'utilisateur peut régénérer avec l'autre pour comparer.

**Paroles :** `LYRICS_PROVIDER = muse | lrc | none`.

**Implémentation (05-ai-world-director) :** prompts neutres versionnés (`PROMPT_VERSION = director-v2`), Muse Spark
par l'API compatible OpenAI (`/chat/completions`), Claude par **Claude in Amazon Bedrock** (`bedrock-mantle`, modèles
`anthropic.claude-sonnet-5-5` pour le directeur, `anthropic.claude-opus-5-5` pour les formes). Sortie : nettoyage,
bornage des nombres, validation pydantic, règles de rendu ; une seconde tentative avec les erreurs, puis le
fournisseur suivant. Détails : `.kiro/specs/05-ai-world-director/design.md`.

**Ce que les LLM ne font pas ici :** détecter les notes, les accords, le tempo ou la tonalité. Ce travail revient à Basic Pitch et librosa, qui sont précis et déterministes.

**Données des utilisateurs (décision du 2026-11-24) :** le director utilise par défaut `muse-spark-1.3-contributor` (moins cher ; Meta peut entraîner ses modèles sur les entrées : résumé texte de la chanson et paroles, jamais le fichier audio). La page d'envoi en avertit l'utilisateur. `META_DIRECTOR_MODEL=muse-spark-1.3-contributor` désactive ce choix.

**Garde-fous :**
- plafond de dépense par analyse ;
- résultats mis en cache par empreinte (hash audio + version du prompt) ;
- **mode `mock` déterministe** si la clé est absente ou si l'API échoue : la démo fonctionne toujours.

---

## 6. Génération 3D

### Principe : le LLM décrit, le code construit

Un LLM ne produit pas de bons maillages (des listes de sommets en texte sont imprécises). Il produit une **recette** dans un langage fermé, validée par schéma, puis un constructeur déterministe en Three.js la transforme en géométrie.

```jsonc
// ShapeRecipe — exemple : « tour de cristal »
{
  "schema": "music-world.shape.v1",
  "name": "crystal_tower",
  "parts": [
    { "op": "prism", "sides": 6, "radius": 0.4, "height": 3.0, "taper": 0.6 },
    { "op": "cluster", "of": "prism", "count": 5, "spread": 0.8, "seedOffset": 3 },
    { "op": "emissive_bands", "count": 4, "colorRole": "accent" }
  ],
  "budget": { "maxTriangles": 2000 }
}
```

- Opérations disponibles (liste fermée) : `box`, `prism`, `spike` (pic d'égaliseur), `stack` (étages) et `cluster` (05-ai-world-director, tâche 6). Réservées, non implémentées : `lathe`, `extrude`, `lsystem_tree`, `arch`, `emissive_bands`.
- Budget : `budget.maxTriangles` ≤ 2000 (défaut 500), vérifié avant construction par `ShapeRecipe.triangle_count` (Python) et par le builder web ; au plus 16 recettes par template (4 pour un template généré par le directeur IA), référencées par `recipe:<name>`.
- Chaque recette est construite une seule fois, puis réutilisée en **`InstancedMesh`** pour toutes les notes qui la déclenchent.
- Les couleurs viennent de **rôles** de la palette (`primary`, `accent`…), pas de valeurs fixes : la forme suit le template.

### Mapping notes → monde (template par défaut)

| Donnée musicale | Effet |
|---|---|
| Hauteur grave (< Do3) | Relief du terrain, montagnes |
| Hauteur médium | Immeubles de la ville |
| Hauteur aiguë (> Do5) | Pics verticaux « égaliseur », particules |
| Vélocité | Hauteur et luminosité |
| Durée | Durée de construction, persistance |
| Accord | Groupe de structures reliées par un arc lumineux |
| Kick / temps fort | Impulsion lumineuse dans les fissures du terrain |
| Section (couplet / refrain) | Changement d'intensité du bloom et des particules |
| Paroles | Thèmes → choix de formes et de palette par le LLM ; texte flottant (option) |

Ces correspondances sont des **choix artistiques**, définis par le template et modifiables.

### Cycle d'une note

1. La note apparaît au bout de la portée, `lookahead` secondes avant son attaque.
2. Elle glisse le long de la portée jusqu'à la **tête de lecture**.
3. À l'instant de l'attaque, elle **tombe** vers son point d'impact sur le terrain.
4. La structure **pousse** (durée liée à la durée de la note), puis continue de réagir à la musique.

Tout est calculé à partir de `t`. Avec un seek, la note est simplement à l'endroit où elle doit être à cet instant.

---

## 7. Immersion Meta Quest (WebXR via IWSDK)

- **Bouton « Entrer en VR »** sur la page de lecture. La session est `immersive-vr` avec `local-floor`.
- **En VR :** la plaque du monde est posée devant l'utilisateur comme une **maquette sur une table** (échelle ≈ 1,5 m), et l'utilisateur tourne autour. Un mode « à l'échelle » pour marcher dans la ville viendra plus tard.
- Panneau spatial (UIKitML) : lecture / pause, timeline, choix du template.
- Entrées : contrôleurs et mains (pincement). Seuil de pincement ≈ 0,7–0,8.
- **Budget de performance Quest :** < 100 draw calls, tout en `InstancedMesh`, textures compressées, 72 Hz minimum (demander 90 Hz si le budget le permet).
- **Navigation bureau / mobile (hors VR) :** vue cinématique par défaut ; mode « Explorer » (touche `N`) : orbite, déplacement, zoom, vol au clavier, vues prédéfinies (Vue d'ensemble, Portée, Ville, Dessus) et réinitialisation. Ne touche ni l'horloge audio ni `worldStateAt` ; désactivé pendant une session VR.
- **Développement sans casque :** IWER émule un Meta Quest 3 dans le navigateur.
- **Test sur casque :** URL HTTPS du serveur de développement ou de l'instance OVHcloud.

---

## 8. Store de templates

Chaque utilisateur peut publier des templates que les autres utilisent pendant la lecture pour construire leur monde.

### Contenu d'un template

```jsonc
// Contrat `music-world.template.v1` — source : apps/api/music_world/schemas/template.py
{
  "schema": "music-world.template.v1",
  "id": "neon-nocturne", "name": "Neon Nocturne", "license": "CC-BY-4.0",
  "palette": { "background": "#07051a", "terrain": "#1a1533", "primary": "#b04cff", "accent": "#ff4fd8", "secondary": "#22d3ee", "staff": "#e8f7ff" },
  "terrain": { "style": "cracked_plate", "mountains": "edges", "size": 12 },
  "staff":   { "style": "glowing_lines", "path": "diagonal_curve", "clef": "treble", "glow": 1.2, "lookahead": 4.0, "fallDuration": 0.35 },
  "mappings": [                                   // évaluées dans l'ordre, la première qui correspond gagne
    { "when": { "pitch": "<48" },   "spawn": "terrain_ridge" },
    { "when": { "pitch": "48-72" }, "spawn": "building", "heightFrom": "velocity" },
    { "when": { "pitch": ">72" },   "spawn": "spike" },
    { "when": {},                   "spawn": "building" }   // filet de sécurité
  ],
  "zones": [ { "kind": "building", "xMin": -0.95, "xMax": -0.1, "zMin": -0.95, "zMax": 0.3 } ],  // plaque normalisée [-1, 1]
  "budget": { "instancesPerKind": 2000 },
  "fx": { "particles": "arcs", "bloom": 0.8, "beatPulse": true, "chordLinks": "light_arc" }
}
```

- Conditions `when` (toutes optionnelles, combinées en ET) : `pitch` et `velocity` (`<a`, `>a` stricts, `a-b` inclusif),
  `chord` (booléen), `stem`. `spawn` : `terrain_ridge | building | spike | crystal | cluster | recipe:<nom>`.
- Les accords sont toujours reliés par un arc lumineux (`fx.chordLinks`), indépendamment des mappings.
- **Décor** (`scenery`, ≤ 24 entrées `{kind, count ≤ 60}`, ≤ 400 objets au total) : des objets déjà posés sur la plaque à t = 0, sans note, entièrement développés. Leur position vient de la graine du monde, dans les zones de leur `kind` : une autre graine réorganise toute la scène. Ils partagent le budget `instancesPerKind` de leur `kind` ; `spawnedCount` ne les compte pas. Chaque Play depuis le début (premier Play, ou Play après la fin) tire une nouvelle graine (`usePlaySeed`) : décor et notes sont réorganisés à chaque lecture ; pause et reprise gardent la graine. Une recette règle son échelle avec `footprint` (0,1–1,5 m, défaut 0,25) et `heightScale` (0,1–2, défaut 1) pour être large et basse (tortue, épave) ou fine et haute. Exemple : `nemo-reef` (16 recettes + 5 formes natives, 116 objets).

### Règles

- **Validation côté serveur** (pydantic) et côté client (zod), avec des schémas générés depuis une source unique.
- Uniquement des données : **pas de JS, pas d'URL externes**. Les assets sont des recettes (§ 6) ou des GLB vérifiés par gltf-validator, avec un budget de triangles.
- Taille maximale, licence obligatoire (choix parmi une liste), aperçu (capture générée).
- Publication : brouillon → publié. Signalement possible.
- Un template généré par le LLM peut être modifié puis publié dans le store.
- **Éditeur** (`/editor?from=<id>`) : on travaille sur une copie ; palette, terrain, portée, effets, règles de notes et zones,
  avec les bornes du schéma comme `min` / `max`, validation zod + règles du store à chaque changement, aperçu en direct
  (dernier template valide, 300 ms) sur la chanson de démo ou `?project=<id>`. Brouillon : `POST` puis `PUT
  /api/templates/{id}` (propriétaire, brouillon seulement, 409 sinon) ; publication avec vignette. Les recettes de formes
  sont modifiables (section « Formes » : pièces, empreinte, échelle de hauteur, budget de triangles ; renommer ou
  supprimer une recette réécrit ses références).
- Comptes : authentification simple (e-mail + lien magique, ou OAuth GitHub).
- Templates de lancement : `neon-nocturne` (par défaut, fidèle à l'image) et un template d'Halloween pour le thème Kiroween.

---

## 9. Contrats de données

Source de vérité : modèles pydantic dans `apps/api/music_world/schemas/`, enregistrés dans `EXPORTED`.
`make schemas` produit `packages/schemas/*.schema.json` puis les types TS + validateurs zod dans
`apps/web/src/templates/generated/`. Schémas exportés : `music-world.analysis.v1`, `music-world.director-providers.v1`,
`music-world.director-result.v1`, `music-world.health.v1`, `music-world.job.v1`,
`music-world.job-accepted.v1`, `music-world.moderation-queue.v1`, `music-world.project.v1`, `music-world.project-created.v1`, `music-world.session.v1`,
`music-world.store-template.v1`, `music-world.store-template-page.v1`, `music-world.template.v1`.

`POST /api/projects` (multipart `audio` + `lyrics` .lrc optionnel) répond `202` avec `ProjectCreated`
(`projectId`, `jobId` nul si l'analyse du même SHA-256 est déjà en cache, `status`). `GET /api/projects/{id}` renvoie
`Project` (`status` : `analyzing | ready | failed`, job d'analyse). `GET /api/projects/{id}/analysis` renvoie l'`AnalysisResult`
(409 `ANALYSIS_NOT_READY` pendant l'analyse ; le `.lrc` de l'utilisateur remplace les paroles transcrites) et
`GET /api/projects/{id}/audio` le fichier audio pour la lecture.

Directeur IA : `GET /api/director/providers` renvoie `DirectorProviders` (`default`, `providers[]` avec `configured`).
`POST /api/projects/{id}/director` (`{provider?}`) et `POST /api/director/demo` (`{analysis, provider?}`, analyse du
morceau de démo uniquement) renvoient `DirectorResult` : `template`, `provider`, `model`, `requestedProvider`, `cached`,
`fallbacks[]` (`{provider, reason}`). Le template gagne un champ optionnel `meta.generatedBy = {provider, model,
promptVersion}` (ajout compatible, le schéma reste v1), toujours écrit par le serveur, jamais par le modèle.

Comptes (`06-template-store`) : `POST /api/auth/magic-link` (`{email}`, toujours `202`), `POST /api/auth/verify`
(`{token}`, pose les cookies `mw_session` httpOnly et `mw_csrf`), `GET /api/auth/session` et `POST /api/auth/logout`
renvoient ou terminent la `Session` (`user` : `{id, email, displayName}` ou nul). Les requêtes POST/PUT/DELETE avec
session renvoient le cookie `mw_csrf` dans l'en-tête `X-CSRF-Token`. Un projet envoyé connecté appartient à son
auteur : toute autre personne reçoit `404` sur le projet, son audio, son analyse et le directeur.

Store : `POST /api/templates` (`{template, publish}`, connecté) valide le template (`music-world.template.v1` + règles
du store : ≤ 32 Ko, formes intégrées uniquement, portée lisible, nom en texte brut) et renvoie `StoreTemplate`
(`id` UUID, `template` dont l'`id` reçoit un suffixe unique, `status` `draft | published | hidden`, `author.displayName`,
`featured`, `thumbnailUrl`, `createdAt`, `publishedAt`). `POST /api/templates/{id}/publish`, `PUT|GET
/api/templates/{id}/thumbnail` (PNG/JPEG/WebP ≤ 128 Ko, ≤ 640 px) et `DELETE /api/templates/{id}` : propriétaire seul,
`404` sinon. `GET /api/templates` (public, `?cursor=&limit=`) renvoie `StoreTemplatePage` (`items`, `nextCursor`) ;
`GET /api/templates/mine` les templates de l'appelant. `POST /api/templates/{id}/reports` (`{reason}` parmi
`offensive | spam | broken | copyright`, connecté) : un signalement par personne et par template ; au seuil
`TEMPLATE_REPORT_HIDE_THRESHOLD` le template passe `hidden` (retiré de la galerie, visible de son auteur).
Modération (`10-template-moderation`) : `MODERATOR_EMAILS` (liste d'e-mails séparés par des virgules, vide par défaut)
désigne les modérateurs ; `GET /api/auth/session` ajoute `moderator: true` pour eux seuls. `GET
/api/moderation/templates` (`ModerationQueue` : templates `hidden`, dernier signalement d'abord, motifs, `nextCursor`),
`POST /api/moderation/templates/{id}/restore` (republie et oublie les signalements) et `…/remove` (supprime) répondent
`204`, `409 TEMPLATE_NOT_HIDDEN` si le template n'est plus masqué ; `404` pour tout autre utilisateur, et pour tous quand la
liste est vide. Chaque décision écrit une ligne `moderation_actions`.

### NoteEvent

```json
{ "id": "n_0142", "time": 12.45, "duration": 0.8, "midi": 60, "velocity": 0.85, "stem": "other", "chordId": "c_031" }
```

### AnalysisResult (résumé)

```json
{
  "schema": "music-world.analysis.v1",
  "audioHash": "sha256:…", "durationSec": 182.4,
  "tempoBpm": 92, "beats": [0.41, 1.06, …], "kicks": [0.41, …], "key": "A minor",
  "notes": [ /* NoteEvent[] */ ],
  "chords": [ { "id": "c_031", "time": 12.45, "duration": 2.6, "label": "Am", "noteIds": ["n_0142", "n_0143", "n_0144"] } ],
  "energy": [ { "time": 0, "value": 0.12 }, … ],
  "sections": [ { "start": 0, "end": 21.3, "label": "intro" }, … ],
  "lyrics": [ { "start": 22.1, "end": 25.4, "text": "…" } ],
  "lyricsSource": "muse-voice | lrc | none"
}
```

Invariants vérifiés par le validateur pydantic (exigence 7.2 de `02-music-analysis`) : notes triées par (time, midi),
ids uniques, `noteIds` des accords existants (notes qui démarrent à ±60 ms et se chevauchent), tous les temps dans
`[0, durationSec]`, beats/kicks/énergie croissants, sections contiguës couvrant le morceau, `lyrics` vide si
`lyricsSource = none`. Le zod généré (`AnalysisSchema`, type `Analysis`) ne revérifie pas ces invariants.

Les schémas sont versionnés. Les modèles pydantic sont la source de vérité : ils sont exportés en JSON Schema, puis convertis en types TypeScript et en zod.

---

## 10. Structure du dépôt

```text
music-world/
├── .kiro/                    # steering, specs, hooks — NE PAS ignorer dans git
├── apps/
│   ├── web/                  # Next.js + IWSDK
│   │   └── src/
│   │       ├── app/          # routes fines : /, /play/[id], /store, /store/new
│   │       ├── features/     # une fonctionnalité = components, hooks, store, api, consts, interfaces, index.ts
│   │       │                 # upload, player, world-view, director, template-store, template-editor, auth
│   │       ├── engine/       # TS pur : horloge, plan de spawn, worldState(t), PRNG, mapping
│   │       ├── xr/           # composants et systèmes IWSDK, constructeur de recettes 3D
│   │       ├── templates/    # schémas zod générés, template par défaut
│   │       └── lib/          # client API, utilitaires partagés
│   └── api/                  # FastAPI + worker — monolithe modulaire en Clean Architecture
│       └── music_world/
│           ├── analysis/     # domain / application / infrastructure (demucs, basic_pitch, librosa) / interfaces
│           ├── director/     # domain / application / infrastructure (muse, bedrock, mock) / interfaces
│           ├── templates/    # store : validation, publication, modération
│           ├── projects/     # projets, uploads, tâches
│           ├── accounts/     # utilisateurs, authentification
│           ├── schemas/      # pydantic — source de vérité des contrats
│           └── shared/       # configuration, logs, base de données, composition des dépendances
├── packages/schemas/         # JSON Schema exportés + types générés
├── infra/                    # docker-compose.yml, Caddyfile, scripts de déploiement OVHcloud
├── assets/                   # image de référence
├── LICENSE                   # MIT
└── README.md                 # en anglais, pour les jurés
```

---

## 11. Plan de réalisation (23 novembre → 4 décembre 2026)

| Jour | Spec Kiro | Livrable |
|---|---|---|
| 1 (23–24/11) | `01-foundation` | Monorepo, licence MIT, Docker Compose, Next.js + IWSDK + IWER (cube en VR émulée), FastAPI « hello ». **Test de Muse Voice sur une voix chantée.** Demande des crédits Kiro. |
| 2–3 | `02-music-analysis` | Upload → tâche → Demucs + Basic Pitch + librosa + accords → `AnalysisResult`. Paroles via Muse Voice (repli : `.lrc` fourni). |
| 4–5 | `03-world-engine-core` | Horloge, plan de spawn, `worldState(t)`, portée et notes qui tombent, tests de propriétés. |
| 6 | `04-default-template` | Rendu fidèle à l'image de référence (terrain, ville, portée, arcs, bloom). |
| 7 | `05-ai-world-director` | Muse Spark → `WorldTemplate` validé, cache, mock. Recettes de formes (§ 6). |
| 8 | `06-template-store` | Comptes, publication, galerie, sélection à la lecture. |
| 9 | `07-xr-mode` | Mode maquette VR, panneau spatial, test sur Quest et IWER. |
| 10 | — | Déploiement OVHcloud (HTTPS), morceau de démo pré-analysé, correction des bugs. |
| 11 (≤ 4/12 14:00 PT) | — | Vidéo < 3 min, README, rapport sur l'usage de Kiro, soumission Devpost. |

**Échéance des crédits Kiro :** demande avant le **1er décembre 2026, 12:00 PT**.

**Après le hackathon :** modèle auto-hébergé (Muse Glimmer), GPU pour Demucs, mode à l'échelle 1 en VR, export vidéo, entrée micro en direct, (l'éditeur de templates et de recettes existe déjà).

---

## 12. Kiroween 2026 — conformité

| Exigence | Réponse du projet |
|---|---|
| Projet créé pendant la période de soumission (≥ 30/10/2026) | Code commencé le 23/11/2026. Ce document de conception est mentionné comme travail préalable. |
| Dépôt GitHub public + licence open source visible | `LICENSE` MIT à la racine. Dépendances compatibles (pas d'AGPL). |
| `/.kiro` à la racine, jamais dans `.gitignore` | Steering, specs et hooks versionnés. |
| URL fonctionnelle pour les jurés | Instance OVHcloud en HTTPS, avec un morceau de démo pré-analysé. |
| Vidéo < 3 min sur YouTube | **Musique libre de droits ou composée par nous uniquement.** Montrer le web **et** le Quest. |
| Tout en anglais | README, description, vidéo et instructions de test en anglais. |
| Rapport sur l'usage de Kiro | Tenu au fil de l'eau dans `KIRO_USAGE.md` (hook manuel prévu). |
| Catégorie | **Frankenstein** : DSP Python + LLM Meta Muse + WebXR IWSDK + génération procédurale + store communautaire. |

**Fonctionnalités Kiro à démontrer :**
- développement piloté par les specs ;
- steering (global et ciblé par dossier) ;
- hooks ;
- **tests basés sur les propriétés** (fast-check et Hypothesis : déterminisme de `worldState`, validité de toute sortie LLM acceptée, invariants de l'analyse) ;
- MCP (documentation Meta) ;
- éventuellement des agents personnalisés.

---

## 13. Risques

1. **Muse Voice sur le chant :** non garanti → test dès le jour 1, repli `.lrc`.
2. **Audio dans Muse Spark 1.3 :** support incomplet → seulement en indice d'ambiance, jamais indispensable.
3. **Temps de calcul de Demucs sur CPU :** limite de 3 min par morceau, tâches asynchrones, démo pré-analysée.
4. **Transcription polyphonique :** Basic Pitch est imparfait sur un mix complet → le lancer sur les pistes séparées et filtrer les notes trop courtes ou trop faibles.
5. **IWSDK sous Next.js :** non documenté officiellement → prototype dès le jour 1, avec la solution de repli Vite.
6. **Performance sur Quest :** instanciation systématique, budget de draw calls, tests réguliers sur le casque.
7. **API Meta en préversion :** identifiants et formats à revérifier, mock déterministe en secours.
8. **Sécurité :** templates et sorties du LLM = données validées. Aucun code exécuté. Clé API uniquement côté serveur.
9. **Droits musicaux :** l'audio importé n'est pas redistribué. Pas d'export vidéo dans le MVP.
10. **Planning de 11 jours :** l'ordre de priorité est strict, chaque jour doit se terminer sur une démo qui fonctionne.

---

## 14. Critères d'acceptation du MVP

- [ ] Un fichier audio (≤ 3 min) peut être importé, analysé et lu.
- [ ] L'analyse produit des notes horodatées, des accords, le tempo, la tonalité, l'énergie et les sections.
- [ ] Les paroles sont transcrites (Muse Voice), ou fournies en `.lrc`, ou marquées absentes.
- [ ] Muse Spark génère un template valide. Toute sortie invalide est rejetée et remplacée par le template par défaut.
- [ ] Le rendu par défaut reprend l'image de référence (disposition, palette, portée, notes).
- [ ] Une note glisse sur la portée, tombe et construit un objet **au bon instant** (écart ≤ 1 image).
- [ ] La vélocité et la durée influencent au moins deux propriétés visuelles.
- [ ] Un accord crée un groupe d'objets reliés.
- [ ] Pause, reprise et seek gardent le monde exact (`worldState(t)` identique).
- [ ] Même audio + même template + même seed ⇒ même monde (test de propriété).
- [ ] Un utilisateur peut publier un template, et un autre peut l'utiliser pendant la lecture.
- [ ] Le monde s'explore à la souris et en VR (Quest ou IWER).
- [ ] ≥ 72 fps sur Meta Quest 3 avec le morceau de démo ; 60 fps sur un portable avec GPU intégré.
- [ ] L'application est en ligne en HTTPS sur OVHcloud.

---

## Annexe — Glossaire

- **BPM :** battements par minute.
- **MIDI :** représentation symbolique des notes (hauteur, durée, vélocité).
- **Stem :** piste isolée (voix, batterie, basse, autres) obtenue par séparation de sources.
- **Template :** description en données d'un style de monde (palette, formes, règles de mapping).
- **ShapeRecipe :** description d'une forme 3D dans un langage fermé, construite par du code déterministe.
- **ECS :** Entity Component System, l'architecture d'IWSDK.
- **IWSDK :** Immersive Web SDK de Meta (WebXR + Three.js).
- **IWER :** émulateur WebXR de Meta, pour tester sans casque.
- **Seed :** valeur initiale qui rend une génération aléatoire reproductible.
- **PBT :** tests basés sur les propriétés (property-based testing).
