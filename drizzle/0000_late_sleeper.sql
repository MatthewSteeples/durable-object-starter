CREATE TABLE `subscription_records` (
	`endpoint` text PRIMARY KEY NOT NULL,
	`keys_p256dh` text NOT NULL,
	`keys_auth` text NOT NULL
);
