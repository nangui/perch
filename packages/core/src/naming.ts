/**
 * The naming rules a panel derives from a model name.
 *
 * Here rather than in `@perchjs/nest` because two packages need the same
 * answer: the decorator that defaults a slug, and the CLI that has to know
 * which slug a resource will end up on to notice two of them colliding. An
 * adapter may not import another, so a rule they share lives in the domain —
 * the alternative was two copies that agree until one is edited.
 */

/**
 * Deliberately naive — `y → ies`, `s/x/z/ch/sh → es`, otherwise `s`. It is a
 * default for a URL, not a linguistics engine: anything it gets wrong is fixed
 * by writing `slug` down, which is clearer than a rule nobody can predict.
 */
export function plural(word: string): string {
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  return `${word}s`;
}

export function kebab(word: string): string {
  return word
    .replace(/([a-z\d])([A-Z])/g, "$1-$2")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

/** Where a resource lives when it does not say: `OrderLine` → `order-lines`. */
export function defaultSlug(model: string): string {
  return kebab(plural(model));
}
