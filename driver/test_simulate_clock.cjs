// Guard test for simulate() clock audit.
// Parses decision.cjs, finds every simulate() call site, and asserts each site's
// clock argument matches the documented verdict table in docs/simulate-clock-audit.md.
// Constant-clock sites must carry a trailing marker comment:
//   // SIMULATE_CLOCK_AUDIT: constant <value> (VERDICT)
// Real-clock sites must pass a variable (not a numeric literal).
// Any new unmarked call site fails the test.

"use strict";

const fs = require("fs");
const path = require("path");

const DECISION_PATH = path.join(__dirname, "decision.cjs");
const AUDIT_PATH = path.join(__dirname, "..", "docs", "simulate-clock-audit.md");

function readFile(p) {
  return fs.readFileSync(p, "utf8");
}

function findSimulateCalls(source) {
  const calls = [];
  const lines = source.split("\n");
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match simulate( calls - could be const r = simulate( or const arc = simulate( etc.
    const match = line.match(/^\s*(?:const|let|var)\s+\w+\s*=\s*simulate\((.*)$/);
    if (match) {
      // The call might span multiple lines. Find the closing paren.
      let fullCall = line;
      let parenCount = (line.match(/\(/g) || []).length - (line.match(/\)/g) || []).length;
      let j = i + 1;
      while (parenCount > 0 && j < lines.length) {
        fullCall += " " + lines[j].trim();
        parenCount += (lines[j].match(/\(/g) || []).length;
        parenCount -= (lines[j].match(/\)/g) || []).length;
        j++;
      }
      calls.push({ lineNum: i + 1, line: line.trim(), fullCall: fullCall.trim() });
    }
  }
  return calls;
}

function extractClockArg(fullCall) {
  // The simulate signature: simulate(level, x, y, dy, catHeight, action, movingFrames, opts)
  // We need the 7th argument (movingFrames).
  // Parse arguments accounting for nested parens and template literals.
  const args = [];
  let current = "";
  let depth = 0;
  let inTemplate = false;
  let templateDepth = 0;
  
  // Find the opening paren of simulate(
  const startIdx = fullCall.indexOf("simulate(");
  if (startIdx === -1) return null;
  
  let i = startIdx + 9; // skip "simulate("
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
          // End of simulate call
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
  
  // movingFrames is the 7th argument (index 6)
  return args[6] || null;
}

function hasMarkerComment(line, lineNum, source) {
  // Check for trailing comment on the same line
  if (line.includes("SIMULATE_CLOCK_AUDIT:")) return true;
  // Check for comment on the next line (for multi-line calls)
  const lines = source.split("\n");
  if (lineNum < lines.length) {
    const nextLine = lines[lineNum].trim();
    if (nextLine.startsWith("// SIMULATE_CLOCK_AUDIT:")) return true;
  }
  return false;
}

function getMarkerVerdict(line, lineNum, source) {
  const lines = source.split("\n");
  // Check current line
  let commentMatch = line.match(/SIMULATE_CLOCK_AUDIT:\s*constant\s+(\d+)\s*\(([^)]+)\)/);
  if (commentMatch) return { value: commentMatch[1], verdict: commentMatch[2].trim() };
  // Check next line
  if (lineNum < lines.length) {
    commentMatch = lines[lineNum].match(/SIMULATE_CLOCK_AUDIT:\s*constant\s+(\d+)\s*\(([^)]+)\)/);
    if (commentMatch) return { value: commentMatch[1], verdict: commentMatch[2].trim() };
  }
  return null;
}

function isRealClockArg(arg) {
  // Real clock args are variables like: mf, mfNow, movingFrames, etc.
  // Not numeric literals like 0, 1, 42
  if (!arg) return false;
  const trimmed = arg.trim();
  // Numeric literal
  if (/^\d+$/.test(trimmed)) return false;
  // Negative numeric literal
  if (/^-\d+$/.test(trimmed)) return false;
  // It's a variable or expression
  return true;
}

function parseAuditVerdicts(auditSource) {
  // Parse the summary table to get expected verdict per line number
  const verdicts = {};
  const lines = auditSource.split("\n");
  let inTable = false;
  for (const line of lines) {
    if (line.includes("| Site | Function | Line | Clock | Verdict |")) {
      inTable = true;
      continue;
    }
    if (inTable && line.startsWith("|")) {
      // Parse table row: | 5 | `buildObjectiveCall` descent cost | 782 | `0` | **LATENT-DEFECT** |
      const match = line.match(/\|\s*\d+\s*\|\s*[^|]+\s*\|\s*(\d+)\s*\|\s*`(\d+)`\s*\|\s*\*?\*?([^*|]+)\*?\*?\s*\|/);
      if (match) {
        const lineNum = parseInt(match[1], 10);
        const clockVal = match[2];
        const verdict = match[3].trim();
        verdicts[lineNum] = { clock: clockVal, verdict };
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
  
  console.log(`Found ${calls.length} simulate() call sites in decision.cjs`);
  
  let passed = 0;
  let failed = 0;
  const errors = [];
  
  for (const call of calls) {
    const clockArg = extractClockArg(call.fullCall);
    const hasMarker = hasMarkerComment(call.line, call.lineNum, source);
    const marker = getMarkerVerdict(call.line, call.lineNum, source);
    const isRealClock = isRealClockArg(clockArg);
    const auditEntry = auditVerdicts[call.lineNum];
    
    console.log(`\n  Line ${call.lineNum}: clockArg="${clockArg}" isRealClock=${isRealClock} hasMarker=${hasMarker} ${marker ? `marker="${marker.value} (${marker.verdict})"` : ""} ${auditEntry ? `audit="${auditEntry.clock} (${auditEntry.verdict})"` : ""}`);
    
    if (isRealClock) {
      // Real-clock site: must NOT have a constant marker (or if it does, it's an error)
      if (hasMarker) {
        errors.push(`Line ${call.lineNum}: Real-clock site has SIMULATE_CLOCK_AUDIT marker (should only be on constant sites)`);
        failed++;
      } else {
        // Verify audit doc has this as a real-clock site
        if (auditEntry && (auditEntry.clock === "0" || auditEntry.clock === "1")) {
          errors.push(`Line ${call.lineNum}: Code has real clock (${clockArg}) but audit doc says constant ${auditEntry.clock}`);
          failed++;
        } else {
          console.log(`    OK: Real-clock site (${clockArg})`);
          passed++;
        }
      }
    } else {
      // Constant-clock site: MUST have marker comment
      if (!hasMarker) {
        errors.push(`Line ${call.lineNum}: Constant-clock site (value=${clockArg}) missing SIMULATE_CLOCK_AUDIT marker`);
        failed++;
      } else if (!marker) {
        errors.push(`Line ${call.lineNum}: Has marker but couldn't parse it`);
        failed++;
      } else {
        // Verify the marker value matches the actual constant
        if (marker.value !== clockArg) {
          errors.push(`Line ${call.lineNum}: Marker value ${marker.value} doesn't match actual constant ${clockArg}`);
          failed++;
        } else if (auditEntry) {
          // Verify verdict matches audit doc
          if (auditEntry.clock !== clockArg) {
            errors.push(`Line ${call.lineNum}: Audit doc clock ${auditEntry.clock} doesn't match code clock ${clockArg}`);
            failed++;
          } else if (marker.verdict !== auditEntry.verdict) {
            errors.push(`Line ${call.lineNum}: Marker verdict "${marker.verdict}" doesn't match audit doc verdict "${auditEntry.verdict}"`);
            failed++;
          } else {
            console.log(`    OK: Constant-clock site (${clockArg}) marked as ${marker.verdict} (matches audit)`);
            passed++;
          }
        } else {
          errors.push(`Line ${call.lineNum}: Constant-clock site not found in audit doc summary table`);
          failed++;
        }
      }
    }
  }
  
  // Also verify the audit doc has entries for all constant sites
  const constantSitesInAudit = Object.keys(auditVerdicts).length;
  const constantSitesInCode = calls.filter(c => !isRealClockArg(extractClockArg(c.fullCall))).length;
  
  console.log(`\nConstant sites in code: ${constantSitesInCode}`);
  console.log(`Constant sites in audit doc: ${constantSitesInAudit}`);
  
  if (constantSitesInCode !== constantSitesInAudit) {
    errors.push(`Mismatch: ${constantSitesInCode} constant sites in code vs ${constantSitesInAudit} in audit doc`);
    failed++;
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