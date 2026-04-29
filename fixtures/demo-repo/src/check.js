const packageManager = process.env.npm_config_user_agent || "";

if (!packageManager.includes("pnpm")) {
  console.error("This fixture only accepts pnpm-driven script execution.");
  process.exit(1);
}

console.log("Fixture check passed with pnpm.");
