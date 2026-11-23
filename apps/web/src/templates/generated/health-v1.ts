// GENERATED — do not edit. Source: apps/api/music_world/schemas (run `make schemas`).

import { z } from "zod"

export const HealthSchema = z.object({ "status": z.enum(["ok","degraded"]).describe("Overall service status."), "version": z.string().min(1).describe("Application version.") }).strict().describe("Liveness status of the API.")
export type Health = z.infer<typeof HealthSchema>

export const HealthSchemaId = "music-world.health.v1" as const;
