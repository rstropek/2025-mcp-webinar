import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { APP_MIME, uiResource } from "../lib/ui-meta.js";
import type { ViewStore } from "../lib/view-store.js";

/**
 * Step 7 — Tool input & resources (new in the TypeScript port, no .NET
 * equivalent).
 *
 * Two lessons in one step:
 *   1. Tool *input* on its way to becoming a result. A host that streams
 *      tool-call arguments (Claude does; MCPJam and VS Code today do not)
 *      fires `ontoolinputpartial` on the View repeatedly while the model is
 *      still typing arguments, then `ontoolinput` once the full argument
 *      object is known, and finally `ontoolresult` once this handler
 *      returns. The View (`src/ui/step7-tool-input/view.ts`) renders all
 *      three so you can see the timeline live.
 *   2. Ordinary resources, not just `ui://` ones. `docs://step7/cooking-notes.md`
 *      below is a completely normal MCP resource — the View reads it through
 *      `app.readServerResource`, which the host proxies straight through to
 *      this server's `resources/read`. Nothing about it is MCP-Apps-specific;
 *      it demonstrates that a View is a regular MCP client with regular
 *      resource access, on top of the `ui://` view resource it was mounted
 *      from.
 */
const RESOURCE_URI = "ui://step7-tool-input/app.html";
const COOKING_NOTES_URI = "docs://step7/cooking-notes.md";

interface Ingredient {
  name: string;
  amount: number;
  unit: string;
}

// A small built-in table, amounts given per single serving. Anything not in
// this table falls back to a generic three-item list built from the dish
// name itself — the point of the demo is the tool-input timeline and the
// resource read, not a real recipe database.
const RECIPES: Record<string, Ingredient[]> = {
  pancakes: [
    { name: "flour", amount: 120, unit: "g" },
    { name: "milk", amount: 200, unit: "ml" },
    { name: "eggs", amount: 1, unit: "pcs" },
    { name: "sugar", amount: 15, unit: "g" },
    { name: "baking powder", amount: 5, unit: "g" },
  ],
  pasta: [
    { name: "pasta", amount: 100, unit: "g" },
    { name: "olive oil", amount: 10, unit: "ml" },
    { name: "garlic", amount: 1, unit: "clove" },
    { name: "parmesan", amount: 20, unit: "g" },
    { name: "salt", amount: 2, unit: "g" },
  ],
  salad: [
    { name: "lettuce", amount: 50, unit: "g" },
    { name: "tomato", amount: 1, unit: "pcs" },
    { name: "cucumber", amount: 0.5, unit: "pcs" },
    { name: "olive oil", amount: 10, unit: "ml" },
    { name: "salt", amount: 1, unit: "g" },
  ],
};

function genericRecipe(dish: string): Ingredient[] {
  return [
    { name: `${dish} base`, amount: 200, unit: "g" },
    { name: "salt", amount: 2, unit: "g" },
    { name: "olive oil", amount: 10, unit: "ml" },
  ];
}

/** Rounds to two decimals, dropping the trailing zeros `toFixed` would keep. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildIngredients(dish: string, servings: number): Ingredient[] {
  const perServing = RECIPES[dish.trim().toLowerCase()] ?? genericRecipe(dish);
  return perServing.map((ingredient) => ({
    ...ingredient,
    amount: round2(ingredient.amount * servings),
  }));
}

const COOKING_NOTES = `# Cooking notes

- Measure flour by spooning it into the cup and leveling it off — scooping
  straight from the bag packs it down and can add up to 20% extra.
- Let batters rest for 5-10 minutes before cooking; it relaxes the gluten
  and gives a more even texture.
- Salt pasta water until it tastes like the sea — that is the only chance
  the pasta itself gets seasoned.
- Taste as you go and adjust salt at the end, not the beginning: flavors
  concentrate as liquids reduce.
- A pinch of sugar balances acidity in tomato-based sauces.
- Room-temperature eggs incorporate into batters more evenly than cold ones.
- Rest cooked meat for a few minutes before cutting so the juices redistribute.
`;

export function register(server: McpServer, views: ViewStore): void {
  server.registerTool(
    "step7-recipe",
    {
      title: "Step 7 — Tool input & resources",
      description:
        "Builds a scaled ingredient list for a dish. Always pass both 'dish' and 'servings' — " +
        "the View visualizes the streamed input before showing the result.",
      inputSchema: z.object({
        dish: z.string().min(1).describe("Name of the dish, e.g. 'pancakes'"),
        servings: z.number().int().min(1).max(12).default(2).describe("Number of servings to scale the recipe to."),
      }),
      outputSchema: z.object({
        dish: z.string(),
        servings: z.number().int(),
        ingredients: z.array(
          z.object({
            name: z.string(),
            amount: z.number(),
            unit: z.string(),
          }),
        ),
      }),
      _meta: uiResource(RESOURCE_URI),
    },
    async ({ dish, servings }) => {
      const ingredients = buildIngredients(dish, servings);
      const summary = ingredients.map((i) => `${i.amount} ${i.unit} ${i.name}`).join(", ");
      return {
        content: [{ type: "text", text: `Recipe for ${servings} serving(s) of ${dish}: ${summary}.` }],
        structuredContent: { dish, servings, ingredients },
      };
    },
  );

  server.registerResource(
    "step7-tool-input-ui",
    RESOURCE_URI,
    {
      title: "Step 7 — Tool input view",
      description: "Step 7 — Tool input view",
      mimeType: APP_MIME,
    },
    async (uri) => views.read(uri.href, "step7-tool-input"),
  );

  // A plain (non-UI) resource: no `_meta.ui` at all, so a host never renders
  // it as a widget. Its only consumer is the View, calling
  // `app.readServerResource({ uri: COOKING_NOTES_URI })`.
  server.registerResource(
    "step7-cooking-notes",
    COOKING_NOTES_URI,
    {
      title: "Step 7 — Cooking notes",
      description: "A short list of general cooking tips, read by the Step 7 view on demand.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: COOKING_NOTES }],
    }),
  );
}
