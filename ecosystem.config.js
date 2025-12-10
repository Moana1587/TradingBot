module.exports = {
    apps: [
        {
            name: 'copy-sniper-bot',
            script: './dist/index.js',
            instances: 1,
            exec_mode: 'fork',
            autorestart: true,
            watch: false,
            max_memory_restart: '500M',
            env: {
                NODE_ENV: 'production',
            },
            error_file: './logs/pm2-error.log',
            out_file: './logs/pm2-out.log',
            log_file: './logs/pm2-combined.log',
            time: false,
            merge_logs: true,
            // Restart delay in milliseconds
            restart_delay: 4000,
            // Maximum number of restarts within the time window
            max_restarts: 10,
            // Time window for max_restarts (in milliseconds)
            min_uptime: '10s',
            // Kill timeout before force kill
            kill_timeout: 5000,
            // Wait for graceful shutdown
            listen_timeout: 10000,
            // Shutdown with message
            shutdown_with_message: true,
        },
    ],
};

