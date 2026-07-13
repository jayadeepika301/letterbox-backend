# Letterbox backend

A small Express API for the Letterbox app: real accounts with unique
usernames and hashed passwords, JWT sessions, and shared storage for
letters so two different people can actually send letters to each
other.

## Endpoints

| Method | Path                        | Auth | Description                                  |
|--------|-----------------------------|------|-----------------------------------------------|
| POST   | `/api/auth/signup`          | no   | `{ username, password }` → creates account, rejects duplicate usernames |
| POST   | `/api/auth/login`           | no   | `{ username, password }` → `{ token, username }` |
| GET    | `/api/me`                   | yes  | Returns the logged-in username |
| GET    | `/api/users/:username/exists` | no | `{ exists: true/false }` — check before sending |
| POST   | `/api/letters`               | yes  | Send a letter (recipient, content, styling, delivery time) |
| GET    | `/api/letters/inbox`         | yes  | Letters addressed to you |
| GET    | `/api/letters/sent`          | yes  | Letters you've sent |
| GET    | `/api/health`                | no   | Health check |

Authenticated requests need `Authorization: Bearer <token>`.

## Run it locally

```bash
npm install
cp .env.example .env   # then edit JWT_SECRET in .env
npm start
```

The API runs on `http://localhost:4000` by default.

## Deploy it for real (so friends on other devices can reach it)

**Render.com (free tier) — easiest path:**

1. Push this folder to a GitHub repo.
2. On [render.com](https://render.com), click **New → Web Service**, connect that repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Under **Environment**, add `JWT_SECRET` with a long random value
   (generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
5. Deploy. Render gives you a URL like `https://letterbox-api-xxxx.onrender.com`.
6. Paste that URL into the Letterbox frontend when it asks for your
   backend address.

**Railway, Fly.io, or any Node host work the same way** — install,
set `JWT_SECRET`, start with `npm start`, expose the port.

## About storage — please read this before relying on it

This backend stores everything in one `data.json` file on disk, on
purpose, to keep the project dependency-free and easy to run
anywhere. That has a real consequence:

- **Free tiers on most hosts (including Render's free web service)
  wipe the disk on every redeploy or restart.** That means accounts
  and letters can disappear without warning. It's fine for trying
  this out with friends, not fine for anything you want to keep.
- If you want real persistence, the natural next step is swapping
  `readDB`/`writeDB` in `server.js` for a hosted database — Render's
  own Postgres, [Supabase](https://supabase.com), or
  [Railway](https://railway.app)'s Postgres add-on all have free
  tiers and a persistent volume/disk. Happy to help make that swap
  when you're ready.

## Security notes

- Passwords are hashed with bcrypt — never stored in plain text.
- There's no email verification, rate limiting, or password reset
  flow. This is enough for a small group of friends, not for a
  public product.
- CORS is wide open (`cors()`) so any frontend can call it. Lock this
  down to your actual frontend's origin before going further.
