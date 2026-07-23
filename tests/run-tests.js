"use strict";

const fs = require("node:fs");
const path = require("node:path");

let failures = 0;

async function main() {
  const specFiles = discoverSpecFiles();
  for (const specFile of specFiles) {
    const loaded = require(path.join(__dirname, specFile));
    if (typeof loaded.run === "function") {
      await runLegacySuite(specFile, loaded);
      continue;
    }
    if (Array.isArray(loaded.tests)) {
      await runNamedSuite(specFile, loaded);
      continue;
    }
    failures += 1;
    console.error(`Unknown suite shape in ${specFile}`);
  }

  if (failures > 0) {
    process.exit(1);
  }
}

function discoverSpecFiles() {
  return fs.readdirSync(__dirname)
    .filter((entry) => entry.endsWith(".spec.js"))
    .filter((entry) => entry !== "helpers.js")
    .sort((left, right) => left.localeCompare(right));
}

async function runLegacySuite(specFile, suite) {
  try {
    await suite.run();
  } catch (error) {
    failures += 1;
    console.error(`Suite failed: ${specFile}`);
    console.error(error instanceof Error ? error.stack : error);
  }
}

async function runNamedSuite(specFile, suite) {
  const suiteName = suite.name || specFile;
  for (const test of suite.tests) {
    try {
      await test.run();
    } catch (error) {
      failures += 1;
      console.error(`Suite failed: ${suiteName} (${specFile})`);
      console.error(`Test failed: ${test.name}`);
      console.error(error instanceof Error ? error.stack : error);
    }
  }
}

void main();
