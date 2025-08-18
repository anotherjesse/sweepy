export default {
  root: "src",
  publicDir: "../public",
  server: {
    host: '0.0.0.0',  // Required for container access
    port: 5173,
    allowedHosts: true,
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
};
