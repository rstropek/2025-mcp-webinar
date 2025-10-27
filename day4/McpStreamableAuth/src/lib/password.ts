// Import types and utilities for working with pony data
import type { Pony } from './ponies.js';
import { renderFragment } from './ponies.js';

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
const substitutions = (s: string) => s.replace(/[oO]/g, '0').replace(/[iI]/g, '!').replace(/[eE]/g, '€').replace(/[sS]/g, '$');

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
const MODES: Array<'full' | 'first' | 'last'> = ['full', 'first', 'last'];

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
  let out = '';

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

/**
 * Advanced options for password generation with hybrid composition.
 */
export type AdvancedGenOpts = {
  length: number;
  includeNumbers: boolean;
  includeSymbols: boolean;
  includeUppercase: boolean;
};

const SYMBOLS = '!@#$%^&*()_+-=[]{}|;:,.<>?';
const NUMBERS = '0123456789';

/**
 * Generates a random number with specified digits.
 */
function randomNumber(digits: number): string {
  if (digits === 0) return '';
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

/**
 * Picks a random element from a string.
 */
function randomChar(str: string): string {
  return str.charAt(Math.floor(Math.random() * str.length));
}

/**
 * Applies case variations to a string.
 */
function applyCaseVariation(str: string, includeUppercase: boolean): string {
  if (!includeUppercase) return str;
  
  // Randomly capitalize some characters
  return str
    .split('')
    .map(char => Math.random() > 0.5 ? char.toUpperCase() : char)
    .join('');
}

/**
 * Advanced password generation with hybrid composition.
 * Combines ponies with numbers and symbols for stronger passwords.
 *
 * @param opts - Advanced password generation options
 * @param ponies - Array of Pony objects to use for password generation
 * @returns A generated password string with metadata
 */
export function buildPasswordAdvanced(opts: AdvancedGenOpts, ponies: Pony[]): {
  result: string;
  metadata: {
    length: number;
    includedNumbers: boolean;
    includedSymbols: boolean;
    includedUppercase: boolean;
    composition: string[];
  };
} {
  const { length, includeNumbers, includeSymbols, includeUppercase } = opts;
  
  // Reserve space for numbers and symbols FIRST
  let reservedSpace = 0;
  if (includeNumbers) reservedSpace += 2; // Reserve 2 chars for numbers
  if (includeSymbols) reservedSpace += 1; // Reserve 1 char for symbol
  
  // Calculate available length for ponies
  const ponySpace = Math.max(5, length - reservedSpace);
  
  let result = '';
  const composition: string[] = [];
  
  // STEP 1: Build the base password with pony names (leave room for numbers/symbols)
  while (result.length < ponySpace) {
    const pony = choice(ponies);
    const mode = choice(MODES);
    let fragment = renderFragment(pony, mode);
    
    // Apply case variations
    fragment = applyCaseVariation(fragment, includeUppercase);
    
    // Only add if it fits in the pony space
    if (result.length + fragment.length <= ponySpace) {
      result += fragment;
      // Add the actual pony name(s) used to composition
      if (mode === 'first') {
        composition.push(pony.first);
      } else if (mode === 'last' && pony.last) {
        composition.push(pony.last);
      } else {
        composition.push(pony.first + (pony.last ? ' ' + pony.last : ''));
      }
    } else if (result.length < ponySpace) {
      // Truncate fragment to fit exactly in pony space
      const remainingSpace = ponySpace - result.length;
      if (remainingSpace > 0) {
        result += fragment.substring(0, remainingSpace);
      }
      break;
    }
  }
  
  // STEP 2: Add numbers if requested (guaranteed to fit)
  if (includeNumbers) {
    const numbers = randomNumber(2);
    result += numbers;
    composition.push('numbers');
  }
  
  // STEP 3: Add symbols if requested (guaranteed to fit)
  if (includeSymbols) {
    const symbol = randomChar(SYMBOLS);
    result += symbol;
    composition.push('symbol');
  }
  
  // STEP 4: Now we should be at exact target length
  // If ponies were short, pad with additional pony fragments
  while (result.length < length) {
    const pony = choice(ponies);
    const mode = choice(MODES);
    let fragment = renderFragment(pony, mode);
    fragment = applyCaseVariation(fragment, includeUppercase);
    
    const remainingSpace = length - result.length;
    if (fragment.length <= remainingSpace) {
      result += fragment;
      // Add to composition
      if (mode === 'first') {
        composition.push(pony.first);
      } else if (mode === 'last' && pony.last) {
        composition.push(pony.last);
      } else {
        composition.push(pony.first + (pony.last ? ' ' + pony.last : ''));
      }
    } else {
      // Add just enough to reach target length
      result += fragment.substring(0, remainingSpace);
      break;
    }
  }
  
  // Ensure exact length (should already be correct, but safety check)
  result = result.substring(0, length);
  
  return {
    result,
    metadata: {
      length: result.length,
      includedNumbers: includeNumbers,
      includedSymbols: includeSymbols,
      includedUppercase: includeUppercase,
      composition: [...new Set(composition)], // unique only
    }
  };
}

/**
 * Filters ponies based on a custom list of pony names.
 * 
 * @param ponies - Array of all available Pony objects
 * @param customPonies - Array of pony names to filter by
 * @returns Filtered array of Pony objects
 */
export function filterPonies(ponies: Pony[], customPonies: string[]): Pony[] {
  if (!customPonies || customPonies.length === 0) {
    return ponies;
  }
  
  return ponies.filter(pony => 
    customPonies.includes(pony.first) || 
    (pony.last && customPonies.some(cp => pony.last?.includes(cp)))
  );
}