CREATE TABLE genres (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);



CREATE TABLE instruments (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);



CREATE TABLE track_genres (
  id SERIAL PRIMARY KEY,
  track_id INT REFERENCES tracks(id) ON DELETE CASCADE,
  genre_id INT REFERENCES genres(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (track_id, genre_id) -- Prevent duplicate genre tags for a track
);



CREATE TABLE track_instruments (
  id SERIAL PRIMARY KEY,
  track_id INT REFERENCES tracks(id) ON DELETE CASCADE,
  instrument_id INT REFERENCES instruments(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (track_id, instrument_id) -- Prevent duplicate instrument tags for a track
);


INSERT INTO genres (name) VALUES
('Rock'),
('Pop'),
('Hip Hop'),
('Electronic'),
('Jazz'),
('Classical'),
('R&B'),
('Country'),
('Folk'),
('Metal'),
('Alternative'),
('Indie'),
('Punk'),
('Soul'),
('Funk'),
('Blues'),
('Reggae'),
('Latin'),
('Afrobeats'),
('EDM'),
('House'),
('Techno'),
('Ambient'),
('Lo-Fi'),
('Experimental'),
('Christian'),
('Gospel');


INSERT INTO instruments (name) VALUES
('Acoustic Guitar'),
('Piano'),
('Drums'),
('Bass'),
('Vocals'),
('Synthesizer'),
('Saxophone'),
('Violin'),
('Trumpet'),
('DJ/Turntables'),
('Keyboard'),
('Percussion'),
('Bass Synth'),
('Sampler'),
('Drum Machine'),
('Flute'),
('Clarinet'),
('Trombone'),
('Cello'),
('Viola'),
('Ukulele'),
('Harmonica'),
('FX'),
('Vocals (Rap)'),
('Electric Guitar');



CREATE TABLE elements (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);



CREATE TABLE track_elements (
  id SERIAL PRIMARY KEY,
  track_id INT REFERENCES tracks(id) ON DELETE CASCADE,
  element_id INT REFERENCES elements(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (track_id, element_id) -- Prevent duplicate element tags for a track (max 2 enforced at application level)
);



CREATE TABLE track_instrument_requests (
  id SERIAL PRIMARY KEY,
  track_id INT REFERENCES tracks(id) ON DELETE CASCADE,
  instrument_id INT REFERENCES instruments(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (track_id, instrument_id) -- Prevent duplicate instrument request tags for a track (max 2 enforced at application level)
);



CREATE TABLE track_element_requests (
  id SERIAL PRIMARY KEY,
  track_id INT REFERENCES tracks(id) ON DELETE CASCADE,
  element_id INT REFERENCES elements(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (track_id, element_id) -- Prevent duplicate element request tags for a track (max 2 enforced at application level)
);

-- Create indexes for performance
CREATE INDEX idx_track_elements_track_id ON track_elements(track_id);
CREATE INDEX idx_track_elements_element_id ON track_elements(element_id);
CREATE INDEX idx_track_instrument_requests_track_id ON track_instrument_requests(track_id);
CREATE INDEX idx_track_instrument_requests_instrument_id ON track_instrument_requests(instrument_id);
CREATE INDEX idx_track_element_requests_track_id ON track_element_requests(track_id);
CREATE INDEX idx_track_element_requests_element_id ON track_element_requests(element_id);


INSERT INTO elements (name) VALUES
('Beat'),
('Melody'),
('Harmony'),
('Vocals (Lead)'),
('Vocals (Background)'),
('Solo'),
('Rhythm'),
('Texture/SFX');
