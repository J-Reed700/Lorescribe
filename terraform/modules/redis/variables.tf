variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "region" {
  description = "The GCP region to deploy to"
  type        = string
}

variable "zone" {
  description = "The GCP zone to deploy to"
  type        = string
}

variable "redis_memory_size_gb" {
  description = "Memory size for Redis instance in GB"
  type        = number
}

variable "redis_tier" {
  description = "Redis instance tier (BASIC or STANDARD_HA)"
  type        = string
}

variable "redis_version" {
  description = "Redis version to use"
  type        = string
}

variable "redis_maintenance_day" {
  description = "Day of week for Redis maintenance (SUNDAY-SATURDAY)"
  type        = string
}

variable "redis_maintenance_hour" {
  description = "Hour of day for Redis maintenance (0-23)"
  type        = number
} 