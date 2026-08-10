CREATE TABLE camps (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  product_version VARCHAR(20) NOT NULL CHECK (product_version IN ('5_users', '10_users', '25_users', '50_users', '100_users')),
  stripe_payment_id VARCHAR(255),
  camp_code VARCHAR(64) UNIQUE NOT NULL, -- For invite links
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create rooms table (rooms within camps)
CREATE TABLE rooms (
  id SERIAL PRIMARY KEY,
  camp_id INT REFERENCES camps(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(50) NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (camp_id, name) -- Room names must be unique within a camp
);

-- Create user_camps junction table (many-to-many relationship)
CREATE TABLE user_camps (
  id SERIAL PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  camp_id INT REFERENCES camps(id) ON DELETE CASCADE NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'contributor', 'owner')) DEFAULT 'contributor',
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, camp_id) -- User can only be in each camp once
);

-- Create user_rooms junction table (many-to-many relationship)
CREATE TABLE user_rooms (
  id SERIAL PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  room_id INT REFERENCES rooms(id) ON DELETE CASCADE NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, room_id) -- User can only be in each room once
  -- Note: Users can only be assigned to one room per camp (validated in application logic)
);


-- Create indexes for performance
CREATE INDEX idx_camps_created_by ON camps(created_by);
CREATE INDEX idx_camps_start_date ON camps(start_date);
CREATE INDEX idx_camps_end_date ON camps(end_date);
CREATE INDEX idx_camps_camp_code ON camps(camp_code);

CREATE INDEX idx_rooms_camp_id ON rooms(camp_id);

CREATE INDEX idx_user_camps_user_id ON user_camps(user_id);
CREATE INDEX idx_user_camps_camp_id ON user_camps(camp_id);
CREATE INDEX idx_user_camps_role ON user_camps(role);

CREATE INDEX idx_user_rooms_user_id ON user_rooms(user_id);
CREATE INDEX idx_user_rooms_room_id ON user_rooms(room_id);

-- Create trigger to automatically update the updated_at timestamp for camps
CREATE OR REPLACE FUNCTION update_camp_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_camp_timestamp
BEFORE UPDATE ON camps
FOR EACH ROW
EXECUTE FUNCTION update_camp_timestamp();
