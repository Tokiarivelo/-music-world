// GENERATED — do not edit. Source: apps/api/music_world/schemas (run `make schemas`).

import { z } from "zod"

export const JobSchema = z.object({ "id": z.string().describe("UUIDv7."), "kind": z.string().min(1), "status": z.enum(["queued","running","done","failed"]), "stage": z.union([z.string(), z.null()]).describe("Current stage name, if the job reports stages.").default(null), "progress": z.number().gte(0).lte(1), "error": z.union([z.string(), z.null()]).describe("Error code when status is `failed`.").default(null), "createdAt": z.string().datetime({ offset: true }), "updatedAt": z.string().datetime({ offset: true }) }).strict().describe("Status and progress of a background job.")
export type Job = z.infer<typeof JobSchema>

export const JobSchemaId = "music-world.job.v1" as const;
