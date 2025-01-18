#!/bin/bash

# Create necessary directories if they don't exist
mkdir -p temp recordings

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        echo "Docker is not running. Please start Docker and try again."
        exit 1
    fi
}

case "$1" in
    "start")
        check_docker
        docker-compose up -d
        echo "Bot container started"
        ;;
    "stop")
        check_docker
        docker-compose down
        echo "Bot container stopped"
        ;;
    "restart")
        check_docker
        docker-compose restart
        echo "Bot container restarted"
        ;;
    "logs")
        check_docker
        docker-compose logs -f
        ;;
    "build")
        check_docker
        docker-compose build --no-cache
        echo "Bot container rebuilt"
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|logs|build}"
        exit 1
        ;;
esac 