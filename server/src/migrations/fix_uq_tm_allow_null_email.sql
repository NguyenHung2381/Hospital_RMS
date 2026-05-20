-- Migration: fix_uq_tm_allow_null_email
-- Problem: UQ_tm is a standard UNIQUE CONSTRAINT on (topic_id, email).
--          SQL Server treats all NULLs as equal in a standard unique constraint,
--          so only ONE member per topic can have email = NULL.
--          When email is optional, multiple members without email in the same topic
--          will trigger: "Violation of UNIQUE KEY constraint 'UQ_tm'".
--
-- Fix: Drop the constraint and replace it with a FILTERED unique index
--      that only applies when email IS NOT NULL.
--      This allows multiple members with NULL email in the same topic,
--      while still preventing two members with the SAME non-NULL email.

-- Step 1: Drop the existing UNIQUE CONSTRAINT
IF EXISTS (
    SELECT 1 FROM sys.key_constraints
    WHERE name = 'UQ_tm' AND parent_object_id = OBJECT_ID('dbo.topic_members')
)
BEGIN
    ALTER TABLE [dbo].[topic_members] DROP CONSTRAINT [UQ_tm];
    PRINT 'Dropped constraint UQ_tm';
END

-- Step 2: Drop old index if somehow exists independently
IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_tm' AND object_id = OBJECT_ID('dbo.topic_members')
)
BEGIN
    DROP INDEX [UQ_tm] ON [dbo].[topic_members];
    PRINT 'Dropped index UQ_tm';
END

-- Step 3: Create filtered unique index — only enforces uniqueness when email IS NOT NULL
-- Note: QUOTED_IDENTIFIER must be ON for filtered indexes in SQL Server
SET QUOTED_IDENTIFIER ON;
CREATE UNIQUE NONCLUSTERED INDEX [UQ_tm]
ON [dbo].[topic_members] ([topic_id] ASC, [email] ASC)
WHERE [email] IS NOT NULL;

PRINT 'Created filtered unique index UQ_tm (topic_id, email) WHERE email IS NOT NULL';
GO
