// pm2 ecosystem file — start every script from the repo root:
// Each script loads its own .env file itself (dotenv), so no env is set here.
//   pm2 start ecosystem.config.js
// Start just one with: pm2 start ecosystem.config.js --only whatsapp-bot
module.exports = {
  apps: [
    {
      name: 'whatsapp-bot',
      script: 'index.js',
      cwd: './01-whatsapp-bot',
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: 'discord-mod',
      script: 'index.js',
      cwd: './02-discord-mod-bot',
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: 'telegram-notify',
      script: 'index.js',
      cwd: './03-telegram-notify-bot',
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: 'paystack-webhook',
      script: 'index.js',
      cwd: './04-paystack-webhook',
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: 'price-tracker',
      script: 'index.js',
      cwd: './05-price-tracker',
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: 'scheduler',
      script: 'index.js',
      cwd: './06-scheduler',
      autorestart: true,
      max_restarts: 10,
    }
  ]
};
