/**
 * The demo's own pictures, drawn rather than fetched.
 *
 * A public demo that hotlinks somebody else's photographs is a demo that
 * breaks when they move them, and one that costs them bandwidth for our sake.
 * These are initials on a coloured disc, generated here, so the avatar and
 * image columns have something real to draw and nothing to depend on.
 */
import { Controller, Get, Header, Param } from "@nestjs/common";

/** Deterministic, so a row keeps its colour between restarts. */
function hue(seed: string): number {
  let total = 0;
  for (const character of seed) total = (total * 31 + character.charCodeAt(0)) % 360;
  return total;
}

/**
 * Two letters, and only letters.
 *
 * The name comes out of the address, so it is whatever anybody asks for, and
 * it is put into markup by hand. Two characters is not enough to write a tag
 * even so, but `<` is enough to make the document malformed and the picture
 * not draw at all. Keeping letters is simpler to be sure of than escaping
 * whatever else arrives.
 */
function initials(seed: string): string {
  const words = seed.split(/[\s-]+/).filter((word) => word !== "");
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("")
    .replace(/[^A-Z0-9]/g, "");
}

@Controller("demo-images")
export class ImagesController {
  @Get(":name")
  @Header("Content-Type", "image/svg+xml")
  @Header("Cache-Control", "public, max-age=86400")
  draw(@Param("name") name: string): string {
    const seed = name.replace(/\.svg$/, "").replace(/-/g, " ");
    const tone = hue(seed);
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">`,
      `<circle cx="48" cy="48" r="48" fill="hsl(${String(tone)} 58% 82%)"/>`,
      `<text x="48" y="48" font-family="system-ui, sans-serif" font-size="34"`,
      ` font-weight="600" fill="hsl(${String(tone)} 52% 28%)" text-anchor="middle"`,
      ` dominant-baseline="central">${initials(seed)}</text>`,
      `</svg>`,
    ].join("");
  }
}
