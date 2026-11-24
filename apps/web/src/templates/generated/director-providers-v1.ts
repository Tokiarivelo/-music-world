// GENERATED — do not edit. Source: apps/api/music_world/schemas (run `make schemas`).

import { z } from "zod"

export const DirectorProvidersSchema = z.object({ "default": z.enum(["muse","bedrock","mock"]), "providers": z.array(z.object({ "id": z.enum(["muse","bedrock","mock"]), "model": z.string(), "configured": z.boolean().describe("False when credentials are missing: the selector hides it.") }).strict()) }).strict().describe("`GET /api/director/providers`: the default provider and which ones can be selected.")
export type DirectorProviders = z.infer<typeof DirectorProvidersSchema>

export const DirectorProvidersSchemaId = "music-world.director-providers.v1" as const;
