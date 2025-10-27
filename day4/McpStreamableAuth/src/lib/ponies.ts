// Import necessary Node.js modules for file operations and path handling
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Represents a pony with a required first name and optional last name.
 * This type is used to structure pony data throughout the application.
 */
export type Pony = { first: string; last?: string };

// Recreate __dirname functionality for ES modules (not available by default in ES modules)
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Define the default path to the ponies data file, located in the data directory
const DATA_PATH = path.join(__dirname, '..', 'data', 'ponies.txt');

/**
 * Loads and parses pony data from a text file.
 *
 * The file format expects one pony per line:
 * - Single word: treated as first name only
 * - Multiple words: first word is first name, remaining words form the last name
 * - Lines starting with '#' are treated as comments and ignored
 * - Empty lines are skipped
 *
 * @param filePath - Path to the ponies data file (defaults to DATA_PATH)
 * @returns Promise resolving to an array of Pony objects
 */
export function loadPoniesFromFile(filePath: string = DATA_PATH): Pony[] {
  // Read the entire file contents as UTF-8 text
  const raw = readFileSync(filePath, 'utf-8');

  return (
    raw
      // Split file content into individual lines (handles both Unix \n and Windows \r\n)
      .split(/\r?\n/)
      // Remove leading and trailing whitespace from each line
      .map((l) => l.trim())
      // Filter out empty lines and comment lines (starting with #)
      .filter((l) => l.length > 0 && !l.startsWith('#'))
      // Parse each line into a Pony object
      .map((line) => {
        // Split line by whitespace to separate name parts
        const parts = line.split(/\s+/);

        if (parts.length === 1) {
          // Single word: only first name
          return { first: parts[0] };
        } else {
          // Multiple words: first word is first name
          const first = parts[0];
          // All remaining words joined together form the last name
          const last = parts.slice(1).join(' ');
          return { first, last };
        }
      })
  );
}

/**
 * Renders a pony's name according to the specified mode.
 *
 * This function provides different representations of a pony's name:
 * - "first": Returns only the first name
 * - "last": Returns the last name if available, otherwise falls back to first name
 * - "full": Returns first name concatenated with last name (spaces removed from last name)
 *
 * @param p - The Pony object to render
 * @param mode - The rendering mode: "full", "first", or "last"
 * @returns The formatted name string based on the selected mode
 */
export function renderFragment(p: Pony, mode: 'full' | 'first' | 'last'): string {
  // Extract first and last names, defaulting to empty string if undefined
  const f = p.first ?? '';
  const l = p.last ?? '';

  // Return only the first name
  if (mode === 'first') return f;

  // Return the last name, or first name if no last name exists
  if (mode === 'last') return l || f;

  // Return full name: first name + last name with spaces removed
  // If no last name exists, just return first name
  return l ? f + l.replace(/\s+/g, '') : f;
}

/**
 * Converts an array of ponies to a multi-line string format.
 *
 * Each pony is rendered on its own line. If a pony has a last name,
 * it's formatted as "FirstName LastName" (with internal spaces in last name removed).
 * If a pony only has a first name, just the first name is used.
 *
 * Example output:
 * ```
 * TwilightSparkle
 * Applejack
 * Rainbow Dash
 * ```
 *
 * @param ponies - Array of Pony objects to convert
 * @returns A string with one pony per line, separated by newline characters
 */
export function toOnePerLine(ponies: Pony[]): string {
  return (
    ponies
      // Format each pony: if last name exists, combine with first name (spaces removed from last name)
      // Otherwise, just use the first name
      .map((p) => (p.last ? p.first + ' ' + p.last.replace(/\s+/g, '') : p.first))
      // Join all formatted names with newline characters
      .join('\n')
  );
}
