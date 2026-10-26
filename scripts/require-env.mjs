// Stops a build early, with a clear message, when a required environment variable is missing.
// Usage: node scripts/require-env.mjs DATABASE_URL [OTHER_VAR ...]
const missing = process.argv.slice(2).filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing environment variable(s): ${missing.join(', ')}.`);
  console.error('Add them in Vercel -> Project -> Settings -> Environment Variables, then redeploy.');
  process.exit(1);
}
