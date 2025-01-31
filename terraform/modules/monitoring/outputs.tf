output "notification_channel_id" {
  description = "ID of the email notification channel"
  value       = google_monitoring_notification_channel.email.id
}

output "error_metric_id" {
  description = "ID of the custom error metric"
  value       = google_logging_metric.bot_errors.id
} 