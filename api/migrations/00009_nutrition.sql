-- +goose Up
CREATE TABLE nutrition_profiles (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 weight_kg numeric(6,2) NOT NULL DEFAULT 0 CHECK(weight_kg >= 0 AND weight_kg <= 1000),
 height_cm numeric(6,2) NOT NULL DEFAULT 0 CHECK(height_cm >= 0 AND height_cm <= 300),
 age integer NOT NULL DEFAULT 0 CHECK(age BETWEEN 0 AND 130),
 sex text NOT NULL DEFAULT 'other' CHECK(sex IN('male','female','other')),
 activity_level text NOT NULL DEFAULT 'moderate' CHECK(activity_level IN('sedentary','light','moderate','active','very_active')),
 goal text NOT NULL DEFAULT 'maintain' CHECK(goal IN('lose','maintain','gain')),
 target_calories integer NOT NULL DEFAULT 0 CHECK(target_calories >= 0),
 target_protein_g numeric(6,2) NOT NULL DEFAULT 0 CHECK(target_protein_g >= 0),
 target_carbs_g numeric(6,2) NOT NULL DEFAULT 0 CHECK(target_carbs_g >= 0),
 target_fat_g numeric(6,2) NOT NULL DEFAULT 0 CHECK(target_fat_g >= 0),
 target_fiber_g numeric(6,2) NOT NULL DEFAULT 0 CHECK(target_fiber_g >= 0),
 target_water_ml integer NOT NULL DEFAULT 0 CHECK(target_water_ml >= 0),
 target_mode text NOT NULL DEFAULT 'auto' CHECK(target_mode IN('auto','manual')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO nutrition_profiles(singleton) VALUES(true) ON CONFLICT DO NOTHING;

-- +goose Down
DROP TABLE nutrition_profiles;
