-- Manual rollback for V1__init.sql.
-- Flyway OSS does not support undo; run this by hand against the target database.
-- Tables are dropped in reverse foreign-key order.

DROP TABLE IF EXISTS growth_record;
DROP TABLE IF EXISTS feeding_record;
DROP TABLE IF EXISTS family_member;
DROP TABLE IF EXISTS baby;
DROP TABLE IF EXISTS family;
DROP TABLE IF EXISTS device;
DROP TABLE IF EXISTS app_user;
