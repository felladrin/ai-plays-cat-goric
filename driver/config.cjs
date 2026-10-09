// Environment resolution for the driver. Every machine-specific value lives here
// and is overridable, so a clone runs without editing source.
//
// Rule followed throughout: a missing REQUIRED thing raises an explicit error
// naming the fix. Optional things have documented defaults. Nothing fails silently.
"use strict";

const path = require("path");
const fs = require("fs");

// --- Playwright ------------------------------------------------------------
// Resolution order:
//   1. PLAYWRIGHT_MODULE  - absolute path to a playwright install (global setups)
//   2. require("playwright") - the normal local install (driver/package.json)
// A global install is not on the default resolution path, which is why (1) exists.
function resolvePlaywright() {
  const override = process.env.PLAYWRIGHT_MODULE;
  if (override) {
    try {
      return require(override);
    } catch (e) {
      throw new Error(
        `PLAYWRIGHT_MODULE is set to "${override}" but could not be loaded: ${e.message}`
      );
    }
  }
  try {
    return require("playwright");
  } catch (e) {
    throw new Error(
      "playwright is not installed. Run:\n" +
        "  cd driver && npm install && npx playwright install chromium\n" +
        "Or point PLAYWRIGHT_MODULE at an existing playwright install."
    );
  }
}

// Let Playwright locate its own bundled browser unless a specific binary is named.
// Returns undefined (not a path) when unset, which is what chromium.launch expects.
function browserExecutablePath() {
  const exec = process.env.CHROME || process.env.PLAYWRIGHT_CHROMIUM;
  if (!exec) return undefined;
  if (!fs.existsSync(exec)) {
    throw new Error(`Browser executable not found at "${exec}" (from CHROME/PLAYWRIGHT_CHROMIUM).`);
  }
  return exec;
}

// --- Harness ---------------------------------------------------------------
const HARNESS_URL = process.env.HARNESS_URL || "http://127.0.0.1:5173/harness.html";

// --- Model endpoints -------------------------------------------------------
// Defaults are localhost so a clone targets its own machine. The project's own
// runs point JEV_LOCAL_BASE_URL at a LAN host; that host is not a default here.
const SIMPLE_JEV_BASE_URL = process.env.SIMPLE_JEV_BASE_URL || "http://127.0.0.1:8000";
// No default on purpose. The old fallback was 127.0.0.1:1234, a Caddy shim that
// answers HTTP 200 with an EMPTY body, so every misroute surfaced as
// "halogen-logprobs failed: status 200:" with nothing to act on. It has bitten
// twice in one session.
//
// Resolved on ACCESS, not at require time: requiring config.cjs must not need an
// endpoint, or the offline tools (tests, analysis) break for a variable they
// never read. Every reader is a runner or the client, so a getter throws only
// where a wrong port would actually have been used.
function llamaBaseUrl() {
  if (!process.env.LLAMA_BASE_URL) {
    throw new Error(
      "LLAMA_BASE_URL is unset. Point it at the halogen tunnel on port 1235, " +
        "which driver/experiments/lvl.sh exports for you. It is deliberately " +
        "not defaulted: port 1234 answers 200 with an empty body, so a default " +
        "turns a wrong port into a silent failure instead of a startup error.",
    );
  }
  return process.env.LLAMA_BASE_URL;
}
const DEMO_BASE_URL = process.env.DEMO_BASE_URL || "https://simple-jev-demo-api.featherless.ai";

// Loaded in-process so the key never passes through a shell command or a log.
// .env.local is gitignored by the root `*.local` rule. Resolved on access, like
// LLAMA_BASE_URL, so only the clef endpoint needs it.
// Searched upward from this file, so a frozen copy of driver/ (out/exp_*/driver)
// still finds the one at the repo root.
function findEnvLocal() {
  for (let dir = __dirname; ; dir = path.dirname(dir)) {
    const f = path.join(dir, ".env.local");
    if (fs.existsSync(f)) return f;
    if (path.dirname(dir) === dir) return null;
  }
}
// The hosted Decisions service. Base URL and key are named generically on
// purpose; the service is whatever DECISIONS_BASE_URL points at.
function decisionsBaseUrl() {
  if (!process.env.DECISIONS_BASE_URL && findEnvLocal()) process.loadEnvFile(findEnvLocal());
  if (!process.env.DECISIONS_BASE_URL) {
    throw new Error("DECISIONS_BASE_URL is unset. Point it at the hosted Decisions service, via the environment or the gitignored env file at the repo root.");
  }
  return process.env.DECISIONS_BASE_URL;
}
function decisionsApiKey() {
  const envLocal = process.env.DECISIONS_API_KEY ? null : findEnvLocal();
  if (envLocal) process.loadEnvFile(envLocal);
  if (!process.env.DECISIONS_API_KEY) {
    throw new Error("DECISIONS_API_KEY is unset. Add it to .env.local at the repo root, or export it.");
  }
  return process.env.DECISIONS_API_KEY;
}

// --- Output ----------------------------------------------------------------
// Run artifacts go under out/ in the repo, not /tmp: /tmp collides between
// concurrent runs and is not writable the same way on every platform.
const OUT_DIR = process.env.OUT_DIR || path.join(__dirname, "..", "out");

function outPath(name) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  return path.join(OUT_DIR, name);
}

module.exports = {
  resolvePlaywright,
  browserExecutablePath,
  HARNESS_URL,
  SIMPLE_JEV_BASE_URL,
    get LLAMA_BASE_URL() {
      return llamaBaseUrl();
    },
  DEMO_BASE_URL,
  get DECISIONS_BASE_URL() {
    return decisionsBaseUrl();
  },
  get DECISIONS_API_KEY() {
    return decisionsApiKey();
  },
  OUT_DIR,
  outPath,
};
