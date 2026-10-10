// Browser version of the pony-password logic from ../day2/src/lib.
// Same algorithm, but the pony list is inlined because there is no file system in the browser.

export type Pony = { first: string; last?: string };
export type GenOpts = { minLength: number; special: boolean };

const PONIES: Pony[] = [
  "Pinkie Pie",
  "Rainbow Dash",
  "Twilight Sparkle",
  "Applejack",
  "Rarity",
  "Fluttershy",
  "Spike",
  "Starlight Glimmer",
  "Trixie",
  "Sunset Shimmer",
  "Princess Celestia",
  "Princess Luna",
  "Shining Armor",
  "Big McIntosh",
].map((line) => {
  const [first = "", ...rest] = line.split(/\s+/);
  return rest.length ? { first, last: rest.join(" ") } : { first };
});

const substitutions = (s: string) => s.replace(/[oO]/g, "0").replace(/[iI]/g, "!").replace(/[eE]/g, "€").replace(/[sS]/g, "$");
const choice = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)] as T;
const MODES: Array<"full" | "first" | "last"> = ["full", "first", "last"];

function renderFragment(p: Pony, mode: "full" | "first" | "last"): string {
  const f = p.first;
  const l = p.last ?? "";
  if (mode === "first") return f;
  if (mode === "last") return l || f;
  return l ? f + l.replace(/\s+/g, "") : f;
}

export function buildPassword({ minLength, special }: GenOpts): string {
  let out = "";
  while (out.length < minLength) {
    out += renderFragment(choice(PONIES), choice(MODES));
  }
  return special ? substitutions(out) : out;
}
