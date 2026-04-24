import type { Pony } from "./ponies.js";
import { renderFragment } from "./ponies.js";

export type GenOpts = { minLength: number; special: boolean };

// Special-character substitutions: o/O→0, i/I→!, e/E→€, s/S→$
const substitutions = (s: string) =>
	s
		.replace(/[oO]/g, "0")
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

export function buildMany(
	count: number,
	opts: GenOpts,
	ponies: Pony[],
): string[] {
	return Array.from({ length: count }, () => buildPassword(opts, ponies));
}

/** Advanced hybrid generator — mixes ponies with digits/symbols/case variation. */
export type AdvancedGenOpts = {
	length: number;
	includeNumbers: boolean;
	includeSymbols: boolean;
	includeUppercase: boolean;
};

const SYMBOLS = "!@#$%^&*()_+-=[]{}|;:,.<>?";

function randomDigits(n: number): string {
	if (n === 0) return "";
	const min = 10 ** (n - 1);
	const max = 10 ** n - 1;
	return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

function randomChar(str: string): string {
	return str.charAt(rand(str.length));
}

function applyCaseVariation(str: string, includeUppercase: boolean): string {
	if (!includeUppercase) return str;
	return str
		.split("")
		.map((c) => (Math.random() > 0.5 ? c.toUpperCase() : c))
		.join("");
}

export function buildPasswordAdvanced(
	opts: AdvancedGenOpts,
	ponies: Pony[],
): {
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

	// Reserve space for the appended digits and symbols.
	let reserved = 0;
	if (includeNumbers) reserved += 2;
	if (includeSymbols) reserved += 1;
	const ponySpace = Math.max(5, length - reserved);

	let result = "";
	const composition: string[] = [];

	const pushPonyFragment = (maxLen: number): boolean => {
		const pony = choice(ponies);
		const mode = choice(MODES);
		const fragment = applyCaseVariation(
			renderFragment(pony, mode),
			includeUppercase,
		);
		if (!fragment) return false;
		if (fragment.length <= maxLen) {
			result += fragment;
			if (mode === "first") composition.push(pony.first);
			else if (mode === "last" && pony.last) composition.push(pony.last);
			else composition.push(pony.first + (pony.last ? ` ${pony.last}` : ""));
			return true;
		}
		if (maxLen > 0) {
			result += fragment.substring(0, maxLen);
		}
		return false;
	};

	while (result.length < ponySpace) {
		if (!pushPonyFragment(ponySpace - result.length)) break;
	}

	if (includeNumbers) {
		result += randomDigits(2);
		composition.push("numbers");
	}
	if (includeSymbols) {
		result += randomChar(SYMBOLS);
		composition.push("symbol");
	}

	while (result.length < length) {
		if (!pushPonyFragment(length - result.length)) break;
	}

	result = result.substring(0, length);

	return {
		result,
		metadata: {
			length: result.length,
			includedNumbers: includeNumbers,
			includedSymbols: includeSymbols,
			includedUppercase: includeUppercase,
			composition: [...new Set(composition)],
		},
	};
}

export function filterPonies(ponies: Pony[], customPonies: string[]): Pony[] {
	if (!customPonies || customPonies.length === 0) return ponies;
	return ponies.filter(
		(pony) =>
			customPonies.includes(pony.first) ||
			(pony.last && customPonies.some((cp) => pony.last?.includes(cp))),
	);
}
