terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

# Enable required APIs
module "apis" {
  source     = "../../modules/apis"
  project_id = var.project_id
}

# Networking
module "networking" {
  source = "../../modules/networking"

  project_id = var.project_id
  region     = var.region

  depends_on = [module.apis]
}

# Redis Cache
module "redis" {
  source = "../../modules/redis"

  project_id = var.project_id
  region     = var.region
  zone       = var.zone

  redis_version           = "REDIS_6_X"
  redis_tier             = "BASIC"
  redis_memory_size_gb   = 1
  redis_maintenance_day  = "SUNDAY" 
  redis_maintenance_hour = 2

  depends_on = [module.apis]
}

# Cloud Run Service (for development/staging)
module "cloud_run" {
  source = "../../modules/cloud-run"

  project_id        = var.project_id
  region            = var.region
  container_image   = var.container_image
  discord_token     = var.discord_token
  discord_client_id = var.discord_client_id

  # Redis configuration from redis module
  redis_host           = module.redis.redis_host
  redis_port           = module.redis.redis_port
  redis_auth_secret_id = module.redis.redis_auth_secret_id
  vpc_connector_id     = module.redis.vpc_connector_id

  depends_on = [module.redis, module.apis]
}

# GKE Cluster
module "gke" {
  source = "../../modules/gke"

  project_id     = var.project_id
  region         = var.region
  vpc_network_id = module.networking.vpc_id
  vpc_subnet_id  = module.networking.subnet_id

  min_node_count = var.min_node_count
  max_node_count = var.max_node_count

  depends_on = [module.networking]
}

# Monitoring and Alerts
module "monitoring" {
  source = "../../modules/monitoring"

  project_id             = var.project_id
  region                 = var.region
  alert_email            = var.alert_email
  cluster_name          = module.gke.cluster_name

  depends_on = [module.gke]
}

# Storage and Backup
module "storage" {
  source = "../../modules/storage"

  project_id            = var.project_id
  region               = var.region
  zone                 = var.zone
  backup_bucket        = var.backup_bucket
  recordings_disk_size = var.recordings_disk_size
  cloud_run_service_url = module.gke.cluster_endpoint

  depends_on = [module.apis]
}

# Outputs for kubectl configuration
output "cluster_endpoint" {
  value     = module.gke.cluster_endpoint
  sensitive = true
}

output "cluster_ca_certificate" {
  value     = module.gke.cluster_ca_certificate
  sensitive = true
}

output "cluster_name" {
  value = module.gke.cluster_name
} 