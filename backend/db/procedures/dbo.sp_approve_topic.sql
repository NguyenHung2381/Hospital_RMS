-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
CREATE PROCEDURE [dbo].[sp_approve_topic]
	@topic_id   VARCHAR(15),
	@actor_id   VARCHAR(20),
	@decision   VARCHAR(10),    -- 'approved' | 'rejected' | 'supplement'
	@comment    NVARCHAR(MAX) = NULL
AS
BEGIN
	SET NOCOUNT ON;

	IF @decision NOT IN ('approved', 'rejected', 'supplement')
		RAISERROR(N'Quyết định không hợp lệ', 16, 1);

	EXEC sp_set_session_context N'current_user_id', @actor_id;

	BEGIN TRANSACTION;
	BEGIN TRY
		-- 1. Cập nhật bản ghi phê duyệt
		UPDATE [dbo].[approvals]
		SET    [status]  = @decision,
		       [comment] = @comment
		WHERE  [topic_id] = @topic_id;

		IF @@ROWCOUNT = 0
			RAISERROR(N'Không tìm thấy bản ghi phê duyệt cho đề tài %s', 16, 1, @topic_id);

		-- 2. Cập nhật trạng thái đề tài
		UPDATE [dbo].[topics]
		SET    [status] = @decision
		WHERE  [id] = @topic_id;

		-- 3. Ghi topic_progress
		DECLARE @prog_id     VARCHAR(22);
		DECLARE @prog_prefix VARCHAR(18) = 'TT' + @topic_id + '_';
		DECLARE @prog_count  INT;

		SELECT @prog_count = COUNT(*) + 1
		FROM [dbo].[topic_progress]
		WHERE [topic_id] = @topic_id;

		SET @prog_id = @prog_prefix + RIGHT('00' + CAST(@prog_count AS VARCHAR(2)), 2);

		INSERT INTO [dbo].[topic_progress] ([id], [topic_id], [status], [note], [created_by])
		VALUES (
			@prog_id,
			@topic_id,
			CASE @decision
				WHEN 'approved'   THEN N'Đề tài được phê duyệt'
				WHEN 'supplement' THEN N'Đề tài cần bổ sung, chỉnh sửa'
				ELSE                   N'Đề tài bị từ chối'
			END,
			@comment,
			@actor_id
		);

		COMMIT TRANSACTION;
	END TRY
	BEGIN CATCH
		ROLLBACK TRANSACTION;
		THROW;
	END CATCH

	-- ---------------------------------------------------------------------
	-- 4. Push notification (ngoài transaction, không rollback nếu gửi thông
	--    báo lỗi — business logic đã commit xong)
	-- ---------------------------------------------------------------------
	DECLARE @notif_user_ids NVARCHAR(MAX);

	IF @decision = 'approved'
	BEGIN
		-- Cấp tài khoản thành viên
		EXEC [dbo].[sp_grant_member_accounts] @topic_id, @actor_id;

		-- Thông báo cho chủ nhiệm đề tài (created_by)
		SELECT @notif_user_ids = '[' + STRING_AGG('"' + [uid] + '"', ',') + ']'
		FROM (
			SELECT [created_by] AS [uid]
			FROM   [dbo].[topics]
			WHERE  [id] = @topic_id
			    AND  [created_by] IS NOT NULL
		) x;

		IF @notif_user_ids IS NOT NULL AND @notif_user_ids <> '[]'
			EXEC [dbo].[sp_push_notification]
				@type       = 'topic_approved',
				@title      = N'Đề tài của bạn đã được phê duyệt',
				@message    = N'Đề tài đã được Hội đồng xét duyệt thông qua. Hệ thống đang cấp tài khoản cho các thành viên.',
				@ref_id     = @topic_id,
				@ref_type   = 'topic',
				@user_ids   = @notif_user_ids;
	END
	ELSE IF @decision = 'supplement'
	BEGIN
		-- Thông báo cho chủ nhiệm đề tài (created_by) — chưa cấp tài khoản, chưa cần thông báo thành viên
		SELECT @notif_user_ids = '[' + STRING_AGG('"' + [uid] + '"', ',') + ']'
		FROM (
			SELECT [created_by] AS [uid]
			FROM   [dbo].[topics]
			WHERE  [id] = @topic_id
			    AND  [created_by] IS NOT NULL
		) x;

		DECLARE @supplement_msg NVARCHAR(MAX);
		SET @supplement_msg = ISNULL(
			N'Cần bổ sung: ' + @comment,
			N'Đề tài cần được bổ sung/chỉnh sửa thông tin trước khi Hội đồng xét duyệt tiếp. Vui lòng kiểm tra và nộp lại.'
		);

		IF @notif_user_ids IS NOT NULL AND @notif_user_ids <> '[]'
			EXEC [dbo].[sp_push_notification]
				@type       = 'topic_supplement_requested',
				@title      = N'Đề tài của bạn cần bổ sung thông tin',
				@message    = @supplement_msg,
				@ref_id     = @topic_id,
				@ref_type   = 'topic',
				@user_ids   = @notif_user_ids;
	END
	ELSE
	BEGIN
		-- Thông báo rejected cho chủ nhiệm + toàn bộ thành viên đã có tài khoản
		SELECT @notif_user_ids = '[' + STRING_AGG('"' + [uid] + '"', ',') + ']'
		FROM (
			SELECT [created_by] AS [uid]
			FROM   [dbo].[topics]
			WHERE  [id] = @topic_id
			    AND  [created_by] IS NOT NULL
			UNION
			SELECT [user_id]
			FROM   [dbo].[topic_members]
			WHERE  [topic_id]         = @topic_id
			    AND  [user_id]         IS NOT NULL
			    AND  [account_granted] = 1
		) x;

		-- Tham số @message phải là biến, không được là expression trong EXEC
		DECLARE @reject_msg NVARCHAR(MAX);
		SET @reject_msg = ISNULL(
			N'Lý do: ' + @comment,
			N'Đề tài không được Hội đồng xét duyệt thông qua. Vui lòng liên hệ phòng NCKH để biết thêm chi tiết.'
		);

		IF @notif_user_ids IS NOT NULL AND @notif_user_ids <> '[]'
			EXEC [dbo].[sp_push_notification]
				@type       = 'topic_rejected',
				@title      = N'Đề tài của bạn không được phê duyệt',
				@message    = @reject_msg,
				@ref_id     = @topic_id,
				@ref_type   = 'topic',
				@user_ids   = @notif_user_ids;
	END

	SELECT N'Thành công' AS [message], @topic_id AS [topic_id], @decision AS [decision];
END;
