// Guard test for simulate() clock audit.
// Parses decision.cjs, finds every simulate() call site, and asserts each site's
// clock argument matches the documented verdict table in docs/simulate-clock-audit.md.
// Constant-clock sites must carry a trailing marker comment:
//   // SIMULATE_CLOCK_AUDIT: constant <value> (VERDICT)
// Real-clock sites must pass a variable (not a numeric literal or named constant).
// Any new unmarked call site fails the test.
//
// LIMITS (text-based guard, accepted):
// - Only the FIRST simulate( on a line is detected; a second call on the same line
//   (e.g. a = simulate(..., mf, ...), b = simulate(..., 0, ...)) passes unmarked.
// - An aliased import (const { simulate: sim } = require("./arc.cjs")) defeats the
//   receiver check. Both bypasses require deliberate code changes; the census + the
//   audit doc are the real enforcement.

"use strict";

const fs = require("fs");
const path = require("path");

const DECISION_PATH = path.join(__dirname, "decision.cjs");
const AUDIT_PATH = path.join(__dirname, "..", "docs", "simulate-clock-audit.md");

function readFile(p) {
  return fs.readFileSync(p, "utf8");
}

function findNamedConstants(source) {
  const constants = new Map();
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Match: const NAME = NUMBER; (at module or function scope)
    const match = line.match(/^const\s+(\w+)\s*=\s*(-?\d+(?:\.\d+)?)\s*;/);
    if (match) {
      constants.set(match[1], match[2]);
    }
  }
  return constants;
}

function findSimulateCalls(source) {
  const calls = [];
  const lines = source.split("\n");

  // Track function context for each line
  const functionForLine = new Map();
  let currentFunction = "module";
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Detect function declarations
    const fnMatch = line.match(/^\s*(?:async\s+)?function\s+(\w+)\s*\(/);
    if (fnMatch) {
      currentFunction = fnMatch[1];
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      braceDepth += openBraces - closeBraces;
    } else {
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      braceDepth += openBraces - closeBraces;
      if (braceDepth <= 0) {
        currentFunction = "module";
        braceDepth = 0;
      }
    }
    functionForLine.set(i + 1, currentFunction);
  }

  // Find simulate( calls by scanning line by line, handling multi-line calls
  // We look for the pattern simulate( anywhere on a non-comment line
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Skip pure comment lines
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("/*")) {
      i++;
      continue;
    }

    // Find simulate( on this line (not in a comment)
    // Remove inline comment first
    const codePart = line.split("//")[0];
    const matchIdx = codePart.indexOf("simulate(");
    if (matchIdx === -1) {
      i++;
      continue;
    }

    // Found a simulate( call starting on this line
    // Extract the full call (may span multiple lines)
    let fullCall = line.slice(matchIdx);
    let parenCount = (fullCall.match(/\(/g) || []).length - (fullCall.match(/\)/g) || []).length;
    let j = i + 1;
    while (parenCount > 0 && j < lines.length) {
      const nextLine = lines[j];
      const nextCodePart = nextLine.split("//")[0];
      fullCall += " " + nextCodePart.trim();
      parenCount += (nextCodePart.match(/\(/g) || []).length;
      parenCount -= (nextCodePart.match(/\)/g) || []).length;
      j++;
    }

    const fullCallClean = fullCall.replace(/\s+/g, " ").trim();

    calls.push({
      lineNum: i + 1,
      line: line.trim(),
      fullCall: fullCallClean,
      functionName: functionForLine.get(i + 1) || "unknown",
    });

    // Continue searching from the next line after the call ends
    i = j;
  }

  // Deduplicate by lineNum
  const seen = new Set();
  return calls.filter(c => {
    if (seen.has(c.lineNum)) return false;
    seen.add(c.lineNum);
    return true;
  });
}

function extractClockArg(fullCall) {
  const args = [];
  let current = "";
  let depth = 0;
  let inTemplate = false;
  let templateDepth = 0;

  const startIdx = fullCall.indexOf("simulate(");
  if (startIdx === -1) return null;

  let i = startIdx + 9;
  while (i < fullCall.length) {
    const ch = fullCall[i];

    if (inTemplate) {
      if (ch === "`") {
        inTemplate = false;
        current += ch;
      } else if (ch === "$" && fullCall[i + 1] === "{") {
        templateDepth++;
        current += ch;
      } else if (ch === "}" && templateDepth > 0) {
        templateDepth--;
        current += ch;
      } else {
        current += ch;
      }
    } else {
      if (ch === "`") {
        inTemplate = true;
        current += ch;
      } else if (ch === "(") {
        depth++;
        current += ch;
      } else if (ch === ")") {
        if (depth === 0) {
          args.push(current.trim());
          break;
        }
        depth--;
        current += ch;
      } else if (ch === "," && depth === 0) {
        args.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    i++;
  }

  return args[6] || null;
}

function hasMarkerComment(line, lineNum, source) {
  if (line.includes("SIMULATE_CLOCK_AUDIT:")) return true;
  const lines = source.split("\n");
  if (lineNum < lines.length) {
    const nextLine = lines[lineNum].trim();
    if (nextLine.startsWith("// SIMULATE_CLOCK_AUDIT:")) return true;
  }
  return false;
}

function getMarkerVerdict(line, lineNum, source) {
  const lines = source.split("\n");
  let commentMatch = line.match(/SIMULATE_CLOCK_AUDIT:\s*constant\s+(\S+)\s*\(([^)]+)\)/);
  if (commentMatch) return { value: commentMatch[1], verdict: commentMatch[2].trim() };
  if (lineNum < lines.length) {
    commentMatch = lines[lineNum].match(/SIMULATE_CLOCK_AUDIT:\s*constant\s+(\S+)\s*\(([^)]+)\)/);
    if (commentMatch) return { value: commentMatch[1], verdict: commentMatch[2].trim() };
  }
  return null;
}

function isRealClockArg(arg, namedConstants) {
  if (!arg) return false;
  const trimmed = arg.trim();
  // Numeric literal
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return false;
  // Named constant that resolves to a number
  if (namedConstants.has(trimmed)) return false;
  // It's a variable or expression
  return true;
}

function parseAuditVerdicts(auditSource) {
  // Parse the summary table keyed by line number (existing format)
  const verdicts = new Map();
  const lines = auditSource.split("\n");
  let inTable = false;
  for (const line of lines) {
    if (line.includes("| Site | Function | Line | Clock | Verdict |")) {
      inTable = true;
      continue;
    }
    if (inTable && line.startsWith("|")) {
      // Parse table row: | 1 | `floorBelow` | 398 | real `mf` | DEFENSIBLE |
      // Function column may have extra text after the backtick-wrapped name
      // Clock column may be "real `mf`" or "`0`"
      // Verdict may have **bold** markers
      const match = line.match(/\|\s*\d+\s*\|\s*`([^`]+)`[^|]*\|\s*(\d+)\s*\|\s*([^|]+)\|\s*\*?\*?([^*|]+)\*?\*?\s*\|/);
      if (match) {
        const funcName = match[1].trim();
        const lineNum = parseInt(match[2], 10);
        let clockVal = match[3].trim();
        // Normalize clock value: strip all backticks, remove "real " prefix
        clockVal = clockVal.replace(/`/g, "").replace(/^real\s+/, "");
        const verdict = match[4].trim();
        verdicts.set(lineNum, { lineNum, clock: clockVal, verdict, funcName });
      }
    }
    if (inTable && !line.startsWith("|")) {
      break;
    }
  }
  return verdicts;
}

function main() {
  const source = readFile(DECISION_PATH);
  const calls = findSimulateCalls(source);
  const auditSource = readFile(AUDIT_PATH);
  const auditVerdicts = parseAuditVerdicts(auditSource);
  const namedConstants = findNamedConstants(source);

  console.log(`Found ${calls.length} simulate() call sites in decision.cjs`);
  console.log(`Found ${namedConstants.size} named numeric constants`);

  // Assign site index per function (for reporting)
  const siteIndexByFunc = new Map();
  const callsWithIndex = calls.map(c => {
    const idx = (siteIndexByFunc.get(c.functionName) || 0) + 1;
    siteIndexByFunc.set(c.functionName, idx);
    return { ...c, siteIdx: idx };
  });

  let passed = 0;
  let failed = 0;
  const errors = [];

  for (const call of callsWithIndex) {
    const clockArg = extractClockArg(call.fullCall);
    const hasMarker = hasMarkerComment(call.line, call.lineNum, source);
    const marker = getMarkerVerdict(call.line, call.lineNum, source);
    const isRealClock = isRealClockArg(clockArg, namedConstants);
    // Match audit doc by line number
    const auditEntry = auditVerdicts.get(call.lineNum);

    console.log(`\n  ${call.functionName}#${call.siteIdx} (line ${call.lineNum}): clockArg="${clockArg}" isRealClock=${isRealClock} hasMarker=${hasMarker} ${marker ? `marker="${marker.value} (${marker.verdict})"` : ""} ${auditEntry ? `audit="${auditEntry.clock} (${auditEntry.verdict})"` : ""}`);

    if (isRealClock) {
      if (hasMarker) {
        errors.push(`${call.functionName}#${call.siteIdx} (line ${call.lineNum}): Real-clock site has SIMULATE_CLOCK_AUDIT marker (should only be on constant sites)`);
        failed++;
      } else {
        if (auditEntry && (auditEntry.clock === "0" || auditEntry.clock === "1")) {
          errors.push(`${call.functionName}#${call.siteIdx} (line ${call.lineNum}): Code has real clock (${clockArg}) but audit doc says constant ${auditEntry.clock}`);
          failed++;
        } else {
          console.log(`    OK: Real-clock site (${clockArg})`);
          passed++;
        }
      }
    } else {
      if (!hasMarker) {
        errors.push(`${call.functionName}#${call.siteIdx} (line ${call.lineNum}): Constant-clock site (value=${clockArg}) missing SIMULATE_CLOCK_AUDIT marker`);
        failed++;
      } else if (!marker) {
        errors.push(`${call.functionName}#${call.siteIdx} (line ${call.lineNum}): Has marker but couldn't parse it`);
        failed++;
      } else {
        if (marker.value !== clockArg) {
          errors.push(`${call.functionName}#${call.siteIdx} (line ${call.lineNum}): Marker value ${marker.value} doesn't match actual constant ${clockArg}`);
          failed++;
        } else if (auditEntry) {
          if (auditEntry.clock !== clockArg) {
            errors.push(`${call.functionName}#${call.siteIdx} (line ${call.lineNum}): Audit doc clock ${auditEntry.clock} doesn't match code clock ${clockArg}`);
            failed++;
          } else if (marker.verdict !== auditEntry.verdict) {
            errors.push(`${call.functionName}#${call.siteIdx} (line ${call.lineNum}): Marker verdict "${marker.verdict}" doesn't match audit doc verdict "${auditEntry.verdict}"`);
            failed++;
          } else {
            console.log(`    OK: Constant-clock site (${clockArg}) marked as ${marker.verdict} (matches audit)`);
            passed++;
          }
        } else {
          errors.push(`${call.functionName}#${call.siteIdx} (line ${call.lineNum}): Constant-clock site not found in audit doc summary table`);
          failed++;
        }
      }
    }
  }

  // Verify audit doc has entries for all constant sites (by line number)
  const constantSitesInCode = callsWithIndex.filter(c => !isRealClockArg(extractClockArg(c.fullCall), namedConstants));
  const constantLinesInCode = new Set(constantSitesInCode.map(c => c.lineNum));
  const constantLinesInAudit = new Set(Array.from(auditVerdicts.values())
    .filter(v => v.clock === "0" || v.clock === "1")
    .map(v => v.lineNum));

  console.log(`\nConstant sites in code: ${constantSitesInCode.length}`);
  console.log(`Constant sites in audit doc: ${constantLinesInAudit.size}`);

  // Check for missing audit entries
  for (const lineNum of constantLinesInCode) {
    if (!constantLinesInAudit.has(lineNum)) {
      const call = constantSitesInCode.find(c => c.lineNum === lineNum);
      errors.push(`${call.functionName}#${call.siteIdx} (line ${lineNum}): Constant-clock site not found in audit doc summary table`);
      failed++;
    }
  }
  // Check for stale audit entries
  for (const lineNum of constantLinesInAudit) {
    if (!constantLinesInCode.has(lineNum)) {
      errors.push(`Audit doc has constant-clock entry for line ${lineNum} but no such site exists in code`);
      failed++;
    }
  }

  // Also verify all real-clock sites are in audit doc
  const realClockSitesInCode = callsWithIndex.filter(c => isRealClockArg(extractClockArg(c.fullCall), namedConstants));
  const realClockLinesInCode = new Set(realClockSitesInCode.map(c => c.lineNum));
  const realClockLinesInAudit = new Set(Array.from(auditVerdicts.values())
    .filter(v => v.clock !== "0" && v.clock !== "1")
    .map(v => v.lineNum));

  console.log(`Real-clock sites in code: ${realClockSitesInCode.length}`);
  console.log(`Real-clock sites in audit doc: ${realClockLinesInAudit.size}`);

  for (const lineNum of realClockLinesInCode) {
    if (!realClockLinesInAudit.has(lineNum)) {
      const call = realClockSitesInCode.find(c => c.lineNum === lineNum);
      errors.push(`${call.functionName}#${call.siteIdx} (line ${lineNum}): Real-clock site not found in audit doc summary table`);
      failed++;
    }
  }
  for (const lineNum of realClockLinesInAudit) {
    if (!realClockLinesInCode.has(lineNum)) {
      errors.push(`Audit doc has real-clock entry for line ${lineNum} but no such site exists in code`);
      failed++;
    }
  }

  console.log(`\n--- RESULT ---`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (errors.length) {
    console.log("\nERRORS:");
    for (const e of errors) console.log(`  - ${e}`);
    process.exit(1);
  }

  console.log("All checks passed.");
  process.exit(0);
}

main();