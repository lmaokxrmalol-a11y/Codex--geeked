import "dotenv/config";
import { ensureCatalogIsCurrent } from "./db";
import { seedLocalTestAccounts } from "./localStore";

await seedLocalTestAccounts();
if (process.env.DATABASE_URL) {
  await ensureCatalogIsCurrent();
  console.log("Starter catalog is up to date.");
} else {
  console.info(
    "[Seed] Skipping MySQL catalog sync because DATABASE_URL is not configured"
  );
}
console.log("Leaflore development test accounts are up to date.");
process.exit(0);
