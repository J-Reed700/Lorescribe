variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "region" {
  description = "The GCP region to deploy to"
  type        = string
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
  description = "Discord bot client ID"
  type        = string
}

# Redis-related variables passed from redis module
variable "redis_host" {
  description = "Redis instance hostname"
  type        = string
}

variable "redis_port" {
  description = "Redis instance port"
  type        = string
}

variable "redis_auth_secret_id" {
  description = "Secret ID for Redis auth"
  type        = string
}

variable "vpc_connector_id" {
  description = "VPC Access Connector ID"
  type        = string
} 