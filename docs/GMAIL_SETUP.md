# Gmail API setup runbook

**Start here for step-by-step credentials:** **[ENV_SETUP.md](./ENV_SETUP.md)** (OAuth, refresh token, Pub/Sub, where to paste each value).

This document is the technical reference for how the app uses Gmail after credentials are in place.

The app monitors **one** mailbox — whatever you set as `GMAIL_USER` in `.env` (your monitoring inbox). It never requests Google Workspace admin scopes and does not integrate with Microsoft 365.

## 1. Google Cloud project

1. Create (or reuse) a GCP project.
2. Enable **Gmail API** and **Cloud Pub/Sub API**.
3. Configure the OAuth consent screen (Internal if you have a Google Workspace, otherwise External + test users).
4. Create OAuth client credentials of type **Web application**.
5. Add authorised redirect URIs:
   - Local: `http://localhost:3001/gmail/oauth/callback`
   - Production: `https://<api-host>/gmail/oauth/callback`
6. Copy the client ID and secret into `backend/.env` (and `.env`):

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3001/gmail/oauth/callback
GMAIL_USER=your-monitoring-inbox@gmail.com
```

Requested scopes (mailbox owner only):

- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.send`

## 2. Obtain a refresh token

Sign in **as the account in `GMAIL_USER`**.

```bash
npm run gmail:auth
```

The script prints a URL. After consent it prints `GMAIL_REFRESH_TOKEN=...`. Put that value in `.env` and restart the backend.

Alternatively, sign in as an app admin and open **Gmail → Connect Gmail** (`GET /gmail/oauth/start`).

Store the refresh token in a secrets manager in production. Rotate it if the mailbox password changes or access is revoked.

## 3. Pub/Sub push notifications (`users.watch`)

Gmail cannot POST directly to your API; it publishes to a Pub/Sub topic.

1. Create a topic, e.g. `gmail-approvals`.
2. Grant Gmail permission to publish:

```bash
gcloud pubsub topics add-iam-policy-binding gmail-approvals \
  --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
  --role="roles/pubsub.publisher"
```

3. Create a **push** subscription whose endpoint is:

```
https://<api-host>/webhooks/gmail?token=<GMAIL_PUSH_TOKEN>
```

Use a long random `GMAIL_PUSH_TOKEN` and set the same value in `.env`. For local development, expose the API with a tunnel (Cloudflare Tunnel / ngrok) so Google can reach it.

4. Set:

```
GMAIL_PUBSUB_TOPIC=projects/<gcp-project>/topics/gmail-approvals
GMAIL_PUSH_TOKEN=<same token as the query string>
```

5. As admin, click **Renew watch** in the app, or `POST /admin/gmail/watch`.

Gmail watches expire after about **7 days**. The backend renews automatically when expiry is within 24 hours, and also on startup.

### Notification payload

Pub/Sub POSTs:

```json
{
  "message": {
    "data": "<base64 {\"emailAddress\":\"<GMAIL_USER>\",\"historyId\":\"12345\"}>",
    "messageId": "..."
  },
  "subscription": "projects/.../subscriptions/..."
}
```

The webhook then calls `users.history.list` from the last stored `historyId` and ingests new messages.

## 4. Reconciliation safety net

Push delivery can miss messages. A scheduled job (default every 5 minutes, `GMAIL_RECONCILE_MINUTES`) runs a history sweep, or `users.messages.list` if no cursor exists yet.

Admins can trigger it with **Run reconcile** or `POST /admin/gmail/reconcile`.

If Gmail returns `historyId` not found (cursor too old), the job falls back to a recent inbox list so nothing is silently dropped.

## 5. Threading, dedup, and replies

| Concern | Implementation |
|---|---|
| Dedup | `ProcessedMessage.gmailMessageId` unique; `Approval.threadId` unique |
| Follow-ups | Same Gmail `threadId` updates `lastActivityAt` instead of creating a second approval |
| Headers | Original `Message-ID` stored; replies set `In-Reply-To` and `References` |
| Send | `users.messages.send` with `threadId` and raw MIME |

Decisions are **never** taken by email reply. The in-app action sends a notification reply so the requester still sees the outcome in their inbox.

## 6. Malformed mail

Messages that are auto-replies, missing a From/To, empty, or otherwise unusable are written to `UnprocessedMail` and skipped. Admins review them at `/admin/unprocessed`. Mail sent *from* the monitoring inbox (`GMAIL_USER`, including our own decision replies) is ignored so the pipeline does not loop.

## 7. Production checklist

- [ ] OAuth client is Web application; redirect URI matches the API host
- [ ] Refresh token belongs to `GMAIL_USER`
- [ ] Pub/Sub topic IAM includes `gmail-api-push@system.gserviceaccount.com`
- [ ] Push subscription uses HTTPS + `GMAIL_PUSH_TOKEN`
- [ ] Watch renewal job is running (process must stay up, or run `POST /admin/gmail/watch` from cron)
- [ ] `JWT_SECRET` and Gmail secrets are not in git
