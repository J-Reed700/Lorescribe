# Backup bucket
resource "google_storage_bucket" "backup" {
  name     = var.backup_bucket
  location = var.region
  
  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      age = 30  # days
    }
    action {
      type = "Delete"
    }
  }

  uniform_bucket_level_access = true
}

# Persistent disk for recordings
resource "google_compute_disk" "recordings" {
  name  = "discord-bot-recordings"
  type  = "pd-standard"
  zone  = var.zone
  size  = var.recordings_disk_size
}

# Service account for backups
resource "google_service_account" "backup" {
  account_id   = "discord-bot-backup"
  display_name = "Discord Bot Backup Service Account"
  project      = var.project_id
}

# IAM binding for backup service account
resource "google_storage_bucket_iam_member" "backup" {
  bucket = google_storage_bucket.backup.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.backup.email}"
}

# Cloud Scheduler job for daily backups
resource "google_cloud_scheduler_job" "backup" {
  name             = "discord-bot-backup"
  description      = "Daily backup of Discord bot recordings"
  schedule         = "0 0 * * *"  # Daily at midnight
  time_zone        = "UTC"
  attempt_deadline = "320s"

  retry_config {
    retry_count = 3
  }

  http_target {
    http_method = "POST"
    uri         = "${var.cloud_run_service_url}/backup"
    
    oidc_token {
      service_account_email = google_service_account.backup.email
    }
  }
} 