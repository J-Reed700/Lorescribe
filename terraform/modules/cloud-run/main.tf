# Cloud Run service for the Discord bot
resource "google_cloud_run_service" "discord_bot" {
  name     = "discord-bot"
  location = var.region

  template {
    spec {
      containers {
        image = var.container_image
        
        resources {
          limits = {
            cpu    = "1000m"
            memory = "1024Mi"
          }
        }

        env {
          name  = "DISCORD_TOKEN"
          value = var.discord_token
        }

        env {
          name  = "OPENAI_API_KEY"
          value_from {
            secret_key_ref {
              name = google_secret_manager_secret.openai_key.secret_id
              key = "latest"
            }
          }
        }

        env {
          name  = "CLIENT_ID"
          value = var.discord_client_id
        }

        env {
          name  = "RECORDINGS_PATH"
          value = "/recordings"
        }

        # Redis configuration
        env {
          name  = "REDIS_HOST"
          value = var.redis_host
        }

        env {
          name  = "REDIS_PORT"
          value = var.redis_port
        }

        env {
          name = "REDIS_AUTH_STRING"
          value_from {
            secret_key_ref {
              name = var.redis_auth_secret_id
              key = "latest"
            }
          }
        }

        env {
          name  = "REDIS_TLS_ENABLED"
          value = "true"
        }
      }
    }

    metadata {
      annotations = {
        "run.googleapis.com/vpc-access-connector" = var.vpc_connector_id
        "run.googleapis.com/vpc-access-egress"    = "private-ranges-only"
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  depends_on = [google_service_account.discord_bot]
}

# Secret Manager for sensitive data
resource "google_secret_manager_secret" "discord_token" {
  secret_id = "discord-token"
  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

resource "google_secret_manager_secret" "openai_key" {
  secret_id = "openai-api-key"
  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

# Service account for the bot
resource "google_service_account" "discord_bot" {
  account_id   = "discord-bot-sa"
  display_name = "Discord Bot Service Account"
  project      = var.project_id
}

# Grant Cloud Run invoker role
resource "google_cloud_run_service_iam_member" "public_access" {
  service  = google_cloud_run_service.discord_bot.name
  location = google_cloud_run_service.discord_bot.location
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.discord_bot.email}"
}

# Grant Secret Manager access
resource "google_project_iam_member" "secret_access" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.discord_bot.email}"
  
  depends_on = [google_service_account.discord_bot]
} 