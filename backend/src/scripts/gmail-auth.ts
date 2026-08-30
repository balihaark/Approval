import "dotenv/config";
import http from "node:http";
import { URL } from "node:url";
import { exchangeCodeForTokens, getAuthUrl } from "../lib/gmail/client.js";
import { config } from "../config.js";

async function main() {
  if (!config.gmail.clientId || !config.gmail.clientSecret) {
    console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.");
    process.exit(1);
  }

  const listenUrl = new URL(config.gmail.redirectUri);
  const port = Number(listenUrl.port || 3001);

  const server = http.createServer(async (req, res) => {
    if (!req.url) return;
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname !== listenUrl.pathname) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    const error = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    if (error) {
      res.end(`OAuth error: ${error}`);
      server.close();
      process.exit(1);
    }
    if (!code) {
      res.end("Missing code");
      return;
    }
    try {
      const tokens = await exchangeCodeForTokens(code);
      const refresh = tokens.refresh_token;
      res.setHeader("Content-Type", "text/html");
      res.end(
        `<h1>Success</h1><p>Add this to .env as GMAIL_REFRESH_TOKEN:</p><pre>${refresh ?? "(none returned — revoke app access and retry)"}</pre>`
      );
      console.log("\nGMAIL_REFRESH_TOKEN=" + (refresh ?? ""));
      if (!refresh) {
        console.log(
          "No refresh token returned. Revoke the app at https://myaccount.google.com/permissions and run again."
        );
      }
    } catch (err) {
      res.statusCode = 500;
      res.end(String(err));
    } finally {
      setTimeout(() => {
        server.close();
        process.exit(0);
      }, 500);
    }
  });

  server.listen(port, () => {
    const url = getAuthUrl("cli");
    console.log(`Open this URL and sign in as ${config.gmail.user}:\n`);
    console.log(url);
    console.log(`\nWaiting for redirect on ${config.gmail.redirectUri} ...`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
