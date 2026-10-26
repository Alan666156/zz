# Baby Feeding Backend (V1.0)

Spring Boot 3.3.5 / Java 21 / Gradle 8.7 / MyBatis-Plus 3.5.7 / Flyway 10 / MySQL 8.0.27 / Redis 5 (Lettuce).

API base path: `/api/v1`. Contract: `docs/architecture/v1.0-baby-feeding.md`.

## Prerequisites

| Component | Local value |
|---|---|
| JDK | 21 (`C:\Program Files\Java\jdk-21.0.12.1` on this machine) |
| Gradle | wrapper 8.7 (system Gradle 8.7 is also available) |
| MySQL | `127.0.0.1:3306`, databases `zz_dev` / `zz_test` |
| Redis | `127.0.0.1:6379` (Redis 5 commands only), DB 0 dev / DB 15 test |

`JAVA_HOME` on this machine points at JDK 8 by default. Every Gradle command must
explicitly use JDK 21:

```bash
export JAVA_HOME="/c/Program Files/Java/jdk-21.0.12.1"
export PATH="$JAVA_HOME/bin:$PATH"
java -version   # must print 21
```

The system MySQL client config contains `server-id=1`; always use `--no-defaults`:

```bash
MYSQL_PWD=root123 mysql --no-defaults -h127.0.0.1 -P3306 -uroot -e "SHOW DATABASES"
```

## Local configuration

Secrets and connection values live in `backend/.env.local` (gitignored). Start from
the template and generate two independent secrets:

```bash
cp .env.example .env.local
# edit values, then:
# APP_DEVICE_PEPPER=$(openssl rand -hex 32)
# APP_EXPORT_TOKEN_KEY=$(openssl rand -hex 32)
```

`application.yml` contains no password or key defaults. Missing
`DB_PASSWORD`, `REDIS_PASSWORD`, `APP_DEVICE_PEPPER` or `APP_EXPORT_TOKEN_KEY`
makes startup fail. `APP_DEVICE_PEPPER` and `APP_EXPORT_TOKEN_KEY` must differ.

## Build and run

```bash
export JAVA_HOME="/c/Program Files/Java/jdk-21.0.12.1"
./gradlew clean build          # compile + unit tests
./run-local.sh                 # loads .env.local, starts on :8080
```

`run-local.sh` constructs `DB_URL` from `DB_HOST`/`DB_PORT`/`DB_NAME` unless
`DB_URL` is already set.

Health check (no device header):

```bash
curl -s http://127.0.0.1:8080/api/v1/health
```

Returns HTTP 200 with `data.status=UP` when MySQL and Redis respond, otherwise
HTTP 503 with `code=SERVICE_UNAVAILABLE` and a type-only error summary.

## Implemented endpoints

All responses use `{code,message,data,requestId,serverTime}`. Every endpoint
except health, device init and tokenised CSV downloads requires a valid
`X-Device-Id` UUID v4 header that has been registered through init.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/health` | DB + Redis status; 503 when a dependency is down |
| POST | `/api/v1/devices/init` | Idempotent; stores only the HMAC digest; 10/hour/IP |
| GET | `/api/v1/babies` | Default baby first, then creation order |
| POST | `/api/v1/babies` | Optional client `id` makes retries idempotent; max 5 active |
| GET | `/api/v1/babies/{id}` | Cross-device access returns 404 |
| PATCH | `/api/v1/babies/{id}` | Requires `baseRevision`; stale revision returns 409 with `data.current` |
| DELETE | `/api/v1/babies/{id}?baseRevision=n` | Soft delete; cascades to feeding/growth; deleting the default promotes the earliest remaining baby |
| POST | `/api/v1/feeding-records` | Optional client `id` makes retries idempotent |
| GET | `/api/v1/feeding-records` | `babyId` plus `date` or `from`/`to`; optional `feedType`, `page` (1+), `size` (1-100, default 20) |
| GET | `/api/v1/feeding-records/{id}` | Cross-device access returns 404 |
| PATCH | `/api/v1/feeding-records/{id}` | Requires `baseRevision`; stale revision returns 409 with `data.current` |
| DELETE | `/api/v1/feeding-records/{id}?baseRevision=n` | Soft delete; repeating returns `alreadyDeleted=true` |
| POST | `/api/v1/growth-records` | Optional client `id`; at least one metric required |
| GET | `/api/v1/growth-records` | `babyId` plus optional `from`/`to`, paginated like feeding |
| GET | `/api/v1/growth-records/latest` | Most recent active record for the baby |
| GET/PATCH/DELETE | `/api/v1/growth-records/{id}` | Same revision/tombstone rules as feeding |
| GET | `/api/v1/stats/daily` | `babyId` + required `date`; versioned Redis cache, 10 min |
| GET | `/api/v1/stats/trend` | `babyId` + `from`/`to`, at most 90 days; zero-filled points |
| POST | `/api/v1/sync/push` | 1-50 offline changes, per-item results; 30/min/device |
| POST | `/api/v1/exports/feeding-records` | Signs a 300 s CSV download token; 5/hour/device |
| GET | `/api/v1/exports/feeding-records/{token}.csv` | Token is the capability: no device header and no rate limit |

### Baby profiles

- The first active baby becomes the default automatically; switching the default
  clears the previous one atomically under a per-device row lock.
- The current default cannot be unset (`DEFAULT_BABY_REQUIRED`); deleting the
  default promotes the earliest remaining baby.
- Soft-deleted records are retained; repeating DELETE returns
  `alreadyDeleted=true` instead of an error.
- UUIDs are lower-case canonical v4. Uppercase ids are rejected, never
  normalised.
- `birthDate` accepts `[today - 3 years - 1 day, today + 1 day]` to tolerate
  client timezones up to UTC+14.

### Feeding records

- Four types: `BREAST` (side + duration), `FORMULA` (amount + `ML`), `MIXED`
  (side + amount + duration), `SOLID` (amount in `G`, unit optional when the
  amount is omitted).
- Amounts allow one decimal; milk is `0 < x <= 500 ml`, solid is
  `0 < x <= 2000 g`; duration is `0-21600` seconds.
- `startedAt` must be ISO-8601 with an offset, not before the baby's birth date
  and not more than 5 minutes in the future. `endedAt` must follow `startedAt`
  and stay within 6 hours.
- `recordDate` is derived from the local date of `startedAt` using its own
  offset, so the same instant can belong to different days for different
  offsets.
- Notes are limited to 200 code points. Tags are limited to 5 values from the
  fixed enum, deduplicated and stored in enum declaration order.
- List queries span at most 92 days.
- Every create/update/delete bumps the per-baby stats version, so cached stats
  never outlive a write.

### Growth records

- At least one of `weightKg` (0.5-50, two decimals), `heightCm` (20-150,
  one decimal) or `headCircumferenceCm` (20-70, one decimal) is required.
- `measuredOn` must fall between the baby's birth date and tomorrow (UTC).
- List queries span at most 366 days.

### Statistics

- `daily` requires `date`; `trend` requires `from`/`to` and spans at most 90
  days. Dates are strict `YYYY-MM-DD` and grouping uses the record's local
  `recordDate`.
- Responses are cached in Redis for 10 minutes under a per-baby version key.
  Feeding writes increment the version, so the next read misses old entries.
- `cached` reports whether the response came from Redis. Redis failures degrade
  to database reads rather than failing the request.

### Offline sync

- A batch carries a UUID v4 `batchId`, 1-50 changes and no duplicate
  `(entityType,id)` pair. Supported entities are `BABY`, `FEEDING_RECORD` and
  `GROWTH_RECORD`; operations are `UPSERT` and `DELETE`.
- Changes apply in request order, each in its own transaction. Item statuses are
  `APPLIED`, `DUPLICATE`, `CONFLICT_SERVER_WINS` and `REJECTED`; one rejected
  item never aborts the batch, and the summary counts every status.
- `baseRevision` drives optimistic concurrency: a tombstone or equal revision
  replays as `DUPLICATE`, a stale revision returns `CONFLICT_SERVER_WINS` with
  the current record.
- Responses are cached for 24 hours per `batchId`. Replaying the same body
  returns `replayed=true`; reusing a `batchId` with a different body returns
  409 `CONFLICT`.
- A 15 second per-device lock serialises batches; a concurrent push returns 409
  `SYNC_IN_PROGRESS` with `Retry-After: 1`.
- Deleted rows stay tombstones: sync can update or delete them but never revive
  them.
- `clientTime` is informational only and never orders changes.

### CSV export

- `POST` validates ownership, strict dates, a <=366-day window and a 10,000-row
  ceiling (`413 EXPORT_TOO_LARGE` with `data.rowCount` and `data.maxRows`).
- The response contains `downloadUrl`, `expiresAt` and `rowCount`. The token is
  `base64url(payload) + "." + base64url(HMAC-SHA256(APP_EXPORT_TOKEN_KEY,
  payload))` and always expires after 300 seconds.
- `GET` verifies the signature (`403 EXPORT_TOKEN_INVALID`) and expiry
  (`410 EXPORT_TOKEN_EXPIRED`), re-checks that the baby is still active (404),
  then streams rows ordered by `started_at`, `id`.
- CSV uses a UTF-8 BOM, CRLF line endings, the locked 12-column header, Chinese
  enum labels, `|`-joined tags in enum order, one-decimal amounts (HALF_UP),
  original-offset timestamps and RFC 4180 quoting. Cells starting with
  `= + - @ TAB CR` get an apostrophe prefix to block spreadsheet formula
  injection.
- Downloads set `Content-Type: text/csv; charset=UTF-8`,
  `Content-Disposition: attachment; filename="feeding-records-{from}-{to}.csv"`,
  `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.

### Rate limits

| Scope | Default limit | Subject |
|---|---|---|
| api | 120/minute | device |
| init | 10/hour | IP |
| export | 5/hour | device |
| sync | 30/minute | device |

Fixed windows use Redis `INCR` + `EXPIRE` (Redis 5 compatible). Rejections
return 429 `RATE_LIMITED` with `Retry-After` and `X-RateLimit-*` headers. When
Redis is unavailable the limiter fails open and omits the headers. Limits are
overridable through the `APP_RATE_LIMIT_*` variables listed in `.env.example`.

## Database migrations

Flyway runs automatically on startup (`spring.flyway.locations=classpath:db/migration`).
`V1__init.sql` creates all V1.0 tables, indexes and composite foreign keys.

Manual rollback (Flyway OSS has no undo):

```bash
MYSQL_PWD=root123 mysql --no-defaults -h127.0.0.1 -P3306 -uroot zz_dev \
  < src/main/resources/db/rollback/V1__init.down.sql
```

The down script drops tables in reverse foreign-key order. It is destructive.

## Runbook

Startup order for a fresh environment:

1. Start MySQL and Redis; create `zz_dev` and `zz_test` (`createDatabaseIfNotExist`
   is enabled on the test URL only).
2. Create `backend/.env.local` from `.env.example` and set `DB_PASSWORD`,
   `REDIS_PASSWORD`, `APP_DEVICE_PEPPER` and `APP_EXPORT_TOKEN_KEY`.
3. `./gradlew clean build` and then `./run-local.sh`.
4. Flyway applies `V1__init.sql` automatically; check the log for
   `Successfully applied 1 migration`.
5. `curl -s http://127.0.0.1:8080/api/v1/health` must return HTTP 200 with
   `data.status=UP`.

Smoke test after deployment:

```bash
DEVICE=$(uuidgen | tr 'A-Z' 'a-z')
curl -s -X POST http://127.0.0.1:8080/api/v1/devices/init \
  -H "X-Device-Id: $DEVICE" -H 'Content-Type: application/json' \
  -d '{"platform":"H5","appVersion":"1.0.0"}'
curl -s http://127.0.0.1:8080/api/v1/babies -H "X-Device-Id: $DEVICE"
```

Operational checks:

- Logs contain request id, route, status and latency only; request bodies,
  nicknames, amounts, notes and raw device ids must never appear.
- Redis keys are prefixed by `app.redis-key-prefix` and use the device HMAC, not
  the raw device id: `dev:`, `baby:`, `statsver:feed:`, `stats:feed:`, `rl:`,
  `lock:sync:` and `sync:`.
- Cache TTLs: stats 10 minutes, stats version 7 days, sync batch 24 hours, sync
  lock 15 seconds.
- Rate-limit and `SYNC_IN_PROGRESS` rejections always carry `Retry-After`.
- `ZZ-TEST` guard: integration tests refuse to start unless the JDBC URL
  contains `/zz_test`, Redis uses DB 15 and the key prefix starts with `test:`.

## Tests

Unit tests do not need MySQL/Redis:

```bash
./gradlew test
```

Integration tests use `zz_test` + Redis DB 15. `application-test.yml` is
test-only and a startup guard refuses to run if the URL does not contain
`zz_test` or if the Redis database is not 15:

```bash
./gradlew integrationTest
```

Integration tests use MockMvc against the real MySQL/Redis stack, truncate
tables in foreign-key order and flush DB 15 before each test; JUnit does not run
them in parallel.

Full verification (unit + integration + coverage thresholds) requires local
MySQL/Redis:

```bash
./gradlew clean test integrationTest jacocoTestReport jacocoTestCoverageVerification
```

Coverage gates in `build.gradle`:

- Overall line coverage >= 70% across unit and integration execution data.
- 100% branch coverage for `BabyValidator`, `ExportValidator`, `SyncValidator`,
  `GrowthValidator`, `CsvExporter` and the stats classes (`StatsValidator`,
  `StatsService`, `FeedingStatsAggregator`).
- `FeedingValidator` >= 99% line and >= 97% branch: its enum `switch` has a
  synthetic default branch and its ">5 tags" guard cannot be reached with a
  five-constant enum, so both stay uncovered by construction.

HTML report: `build/reports/jacoco/test/html/index.html`.

## Project layout

```
src/main/java/com/zz/babyfeeding/
├── BabyFeedingApplication.java
├── common/        api / web / security / redis / util
├── config/        AppProperties, timezone, clock, web config
├── health/        self-written health endpoint
├── device/        device init (anonymous identity)
├── baby/          baby profile CRUD
├── feeding/       feeding records, tag/type enums, validator
├── growth/        growth records, validator
├── stats/         daily/trend aggregation and versioned cache
├── sync/          offline batch push, lock and idempotent replay
└── export/        signed CSV export (ticket + streaming download)
src/main/resources/
├── application.yml
└── db/migration, db/rollback
src/integrationTest/java, src/integrationTest/resources
```

## Security notes

- No application-level field encryption (user-confirmed): business columns are
  plaintext; production relies on HTTPS and disk encryption.
- Device ids are stored only as `HMAC-SHA256(APP_DEVICE_PEPPER, deviceId)`.
- CSV export tokens are HMAC-signed with `APP_EXPORT_TOKEN_KEY` (fixed 5 min
  TTL).
- Logs contain request id, route, status and latency only; request bodies,
  nicknames, amounts, notes and raw device ids are never logged.
- No Spring Security and no Redisson. Rate limiting uses Redis 5-compatible
  `EVAL` scripts with `INCR` + `EXPIRE`.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Unsupported class file major version` or Boot 3 build error | `JAVA_HOME` is JDK 8; export JDK 21 |
| `unknown variable 'server-id=1'` | use `mysql --no-defaults` |
| Startup: `Could not resolve placeholder 'DB_PASSWORD'` | create `.env.local` or export env vars |
| Redis `ERR unknown command` | use Redis 5 commands only (`GETDEL`, `SET ... GET` are forbidden) |
| Flyway migration checksum error in `zz_test` | drop/recreate `zz_test` locally or run `flyway repair` intentionally; never disable checks in production |
| `409 SYNC_IN_PROGRESS` | another batch holds the 15 s device lock; retry after `Retry-After` |
| `409 CONFLICT` on sync replay | the same `batchId` was reused with a different body; use a new `batchId` |
| `403 EXPORT_TOKEN_INVALID` | token was edited, truncated or signed with another key |
| `410 EXPORT_TOKEN_EXPIRED` | tokens live 300 s; request a new ticket |
| `413 EXPORT_TOO_LARGE` | narrow the date range until `rowCount <= 10000` |
| `429 RATE_LIMITED` | inspect `data.scope` (`api`/`init`/`export`/`sync`) and `Retry-After` |
