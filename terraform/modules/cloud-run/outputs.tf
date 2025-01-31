output "service_name" {
  description = "Name of the Cloud Run service"
  value       = google_cloud_run_service.discord_bot.name
}

output "service_url" {
  description = "URL of the Cloud Run service"
  value       = google_cloud_run_service.discord_bot.status[0].url
}

output "service_account_email" {
  description = "Service account email"
  value       = google_service_account.discord_bot.email
} 