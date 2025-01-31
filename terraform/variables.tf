variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "region" {
  description = "The GCP region to deploy to"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "The GCP zone to deploy to"
  type        = string
  default     = "us-central1-a"
}

variable "container_image" {
  description = "The container image to deploy (including tag)"
  type        = string
}

variable "discord_token" {
  description = "Discord bot token"
  type        = string
}

variable "discord_client_id" {
  description = "Discord client ID"
  type        = string
}

variable "min_node_count" {
  description = "Minimum number of GKE nodes"
  type        = number
  default     = 1
}

variable "max_node_count" {
  description = "Maximum number of GKE nodes"
  type        = number
  default     = 3
}

variable "alert_email" {
  description = "Email address for monitoring alerts"
  type        = string
}

variable "backup_bucket" {
  description = "GCS bucket name for backups"
  type        = string
}

variable "redis_memory_size_gb" {
  description = "Memory size for Redis instance in GB"
  type        = number
  default     = 1
}

variable "redis_tier" {
  description = "Redis instance tier (BASIC or STANDARD_HA)"
  type        = string
  default     = "BASIC"
}

variable "redis_version" {
  description = "Redis version to use"
  type        = string
  default     = "REDIS_6_X"
}

variable "redis_maintenance_day" {
  description = "Day of week for Redis maintenance (SUNDAY-SATURDAY)"
  type        = string
  default     = "SUNDAY"
}

variable "redis_maintenance_hour" {
  description = "Hour of day for Redis maintenance (0-23)"
  type        = number
  default     = 2
}

      