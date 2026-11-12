CREATE TABLE `inventoryDeductions` (
	`orderKey` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inventoryDeductions_orderKey` PRIMARY KEY(`orderKey`)
);
--> statement-breakpoint
ALTER TABLE `books` ADD `slug` varchar(255) NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `books` SET `slug` = `id` WHERE `slug` = '';--> statement-breakpoint
ALTER TABLE `books` ALTER COLUMN `slug` DROP DEFAULT;--> statement-breakpoint
ALTER TABLE `books` ADD `coverImage` varchar(1024);--> statement-breakpoint
ALTER TABLE `books` ADD `stock` int DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE `books` ADD CONSTRAINT `books_slug_unique` UNIQUE(`slug`);