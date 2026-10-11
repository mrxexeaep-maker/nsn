# Feedback service

Cloudflare Worker for pings, opt-in usage stats, and the Cloud waitlist; overview and setup in `README.md`.

- Every field the app may send is a closed Valibot list in `src/contract/schema.ts`, with its plain-language meaning in `src/contract/describe.ts`; the privacy page renders both. Add an event or property in both files and update `packages/docs/overview/privacy.md` prose if what is collected changes (`tests/contract.test.ts`).
- The Worker never stores or forwards a client address: rate limits key on it in memory, PostHog requests are new requests from the Worker, and Turnstile is verified without `remoteip` (`tests/ingest.test.ts`).
- Schema changes are new files in `migrations/`, applied by `wrangler d1 migrations`; keep `src/db/schema.ts` in step (`tests/harness.ts` applies them).
- Run `bun --filter @open-pencil/feedback types` after changing `wrangler.jsonc`; `bun run test:feedback` checks the generated file.
- Outside services (`fetch`, the clock) come through `FeedbackServices`, and bindings through `Env`, so tests run the real app against a local D1 under `bun test` (`tests/harness.ts`).
