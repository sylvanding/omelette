> ⚠️ 本文档的中文翻译正在进行中。以下为英文原文。

# Notifications API

Base path: `/api/v1/projects/{project_id}/notifications`

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects/{id}/notifications` | List notifications |
| POST | `/projects/{id}/notifications/{id}/read` | Mark notification as read |
| POST | `/projects/{id}/notifications/mark-all-read` | Mark all notifications as read |
| DELETE | `/projects/{id}/notifications/{id}` | Dismiss a notification |

## List Notifications

`GET /projects/{id}/notifications`

**Query parameters:**
- `unread_only` — If `true`, only return unread notifications

**Notification types:**
- `subscription_match` — New paper matches an active subscription
- `paper_update` — Paper metadata has been updated
- `system` — System-wide notifications

**Response fields:**
- `items[]` — Each with `id`, `type`, `title`, `body`, `paper_id`, `subscription_id`, `is_read`, `is_dismissed`, `created_at`
- `unread_count` — Number of unread notifications
- `total` — Total notifications

## Mark as Read

`POST /projects/{id}/notifications/{id}/read` — Mark a single notification as read.

## Mark All as Read

`POST /projects/{id}/notifications/mark-all-read` — Mark all notifications for the project as read.

## Dismiss

`DELETE /projects/{id}/notifications/{id}` — Permanently remove a notification.
