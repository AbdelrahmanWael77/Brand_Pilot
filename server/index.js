import { createApp } from './app.js';

// Local settings (API key, port) come from a git-ignored `.env` file when there is one.
try {
  process.loadEnvFile();
} catch {
  /* no .env file: use the real environment */
}

const port = Number(process.env.PORT) || 3000;
createApp().listen(port, () => console.log(`BrandPilot running at http://localhost:${port}`));
