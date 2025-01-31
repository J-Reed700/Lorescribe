# Discord Bot Infrastructure

This directory contains the Terraform configuration for deploying the Discord bot to Google Cloud Platform.

## Prerequisites

- [Terraform](https://www.terraform.io/downloads.html) (>= 1.0)
- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install)
- GCP Project with billing enabled
- Discord Bot Token and Application credentials

## Structure

```
terraform/
├── main.tf           # Main infrastructure configuration
├── variables.tf      # Variable definitions
├── monitoring.tf     # Monitoring and alerting configuration
├── backup.tf         # Backup and storage configuration
└── terraform.tfvars  # Variable values (create from .example)
```

## Quick Start

1. Initialize Terraform:
   ```bash
   terraform init
   ```

2. Configure your variables:
   ```bash
   cp terraform.tfvars.example terraform.tfvars
   # Edit terraform.tfvars with your values
   ```

3. Review the plan:
   ```bash
   terraform plan
   ```

4. Apply the configuration:
   ```bash
   terraform apply
   ```

## Components

- **Cloud Run Service**: Main bot service with autoscaling
- **Secret Manager**: Secure storage for sensitive data
- **Cloud Storage**: Backup storage for recordings
- **Cloud Monitoring**: Uptime checks and alerts
- **Cloud Scheduler**: Automated backups

## Post-Deployment

1. Set up secrets:
   ```bash
   echo -n "your-discord-token" | gcloud secrets create discord-token --data-file=-
   echo -n "your-openai-key" | gcloud secrets create openai-api-key --data-file=-
   ```

2. Verify deployment:
   ```bash
   gcloud run services describe discord-bot
   ```

3. Set up monitoring:
   - Visit Cloud Monitoring Dashboard
   - Configure notification channels
   - Review alert policies

## Maintenance

- **Backups**: Automated daily at midnight UTC
- **Cleanup**: 30-day retention policy for backups
- **Updates**: Use `terraform apply` after config changes

## Security

- IAM roles configured for least privilege
- Secrets managed via Secret Manager
- Network security with Cloud Run
- Automated security patches

## Troubleshooting

1. **Deployment Issues**:
   - Check GCP quotas and limits
   - Verify IAM permissions
   - Review Cloud Build logs

2. **Runtime Issues**:
   - Check Cloud Run logs
   - Monitor resource usage
   - Verify secret access

## Cost Management

- Cloud Run: Pay-per-use pricing
- Storage: Lifecycle policies for cost control
- Monitoring: Free tier available 