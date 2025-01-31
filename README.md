# Discord Bot Infrastructure

This repository contains the infrastructure code for deploying a Discord bot on Google Kubernetes Engine (GKE) with Redis caching.

## Architecture

- **GKE Cluster**: Runs the Discord bot and Redis
- **Redis**: In-cluster caching using StatefulSet
- **Persistent Storage**: For bot recordings and Redis data
- **Monitoring**: GCP monitoring with email alerts
- **Backup**: GCS bucket for backups

## Prerequisites

1. Google Cloud SDK installed and configured
2. Terraform installed
3. kubectl installed
4. Required GCP APIs enabled (handled by Terraform)
5. Required environment variables:
   - DISCORD_TOKEN
   - OPENAI_API_KEY
   - DISCORD_CLIENT_ID
   - DISCORD_GUILD_ID
   - DISCORD_BOT_IMAGE
   - REDIS_PASSWORD

## Deployment Steps

1. **Initialize and Apply Terraform**:
   ```bash
   cd terraform/environments/prod
   cp terraform.tfvars.example terraform.tfvars
   # Edit terraform.tfvars with your values
   terraform init
   terraform apply
   ```

2. **Configure kubectl**:
   ```bash
   gcloud container clusters get-credentials $(terraform output -raw cluster_name) \
     --region $(terraform output -raw region) \
     --project $(terraform output -raw project_id)
   ```

3. **Deploy Kubernetes Resources**:
   ```bash
   cd ../../../k8s
   chmod +x deploy.sh
   ./deploy.sh
   ```

## Monitoring

The following metrics are monitored:
- GKE Node CPU Usage
- GKE Node Memory Usage
- Discord Bot Pod Status
- Redis Pod Status
- Custom Log Metric for Bot Errors

Alerts will be sent to the configured email address.

## Backup

Backups are stored in the configured GCS bucket. The backup schedule and retention policy can be configured in the Terraform variables.

## Directory Structure

```
.
├── terraform/
│   ├── environments/
│   │   └── prod/
│   │       ├── main.tf
│   │       ├── variables.tf
│   │       └── terraform.tfvars
│   └── modules/
│       ├── apis/
│       ├── gke/
│       ├── monitoring/
│       ├── networking/
│       └── storage/
└── k8s/
    ├── discord-bot.yaml
    ├── redis.yaml
    └── deploy.sh
```

## Maintenance

- **Scaling**: Adjust `min_node_count` and `max_node_count` in terraform.tfvars
- **Monitoring**: Configure alert thresholds in the monitoring module
- **Backup**: Adjust backup retention policy in the storage module

## Troubleshooting

1. **Pod Issues**:
   ```bash
   kubectl get pods
   kubectl describe pod <pod-name>
   kubectl logs <pod-name>
   ```

2. **Redis Issues**:
   ```bash
   kubectl exec -it redis-0 -- redis-cli -a $REDIS_PASSWORD
   ```

3. **Node Issues**:
   ```bash
   kubectl get nodes
   kubectl describe node <node-name>
   ``` 