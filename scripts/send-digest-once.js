const { buildAndDeliverDigest, deliveryNote, readDigestConfig } = require("../server");

async function main() {
  const config = readDigestConfig();

  if (!config) {
    throw new Error("Missing Canvas To Do email config. Add CANVAS_BASE_URL, CANVAS_TOKEN, DIGEST_EMAIL, and DIGEST_TIME.");
  }

  console.log(deliveryNote());
  const result = await buildAndDeliverDigest(config, "render-cron");
  console.log(result.message);
  console.log(result.subject);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
