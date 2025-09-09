-- Migration to add quoted message support to existing messages table
-- Run this after the main schema.sql

-- Add quoted message columns to messages table
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS quoted_message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS quoted_content TEXT,
ADD COLUMN IF NOT EXISTS quoted_sender_name VARCHAR(100);

-- Add index for quoted message lookups
CREATE INDEX IF NOT EXISTS idx_messages_quoted_message_id ON messages(quoted_message_id);
