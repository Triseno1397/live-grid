/**
 * Slugs are kebab-case, stable, and never regenerated on rename (AGENTS.md).
 *
 * This is only used to DERIVE a slug when the incoming record doesn't carry one.
 * An existing row matched by slug keeps its slug even if its name changes — otherwise
 * every URL in the product would break on an editorial rename.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    // strip diacritics: "Beyoncé" -> "Beyonce"
    .replace(/[̀-ͯ]/g, "")
    // "Rock & Roll" -> "rock and roll" reads better than "rock-roll"
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
