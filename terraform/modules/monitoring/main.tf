# Email notification channel
resource "google_monitoring_notification_channel" "email" {
  display_name = "Discord Bot Alert Email"
  type         = "email"
  labels = {
    email_address = var.alert_email
  }
}

# GKE Node CPU Usage Alert
resource "google_monitoring_alert_policy" "gke_node_cpu" {
  display_name = "GKE Node High CPU Usage"
  combiner     = "OR"
  conditions {
    display_name = "GKE Node CPU usage"
    condition_threshold {
      filter          = "resource.type = \"k8s_node\" AND metric.type = \"kubernetes.io/node/cpu/allocatable_utilization\""
      duration        = "300s"
      comparison     = "COMPARISON_GT"
      threshold_value = 0.8
      trigger {
        count = 1
      }
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }
  notification_channels = [google_monitoring_notification_channel.email.name]
}

# GKE Node Memory Usage Alert
resource "google_monitoring_alert_policy" "gke_node_memory" {
  display_name = "GKE Node High Memory Usage"
  combiner     = "OR"
  conditions {
    display_name = "GKE Node Memory usage"
    condition_threshold {
      filter          = "resource.type = \"k8s_node\" AND metric.type = \"kubernetes.io/node/memory/allocatable_utilization\""
      duration        = "300s"
      comparison     = "COMPARISON_GT"
      threshold_value = 0.8
      trigger {
        count = 1
      }
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }
  notification_channels = [google_monitoring_notification_channel.email.name]
}

# Discord Bot Pod Status Alert
resource "google_monitoring_alert_policy" "discord_bot_status" {
  display_name = "Discord Bot Pod Status"
  combiner     = "OR"
  conditions {
    display_name = "Pod not running"
    condition_threshold {
      filter          = "resource.type = \"k8s_pod\" AND metric.type = \"kubernetes.io/pod/status/phase\" AND metadata.user_labels.app = \"discord-bot\""
      duration        = "300s"
      comparison     = "COMPARISON_NE"
      threshold_value = 2  # 2 represents "Running" state
      trigger {
        count = 1
      }
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }
  notification_channels = [google_monitoring_notification_channel.email.name]
}

# Redis Pod Status Alert
resource "google_monitoring_alert_policy" "redis_status" {
  display_name = "Redis Pod Status"
  combiner     = "OR"
  conditions {
    display_name = "Pod not running"
    condition_threshold {
      filter          = "resource.type = \"k8s_pod\" AND metric.type = \"kubernetes.io/pod/status/phase\" AND metadata.user_labels.app = \"redis\""
      duration        = "300s"
      comparison     = "COMPARISON_NE"
      threshold_value = 2  # 2 represents "Running" state
      trigger {
        count = 1
      }
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }
  notification_channels = [google_monitoring_notification_channel.email.name]
}

# Custom Log Metric for Bot Errors
resource "google_logging_metric" "bot_errors" {
  name   = "discord_bot_errors"
  filter = "resource.type=\"k8s_pod\" AND resource.labels.pod_name=starts_with(\"discord-bot\") AND severity>=ERROR"
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
} 