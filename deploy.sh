#!/bin/bash

# CivicVoice Firebase Deployment Script
# This script automates the deployment process

set -e  # Exit on error

echo "🚀 CivicVoice Firebase Deployment"
echo "================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if firebase-config.js exists
if [ ! -f "firebase-config.js" ]; then
    echo -e "${RED}❌ Error: firebase-config.js not found${NC}"
    echo "Please copy firebase-config.example.js to firebase-config.js and add your credentials"
    exit 1
fi

# Check if placeholder values are still in config
if grep -q "YOUR_API_KEY" firebase-config.js; then
    echo -e "${RED}❌ Error: firebase-config.js still contains placeholder values${NC}"
    echo "Please update firebase-config.js with your actual Firebase credentials"
    exit 1
fi

echo "✅ Configuration file found"
echo ""

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo -e "${YELLOW}⚠️  Firebase CLI not found${NC}"
    echo "Installing Firebase CLI..."
    npm install -g firebase-tools
fi

echo "📋 Deployment Options:"
echo "1. Deploy everything (rules + indexes + hosting)"
echo "2. Deploy Firestore rules only"
echo "3. Deploy Firestore indexes only"
echo "4. Deploy hosting only"
echo "5. Test locally (firebase serve)"
echo ""
read -p "Select option (1-5): " option

case $option in
    1)
        echo -e "${GREEN}Deploying everything...${NC}"
        firebase deploy
        ;;
    2)
        echo -e "${GREEN}Deploying Firestore rules...${NC}"
        firebase deploy --only firestore:rules
        ;;
    3)
        echo -e "${GREEN}Deploying Firestore indexes...${NC}"
        firebase deploy --only firestore:indexes
        ;;
    4)
        echo -e "${GREEN}Deploying hosting...${NC}"
        firebase deploy --only hosting
        ;;
    5)
        echo -e "${GREEN}Starting local Firebase server...${NC}"
        firebase serve
        ;;
    *)
        echo -e "${RED}Invalid option${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}✅ Done!${NC}"

# If hosting was deployed, show the URL
if [ "$option" == "1" ] || [ "$option" == "4" ]; then
    PROJECT_ID=$(grep -o '"default": "[^"]*' .firebaserc | cut -d'"' -f4)
    if [ ! -z "$PROJECT_ID" ]; then
        echo ""
        echo -e "${GREEN}🌐 Your app is live at:${NC}"
        echo "https://${PROJECT_ID}.web.app"
        echo "https://${PROJECT_ID}.firebaseapp.com"
    fi
fi
