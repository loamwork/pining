// ---------------------------------------------------------------------------
// Bio generation script — generates species-level bios via Claude API
// ---------------------------------------------------------------------------

import Anthropic from "@anthropic-ai/sdk";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BiosCache {
  version: string;
  generatedAt: string;
  model: string;
  species: Record<string, string[]>;
  elder: string[];
  mystery: string[];
}

interface SpeciesInfo {
  scientific: string;
  common: string;
  facts: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2000;
const CONCURRENCY = 2;
const DELAY_MS = 500;
const TIMEOUT_MS = 60_000;
const MAX_RETRIES = 3;
const BIOS_PER_SPECIES = 20;

const KINK_CATEGORIES = [
  "age_gap_older",
  "age_gap_younger",
  "dom",
  "sub",
  "switch",
  "spanking",
  "bdsm_light",
] as const;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = resolve(__dirname, "../../data");
const CACHE_PATH = resolve(DATA_DIR, "species-bios.json");

// ---------------------------------------------------------------------------
// Deterministic hash (same as assign.ts)
// ---------------------------------------------------------------------------

function deterministicHash(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function assignKinkCategory(scientific: string): string {
  return KINK_CATEGORIES[deterministicHash(scientific) % KINK_CATEGORIES.length];
}

// ---------------------------------------------------------------------------
// Smoke-test species
// ---------------------------------------------------------------------------

const SMOKE_TEST_SPECIES: SpeciesInfo[] = [
  {
    scientific: "Quercus rubra",
    common: "Northern red oak",
    facts:
      "Red oaks grow fast, turn brilliant red in fall, and are the most commonly planted street tree in North America. They can live 300-500 years and reach 90 feet tall. Acorns take two years to mature.",
  },
  {
    scientific: "Tilia cordata",
    common: "Littleleaf linden",
    facts:
      "Lindens are famously fragrant when flowering in June, attracting bees from miles around. Heart-shaped leaves. Often planted along European boulevards. The inner bark (bast) was historically used to make rope. Linden tea is a classic folk remedy.",
  },
  {
    scientific: "Sequoia sempervirens",
    common: "Coast redwood",
    facts:
      "The tallest trees on Earth, reaching over 370 feet. Can live 2000+ years. Bark up to a foot thick, fire-resistant. They drink fog through their needles. A single tree can hold an entire ecosystem of ferns, mosses, and other plants in its canopy.",
  },
];

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

function buildSpeciesPrompt(species: SpeciesInfo): string {
  const kink = assignKinkCategory(species.scientific);
  return `You are writing dating app bios for a ${species.common} (${species.scientific}) tree. The tree writes its own bio in first person. 1-2 sentences each, 20-280 characters.
No hashtags, no emojis, no exclamation marks.

These should read like REAL dating app bios — the kind you'd see on Hinge or Tinder. Funny, self-deprecating, specific. The tree should roast itself as much as it brags. Reference the tree's actual quirks, flaws, and weird biological facts — not generic "I'm tall and strong" energy. Think: a tree that's been on the apps too long and has gotten very honest about what it is.

BAD (too generic, too earnest): "I turn heads every autumn without even trying."
GOOD (specific, self-deprecating): "I drop 70,000 acorns a year and not one has texted me back."

Generate exactly 20 bios as a JSON array of strings:
- Bios 0-11: SWAGGER tone — confident but always undercut with humor or self-deprecation. The tree knows it's a catch but also knows it's a lot.
- Bios 12-18: INNUENDO tone — tasteful double entendre using tree/nature vocabulary only (wood, trunk, roots, spreading, girth, etc.). Should land as a joke, not as creepy.
- Bio 19: KINKY tone (${kink}) — playful kink reference using tree vocabulary only. Never explicit human sexuality. Should make someone laugh-then-think.

Species facts to weave in (USE THESE — they make the bios specific and funny): ${species.facts}

Return ONLY a JSON array of 20 strings. No other text.`;
}

const ELDER_PROMPT = `You are writing dating app bios for ancient, centuries-old trees — the kind that have watched civilizations rise and fall. First person, 1-2 sentences each, 20-280 characters.
Tone: stately, wistful, Giving Tree by Shel Silverstein. Speaks of centuries of shade, generations sheltered, quiet endurance. Minimal swagger — these trees don't need to prove anything. They've been here longer than anyone reading this.
But they're still on a dating app, so there should be a dry humor to it — like a 500-year-old who signed up for Hinge out of curiosity. Not sad, not desperate. Just... bemused by the whole thing. Mix the wistful with the wry.
No hashtags, no emojis, no exclamation marks.
Generate exactly 20 bios as a JSON array of strings. Return ONLY the JSON array.`;

const MYSTERY_PROMPT = `You are writing dating app bios for trees that nobody has identified — unknown species, unknown age. First person, 1-2 sentences each, 20-280 characters.
Tone: playful, existential, "still finding myself." Self-deprecating charm about not knowing what they are. A tree having an identity crisis but being surprisingly cool about it. Think: someone who put "figuring it out" as their job title on Hinge and somehow made it charming.
These should be funny. Not quirky-random funny, but real-person-who-happens-to-be-a-tree funny.
No hashtags, no emojis, no exclamation marks.
Generate exactly 20 bios as a JSON array of strings. Return ONLY the JSON array.`;

// ---------------------------------------------------------------------------
// API call with retry
// ---------------------------------------------------------------------------

async function callClaude(
  client: Anthropic,
  prompt: string,
  label: string,
): Promise<string[]> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.messages.create(
        {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          messages: [{ role: "user", content: prompt }],
        },
        { timeout: TIMEOUT_MS },
      );

      const text =
        response.content[0].type === "text" ? response.content[0].text : "";

      // Extract JSON array from response (handle markdown code blocks)
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error(`No JSON array found in response for ${label}`);
      }

      const parsed: unknown = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed) || parsed.length !== BIOS_PER_SPECIES) {
        throw new Error(
          `Expected array of ${BIOS_PER_SPECIES}, got ${Array.isArray(parsed) ? parsed.length : typeof parsed} for ${label}`,
        );
      }

      // Validate each bio
      const bios: string[] = [];
      for (let i = 0; i < parsed.length; i++) {
        const bio = parsed[i];
        if (typeof bio !== "string") {
          throw new Error(`Bio ${i} is not a string for ${label}`);
        }
        if (bio.length < 20 || bio.length > 280) {
          console.warn(
            `  Warning: bio ${i} for ${label} is ${bio.length} chars (expected 20-280): "${bio.slice(0, 60)}..."`,
          );
        }
        bios.push(bio);
      }

      return bios;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES) {
        console.warn(
          `  Attempt ${attempt}/${MAX_RETRIES} failed for ${label}: ${msg}. Retrying...`,
        );
        await sleep(1000 * attempt);
      } else {
        console.error(
          `  SKIPPED ${label}: failed after ${MAX_RETRIES} attempts (${msg})`,
        );
        return null;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function loadCache(): BiosCache {
  if (existsSync(CACHE_PATH)) {
    try {
      const raw = readFileSync(CACHE_PATH, "utf-8");
      return JSON.parse(raw) as BiosCache;
    } catch {
      console.warn("Could not parse existing cache, starting fresh.");
    }
  }
  return {
    version: new Date().toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    model: MODEL,
    species: {},
    elder: [],
    mystery: [],
  };
}

function saveCache(cache: BiosCache): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  cache.generatedAt = new Date().toISOString();
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// Concurrent worker pool
// ---------------------------------------------------------------------------

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> {
  const results: T[] = [];
  let idx = 0;

  async function worker(): Promise<void> {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
      if (i < tasks.length - 1) {
        await sleep(DELAY_MS);
      }
    }
  }

  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(concurrency, tasks.length); w++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Species extraction from arborlog (for full run)
// ---------------------------------------------------------------------------

function extractSpeciesFromArborlog(arborlogPath: string): SpeciesInfo[] {
  // Scan all JSON files in arborlog live-data directory
  const files = readdirSync(arborlogPath).filter((f: string) =>
    f.endsWith(".json"),
  );

  const speciesSet = new Map<string, { common: string }>();

  for (const file of files) {
    try {
      const data = JSON.parse(
        readFileSync(resolve(arborlogPath, file), "utf-8"),
      );
      if (!Array.isArray(data)) continue;
      for (const tree of data) {
        const sci = tree.scientific?.trim();
        const com = tree.common?.trim();
        if (sci && sci.includes(" ") && !speciesSet.has(sci)) {
          speciesSet.set(sci, { common: com || sci });
        }
      }
    } catch {
      // skip unparseable files
    }
  }

  return Array.from(speciesSet.entries()).map(([scientific, info]) => ({
    scientific,
    common: info.common,
    facts: "", // no species facts for full run — Claude knows most species
  }));
}

// ---------------------------------------------------------------------------
// Print bios
// ---------------------------------------------------------------------------

function printBios(label: string, bios: string[]): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${label}`);
  console.log("=".repeat(60));
  for (let i = 0; i < bios.length; i++) {
    const tone =
      i < 12 ? "SWAGGER" : i < 19 ? "INNUENDO" : "KINKY";
    console.log(`  [${i.toString().padStart(2, "0")}] (${tone.padEnd(8)}) ${bios[i]}`);
  }
}

function printPoolBios(label: string, bios: string[]): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${label}`);
  console.log("=".repeat(60));
  for (let i = 0; i < bios.length; i++) {
    console.log(`  [${i.toString().padStart(2, "0")}] ${bios[i]}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isSmokeTest = args.includes("--smoke-test");
  const arborlogIdx = args.indexOf("--arborlog");
  const arborlogPath =
    arborlogIdx >= 0 ? resolve(args[arborlogIdx + 1]) : null;

  if (!isSmokeTest && !arborlogPath) {
    console.error(
      "Usage: npx tsx src/bio/generate-species.ts --smoke-test\n" +
        "       npx tsx src/bio/generate-species.ts --arborlog ../../arborlog/live-data",
    );
    process.exit(1);
  }

  // Load API key from env or .env file
  let apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Try loading from .env file in indexer root
    const envPath = resolve(__dirname, "../../.env");
    if (existsSync(envPath)) {
      const envContent = readFileSync(envPath, "utf-8");
      const match = envContent.match(/^ANTHROPIC_API_KEY=(.+)$/m);
      if (match) apiKey = match[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  if (!apiKey) {
    console.error(
      "Error: ANTHROPIC_API_KEY not found.\n" +
        "Set it as an env var or add it to indexer/.env",
    );
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });
  const cache = loadCache();

  // Determine species list
  let speciesList: SpeciesInfo[];
  if (isSmokeTest) {
    console.log("Running smoke test with 3 hardcoded species + elder + mystery");
    speciesList = SMOKE_TEST_SPECIES;
  } else {
    console.log(`Extracting species from ${arborlogPath}...`);
    speciesList = extractSpeciesFromArborlog(arborlogPath!);
    console.log(`Found ${speciesList.length} unique species`);
  }

  // Filter out already-cached species
  const uncached = speciesList.filter((s) => !(s.scientific in cache.species));
  console.log(
    `${uncached.length} species to generate (${speciesList.length - uncached.length} cached)`,
  );

  // Build species tasks
  const speciesTasks = uncached.map((species) => async () => {
    console.log(
      `Generating bios for ${species.common} (${species.scientific})...`,
    );
    const bios = await callClaude(
      client,
      buildSpeciesPrompt(species),
      species.scientific,
    );
    if (bios === null) return null;
    cache.species[species.scientific] = bios;
    saveCache(cache);
    return { species, bios };
  });

  // Run species generation
  const speciesResults = await runWithConcurrency(speciesTasks, CONCURRENCY);

  // Elder pool
  if (cache.elder.length === 0) {
    console.log("\nGenerating elder pool...");
    cache.elder = (await callClaude(client, ELDER_PROMPT, "elder")) ?? [];
    saveCache(cache);
  } else {
    console.log("\nElder pool already cached, skipping.");
  }

  // Mystery pool
  if (cache.mystery.length === 0) {
    console.log("Generating mystery pool...");
    cache.mystery = (await callClaude(client, MYSTERY_PROMPT, "mystery")) ?? [];
    saveCache(cache);
  } else {
    console.log("Mystery pool already cached, skipping.");
  }

  // Print all generated bios
  console.log("\n\n" + "=".repeat(60));
  console.log("  ALL GENERATED BIOS");
  console.log("=".repeat(60));

  for (const result of speciesResults) {
    if (result === null) continue;
    const kink = assignKinkCategory(result.species.scientific);
    printBios(
      `${result.species.common} (${result.species.scientific}) — kink: ${kink}`,
      result.bios,
    );
  }

  // Also print any previously cached species in the smoke test
  if (isSmokeTest) {
    for (const species of speciesList) {
      if (!speciesResults.find((r) => r.species.scientific === species.scientific)) {
        const kink = assignKinkCategory(species.scientific);
        printBios(
          `${species.common} (${species.scientific}) — kink: ${kink} [CACHED]`,
          cache.species[species.scientific],
        );
      }
    }
  }

  printPoolBios("ELDER POOL", cache.elder);
  printPoolBios("MYSTERY POOL", cache.mystery);

  console.log(`\nDone. ${Object.keys(cache.species).length} species in cache.`);
  console.log(`Cache saved to ${CACHE_PATH}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
