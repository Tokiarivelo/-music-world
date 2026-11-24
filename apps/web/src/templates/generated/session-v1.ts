// GENERATED — do not edit. Source: apps/api/music_world/schemas (run `make schemas`).

import { z } from "zod"

export const SessionSchema = z.object({ "user": z.union([z.object({ "id": z.string(), "email": z.string().describe("Only ever returned to its owner."), "displayName": z.string().describe("Public author name in the template store.") }).strict(), z.null()]), "moderator": z.union([z.boolean(), z.null()]).describe("`true` only for a moderator; absent for everyone else (10-template-moderation).").default(null) }).strict().describe("`GET /api/auth/session` and `POST /api/auth/verify`: who is signed in (`user` is null when nobody is).")
export type Session = z.infer<typeof SessionSchema>

export const SessionSchemaId = "music-world.session.v1" as const;
