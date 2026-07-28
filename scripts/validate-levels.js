const levels = require("../level-engine");

const result = levels.validateAll();
if (!result.ok) {
  console.error(result.errors.join("\n"));
  process.exit(1);
}
console.log("1200 niveaus gecontroleerd: uniek, geldig en oplopend waar van toepassing.");
