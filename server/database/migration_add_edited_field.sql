-- Migration to add edited field to messages table
-- This migration adds support for tracking when messages have been edited

-- Add edited field to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited BOOLEAN DEFAULT FALSE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP;

-- Add index for edited field for better query performance
CREATE INDEX IF NOT EXISTS idx_messages_edited ON messages(edited);

-- Update existing messages to have edited = false
UPDATE messages SET edited = FALSE WHERE edited IS NULL;
