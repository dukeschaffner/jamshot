BEGIN;
WITH params AS (
  SELECT
    127::int AS source_track_id,  -- <-- source tracks.id
    50::int      AS copy_count       -- <-- number of copies (1..N)
),
src AS (
  SELECT t.*
  FROM tracks t
  JOIN params p ON t.id = p.source_track_id
)
INSERT INTO tracks (
  user_id,
  title,
  audio_url,
  combined_audio_url,
  waveform_url,
  combined_waveform_url,
  duration,
  layer,
  parent_track_id,
  root_id,
  play_count,
  is_private,
  is_loop,
  metronome_bpm,
  metronome_offset,
  time_signature,
  secret_token,
  allow_download,
  is_competition_entry,
  competition_id,
  processing_status,
  processing_error,
  team_id,
  team_folder_id,
  camp_id,
  room_id,
  key,
  collab_count,
  like_count,
  repost_count,
  comment_count,
  created_at
)
SELECT
  s.user_id,
  LEFT(s.title || ' ' || g.n::text, 100),  -- int suffix; trim to title max length
  s.audio_url,
  s.combined_audio_url,
  s.waveform_url,
  s.combined_waveform_url,
  s.duration,
  s.layer,
  s.parent_track_id,
  s.root_id,
  s.play_count,
  s.is_private,
  s.is_loop,
  s.metronome_bpm,
  s.metronome_offset,
  s.time_signature,
  s.secret_token,
  s.allow_download,
  s.is_competition_entry,
  s.competition_id,
  s.processing_status,
  s.processing_error,
  s.team_id,
  s.team_folder_id,
  s.camp_id,
  s.room_id,
  s.key,
  s.collab_count,
  s.like_count,
  s.repost_count,
  s.comment_count,
  now() + ((g.n - 1) * INTERVAL '1 second') AS created_at
FROM src s
CROSS JOIN params p
CROSS JOIN generate_series(1, p.copy_count) AS g(n);
-- Optional: verify before commit
-- SELECT id, title FROM tracks WHERE ... ;
COMMIT;
-- ROLLBACK;