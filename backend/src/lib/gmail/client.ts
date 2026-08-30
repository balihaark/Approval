import { google, gmail_v1 } from "googleapis";
import { config, gmailConfigured } from "../../config.js";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];

export function getOAuth2Client() {
  const { clientId, clientSecret, redirectUri } = config.gmail;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getAuthUrl(state?: string): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  return tokens;
}

export function getAuthorizedClient() {
  if (!gmailConfigured()) {
    throw new Error("Gmail is not fully configured (missing refresh token)");
  }
  const client = getOAuth2Client();
  client.setCredentials({ refresh_token: config.gmail.refreshToken });
  return client;
}

export function getGmail(): gmail_v1.Gmail {
  return google.gmail({ version: "v1", auth: getAuthorizedClient() });
}

export const GMAIL_USER = config.gmail.user;
