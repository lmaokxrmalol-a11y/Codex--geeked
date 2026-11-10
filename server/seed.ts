import "dotenv/config";
import { ensureCatalogIsCurrent } from "./db";

await ensureCatalogIsCurrent();
console.log("Codex-geeked catalog is up to date.");
process.exit(0);
