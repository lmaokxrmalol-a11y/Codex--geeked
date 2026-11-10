CREATE TABLE `books` (
	`id` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`author` varchar(255) NOT NULL,
	`category` enum('Fiction','Nonfiction','Poetry','Food & drink') NOT NULL,
	`priceCents` int NOT NULL,
	`ratingTenths` int NOT NULL,
	`reviews` int NOT NULL DEFAULT 0,
	`summary` text NOT NULL,
	`description` text NOT NULL,
	`pages` int NOT NULL,
	`format` varchar(64) NOT NULL,
	`published` int NOT NULL,
	`coverColor` varchar(16) NOT NULL,
	`coverAccent` varchar(16) NOT NULL,
	`coverLabel` varchar(64) NOT NULL,
	`tags` text NOT NULL,
	`featured` int NOT NULL DEFAULT 0,
	`badge` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `books_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cartItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` varchar(128) NOT NULL,
	`bookId` varchar(64) NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cartItems_id` PRIMARY KEY(`id`),
	CONSTRAINT `cart_session_book_unique` UNIQUE(`sessionId`,`bookId`)
);
--> statement-breakpoint
CREATE TABLE `orderItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`bookId` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`priceCents` int NOT NULL,
	`quantity` int NOT NULL,
	CONSTRAINT `orderItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` varchar(128) NOT NULL,
	`firstName` varchar(120) NOT NULL,
	`lastName` varchar(120) NOT NULL,
	`email` varchar(320) NOT NULL,
	`address` varchar(255) NOT NULL,
	`city` varchar(120) NOT NULL,
	`postcode` varchar(32) NOT NULL,
	`status` enum('pending','paid','fulfilled','cancelled') NOT NULL DEFAULT 'pending',
	`subtotalCents` int NOT NULL,
	`shippingCents` int NOT NULL,
	`totalCents` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wishlistItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` varchar(128) NOT NULL,
	`bookId` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wishlistItems_id` PRIMARY KEY(`id`),
	CONSTRAINT `wishlist_session_book_unique` UNIQUE(`sessionId`,`bookId`)
);
--> statement-breakpoint
ALTER TABLE `cartItems` ADD CONSTRAINT `cartItems_bookId_books_id_fk` FOREIGN KEY (`bookId`) REFERENCES `books`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orderItems` ADD CONSTRAINT `orderItems_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wishlistItems` ADD CONSTRAINT `wishlistItems_bookId_books_id_fk` FOREIGN KEY (`bookId`) REFERENCES `books`(`id`) ON DELETE cascade ON UPDATE no action;