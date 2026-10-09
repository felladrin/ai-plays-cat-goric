// Harness-only Vite config. CommonJS (vite 2.5.10 rejects an ESM .mjs config).
// Deliberately plugin-free: the three plugins in vite.config.ts are all
// build-time (roadroller bails without context.bundle; viteSingleFile and
// createHtmlPlugin are build-only) or the git-blocked rollup-plugin-kontra.
// Plain dev serving is all the harness needs. vite.config.ts is untouched.
module.exports = {
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  logLevel: "info",
};
