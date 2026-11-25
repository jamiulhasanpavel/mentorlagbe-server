# MentorLagbe Server

An Express backend for MentorLagbe.

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and configure the environment variables.
3. Start development server: `npm run dev`

## Vercel deployment

Deploy this repository as a separate Vercel project using the Express
entrypoint in `index.js`. Configure environment variables in the backend
project only:

- `MONGODB_URI` and `DB_NAME`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`: the frontend's canonical origin, without a trailing slash
- `CLIENT_URL`: comma-separated exact frontend origins allowed by CORS
- `BETTER_AUTH_TRUSTED_ORIGINS`: comma-separated exact frontend origins trusted
  by Better Auth
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` if Google sign-in is enabled
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the Stripe success, cancel,
  and portal return URLs
- `IMGBB_API_KEY` if backend image upload features require it

Use the exact frontend production and preview origins; do not allow every
`*.vercel.app` subdomain. MongoDB Atlas must permit the backend deployment's
network connection. Verify the deployment at `/api/health`.

The frontend uses a same-origin `/api` proxy. Set its private
`BACKEND_API_URL` to this backend's origin; do not expose backend secrets as
`NEXT_PUBLIC_*` variables.

## Admin account

Create the account through the normal signup flow, then promote it from a
trusted environment with database access:

```sh
npm run admin:promote -- admin@example.com --confirm
```

The command only promotes one existing student or tutor account matching that
email. It does not create accounts, accepts no admin role through signup or the
role-change API, and requires the explicit `--confirm` flag. Use a dedicated
non-demo account for production admin access; never enable demo credentials for
a production admin account. Keep MongoDB credentials restricted to trusted
operators and never expose them in client-side configuration.

Google sign-in is enabled when both `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` are set. In Google Cloud Console, add
`<frontend-origin>/api/auth/callback/google` as an authorized redirect URI.
The frontend proxies all Better Auth requests to this server.

Optional one-click demo sign-in uses dedicated demo accounts. Set
`DEMO_ADMIN_PASSWORD`, `DEMO_TUTOR_PASSWORD`, and `DEMO_STUDENT_PASSWORD` on
the auth server to the passwords for the matching demo accounts. Keep these
accounts isolated from real user data and production admin controls; never
commit their passwords.

Stripe subscriptions require `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
Configure Stripe to send checkout completion/expiration and subscription
update/deletion and invoice paid/payment-failed events to
`/api/payments/webhook`. Set the success, cancel, and billing portal return
URLs to the deployed frontend origin. Plan amounts and eligible account roles
are enforced by the server; do not send prices from the client.

## Tutor messages

The private messaging API stores threads in the `message` collection:

- `POST /api/messages` lets an authenticated student send a message to a tutor.
- `GET /api/messages/me` returns only the signed-in student's messages.
- `GET /api/messages/tutor` returns only messages addressed to the signed-in tutor.
- `POST /api/messages/:id/replies` lets the addressed tutor add a reply.
- `GET /api/users/tutors/:id/profile` returns public tutor profile fields.

The backend validates content and derives sender identity from the Better Auth
session; message reads and replies are scoped to the authenticated account.

## Sample tuition data

Register a tutor account matching `SEED_TUTOR_EMAIL` (defaults to
`tutor@mentorlagbe.com`), then run `npm run seed:tuitions`. The script adds
approved public listings and pending moderation examples. It uses fixed IDs
and insert-only upserts, so rerunning it does not duplicate or overwrite
existing records. It never clears collections or modifies unrelated data.
