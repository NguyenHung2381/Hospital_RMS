-- ============================================================
-- Migration: Thêm thời gian đăng ký và hạn nộp báo cáo
--            vào đợt nghiên cứu (research_rounds)
-- ============================================================

-- 1. Cột thời gian đăng ký đề tài
ALTER TABLE [dbo].[research_rounds]
    ADD [registration_start_date] DATE NULL,
        [registration_end_date]   DATE NULL;
GO

ALTER TABLE [dbo].[research_rounds]
    ADD CONSTRAINT [CHK_rr_reg_dates] CHECK (
        [registration_start_date] IS NULL
        OR [registration_end_date]   IS NULL
        OR [registration_end_date]  >= [registration_start_date]
    );
GO

-- 2. Bảng hạn nộp báo cáo nhiều lần/phase trên mỗi đợt
--    ID: HN + năm(4) + số-đợt(1) + phase-padded-2 = 9 ký tự
--    VD: HN2025101 = đợt DOT20251, lần nộp 01
CREATE TABLE [dbo].[round_deadlines] (
    [id]            VARCHAR(9)    NOT NULL,
    [round_id]      VARCHAR(10)   NOT NULL,
    [phase]         TINYINT       NOT NULL,   -- 1 = lần 1, 2 = lần 2 ...
    [name]          NVARCHAR(255) NOT NULL,   -- "Hạn nộp báo cáo lần 1"
    [deadline_date] DATE          NOT NULL,
    [created_at]    DATETIME2(7)  NOT NULL CONSTRAINT [DF_rd_created_at] DEFAULT GETDATE(),
    [created_by]    VARCHAR(20)   NOT NULL,
    [updated_at]    DATETIME2(7)  NULL,
    [updated_by]    VARCHAR(20)   NULL,

    CONSTRAINT [PK_round_deadlines] PRIMARY KEY CLUSTERED ([id] ASC),
    CONSTRAINT [FK_rd_round]        FOREIGN KEY ([round_id])
        REFERENCES [dbo].[research_rounds]([id]) ON DELETE CASCADE,
    CONSTRAINT [FK_rd_creator]      FOREIGN KEY ([created_by])
        REFERENCES [dbo].[users]([id]),
    CONSTRAINT [UQ_rd_round_phase]  UNIQUE ([round_id], [phase]),
    CONSTRAINT [CHK_rd_id]          CHECK ([id] LIKE 'HN[0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
    CONSTRAINT [CHK_rd_phase]       CHECK ([phase] BETWEEN 1 AND 9)
);
GO
