-- Migration to add message status tracking
-- Run this after the main schema.sql

-- Add status column to messages table
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read'));

-- Update existing messages to have 'delivered' status
UPDATE messages SET status = 'delivered' WHERE status = 'sent';

-- Add index for status lookups
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
