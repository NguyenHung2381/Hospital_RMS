-- Add staff_number column to topic_members
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('topic_members') AND name = 'staff_number'
)
BEGIN
    ALTER TABLE [dbo].[topic_members] ADD [staff_number] NVARCHAR(50) NULL;
END
