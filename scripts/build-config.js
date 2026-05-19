import { mkdir, writeFile } from "node:fs/promises";

const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
const config = `window.APP_CONFIG = ${JSON.stringify({ googleClientId }, null, 2)};\n`;

await mkdir("public", { recursive: true });
await writeFile("public/config.js", config, "utf8");
console.log(googleClientId ? "Wrote Google client config." : "Wrote empty Google client config.");
