/** Photo-v1 is opt-in on imported Fuji still recipes; video keeps its
 * existing grade. Share this selection between video poster and export. */
export function recipeForMedia(recipe: Record<string, any>, simple: boolean, video: boolean) {
  return {
    ...recipe,
    ...(simple ? { strength: 1 } : {}),
    ...(video ? { processing: "legacy" } : {}),
  };
}
