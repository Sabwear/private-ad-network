import { spawnSync } from "node:child_process";

const mode = process.argv[2];
const extraArguments = process.argv.slice(3);
const databaseUrl = process.env.SUPABASE_DB_URL;

if (!databaseUrl) {
  console.error("SUPABASE_DB_URL is missing. Add it to the ignored .env.database.local file.");
  process.exit(1);
}

const commands = {
  query: ["db", "query", ...extraArguments],
  list: ["migration", "list", ...extraArguments],
  repair: ["migration", "repair", ...extraArguments],
  check: ["db", "push", "--dry-run", ...extraArguments],
  push: ["db", "push", ...extraArguments],
};

const commandArguments = commands[mode];
if (!commandArguments) {
  console.error("Expected one of: query, list, repair, check, push.");
  process.exit(1);
}

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) {
  console.error("Run this helper through a pnpm database script.");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [pnpmCli, "exec", "supabase", "--workdir", ".", ...commandArguments, "--db-url", databaseUrl],
  { stdio: "inherit" },
);

if (result.error) {
  console.error(`Supabase CLI could not start: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
