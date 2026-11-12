// Creates a local development account through the running app's own API.
// Usage: start the app (`npm start`), then `npm run seed:dev`.
// LOCAL DEVELOPMENT ONLY — never use these credentials on a deployed instance.
const base = process.env.BRANDPILOT_URL || `http://localhost:${process.env.PORT || 3000}`;
const DEV_USER = { email: 'dev@brandpilot.test', password: 'brandpilot-dev-1' };

const r = await fetch(`${base}/api/auth/register`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(DEV_USER),
});
if (r.status === 201) console.log(`Created dev account ${DEV_USER.email} on ${base}`);
else if (r.status === 409) console.log(`Dev account ${DEV_USER.email} already exists on ${base}`);
else {
  console.error(`Could not create dev account: HTTP ${r.status} ${await r.text()}`);
  process.exit(1);
}
