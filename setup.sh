#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Setting up SummarizerBot development environment...${NC}"

# Check if Python 3.10+ is installed
if ! command -v python3 &> /dev/null; then
    echo "Python 3 is not installed. Please install Python 3.10 or higher."
    exit 1
fi

# Create virtual environment
echo -e "${BLUE}Creating Python virtual environment...${NC}"
python3 -m venv .venv

# Activate virtual environment
echo -e "${BLUE}Activating virtual environment...${NC}"
source .venv/bin/activate

# Upgrade pip
echo -e "${BLUE}Upgrading pip...${NC}"
python -m pip install --upgrade pip

# Install Poetry in the virtual environment
echo -e "${BLUE}Installing Poetry in virtual environment...${NC}"
pip install poetry

# Install dependencies using Poetry
echo -e "${BLUE}Installing project dependencies...${NC}"
poetry config virtualenvs.create false
poetry install

# Create necessary directories
echo -e "${BLUE}Creating necessary directories...${NC}"
mkdir -p temp recordings

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo -e "${BLUE}Creating .env file...${NC}"
    cat > .env << EOL
DISCORD_TOKEN=your_discord_token_here
OPENAI_API_KEY=your_openai_api_key_here
CLIENT_ID=your_client_id_here
EOL
    echo -e "${GREEN}Created .env file. Please edit it with your actual tokens.${NC}"
fi

echo -e "${GREEN}Setup complete!${NC}"
echo -e "${GREEN}To activate the virtual environment in the future, run:${NC}"
echo -e "source .venv/bin/activate"
echo -e "${GREEN}Then you can run the bot with:${NC}"
echo -e "python -m src.bot"

# Add .venv to .gitignore if it's not already there
if [ ! -f .gitignore ] || ! grep -q "^.venv$" .gitignore; then
    echo ".venv" >> .gitignore
    echo -e "${BLUE}Added .venv to .gitignore${NC}"
fi 