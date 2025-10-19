// Import types and utilities for working with pony data
import type { Pony } from "./ponies.js";
import { renderFragment } from "./ponies.js";

/**
 * Options for password generation.
 * @property minLength - Minimum length of the generated password
 * @property special - Whether to apply special character substitutions
 */
export type GenOpts = { minLength: number; special: boolean };

/**
 * Applies special character substitutions to make passwords more secure.
 * Performs the following replacements:
 * - o/O → 0 (zero)
 * - i/I → ! (exclamation mark)
 * - e/E → € (euro symbol)
 * - s/S → $ (dollar sign)
 * 
 * @param s - The input string to transform
 * @returns The string with special character substitutions applied
 */
const substitutions = (s: string) =>
  s.replace(/[oO]/g, "0")
   .replace(/[iI]/g, "!")
   .replace(/[eE]/g, "€")
   .replace(/[sS]/g, "$");

/**
 * Generates a random integer between 0 (inclusive) and n (exclusive).
 * @param n - The upper bound (exclusive)
 * @returns A random integer from 0 to n-1
 */
const rand = (n: number) => Math.floor(Math.random() * n);

/**
 * Selects a random element from an array.
 * @param arr - The array to choose from
 * @returns A randomly selected element from the array
 */
const choice = <T>(arr: T[]): T => arr[rand(arr.length)];

// Available modes for rendering pony names in passwords
const MODES: Array<"full" | "first" | "last"> = ["full", "first", "last"];

/**
 * Builds a password by concatenating randomly selected pony name fragments.
 * 
 * The function:
 * 1. Randomly selects ponies from the provided array
 * 2. Randomly chooses a rendering mode (full, first, or last name)
 * 3. Concatenates fragments until the minimum length is reached
 * 4. Optionally applies special character substitutions
 * 
 * @param opts - Password generation options (minLength and special character flag)
 * @param ponies - Array of Pony objects to use for password generation
 * @returns A generated password string
 */
export function buildPassword(opts: GenOpts, ponies: Pony[]): string {
  const { minLength, special } = opts;
  let out = "";
  
  // Keep adding pony name fragments until we reach the minimum length
  while (out.length < minLength && ponies.length > 0) {
    // Randomly select a pony from the array
    const pony = choice(ponies);
    // Randomly select a rendering mode (full, first, or last name)
    const mode = choice(MODES);
    // Render the pony name fragment according to the selected mode
    const frag = renderFragment(pony, mode);
    // Skip empty fragments
    if (!frag) continue;
    // Append the fragment to the password
    out += frag;
  }
  
  // Apply special character substitutions if requested
  return special ? substitutions(out) : out;
}

/**
 * Generates multiple passwords using the same options and pony list.
 * 
 * This is a convenience function that calls buildPassword() multiple times
 * to generate a batch of passwords.
 * 
 * @param count - The number of passwords to generate
 * @param opts - Password generation options (minLength and special character flag)
 * @param ponies - Array of Pony objects to use for password generation
 * @returns An array of generated password strings
 */
export function buildMany(count: number, opts: GenOpts, ponies: Pony[]): string[] {
  // Create an array of the specified length and generate a password for each element
  return Array.from({ length: count }, () => buildPassword(opts, ponies));
}
