#!/bin/bash

# Mailikan Deployment Script
# Usage: ./deploy.sh

set -e

echo "🚀 Starting Mailikan deployment..."

# Variables
APP_DIR="/home/mailikan/mailikan"
APP_USER="mailikan"
REMOTE_SERVER="194.55.13.83"

# Function to run commands on remote server
run_remote() {
    ssh -t $APP_USER@$REMOTE_SERVER "$1"
}

# Upload files to server
echo "📦 Uploading files to server..."
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'logs' \
    ./ $APP_USER@$REMOTE_SERVER:$APP_DIR/

# Install dependencies and restart application
echo "🔧 Installing dependencies..."
run_remote "cd $APP_DIR && npm install --production"

echo "🔄 Restarting application..."
run_remote "cd $APP_DIR && pm2 restart mailikan || pm2 start ecosystem.config.js --env production"

echo "📊 Checking application status..."
run_remote "pm2 status"

echo "✅ Deployment completed successfully!"
echo "🌐 Your application should be available at http://$REMOTE_SERVER"
