import { config } from "./config.js";
import { createApp } from "./app.js";

const app = createApp();

app.listen(config.port, "::", () =>
  console.log(`ResearchLens backend → http://localhost:${config.port} (env=${config.env}, demo=${config.demoMode})`)
);
