#!/bin/bash
# ==============================================================================
# MOCS E-Commerce VPS Deployment & Setup Script
# Run on VPS: chmod +x deploy.sh && ./deploy.sh
# ==============================================================================

set -e

echo "🚀 Starting MOCS API VPS deployment..."

# Navigate to project directory
cd "$(dirname "$0")/src"

# 1. Ensure categorized uploads directory exists with correct permissions
echo "📁 Setting up uploads directory structure..."
mkdir -p uploads/products uploads/banners uploads/categories uploads/collections uploads/auth uploads/ads uploads/collage uploads/avatars uploads/reviews uploads/general logs
chmod -R 755 uploads



# 2. Install dependencies
echo "📦 Installing production dependencies..."
npm install --production

# 3. Start or reload PM2
if command -v pm2 &> /dev/null; then
    echo "🔄 Reloading PM2 process..."
    pm2 reload ../ecosystem.config.js || pm2 start ../ecosystem.config.js
    pm2 save
else
    echo "⚠️ PM2 not found. Please install globally: npm install -g pm2"
fi

echo "✅ MOCS Backend is live on VPS!"
