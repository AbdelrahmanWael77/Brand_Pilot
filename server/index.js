import { createApp } from './app.js';

// Local settings (API key, port) come from a git-ignored `.env` file when there is one.
try {
  process.loadEnvFile();
} catch {
  /* no .env file: use the real environment */
}

const port = Number(process.env.PORT) || 3000;
// Express 5 hands a listen failure to this callback instead of throwing: without the check the
// process would print "running" and exit quietly.
createApp().listen(port, (err) => {
  if (err) {
    const why =
      err.code === 'EADDRINUSE' ? 'the port is already in use' : err.code === 'EACCES' ? 'the port is not permitted (it may be in a range reserved by the system)' : err.message;
    console.error(`BrandPilot could not start on port ${port}: ${why}. Choose another port with the PORT variable, for example PORT=4000.`);
    process.exit(1);
  }
  console.log(`BrandPilot running at http://localhost:${port}`);
});
