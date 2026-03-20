const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const RUNTIME_DIR = path.join(ROOT, "runtime");

const POKEMON_ALL_PATH = path.join(RUNTIME_DIR, "pokemon-all.json");
const CATCH_RATES_PATH = path.join(RUNTIME_DIR, "catch-rates.json");
const RARITY_GROUPS_PATH = path.join(RUNTIME_DIR, "rarity-groups.json");

const OUTPUTS = {
  common: path.join(RUNTIME_DIR, "common.txt"),
  uncommon: path.join(RUNTIME_DIR, "uncommon.txt"),
  rare: path.join(RUNTIME_DIR, "rare.txt"),
  regional: path.join(RUNTIME_DIR, "regional.txt"),
  legendary: path.join(RUNTIME_DIR, "legendary.txt"),
  mythical: path.join(RUNTIME_DIR, "mythical.txt"),
  mega: path.join(RUNTIME_DIR, "mega.txt"),
  gmax: path.join(RUNTIME_DIR, "gmax.txt"),
  shinyAll: path.join(RUNTIME_DIR, "shiny-all.txt"),
  starterList: path.join(RUNTIME_DIR, "starter-list.txt"),
  summary: path.join(RUNTIME_DIR, "pokemon-summary.json")
};

const VALID_RARITIES = new Set([
  "common",
  "uncommon",
  "rare",
  "regional",
  "legendary",
  "mythical",
  "mega",
  "gmax"
]);

const VALID_FORM_TYPES = new Set([
  "base",
  "regional",
  "mega",
  "gmax",
  "alternate"
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeTextFile(filePath, lines) {
  const content = lines.join("\n").trim() + "\n";
  fs.writeFileSync(filePath, content, "utf8");
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function padDex(dex) {
  return String(dex).padStart(4, "0");
}

function normalizeTag(tag) {
  return String(tag || "").trim().toLowerCase();
}

function sortPokemon(a, b) {
  if (a.dex !== b.dex) return a.dex - b.dex;
  return a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base" });
}

function getResolvedCatchRate(entry, catchRates) {
  if (typeof entry.catchRateOverride === "number") {
    return entry.catchRateOverride;
  }

  if (
    catchRates &&
    catchRates._overrides &&
    Object.prototype.hasOwnProperty.call(catchRates._overrides, entry.id)
  ) {
    return catchRates._overrides[entry.id];
  }

  if (
    entry.catchRateKey &&
    catchRates &&
    catchRates._keys &&
    Object.prototype.hasOwnProperty.call(catchRates._keys, entry.catchRateKey)
  ) {
    return catchRates._keys[entry.catchRateKey];
  }

  if (
    catchRates &&
    catchRates._defaults &&
    Object.prototype.hasOwnProperty.call(catchRates._defaults, entry.rarity)
  ) {
    return catchRates._defaults[entry.rarity];
  }

  return null;
}

function validatePokemon(entries, catchRates, rarityGroups) {
  const errors = [];
  const seenIds = new Set();

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      errors.push("Found a non-object entry in pokemon-all.json.");
      continue;
    }

    if (!entry.id || typeof entry.id !== "string") {
      errors.push(`Entry missing valid id: ${JSON.stringify(entry)}`);
    } else if (seenIds.has(entry.id)) {
      errors.push(`Duplicate id found: ${entry.id}`);
    } else {
      seenIds.add(entry.id);
    }

    if (typeof entry.dex !== "number" || !Number.isInteger(entry.dex) || entry.dex < 1) {
      errors.push(`Invalid dex for ${entry.id || "(unknown id)"}.`);
    }

    if (!entry.displayName || typeof entry.displayName !== "string") {
      errors.push(`Missing displayName for ${entry.id || "(unknown id)"}.`);
    }

    if (!entry.baseSpecies || typeof entry.baseSpecies !== "string") {
      errors.push(`Missing baseSpecies for ${entry.id || "(unknown id)"}.`);
    }

    if (!entry.formCode || typeof entry.formCode !== "string") {
      errors.push(`Missing formCode for ${entry.id || "(unknown id)"}.`);
    }

    if (!VALID_FORM_TYPES.has(entry.formType)) {
      errors.push(
        `Invalid formType for ${entry.id || "(unknown id)"}: ${entry.formType}`
      );
    }

    if (!VALID_RARITIES.has(entry.rarity)) {
      errors.push(
        `Invalid rarity for ${entry.id || "(unknown id)"}: ${entry.rarity}`
      );
    }

    if (!Array.isArray(entry.types) || entry.types.length < 1 || entry.types.length > 2) {
      errors.push(`Invalid types for ${entry.id || "(unknown id)"}.`);
    }

    if (typeof entry.canBeShiny !== "boolean") {
      errors.push(`canBeShiny must be true/false for ${entry.id || "(unknown id)"}.`);
    }

    if (typeof entry.enabled !== "boolean") {
      errors.push(`enabled must be true/false for ${entry.id || "(unknown id)"}.`);
    }

    if (!Array.isArray(entry.tags)) {
      errors.push(`tags must be an array for ${entry.id || "(unknown id)"}.`);
    }

    if (entry.catchRateKey != null) {
      if (
        !catchRates._keys ||
        !Object.prototype.hasOwnProperty.call(catchRates._keys, entry.catchRateKey)
      ) {
        errors.push(
          `Unknown catchRateKey "${entry.catchRateKey}" on ${entry.id || "(unknown id)"}.`
        );
      }
    }

    if (entry.catchRateOverride != null) {
      if (
        typeof entry.catchRateOverride !== "number" ||
        entry.catchRateOverride < 0 ||
        entry.catchRateOverride > 100
      ) {
        errors.push(
          `Invalid catchRateOverride on ${entry.id || "(unknown id)"}.`
        );
      }
    }

    const expectedPrefix = `${padDex(entry.dex)}-`;
    if (entry.id && !entry.id.startsWith(expectedPrefix)) {
      errors.push(
        `ID "${entry.id}" does not match dex ${entry.dex}. Expected prefix ${expectedPrefix}`
      );
    }
  }

  for (const rarity of VALID_RARITIES) {
    if (!rarityGroups[rarity] || typeof rarityGroups[rarity].weight !== "number") {
      errors.push(`Missing rarity weight for "${rarity}" in rarity-groups.json.`);
    }

    if (
      !catchRates._defaults ||
      typeof catchRates._defaults[rarity] !== "number"
    ) {
      errors.push(`Missing default catch rate for "${rarity}" in catch-rates.json.`);
    }
  }

  return errors;
}

function buildOutputs(entries, catchRates) {
  const enabledEntries = entries
    .filter((p) => p.enabled)
    .sort(sortPokemon);

  const byRarity = {
    common: [],
    uncommon: [],
    rare: [],
    regional: [],
    legendary: [],
    mythical: [],
    mega: [],
    gmax: []
  };

  const starterList = [];
  const shinyAll = [];

  const summary = {
    totalEntries: enabledEntries.length,
    byRarity: {},
    byFormType: {},
    byRegion: {},
    speciesCount: 0,
    formEntries: 0,
    shinyEligible: 0,
    starters: 0,
    generatedAt: new Date().toISOString()
  };

  const seenSpecies = new Set();

  for (const entry of enabledEntries) {
    byRarity[entry.rarity].push(entry.displayName);

    if (entry.canBeShiny) {
      shinyAll.push(entry.displayName);
      summary.shinyEligible++;
    }

    const tags = new Set((entry.tags || []).map(normalizeTag));
    if (tags.has("starter")) {
      starterList.push(entry.displayName);
      summary.starters++;
    }

    seenSpecies.add(entry.dex);

    summary.byRarity[entry.rarity] = (summary.byRarity[entry.rarity] || 0) + 1;
    summary.byFormType[entry.formType] = (summary.byFormType[entry.formType] || 0) + 1;

    const regionKey = entry.region || "none";
    summary.byRegion[regionKey] = (summary.byRegion[regionKey] || 0) + 1;

    if (entry.formType !== "base") {
      summary.formEntries++;
    }

    entry.resolvedCatchRate = getResolvedCatchRate(entry, catchRates);
  }

  summary.speciesCount = seenSpecies.size;

  return {
    enabledEntries,
    byRarity,
    starterList,
    shinyAll,
    summary
  };
}

function main() {
  if (!fs.existsSync(POKEMON_ALL_PATH)) {
    throw new Error(`Missing file: ${POKEMON_ALL_PATH}`);
  }
  if (!fs.existsSync(CATCH_RATES_PATH)) {
    throw new Error(`Missing file: ${CATCH_RATES_PATH}`);
  }
  if (!fs.existsSync(RARITY_GROUPS_PATH)) {
    throw new Error(`Missing file: ${RARITY_GROUPS_PATH}`);
  }

  const pokemonAll = readJson(POKEMON_ALL_PATH);
  const catchRates = readJson(CATCH_RATES_PATH);
  const rarityGroups = readJson(RARITY_GROUPS_PATH);

  if (!Array.isArray(pokemonAll)) {
    throw new Error("pokemon-all.json must contain a JSON array.");
  }

  const errors = validatePokemon(pokemonAll, catchRates, rarityGroups);
  if (errors.length > 0) {
    console.error("Validation failed:\n");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  const result = buildOutputs(pokemonAll, catchRates);

  writeTextFile(OUTPUTS.common, result.byRarity.common);
  writeTextFile(OUTPUTS.uncommon, result.byRarity.uncommon);
  writeTextFile(OUTPUTS.rare, result.byRarity.rare);
  writeTextFile(OUTPUTS.regional, result.byRarity.regional);
  writeTextFile(OUTPUTS.legendary, result.byRarity.legendary);
  writeTextFile(OUTPUTS.mythical, result.byRarity.mythical);
  writeTextFile(OUTPUTS.mega, result.byRarity.mega);
  writeTextFile(OUTPUTS.gmax, result.byRarity.gmax);
  writeTextFile(OUTPUTS.shinyAll, result.shinyAll);
  writeTextFile(OUTPUTS.starterList, result.starterList);
  writeJson(OUTPUTS.summary, result.summary);

  console.log("Build complete.");
  console.log(`Enabled entries: ${result.summary.totalEntries}`);
  console.log(`Unique species: ${result.summary.speciesCount}`);
  console.log(`Form entries: ${result.summary.formEntries}`);
}

main();
