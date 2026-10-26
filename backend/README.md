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
except health and device init requires a valid `X-Device-Id` UUID v4 header that
has been registered through init.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/health` | DB + Redis status; 503 when a dependency is down |
| POST | `/api/v1/devices/init` | Idempotent; stores only the HMAC digest; 10/hour/IP |
| GET | `/api/v1/babies` | Default baby first, then creation order |
| POST | `/api/v1/babies` | Optional client `id` makes retries idempotent; max 5 active |
| GET | `/api/v1/babies/{id}` | Cross-device access returns 404 |
| PATCH | `/api/v1/babies/{id}` | Requires `baseRevision`; stale revision returns 409 with `data.current` |
| DELETE | `/api/v1/babies/{id}?baseRevision=n` | Soft delete; cascades to feeding/growth; deleting the default promotes the earliest remaining baby |

Business rules enforced by the baby API:

- The first active baby becomes the default automatically; switching the default
  clears the previous one atomically under a per-device row lock.
- The current default cannot be unset (`DEFAULT_BABY_REQUIRED`).
- Soft-deleted records are retained; repeating DELETE returns
  `alreadyDeleted=true` instead of an error.
- Rate limits (Redis fixed window): api 120/min/device, init 10/hour/IP.
  Rejections return 429 with `Retry-After`; headers report the limit and
  remaining quota. Limits are overridable through the `APP_RATE_LIMIT_*`
  variables listed in `.env.example`.
- UUIDs are lower-case canonical v4. Uppercase ids are rejected, never
  normalised.
- `birthDate` accepts `[today - 3 years - 1 day, today + 1 day]` to tolerate
  client timezones up to UTC+14.

## Database migrations

Flyway runs automatically on startup (`spring.flyway.locations=classpath:db/migration`).
`V1__init.sql` creates all V1.0 tables, indexes and composite foreign keys.

Manual rollback (Flyway OSS has no undo):

```bash
MYSQL_PWD=root123 mysql --no-defaults -h127.0.0.1 -P3306 -uroot zz_dev \
  < src/main/resources/db/rollback/V1__init.down.sql
```

The down script drops tables in reverse foreign-key order. It is destructive.

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

Integration tests truncate tables in foreign-key order and flush DB 15 before
each test. JUnit does not run them in parallel.

## Project layout

```
src/main/java/com/zz/babyfeeding/
├── BabyFeedingApplication.java
├── common/        api / web / security / redis / util
├── config/        AppProperties, timezone
├── health/        self-written health endpoint
├── device/        device init (anonymous identity)
├── baby/          baby profile CRUD
└── ...            feeding / growth / stats / sync / export (later tasks)
src/main/resources/
├── application.yml
└── db/migration, db/rollback
src/integrationTest/java, src/integrationTest/resources
```

## Security notes

- No application-level field encryption (user-confirmed): business columns are
  plaintext; production relies on HTTPS and disk encryption.
- Device ids are stored only as `HMAC-SHA256(APP_DEVICE_PEPPER, deviceId)`.
- CSV export tokens are HMAC-signed with `APP_EXPORT_TOKEN_KEY` (5 min TTL).
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
