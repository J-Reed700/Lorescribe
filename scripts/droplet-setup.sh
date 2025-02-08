#!/bin/bash

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js and npm
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Redis
sudo apt install redis-server -y
sudo systemctl enable redis-server
sudo systemctl start redis-server

# Install PM2 globally
sudo npm install -g pm2

# Install Git
sudo apt install git -y

# Create app directory
mkdir -p ~/SummarizerBot

# Set up PM2 to start on boot
pm2 startup

# Install ffmpeg for audio processing
sudo apt install ffmpeg -y

# Create necessary directories
mkdir -p ~/SummarizerBot/temp
mkdir -p ~/SummarizerBot/data/transcripts
mkdir -p ~/SummarizerBot/data/summaries
mkdir -p ~/SummarizerBot/recordings

# Set up environment variables (you'll need to fill these in)
cat > ~/SummarizerBot/.env << EOL
DISCORD_TOKEN=your_discord_token
OPENAI_API_KEY=your_openai_api_key
REDIS_HOST=localhost
REDIS_PORT=6379
EOL

# Set proper permissions
chmod 600 ~/SummarizerBot/.env

echo "Setup complete! Next steps:"
echo "1. Add your Discord bot token to .env"
echo "2. Add your OpenAI API key to .env"
echo "3. Set up GitHub deploy key"
echo "4. Configure PM2 for your bot" 