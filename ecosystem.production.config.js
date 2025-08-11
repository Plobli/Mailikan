module.exports = {
  apps: [{
    name: 'mailikan',
    script: './server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    user: 'mailikan',
    cwd: '/home/mailikan/mailikan'
  }]
};
