import { config, gmailConfigured } from "../config.js";
import { getGmail } from "../lib/gmail/client.js";

async function main() {
  console.log("Checking Gmail Configuration...");
  console.log(`  GOOGLE_CLIENT_ID:     ${config.gmail.clientId ? "OK" : "MISSING"}`);
  console.log(`  GOOGLE_CLIENT_SECRET: ${config.gmail.clientSecret ? "OK" : "MISSING"}`);
  console.log(`  GMAIL_USER:           ${config.gmail.user || "MISSING"}`);
  console.log(`  GMAIL_REFRESH_TOKEN:  ${config.gmail.refreshToken ? "OK" : "MISSING"}`);

  if (!gmailConfigured()) {
    console.warn("\nGmail is not fully configured (missing Client ID, Secret, or Refresh Token).");
    process.exit(1);
  }

  try {
    const gmail = getGmail();
    const profile = await gmail.users.getProfile({ userId: "me" });
    console.log("\nSuccessfully connected to Gmail!");
    console.log(`  Email:      ${profile.data.emailAddress}`);
    console.log(`  History ID: ${profile.data.historyId}`);
  } catch (err) {
    console.error("\nFailed to connect to Gmail API:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});