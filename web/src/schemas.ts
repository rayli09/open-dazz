import { z } from "zod";

export const ModeSchema = z.enum(["simple", "pro"]);
export type Mode = z.infer<typeof ModeSchema>;
export const LookEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  brand: z.string().min(1),
  tier: z.string().min(1),
  recipe: z.string(),
  baseLut: z.string().nullable(),
  hasLut: z.boolean(),
  baseFilm: z.string().nullable(),
  creator: z.string().nullable(),
  license: z.string().nullable(),
});
export type LookEntry = z.infer<typeof LookEntrySchema>;
export const CatalogSchema = z.object({
  brands: z.record(
    z.string(),
    z.object({
      tiers: z.record(z.string(), z.array(LookEntrySchema)),
      total: z.number().int().nonnegative(),
    }),
  ),
  totalLooks: z.number().int().nonnegative(),
});
export type Catalog = z.infer<typeof CatalogSchema>;

// Defaults match Rust's serde defaults. Preserve provenance and future metadata
// while validating every field the UI or engine consumes, once at JSON ingress.
export const RecipeSchema = z.looseObject({
  name: z.string().min(1),
  baseLut: z.string().nullable().optional(),
  processing: z.enum(["legacy", "fujiPhotoV1"]).default("legacy"),
  strength: z.number().default(1),
  grain: z
    .object({ amount: z.number().default(0), size: z.enum(["small", "large"]).default("small") })
    .prefault({}),
  halation: z.number().default(0),
  tone: z
    .object({
      highlight: z.number().default(0),
      shadow: z.number().default(0),
      color: z.number().default(0),
    })
    .prefault({}),
  whiteBalance: z
    .object({ tempShift: z.number().default(0), tintShift: z.number().default(0) })
    .prefault({}),
  source: z.string().nullable().optional(),
  license: z.string().nullable().optional(),
  provenance: z
    .looseObject({
      film: z.string().optional(),
      creator: z.string().optional(),
      description: z.string().optional(),
    })
    .optional(),
});
export type Recipe = z.infer<typeof RecipeSchema>;
export async function fetchJson<T>(
  url: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const json: unknown = await response.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`${url}: invalid data at ${issue.path.join(".") || "root"} (${issue.message})`);
  }
  return parsed.data;
}
