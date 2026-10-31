const keys = Object.keys(process.env).filter(k => /ACTIONS_|GITHUB_TOKEN/.test(k)).sort();
console.log("PROBE_KEYS=" + JSON.stringify(keys));
console.log("RT=" + (process.env.ACTIONS_RUNTIME_TOKEN ? "present len " + process.env.ACTIONS_RUNTIME_TOKEN.length : "absent"));
console.log("RURL=" + (process.env.ACTIONS_RESULTS_URL || "absent"));
