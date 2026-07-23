const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

fs.rmSync("dist", { recursive: true, force: true });

const command = process.platform === "win32" ? "tsc.cmd" : "tsc";
const result = spawnSync(command, {
  stdio: "inherit",
  shell: true,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

// npm exposes the CLI entrypoint directly as a bin target; preserve its executable bit
// after tsc recreates the dist directory.
if (process.platform !== "win32") {
  fs.chmodSync("dist/cli.js", 0o755);
}
