module.exports = {
  apps: [
    {
      name: "mocs-api",
      script: "./src/server.js",
      instances: "max",
      exec_mode: "cluster",
      watch: false,
      max_memory_restart: "800M",
      env: {
        NODE_ENV: "production",
        PORT: 5000,
      },
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
