CREATE TABLE `employeeReports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`employeeName` text NOT NULL,
	`employeeEmail` varchar(320) NOT NULL,
	`reportText` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `employeeReports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `employeeReports` ADD CONSTRAINT `employeeReports_employeeId_users_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;