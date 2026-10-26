-- Baby feeding app V1.0 schema.
-- Business columns are plaintext by decision (no application-level field encryption).
-- All DATETIME(3) values are UTC. No seed data is inserted here.

-- ---------------------------------------------------------------------------
-- V1.1 reserved: account tables. V1.0 does not read or write these tables.
-- ---------------------------------------------------------------------------
CREATE TABLE app_user (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id     CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    account_type  VARCHAR(16) NOT NULL DEFAULT 'REGISTERED',
    phone         VARCHAR(32) NULL,
    status        VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_app_user_public_id (public_id)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = 'V1.1 reserved: registered accounts';

CREATE TABLE family (
    id             CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    name           VARCHAR(40) NOT NULL,
    owner_user_id  BIGINT UNSIGNED NULL,
    created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_family_owner (owner_user_id),
    CONSTRAINT fk_family_owner FOREIGN KEY (owner_user_id) REFERENCES app_user (id) ON DELETE SET NULL
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = 'V1.1 reserved: family sharing';

CREATE TABLE family_member (
    family_id   CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id     BIGINT UNSIGNED NOT NULL,
    role        VARCHAR(16) NOT NULL DEFAULT 'CAREGIVER',
    status      VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    joined_at   DATETIME(3) NOT NULL,
    created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (family_id, user_id),
    KEY idx_family_member_user (user_id),
    CONSTRAINT fk_family_member_family FOREIGN KEY (family_id) REFERENCES family (id) ON DELETE CASCADE,
    CONSTRAINT fk_family_member_user FOREIGN KEY (user_id) REFERENCES app_user (id) ON DELETE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = 'V1.1 reserved: family membership';

-- ---------------------------------------------------------------------------
-- Anonymous device identity. Only the HMAC-SHA256 digest of the client UUID is
-- stored; the raw device id never reaches the database.
-- ---------------------------------------------------------------------------
CREATE TABLE device (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    device_uid_hash BINARY(32) NOT NULL,
    user_id         BIGINT UNSIGNED NULL,
    platform        VARCHAR(16) NOT NULL DEFAULT 'H5',
    app_version     VARCHAR(32) NULL,
    status          VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    first_seen_at   DATETIME(3) NOT NULL,
    last_seen_at    DATETIME(3) NOT NULL,
    created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_device_uid_hash (device_uid_hash),
    KEY idx_device_user (user_id),
    CONSTRAINT fk_device_user FOREIGN KEY (user_id) REFERENCES app_user (id) ON DELETE SET NULL
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = 'Anonymous device identity (HMAC digest only)';

CREATE TABLE baby (
    id                   CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    device_id            BIGINT UNSIGNED NOT NULL,
    name                 VARCHAR(40) NOT NULL,
    gender               VARCHAR(8) NOT NULL DEFAULT 'UNKNOWN',
    birth_date           DATE NOT NULL,
    is_default           TINYINT(1) NOT NULL DEFAULT 0,
    family_id            CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    revision             INT UNSIGNED NOT NULL DEFAULT 1,
    deleted_at           DATETIME(3) NULL,
    created_by_user_id   BIGINT UNSIGNED NULL,
    updated_by_user_id   BIGINT UNSIGNED NULL,
    created_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    -- Required by the composite foreign keys of feeding_record / growth_record:
    -- (baby_id, device_id) proves that a child row belongs to the same device.
    UNIQUE KEY uk_baby_id_device (id, device_id),
    KEY idx_baby_device (device_id, deleted_at, is_default),
    KEY idx_baby_family (family_id),
    KEY idx_baby_created_by (created_by_user_id),
    KEY idx_baby_updated_by (updated_by_user_id),
    CONSTRAINT fk_baby_device FOREIGN KEY (device_id) REFERENCES device (id) ON DELETE RESTRICT,
    CONSTRAINT fk_baby_family FOREIGN KEY (family_id) REFERENCES family (id) ON DELETE SET NULL,
    CONSTRAINT fk_baby_created_by FOREIGN KEY (created_by_user_id) REFERENCES app_user (id) ON DELETE SET NULL,
    CONSTRAINT fk_baby_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES app_user (id) ON DELETE SET NULL
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = 'Baby profile (plaintext name by decision)';

CREATE TABLE feeding_record (
    id                   CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    device_id            BIGINT UNSIGNED NOT NULL,
    baby_id              CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    feed_type            VARCHAR(16) NOT NULL,
    breast_side          VARCHAR(8) NULL,
    amount_value         DECIMAL(8, 2) NULL,
    amount_unit          VARCHAR(8) NULL,
    duration_sec         INT UNSIGNED NULL,
    note                 VARCHAR(400) NULL,
    tags                 JSON NULL,
    started_at           DATETIME(3) NOT NULL,
    ended_at             DATETIME(3) NULL,
    tz_offset_minutes    SMALLINT NOT NULL,
    record_date          DATE NOT NULL,
    client_updated_at    DATETIME(3) NULL,
    revision             INT UNSIGNED NOT NULL DEFAULT 1,
    deleted_at           DATETIME(3) NULL,
    created_by_user_id   BIGINT UNSIGNED NULL,
    updated_by_user_id   BIGINT UNSIGNED NULL,
    created_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_feed_baby_date (device_id, baby_id, record_date, started_at),
    KEY idx_feed_device_date (device_id, record_date),
    KEY idx_feed_baby_started (baby_id, started_at),
    -- Left-most columns of the composite FK below.
    KEY idx_feed_baby_device (baby_id, device_id),
    KEY idx_feed_created_by (created_by_user_id),
    KEY idx_feed_updated_by (updated_by_user_id),
    CONSTRAINT fk_feed_baby_device
        FOREIGN KEY (baby_id, device_id) REFERENCES baby (id, device_id) ON DELETE RESTRICT,
    CONSTRAINT fk_feed_created_by FOREIGN KEY (created_by_user_id) REFERENCES app_user (id) ON DELETE SET NULL,
    CONSTRAINT fk_feed_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES app_user (id) ON DELETE SET NULL
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = 'Feeding records (plaintext business columns by decision)';

CREATE TABLE growth_record (
    id                       CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    device_id                BIGINT UNSIGNED NOT NULL,
    baby_id                  CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    measured_on              DATE NOT NULL,
    height_cm                DECIMAL(5, 2) NULL,
    weight_kg                DECIMAL(5, 2) NULL,
    head_circumference_cm    DECIMAL(5, 2) NULL,
    note                     VARCHAR(400) NULL,
    revision                 INT UNSIGNED NOT NULL DEFAULT 1,
    deleted_at               DATETIME(3) NULL,
    created_by_user_id       BIGINT UNSIGNED NULL,
    updated_by_user_id       BIGINT UNSIGNED NULL,
    created_at               DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at               DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_growth_baby_date (device_id, baby_id, measured_on, created_at),
    -- Left-most columns of the composite FK below.
    KEY idx_growth_baby_device (baby_id, device_id),
    KEY idx_growth_created_by (created_by_user_id),
    KEY idx_growth_updated_by (updated_by_user_id),
    CONSTRAINT fk_growth_baby_device
        FOREIGN KEY (baby_id, device_id) REFERENCES baby (id, device_id) ON DELETE RESTRICT,
    CONSTRAINT fk_growth_created_by FOREIGN KEY (created_by_user_id) REFERENCES app_user (id) ON DELETE SET NULL,
    CONSTRAINT fk_growth_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES app_user (id) ON DELETE SET NULL
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = 'Growth records (plaintext business columns by decision)';
