# GKE cluster
resource "google_container_cluster" "primary" {
  name     = "discord-bot-cluster"
  location = var.region

  # We can't create a cluster with no node pool defined, but we want to only use
  # separately managed node pools. So we create the smallest possible default
  # node pool and immediately delete it.
  remove_default_node_pool = true
  initial_node_count       = 1

  network    = var.vpc_network_id
  subnetwork = var.vpc_subnet_id

  # Enable Workload Identity
  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  # Enable VPA
  vertical_pod_autoscaling {
    enabled = true
  }

  # Enable Network Policy
  network_policy {
    enabled = true
  }

  # Configure private cluster
  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false
    master_ipv4_cidr_block = "172.16.0.0/28"
  }

  # Enable master authorized networks
  master_authorized_networks_config {
    cidr_blocks {
      cidr_block   = "0.0.0.0/0"
      display_name = "All"
    }
  }

  # Enable network policy
  addons_config {
    network_policy_config {
      disabled = false
    }
  }
}

# Node pool for the bot
resource "google_container_node_pool" "primary_nodes" {
  name       = "discord-bot-pool"
  location   = var.region
  cluster    = google_container_cluster.primary.name
  node_count = var.min_node_count

  # Enable autoscaling
  autoscaling {
    min_node_count = var.min_node_count
    max_node_count = var.max_node_count
  }

  # Node configuration
  node_config {
    preemptible  = true
    machine_type = "e2-standard-2"

    # Google recommends custom service accounts that have cloud-platform scope and permissions granted via IAM Roles.
    service_account = google_service_account.gke_sa.email
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    labels = {
      app = "discord-bot"
    }

    workload_metadata_config {
      mode = "GKE_METADATA"
    }
  }
}

# Service account for GKE nodes
resource "google_service_account" "gke_sa" {
  account_id   = "gke-discord-bot-sa"
  display_name = "GKE Discord Bot Service Account"
}

# Grant required permissions to the service account
resource "google_project_iam_member" "gke_sa_roles" {
  for_each = toset([
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
    "roles/monitoring.viewer",
    "roles/stackdriver.resourceMetadata.writer",
    "roles/storage.objectViewer",  # For pulling images from GCR
    "roles/artifactregistry.reader"  # For pulling images from Artifact Registry
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.gke_sa.email}"
}

# Create a Kubernetes service account and bind it to the GCP service account
resource "google_service_account_iam_binding" "gke_sa_binding" {
  service_account_id = google_service_account.gke_sa.name
  role               = "roles/iam.workloadIdentityUser"

  members = [
    "serviceAccount:${var.project_id}.svc.id.goog[default/discord-bot-sa]"
  ]
} 