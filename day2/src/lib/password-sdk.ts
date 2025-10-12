// src/lib/password.ts
import type { Pony } from "./ponies.js";
import { renderFragment } from "./ponies.js";

export type GenOpts = { minLength: number; special: boolean };

const substitutions = (s: string) =>
  s.replace(/[oO]/g, "0")
   .replace(/[iI]/g, "!")
   .replace(/[eE]/g, "€")
   .replace(/[sS]/g, "$");

const rand = (n: number) => Math.floor(Math.random() * n);
const choice = <T>(arr: T[]): T => arr[rand(arr.length)];
const MODES: Array<"full" | "first" | "last"> = ["full", "first", "last"];

export function buildPassword(opts: GenOpts, ponies: Pony[]): string {
  const { minLength, special } = opts;
  let out = "";
  while (out.length < minLength && ponies.length > 0) {
    const pony = choice(ponies);
    const mode = choice(MODES);
    const frag = renderFragment(pony, mode);
    if (!frag) continue;
    out += frag;
  }
  return special ? substitutions(out) : out;
}

export function buildMany(count: number, opts: GenOpts, ponies: Pony[]): string[] {
  return Array.from({ length: count }, () => buildPassword(opts, ponies));
}
