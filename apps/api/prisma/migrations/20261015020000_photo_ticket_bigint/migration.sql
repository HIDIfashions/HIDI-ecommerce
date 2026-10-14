-- Expand upload byte accounting; no catalogue or order rows are changed.
ALTER TABLE [dbo].[AdminMediaUploadTicket] ALTER COLUMN [maxBytes] BIGINT NOT NULL;
