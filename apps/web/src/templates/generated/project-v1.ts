// GENERATED — do not edit. Source: apps/api/music_world/schemas (run `make schemas`).

import { z } from "zod"

export const ProjectSchema = z.object({ "id": z.string().describe("UUIDv7."), "status": z.enum(["analyzing","ready","failed"]), "audioHash": z.string().regex(new RegExp("^sha256:[0-9a-f]{64}$")), "durationSec": z.number().gt(0), "hasLyricsFile": z.boolean().describe("True when an `.lrc` file was uploaded with the audio."), "job": z.union([z.object({ "id": z.string().describe("UUIDv7."), "kind": z.string().min(1), "status": z.enum(["queued","running","done","failed"]), "stage": z.union([z.string(), z.null()]).describe("Current stage name, if the job reports stages.").default(null), "progress": z.number().gte(0).lte(1), "error": z.union([z.string(), z.null()]).describe("Error code when status is `failed`.").default(null), "createdAt": z.string().datetime({ offset: true }), "updatedAt": z.string().datetime({ offset: true }) }).strict().describe("Status and progress of a background job."), z.null()]).describe("The analysis job, when one was needed.").default(null), "createdAt": z.string().datetime({ offset: true }) }).strict().describe("An uploaded song and the progress of its analysis.")
export type Project = z.infer<typeof ProjectSchema>

export const ProjectSchemaId = "music-world.project.v1" as const;
