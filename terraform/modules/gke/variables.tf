variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "region" {
  description = "The GCP region for the GKE cluster"
  type        = string
}

variable "vpc_network_id" {
  description = "The ID of the VPC network"
  type        = string
}

variable "vpc_subnet_id" {
  description = "The ID of the VPC subnet"
  type        = string
}

variable "min_node_count" {
  description = "Minimum number of nodes in the GKE cluster"
  type        = number
  default     = 1
}

variable "max_node_count" {
  description = "Maximum number of nodes in the GKE cluster"
  type        = number
  default     = 3
} 