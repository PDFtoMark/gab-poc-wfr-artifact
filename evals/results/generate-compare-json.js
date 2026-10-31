// trusted reporter script (baseline copy committed on the default branch)
const fs = require("fs");
console.log("TRUSTED_SCRIPT_EXECUTED");
fs.writeFileSync("trusted-ran.txt", "trusted");
