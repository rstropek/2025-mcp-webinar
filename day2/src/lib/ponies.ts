import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type Pony = { first: string; last?: string };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, "..", "data", "ponies.txt");

export function loadPoniesFromFile(filePath: string = DATA_PATH): Pony[] {
	const raw = readFileSync(filePath, "utf-8");
	return raw
		.split(/\r?\n/)
		.map((l: string) => l.trim())
		.filter((l: string) => l.length > 0 && !l.startsWith("#"))
		.map((line: string) => {
			const parts = line.split(/\s+/);
			if (parts.length === 1) return { first: parts[0] };
			return { first: parts[0], last: parts.slice(1).join(" ") };
		});
}

export function renderFragment(
	p: Pony,
	mode: "full" | "first" | "last",
): string {
	const f = p.first ?? "";
	const l = p.last ?? "";
	if (mode === "first") return f;
	if (mode === "last") return l || f;
	return l ? f + l.replace(/\s+/g, "") : f;
}

export function toOnePerLine(ponies: Pony[]): string {
	return ponies
		.map((p) => (p.last ? `${p.first} ${p.last.replace(/\s+/g, "")}` : p.first))
		.join("\n");
}
