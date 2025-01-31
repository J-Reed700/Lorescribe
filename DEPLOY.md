# Deploying LoreScribe Discord Bot

This guide explains how to deploy the LoreScribe Discord bot to production.

## Prerequisites

- A VPS with at least 1GB RAM (recommended providers: DigitalOcean, Linode, or OVH)
- Docker installed on the VPS
- Discord Bot Token and necessary permissions set up
- OpenAI API key

## Deployment Steps

1. **Clone the Repository**
   ```bash
   git clone <your-repo-url>
   cd lorescribe
   ```

2. **Set Up Environment Variables**
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   nano .env
   ```

3. **Build and Run with Docker**
   ```bash
   # Build the Docker image
   docker build -t lorescribe .

   # Run the container
   docker run -d \
     --name lorescribe \
     --restart unless-stopped \
     --env-file .env \
     -v $(pwd)/recordings:/app/recordings \
     lorescribe
   ```

4. **Monitor the Logs**
   ```bash
   docker logs -f lorescribe
   ```

## Recommended Hosting Options

1. **DigitalOcean Droplet** (Recommended)
   - Basic Droplet ($5-$10/month)
   - Ubuntu 22.04 LTS
   - 1GB RAM minimum

2. **Oracle Cloud Free Tier**
   - Free forever
   - 1GB RAM ARM instance
   - Requires some additional setup for ARM compatibility

3. **Google Cloud Platform**
   - Free tier available
   - e2-micro instance sufficient for basic usage

## Maintenance

- Set up log rotation:
  ```bash
  docker run --log-opt max-size=10m --log-opt max-file=3
  ```

- Regular updates:
  ```bash
  docker pull lorescribe:latest
  docker-compose up -d  # If using docker-compose
  ```

## Monitoring

Consider setting up:
- Uptime monitoring (e.g., UptimeRobot)
- Discord status notifications
- Resource usage alerts

## Backup

The `/recordings` directory is volume-mounted, so make sure to:
1. Regularly backup this directory
2. Monitor disk space usage
3. Implement cleanup for old recordings

## Troubleshooting

1. **Bot Not Connecting**: Check Discord token and permissions
2. **Voice Recording Issues**: Verify ffmpeg installation
3. **High Memory Usage**: Monitor with `docker stats`

For more help, check the GitHub issues or Discord support server. 



####


##

#


log entire interaction


#


##


####