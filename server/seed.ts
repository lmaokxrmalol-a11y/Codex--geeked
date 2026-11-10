import "dotenv/config";
import { seedCatalogIfEmpty } from "./db";

const seeded = await seedCatalogIfEmpty();
console.log(seeded ? "Leaf & Lore catalog seeded." : "Leaf & Lore catalog already contains data.");
process.exit(0);
