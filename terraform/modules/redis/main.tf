# Redis instance
resource "google_redis_instance" "discord_bot_cache" {
  name           = "discord-bot-redis"
  tier           = var.redis_tier
  memory_size_gb = var.redis_memory_size_gb
  
  region       = var.region
  location_id  = var.zone

  authorized_network = google_compute_network.redis_network.id
  connect_mode       = "PRIVATE_SERVICE_ACCESS"

  redis_version     = var.redis_version
  display_name      = "Discord Bot Redis Cache"

  maintenance_policy {
    weekly_maintenance_window {
      day = var.redis_maintenance_day
      start_time {
        hours   = var.redis_maintenance_hour
        minutes = 0
      }
    }
  }

  persistence_config {
    persistence_mode    = "RDB"
    rdb_snapshot_period = "TWENTY_FOUR_HOURS"
  }

  auth_enabled = true

  depends_on = [
    google_compute_network.redis_network,
    google_service_networking_connection.redis_vpc_connection
  ]
}

# VPC network for Redis
resource "google_compute_network" "redis_network" {
  name                    = "redis-network"
  auto_create_subnetworks = false
}

# VPC peering for Redis
resource "google_compute_global_address" "redis_range" {
  name          = "redis-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.redis_network.id
}

resource "google_service_networking_connection" "redis_vpc_connection" {
  network                 = google_compute_network.redis_network.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.redis_range.name]
}

# VPC Access connector
resource "google_vpc_access_connector" "redis_connector" {
  name          = "redis-connector"
  ip_cidr_range = "10.8.0.0/28"
  network       = google_compute_network.redis_network.name
  region        = var.region
}

# Redis auth secret
resource "google_secret_manager_secret" "redis_auth" {
  secret_id = "redis-auth"
  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

resource "random_password" "redis_password" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "google_secret_manager_secret_version" "redis_auth_initial" {
  secret      = google_secret_manager_secret.redis_auth.id
  secret_data = random_password.redis_password.result
} 