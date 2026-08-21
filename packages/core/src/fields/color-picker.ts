/**
 * `ColorPicker` — one colour, in the notation the column keeps it in.
 *
 * What the form holds and what the column holds are not the same shape, for the
 * same reason a key-value field's are not: the two ends want different things.
 * A column keeps a colour in whichever notation the rest of the system reads —
 * `hex`, `rgb()` or `hsl()` — and the page only ever holds hex, because that is
 * what a colour control speaks and what a reader pastes.
 *
 * So the notation is a storage decision and the conversion happens here, where
 * it can be read and tested, rather than in a browser that would then have to
 * carry the same arithmetic twice.
 */
import { configured } from "../component.js";
import type { FieldState, ValueRefusal } from "../field.js";
import { baseFieldState, Field, isUnset } from "../field.js";

/** How the column spells a colour. */
export type ColorFormat = "hex" | "rgb" | "hsl";

export interface ColorPickerState extends FieldState {
  readonly format?: ColorFormat;
}

/** What the page may hold: six hex digits, lower case, and nothing else. */
const HEX = /^#[0-9a-f]{6}$/;

/*
 * What a column holds is somebody else's decision, so both notations are read
 * the way CSS itself writes them now — commas or spaces, whole numbers or not,
 * and a hue that says it is in degrees.
 */
const RGB = /^rgb\(\s*([0-9.]+)[\s,]+([0-9.]+)[\s,]+([0-9.]+)\s*\)$/;
const HSL = /^hsl\(\s*([0-9.]+)(?:deg)?[\s,]+([0-9.]+)%[\s,]+([0-9.]+)%\s*\)$/;

export class ColorPicker extends Field {
  declare readonly state: ColorPickerState;

  override get type(): string {
    return "ColorPicker";
  }

  protected override with(patch: Partial<ColorPickerState>): this {
    return super.with(patch);
  }

  static make(name: string): ColorPicker {
    return configured(new ColorPicker(baseFieldState(name)));
  }

  /** The default, and what the column keeps unless it is told otherwise. */
  hex(): this {
    return this.with({ format: "hex" });
  }

  rgb(): this {
    return this.with({ format: "rgb" });
  }

  hsl(): this {
    return this.with({ format: "hsl" });
  }

  /**
   * One colour, as hex.
   *
   * The page has a colour control and a box that takes hex; neither can produce
   * anything else, so anything else was not produced by a page.
   */
  override admits(value: unknown): ValueRefusal | undefined {
    if (isUnset(value)) return undefined;
    return typeof value === "string" && HEX.test(value) ? undefined : "wrong-shape";
  }

  /**
   * Whatever notation the column holds, as the hex the page speaks.
   *
   * Read tolerantly, because a colour column is one somebody else filled: all
   * three notations are understood whichever was declared, in the spelling CSS
   * uses now as well as the one it used to, `#abc` is the six digits it stands
   * for, and case and spacing are somebody's preference rather than a
   * different colour. What is not a colour at all is left alone — the
   * boundary refuses it, which says more than a black swatch would.
   */
  override fromStorage(value: unknown): unknown {
    if (typeof value !== "string" || value.trim() === "") return value;
    const channels = parse(value);
    return channels === undefined ? value : toHex(channels);
  }

  /** The hex the page holds, in the notation the column keeps. */
  override toStorage(value: unknown): unknown {
    if (typeof value !== "string" || !HEX.test(value)) return value;
    const channels = parse(value);
    if (channels === undefined) return value;

    switch (this.state.format ?? "hex") {
      case "rgb": {
        const [red, green, blue] = channels;
        return `rgb(${String(red)}, ${String(green)}, ${String(blue)})`;
      }
      case "hsl": {
        const [hue, saturation, lightness] = toHsl(channels);
        return `hsl(${String(hue)}, ${String(saturation)}%, ${String(lightness)}%)`;
      }
      default:
        return toHex(channels);
    }
  }
}

/** Red, green and blue, each 0–255. */
type Channels = readonly [red: number, green: number, blue: number];

/** A colour in any of the three notations, or nothing if it is not one. */
function parse(value: string): Channels | undefined {
  const text = value.trim().toLowerCase();

  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(text);
  // `#abc` is `#aabbcc`: each digit stands for both of its pair.
  if (short)
    return channels(short.slice(1).map((one) => Number.parseInt(one + one, 16)));

  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(text);
  if (long) return channels(long.slice(1).map((one) => Number.parseInt(one, 16)));

  const rgb = RGB.exec(text);
  if (rgb) {
    const parts = numbers(rgb);
    if (parts === undefined || parts.some((one) => one > 255)) return undefined;
    // Rounded, because a column written by something else holds decimals and
    // a channel is one of 256 steps whatever notation it arrived in.
    return channels(parts.map((one) => Math.round(one)));
  }

  const hsl = HSL.exec(text);
  if (hsl) {
    const parts = numbers(hsl);
    if (parts === undefined) return undefined;
    const [hue = 0, saturation = 0, lightness = 0] = parts;
    if (hue > 360 || saturation > 100 || lightness > 100) return undefined;
    return fromHsl(hue, saturation, lightness);
  }

  return undefined;
}

/**
 * The three numbers a match caught, or nothing if one of them is not a number.
 *
 * The patterns take a decimal point where a column somebody else wrote has one,
 * which means they also take a lone `.`.
 */
function numbers(match: RegExpExecArray): readonly number[] | undefined {
  const parts = match.slice(1).map(Number);
  return parts.every((one) => Number.isFinite(one)) ? parts : undefined;
}

/** Three numbers as the triple the rest of this file passes around. */
function channels(parts: readonly number[]): Channels {
  const [red = 0, green = 0, blue = 0] = parts;
  return [red, green, blue];
}

function toHex(colour: Channels): string {
  return `#${colour.map((one) => one.toString(16).padStart(2, "0")).join("")}`;
}

/** Rounded to whole degrees and percentages, which is what a column holds. */
function toHsl(colour: Channels): readonly [number, number, number] {
  const red = colour[0] / 255;
  const green = colour[1] / 255;
  const blue = colour[2] / 255;
  const high = Math.max(red, green, blue);
  const low = Math.min(red, green, blue);
  const span = high - low;
  const lightness = (high + low) / 2;

  if (span === 0) return [0, 0, Math.round(lightness * 100)];

  const saturation = span / (1 - Math.abs(2 * lightness - 1));
  const hue =
    high === red
      ? ((green - blue) / span + (green < blue ? 6 : 0)) * 60
      : high === green
        ? ((blue - red) / span + 2) * 60
        : ((red - green) / span + 4) * 60;

  return [
    Math.round(hue) % 360,
    Math.round(saturation * 100),
    Math.round(lightness * 100),
  ];
}

function fromHsl(hue: number, saturation: number, lightness: number): Channels {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const sector = (hue % 360) / 60;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const base = l - chroma / 2;

  const sectors: readonly Channels[] = [
    [chroma, second, 0],
    [second, chroma, 0],
    [0, chroma, second],
    [0, second, chroma],
    [second, 0, chroma],
    [chroma, 0, second],
  ];

  const picked = sectors[Math.floor(sector) % 6] ?? [0, 0, 0];
  return channels(picked.map((one) => Math.round((one + base) * 255)));
}
