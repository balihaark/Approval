import { renewGmailWatch } from "../lib/gmail/watch.js";
import { gmailConfigured } from "../config.js";

async function main() {
  if (!gmailConfigured()) {
    console.error("Gmail OAuth is not fully configured.");
    process.exit(1);
  }
  const result = await renewGmailWatch();
  console.log(
    JSON.stringify(
      {
        historyId: result.historyId,
        expiration: result.expiration?.toISOString() ?? null,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
