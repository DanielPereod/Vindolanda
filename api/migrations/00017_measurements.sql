-- +goose Up
CREATE TABLE body_measurements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 measured_on date NOT NULL UNIQUE,
 weight_kg numeric(5,2) CHECK(weight_kg IS NULL OR (weight_kg >= 0 AND weight_kg <= 1000)),
 body_fat_pct numeric(4,1) CHECK(body_fat_pct IS NULL OR (body_fat_pct >= 0 AND body_fat_pct <= 100)),
 waist_cm numeric(5,1) CHECK(waist_cm IS NULL OR (waist_cm >= 0 AND waist_cm <= 1000)),
 hip_cm numeric(5,1) CHECK(hip_cm IS NULL OR (hip_cm >= 0 AND hip_cm <= 1000)),
 chest_cm numeric(5,1) CHECK(chest_cm IS NULL OR (chest_cm >= 0 AND chest_cm <= 1000)),
 neck_cm numeric(5,1) CHECK(neck_cm IS NULL OR (neck_cm >= 0 AND neck_cm <= 1000)),
 arm_cm numeric(5,1) CHECK(arm_cm IS NULL OR (arm_cm >= 0 AND arm_cm <= 1000)),
 thigh_cm numeric(5,1) CHECK(thigh_cm IS NULL OR (thigh_cm >= 0 AND thigh_cm <= 1000)),
 notes text NOT NULL DEFAULT '' CHECK(length(notes) <= 500),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(weight_kg IS NOT NULL OR body_fat_pct IS NOT NULL OR waist_cm IS NOT NULL OR hip_cm IS NOT NULL OR chest_cm IS NOT NULL OR neck_cm IS NOT NULL OR arm_cm IS NOT NULL OR thigh_cm IS NOT NULL)
);
CREATE INDEX body_measurements_date ON body_measurements(measured_on DESC);

-- +goose Down
DROP TABLE body_measurements;
