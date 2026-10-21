
import { config } from "./config.js"; // Import the application configuration settings.
import { createApp } from "./app.js"; // Import the function that creates the backend application.

const app = createApp(); // Create an instance of the application.

app.listen(config.port, "::", () => // Start the server on the configured port and listen on all IPv6 interfaces.
  console.log(`ResearchLens backend → http://localhost:${config.port} (env=${config.env}, demo=${config.demoMode})`) // Display the server URL, environment and demo mode in the console.
);
