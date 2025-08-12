module.exports = {
  apps: [{
    name: 'mailikan-dev',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: true,
    watch_delay: 1000,
    ignore_watch: [
      'node_modules',
      'data',
      '*.log',
      'macOS-iOS'
    ],
    env: {
      NODE_ENV: 'development',
      PORT: 3000,
      SESSION_SECRET: 'dev-secret-key'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
