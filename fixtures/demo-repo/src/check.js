// We check `npm_execpath` rather than `npm_config_user_agent` because the
// latter leaks down from a parent pnpm process to any child shell, polluting
// npm's environment when codex/agents are launched from a pnpm-managed dev
// server. `npm_execpath` is set to the actual binary path of the package
// manager that invoked this script:
//   - pnpm: ".../bin/pnpm" or ".../pnpm.cjs"
//   - npm:  ".../npm-cli.js"
const execpath = process.env.npm_execpath || "";
const invokedByPnpm = /\bpnpm(\.cjs)?$/.test(execpath);

if (!invokedByPnpm) {
  console.error("This project only accepts pnpm-driven script execution.");
  console.error("Use `pnpm test` instead of `npm test`.");
  console.error(`(detected npm_execpath: "${execpath}")`);
  process.exit(1);
}

console.log("Fixture check passed with pnpm.");
