-- Migration to add image_data column to messages table
-- Run this script to update existing databases

-- Add image_data column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' 
        AND column_name = 'image_data'
    ) THEN
        ALTER TABLE messages ADD COLUMN image_data JSONB;
    END IF;
END $$;

-- Add index for message_type if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(message_type);

-- Update existing messages to have proper message_type
UPDATE messages 
SET message_type = 'text' 
WHERE message_type IS NULL;
