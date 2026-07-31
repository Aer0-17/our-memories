# Backup and Migration

The project has two different backup paths:

- Encrypted full backup (`.ombak`): a server-side SQLite snapshot plus local
  photos and voice files. Use this for routine protection and disaster recovery.
- JSON space export: portable database records plus media references, without
  media binaries or additional encryption. Use this for migration or a small
  manual copy only.

## Encrypted Full Backup

### Enable On Docker Compose

Generate a dedicated 32-byte key once. Do not reuse `JWT_SECRET`, the space
password, or the admin password:

```bash
openssl rand -base64 32
```

Store one copy in `.env` and one offline copy away from the NAS. A lost key
cannot be recovered, while anyone who obtains it together with a backup can
decrypt the data.

Prepare the host directory before enabling the feature. The current production
image runs as `100:101`:

```bash
mkdir -p backups
chown -R 100:101 backups
chmod 700 backups
```

Add these values to `.env`:

```env
FULL_BACKUP_ENABLED=true
FULL_BACKUP_ENCRYPTION_KEY=<openssl rand -base64 32 output>
FULL_BACKUP_INTERVAL=24h
FULL_BACKUP_RETENTION=30
BACKUP_HOST_DIR=./backups
BACKUP_TMPFS_SIZE=512m
```

Then recreate the container. The first automatic check runs about 30 seconds
after startup. Either signed-in member can also start a backup from the mini
program's Data Vault.

```bash
docker compose up -d
docker compose logs --since=5m --tail=100 our-memories
```

The backup writer uses `VACUUM INTO` for a consistent SQLite snapshot, streams
tar/gzip directly through chunked AES-256-GCM, verifies the finished `.partial`
file, and only then publishes the `.ombak` file. No long-lived plaintext archive
is written. The directory retains the newest configured number of packages.

If S3-compatible storage is configured, the package still contains the local
`LOCAL_IMAGE_DIR` only. Remote objects must be protected with bucket versioning
or a separate object-storage backup policy.

### Verify And Extract

List the newest package and verify its authentication tags, archive structure,
entry hashes, and manifest:

```bash
docker compose exec our-memories sh -lc '
  latest=$(ls -1t /app/backups/*.ombak | head -n 1)
  ./our-memories-backupctl verify -file "$latest"
'
```

Test extraction into an empty directory:

```bash
docker compose exec our-memories sh -lc '
  latest=$(ls -1t /app/backups/*.ombak | head -n 1)
  out=/app/backups/restore-test-$(date +%Y%m%d-%H%M%S)
  mkdir -m 700 "$out"
  ./our-memories-backupctl extract -file "$latest" -out "$out"
  echo "$out"
'
```

The result contains:

```text
database/ourMemories.db
media/...
manifest.json
```

At least once per quarter, open the extracted database with SQLite and inspect
several restored media files. A backup is not proven recoverable until this test
has succeeded.

### Disaster Recovery

1. Stop the application and preserve the damaged `data` directory unchanged.
2. Verify and extract the selected `.ombak` package with the same encryption key.
3. Copy `database/ourMemories.db` to the new `data/ourMemories.db`.
4. Copy the contents of `media/` to the new `data/images/`.
5. Set ownership to `100:101`, directories to `0700`, and files to `0600`.
6. Start the container, check `/health`, sign in, and inspect several records and
   media files before deleting the preserved damaged directory.

Never extract directly over the live `data` directory. Restore into an empty
directory and validate first.

## JSON Space Export

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
