variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "region" {
  description = "The GCP region for monitoring resources"
  type        = string
}

variable "alert_email" {
  description = "Email address for monitoring alerts"
  type        = string
}

variable "cluster_name" {
  description = "Name of the GKE cluster"
  type        = string
} 