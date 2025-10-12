export type GenOpts = { minLength: number; special: boolean };

type Pony = {
  first: string;       
  last?: string;         
};

const rand = (n: number) => Math.floor(Math.random() * n);
const choice = <T>(arr: T[]): T => arr[rand(arr.length)];

function renderFragment(p: Pony, mode: "full" | "first" | "last"): string {
  const f = p.first ?? "";
  const l = p.last ?? "";
  if (mode === "first") return f;
  if (mode === "last")  return l || f;
  return l ? f + l : f;
}

const substitutions = (s: string) =>
  s.replace(/[oO]/g, "0")
   .replace(/[iI]/g, "!")
   .replace(/[eE]/g, "€")
   .replace(/[sS]/g, "$");

export const PONIES: Pony[] = [
  { first: "Pinkie", last: "Pie" },
  { first: "Rainbow", last: "Dash" },
  { first: "Twilight", last: "Sparkle" },
  { first: "Applejack" },                
  { first: "Rarity" },
  { first: "Fluttershy" },
  { first: "Spike" },
  { first: "Starlight", last: "Glimmer" },
  { first: "Sunset",    last: "Shimmer" },
  { first: "Princess",  last: "Celestia" },
  { first: "Princess",  last: "Luna" },
  { first: "Shining",   last: "Armor" },
  { first: "Big",       last: "McIntosh" },
  { first: "Trixie" }
];

const MODES: Array<"full" | "first" | "last"> = ["full", "first", "last"];

export function buildPassword(opts: GenOpts, ponies: Pony[] = PONIES): string {
  const { minLength, special } = opts;
  let out = "";

  while (out.length < minLength) {
    const pony = choice(ponies);
    const mode = choice(MODES);
    const fragment = renderFragment(pony, mode);
    if (!fragment) continue; 
    out += fragment;
  }

  return special ? substitutions(out) : out;
}

export function buildMany(count: number, opts: GenOpts, ponies: Pony[] = PONIES): string[] {
  return Array.from({ length: count }, () => buildPassword(opts, ponies));
}
