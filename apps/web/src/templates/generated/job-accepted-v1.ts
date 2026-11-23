// GENERATED — do not edit. Source: apps/api/music_world/schemas (run `make schemas`).

import { z } from "zod"

export const JobAcceptedSchema = z.object({ "jobId": z.string() }).strict().describe("Body of a `202 Accepted` response; poll `GET /api/jobs/{jobId}`.")
export type JobAccepted = z.infer<typeof JobAcceptedSchema>

export const JobAcceptedSchemaId = "music-world.job-accepted.v1" as const;
