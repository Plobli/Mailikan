module.exports = {
  apps: [{
    name: 'mailikan',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      SESSION_SECRET: 'change-this-in-production-to-a-random-string'
    },
    error_file: '/var/log/mailikan/err.log',
    out_file: '/var/log/mailikan/out.log',
    log_file: '/var/log/mailikan/combined.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    kill_timeout: 3000,
    wait_ready: true,
    listen_timeout: 10000
  }]
};
