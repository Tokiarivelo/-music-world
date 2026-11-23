// GENERATED — do not edit. Source: apps/api/music_world/schemas (run `make schemas`).

import { z } from "zod"

export const HealthSchema = z.object({ "status": z.enum(["ok","degraded"]).describe("`degraded` when a configured dependency fails."), "version": z.string().min(1).describe("Application version."), "checks": z.object({ "postgres": z.enum(["ok","error","not_configured"]), "redis": z.enum(["ok","error","not_configured"]), "storage": z.enum(["ok","error","not_configured"]).describe("S3-compatible object storage (OVHcloud).") }).strict() }).strict().describe("Liveness status of the API and of its dependencies.")
export type Health = z.infer<typeof HealthSchema>

export const HealthSchemaId = "music-world.health.v1" as const;
