import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CatalogSchema, RecipeSchema, fetchJson } from "../src/schemas";
const root = new URL("../../../", import.meta.url);

test("the full shipped catalog and every referenced recipe satisfy ingress schemas", () => {
  const catalog = CatalogSchema.parse(
    JSON.parse(readFileSync(new URL("library/catalog.json", root), "utf8")),
  );
  const entries = Object.values(catalog.brands).flatMap((b) => Object.values(b.tiers).flat());
  assert.equal(entries.length, catalog.totalLooks);
  for (const entry of entries) {
    const source = JSON.parse(readFileSync(new URL(entry.recipe, root), "utf8"));
    const parsed = RecipeSchema.parse(source);
    assert.equal(parsed.name, source.name);
    assert.deepEqual(parsed.provenance, source.provenance);
    assert.deepEqual(parsed.tone, source.tone);
    assert.deepEqual(parsed.whiteBalance, source.whiteBalance);
    assert.equal(parsed.processing, source.processing ?? "legacy");
    assert.equal(parsed.strength, source.strength ?? 1);
  }
});

test("recipe defaults match serde, metadata survives, and malformed controls are rejected", () => {
  const source = {
    name: "minimal",
    provenance: { sourceRepo: "upstream" },
    futureMetadata: { x: 1 },
  };
  const parsed = RecipeSchema.parse(source);
  assert.deepEqual(parsed.grain, { amount: 0, size: "small" });
  assert.deepEqual(parsed.tone, { highlight: 0, shadow: 0, color: 0 });
  assert.deepEqual(parsed.whiteBalance, { tempShift: 0, tintShift: 0 });
  assert.deepEqual(parsed.futureMetadata, source.futureMetadata);
  for (const extra of [
    { strength: "1" },
    { grain: { amount: NaN } },
    { tone: { color: Infinity } },
    { whiteBalance: { tempShift: null } },
    { processing: "unknown" },
  ]) {
    assert.equal(RecipeSchema.safeParse({ name: "bad", ...extra }).success, false);
  }
  assert.equal(
    CatalogSchema.safeParse({
      brands: { x: { tiers: { x: [{ id: "broken" }] }, total: 1 } },
      totalLooks: 1,
    }).success,
    false,
  );
});

test("JSON ingress rejects HTTP failures and malformed JSON/schema without blind casts", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('{"name":"okay"}', { status: 404 });
    await assert.rejects(fetchJson("/recipe.json", RecipeSchema), /HTTP 404/);
    globalThis.fetch = async () => new Response('{"name":7}');
    await assert.rejects(fetchJson("/recipe.json", RecipeSchema), /invalid data at name/);
    globalThis.fetch = async () => new Response("not json");
    await assert.rejects(fetchJson("/recipe.json", RecipeSchema));
    globalThis.fetch = async () => new Response('{"name":"okay"}');
    assert.equal((await fetchJson("/recipe.json", RecipeSchema)).strength, 1);
  } finally {
    globalThis.fetch = original;
  }
});
