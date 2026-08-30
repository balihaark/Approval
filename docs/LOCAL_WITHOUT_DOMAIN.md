# Local Gmail ingest

## Recommended local setup: ngrok

See **[NGROK_SETUP.md](./NGROK_SETUP.md)**.

- Free ngrok account  
- One free static `*.ngrok-free.app` domain  
- No personal domain required  

## Fallback without any tunnel

Set `GMAIL_RECONCILE_MINUTES=1` in `backend/.env`.  
New mail is picked up within about a minute via polling. Pub/Sub push is optional.

See **[ENV_SETUP.md](./ENV_SETUP.md) Part 5** for the full polling-only setup.
