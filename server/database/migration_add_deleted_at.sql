-- Migration to add deleted_at field for soft delete functionality
-- Run this migration to add soft delete support to messages

-- Add deleted_at column to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- Add index for better performance when filtering out deleted messages
CREATE INDEX IF NOT EXISTS idx_messages_deleted_at ON messages(deleted_at);

-- Add index for non-deleted messages (most common query)
CREATE INDEX IF NOT EXISTS idx_messages_not_deleted ON messages(chat_id, created_at) WHERE deleted_at IS NULL;
