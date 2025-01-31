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

variable "backup_bucket" {
  description = "GCS bucket name for backups"
  type        = string
}

variable "recordings_disk_size" {
  description = "Size of the recordings disk in GB"
  type        = number
  default     = 10
}

variable "cloud_run_service_url" {
  description = "URL of the Cloud Run service"
  type        = string
} 