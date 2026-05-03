> ⚠️ 本文档的中文翻译正在进行中。以下为英文原文。

# Team Members API

Base path: `/api/v1/projects/{project_id}/members`

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects/{id}/members` | List team members |
| POST | `/projects/{id}/members` | Invite a team member |
| PUT | `/projects/{id}/members/{member_id}` | Update member role |
| DELETE | `/projects/{id}/members/{member_id}` | Remove a team member |

## Roles

Team members have one of three roles:

| Role | Permissions |
|------|-------------|
| `owner` | Full control including team management |
| `editor` | Read/write access to papers and projects |
| `viewer` | Read-only access |

## Invite Member

`POST /projects/{id}/members`

**Request body:**
```json
{
  "email": "user@example.com",
  "role": "editor"
}
```

Sends an invitation to the specified email. The invite is tracked by email since the app is currently single-user.

## Update Role

`PUT /projects/{id}/members/{member_id}`

**Request body:**
```json
{
  "role": "owner"
}
```

## Authentication

The RBAC middleware uses `X-User-Email` header for identity. Without it, single-user mode is assumed and access is granted.
