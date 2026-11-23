// GENERATED — do not edit. Source: apps/api/music_world/schemas (run `make schemas`).

import { z } from "zod"

export const ProjectCreatedSchema = z.object({ "projectId": z.string(), "jobId": z.union([z.string(), z.null()]).describe("Poll `GET /api/jobs/{jobId}`; null when the analysis is cached."), "status": z.enum(["analyzing","ready","failed"]) }).strict().describe("Body of `202 Accepted` after an upload. `jobId` is null when the analysis was already cached.")
export type ProjectCreated = z.infer<typeof ProjectCreatedSchema>

export const ProjectCreatedSchemaId = "music-world.project-created.v1" as const;
