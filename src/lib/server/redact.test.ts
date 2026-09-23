// Run with: npm run test:redact
import assert from "node:assert/strict";
import { test } from "node:test";

process.env.SUPABASE_SECRET_KEY = "sb_secret_abcdefghijklmnop";
process.env.CRON_SECRET = "0123456789abcdef0123";
const { redactSecrets, safeMessage } = await import("./redact.ts");

test("hides the configured keys", () => {
  assert.equal(redactSecrets('Headers.set: "sb_secret_abcdefghijklmnop" is invalid'), 'Headers.set: "[key hidden]" is invalid');
  assert.equal(redactSecrets("bearer 0123456789abcdef0123 rejected"), "bearer [key hidden] rejected");
});

test("hides keys it was never given, by their shape", () => {
  assert.equal(redactSecrets("sent sb_publishable_zzz9 instead"), "sent [key hidden] instead");
  assert.equal(redactSecrets("token eyJhbGc.eyJzdWI.sig expired"), "token [key hidden] expired");
});

test("leaves ordinary messages alone", () => {
  assert.equal(redactSecrets("Loading the season failed: no rows"), "Loading the season failed: no rows");
});

test("a whitespace-broken key is still hidden", () => {
  // The value that actually reaches the header keeps the stray space the dashboard added.
  process.env.SUPABASE_SECRET_KEY = "sb_secret_abcd efghijkl";
  assert.equal(redactSecrets('invalid: "sb_secret_abcd efghijkl"'), 'invalid: "[key hidden]"');
  process.env.SUPABASE_SECRET_KEY = "sb_secret_abcdefghijklmnop";
});

test("safeMessage falls back when there is no message", () => {
  assert.equal(safeMessage("not an error", "Could not read the sheet."), "Could not read the sheet.");
  assert.equal(safeMessage(new Error("sb_secret_abcdefghijklmnop leaked")), "[key hidden] leaked");
});
