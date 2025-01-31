output "backup_bucket_name" {
  description = "Name of the backup bucket"
  value       = google_storage_bucket.backup.name
}

output "recordings_disk_id" {
  description = "ID of the recordings disk"
  value       = google_compute_disk.recordings.id
}

output "backup_service_account_email" {
  description = "Email of the backup service account"
  value       = google_service_account.backup.email
} 