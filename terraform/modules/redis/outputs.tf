output "redis_host" {
  description = "Redis instance hostname"
  value       = google_redis_instance.discord_bot_cache.host
}

output "redis_port" {
  description = "Redis instance port"
  value       = google_redis_instance.discord_bot_cache.port
}

output "redis_auth_secret_id" {
  description = "Secret ID for Redis auth"
  value       = google_secret_manager_secret.redis_auth.secret_id
}

output "vpc_connector_id" {
  description = "VPC Access Connector ID"
  value       = google_vpc_access_connector.redis_connector.id
}

output "instance_id" {
  description = "Redis instance ID"
  value       = google_redis_instance.discord_bot_cache.id
} 