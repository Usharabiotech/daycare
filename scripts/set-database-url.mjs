// Saves your database connection string into .env without echoing it on screen.
// Run: node scripts/set-database-url.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import readline from 'node:readline';

const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });

let muted = false;
rl._writeToOutput = (s) => { if (!muted) rl.output.write(s); };

rl.question('Paste your Neon DIRECT connection string, then press Enter: ', (answer) => {
  muted = false;
  rl.output.write('\n');
  rl.close();
  const url = answer.trim().replace(/^["']|["']$/g, '');

  if (!/^postgres(ql)?:\/\//.test(url)) {
    console.log('That does not look like a postgresql:// connection string. Nothing was saved.');
    process.exit(1);
  }
  if (url.includes('*')) {
    console.log('The string contains * characters (the masked copy). Copy it again from Neon. Nothing was saved.');
    process.exit(1);
  }
  if (url.includes('-pooler')) {
    console.log('Warning: this is the pooled string (-pooler). NidHub needs the direct one; turn off connection pooling in Neon.');
  }

  writeFileSync(envPath, `# Neon direct connection string. Git-ignored; never commit this file.\nDATABASE_URL=${url}\n`);
  console.log(`Saved to ${envPath}`);
});
muted = true;
