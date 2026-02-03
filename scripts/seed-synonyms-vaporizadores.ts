import "dotenv/config";
import { upsertSynonymsConfig } from "../lib/kb-v2/tables/synonyms";
import { ensureIndexes } from "../lib/models";

const VAPORIZADORES_GROUP = {
  terms: ["vaporizador", "vapo", "vape", "v4po", "v4porizador"],
  category: "products",
  enabled: true,
};

async function main() {
  const sessionId = process.env.SESSION_ID ?? process.env.KB_SESSION_ID ?? "";
  if (!sessionId.trim()) {
    console.error(
      "Set SESSION_ID or KB_SESSION_ID to the target session (e.g. astro-grow)."
    );
    process.exit(1);
  }
  await ensureIndexes();
  await upsertSynonymsConfig(sessionId.trim(), [VAPORIZADORES_GROUP]);
  console.log(`Synonyms config updated for sessionId=${sessionId.trim()}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
