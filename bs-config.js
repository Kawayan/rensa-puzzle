// lite-server (browser-sync) configuration.
// Honors the PORT environment variable so the preview harness can assign a free port.
module.exports = {
  port: process.env.PORT ? Number(process.env.PORT) : 3000,
  server: { baseDir: "./" },
};
