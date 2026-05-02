# API Keys API

Base path: `/api/v1/api-keys`

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/api-keys` | List all API keys |
| POST | `/api/v1/api-keys` | Generate a new API key |
| POST | `/api/v1/api-keys/{key_id}/revoke` | Revoke an API key |
| DELETE | `/api/v1/api-keys/{key_id}` | Delete an API key permanently |

## Scopes

API keys have one of three scopes that determine what operations they can perform:

| Scope | Permissions |
|-------|-------------|
| `read` | Read-only access to data |
| `write` | Read + write operations |
| `admin` | Full access including key management |

## List Keys

`GET /api/v1/api-keys` — Returns all API keys with their metadata (without the secret key value).

**Response fields:**
- `id` — Key ID
- `name` — User-provided name
- `key_prefix` — Prefix of the key (e.g. `omk_abc123...`) for identification
- `scope` — Access scope
- `is_active` — Whether the key is currently active
- `last_used_at` — Last usage timestamp (ISO 8601)
- `created_at` — Creation timestamp

## Create Key

`POST /api/v1/api-keys` — Generate a new API key.

**Request body:**
```json
{
  "name": "My API Key",
  "scope": "read"
}
```

**Response fields:**
- `id`, `name`, `key_prefix`, `scope`, `is_active`, `created_at` — Same as list
- `key` — **The full secret key value — only returned at creation time and never stored**

> **Important:** The raw key is only shown once at creation. Store it securely immediately.

## Revoke Key

`POST /api/v1/api-keys/{key_id}/revoke` — Disable an API key without deleting it. The key can no longer be used for authentication.

## Delete Key

`DELETE /api/v1/api-keys/{key_id}` — Permanently remove an API key. This action cannot be undone.
