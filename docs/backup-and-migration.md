# Backup and Migration

This project exports one space as a JSON backup. The backup contains database
records and a media manifest, but it does not embed image binary data.

## What Is Included

- Space metadata, including the password hash and commercial status fields.
- Users in the space.
- Memories, memory photos, anniversary cards, anniversary photos.
- Settings, city assets, login photos, auxiliary items, trip-guide stores.
- Whispers, whisper replies, time capsules, time-capsule photos.
- Orders for the space.
- A `media` list with object `key` and current `url` references.

Admin accounts and audit logs are not included.

## Export From The Old Server

Log in and keep the access token:

```bash
OLD_API="https://old.example.com/api/v1"

TOKEN="$(
  curl -s "$OLD_API/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"spaceCode":"your-space-code","password":"your-password","userId":"me"}' \
    | jq -r '.accessToken'
)"
```

Export the backup:

```bash
curl -L "$OLD_API/backup/export" \
  -H "Authorization: Bearer $TOKEN" \
  -o our-memories-backup.json
```

Keep this file private. It contains personal data and the space password hash.

## Copy Images To Domestic Object Storage

The JSON file contains image references like:

```json
{
  "key": "space-id/memories/photo-id.jpg",
  "url": "https://old-bucket.example.com/space-id/memories/photo-id.jpg"
}
```

Copy every object under the exported space prefix to the new bucket while
preserving the same key. For example, if the key is
`space-id/memories/photo-id.jpg`, it should have that exact key in the new
bucket too.

When the new backend has `S3_PUBLIC_BASE_URL` or `S3_ENDPOINT` configured, the
import will rewrite stored image URLs to the new public base automatically.

## Import On The New Server

Start the new server with the target database and domestic object storage
environment variables configured.

Log in to the seeded/default space on the new server just to authorize the
import:

```bash
NEW_API="https://new.example.com/api/v1"

NEW_TOKEN="$(
  curl -s "$NEW_API/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"spaceCode":"seed-space-code","password":"seed-password","userId":"me"}' \
    | jq -r '.accessToken'
)"
```

Import the backup:

```bash
curl -s "$NEW_API/backup/import" \
  -H "Authorization: Bearer $NEW_TOKEN" \
  -H 'Content-Type: application/json' \
  --data-binary @our-memories-backup.json
```

The import replaces the currently logged-in space with the backed-up space. If
the backed-up space ID differs from the seeded space ID, the response returns
`"reloginRequired": true`. Log in again using the original space code and
password from the old server.

## Safety Notes

- Test the import on a staging database first if the new server already has
  real data.
- Keep object keys unchanged during bucket migration.
- The API request body limit is 64 MB. The backup should usually stay small
  because image binary data is not embedded.
