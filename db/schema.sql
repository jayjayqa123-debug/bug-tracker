-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Sep 28, 2026 at 05:35 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `bugtracker`
--

-- --------------------------------------------------------

--
-- Table structure for table `attachments`
--

CREATE TABLE `attachments` (
  `id` varchar(36) NOT NULL,
  `ticket_id` varchar(36) NOT NULL,
  `type` enum('link','image','video') NOT NULL,
  `url` varchar(1000) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `bugs`
--

CREATE TABLE `bugs` (
  `id` int(11) NOT NULL,
  `project_id` int(11) NOT NULL,
  `title` varchar(500) NOT NULL,
  `description` text DEFAULT NULL,
  `steps` text DEFAULT NULL,
  `expected_result` text DEFAULT NULL,
  `actual_result` text DEFAULT NULL,
  `severity` enum('1','2','3','4') DEFAULT '3',
  `priority` enum('1','2','3','4') DEFAULT '3',
  `type` enum('codeerror','config_var','add_feature','ui','install') DEFAULT 'codeerror',
  `status` enum('0','1','2','3','4','5','6') DEFAULT '1',
  `opened_by` int(11) NOT NULL,
  `assigned_to` int(11) DEFAULT NULL,
  `resolved_by` int(11) DEFAULT NULL,
  `closed_by` int(11) DEFAULT NULL,
  `opened_date` timestamp NOT NULL DEFAULT current_timestamp(),
  `resolved_date` timestamp NULL DEFAULT NULL,
  `closed_date` timestamp NULL DEFAULT NULL,
  `last_edited_by` int(11) DEFAULT NULL,
  `last_edited_date` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `bug_attachments`
--

CREATE TABLE `bug_attachments` (
  `id` int(11) NOT NULL,
  `bug_id` int(11) NOT NULL,
  `file_name` varchar(255) NOT NULL,
  `file_path` varchar(500) NOT NULL,
  `file_size` int(11) DEFAULT NULL,
  `uploaded_by` int(11) DEFAULT NULL,
  `uploaded_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `bug_history`
--

CREATE TABLE `bug_history` (
  `id` int(11) NOT NULL,
  `bug_id` int(11) NOT NULL,
  `action` enum('opened','resolved','closed','activated','assigned','commented') DEFAULT NULL,
  `comment` text DEFAULT NULL,
  `assigned_to` int(11) DEFAULT NULL,
  `resolved_by` int(11) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `counters`
--

CREATE TABLE `counters` (
  `platform` enum('Android','iOS','Web') NOT NULL,
  `last_number` int(11) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `counters`
--

INSERT INTO `counters` (`platform`, `last_number`) VALUES
('Android', 1),
('iOS', 0),
('Web', 0);

-- --------------------------------------------------------

--
-- Table structure for table `projects`
--

CREATE TABLE `projects` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `code` varchar(50) NOT NULL,
  `type` enum('project','product') DEFAULT 'project',
  `status` enum('active','suspended','closed') DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `created_by` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tickets`
--

CREATE TABLE `tickets` (
  `id` varchar(36) NOT NULL,
  `ticket_number` varchar(20) DEFAULT NULL,
  `title` varchar(500) NOT NULL,
  `description` text DEFAULT NULL,
  `platform` enum('Android','iOS','Web') NOT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'On Filing',
  `priority` varchar(20) NOT NULL DEFAULT 'Medium',
  `severity` varchar(20) NOT NULL DEFAULT 'Minor',
  `assignee_id` varchar(36) DEFAULT NULL,
  `filed_by_id` varchar(36) NOT NULL,
  `filed_by_name` varchar(255) DEFAULT NULL,
  `share_token` varchar(36) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `fixed_at` datetime DEFAULT NULL,
  `closed_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` varchar(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) DEFAULT NULL,
  `google_id` varchar(64) DEFAULT NULL,
  `role` enum('QA','Dev') NOT NULL,
  `platform` enum('Android','iOS','Web') DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `name`, `email`, `password`, `google_id`, `role`, `platform`, `created_at`) VALUES
('1083451f-3c11-4c87-b933-84f3ed9257fb', 'Android Kulas', 'kulas123@gmail.com', '$2a$10$L3XrCrry5.a2gJLTzw9ZjeK7gHyvuhfinjVC5Xh8uOn1yTjpmotrS', NULL, 'Dev', 'Android', '2026-09-28 23:25:20'),
('14918216-e96f-4eca-a34c-8ea0d1914ff3', 'QA Kira', 'qakira123@gmail.com', '$2a$10$pUnkjDGY5.8NhAVDBCfNauVJ/xdLSb555wqxxozkM33x9/Na.PptK', NULL, 'QA', NULL, '2026-09-28 23:03:00'),
('24d759ed-ae9f-4ecc-b0f6-905b8d6accad', 'QA Jay', 'jayjayqa123@gmail.com', '$2a$10$ToE5oGLNcBV9LL2dFSxzg.POPxTz/6LoUhYQUENFVIoo3rUnwGiRO', NULL, 'QA', NULL, '2026-09-28 19:56:45'),
('34eb3e1d-c119-438c-915a-447880d37d08', 'QA Shanks', 'qashanks123@gmail.com', '$2a$10$h4h8hzrPaYc8D7ziyBXcQ.71wAFcmJyLB6rS9UACzS9yifuxrQktC', NULL, 'QA', NULL, '2026-09-28 23:11:04'),
('363aabf4-3694-40fd-a8f3-6f8a263062c5', 'QA Broze', 'qabroze123@gmail.com', '$2a$10$S0N8/zUwPzbwcT.wjRPoK.H9O1sG9Bik3LcuJ/sLTKlTwltSTw4Ny', NULL, 'QA', NULL, '2026-09-28 23:08:19'),
('45d46310-ea19-448f-a6f5-1c91786ef916', 'Web Skai', 'skai123456@gmail.com', '$2a$10$jY.fLciVHaN75TkeUWmGPOfPjwTjtE8ceCjmzlM3vMDbfrZI5zjEy', NULL, 'Dev', 'Web', '2026-09-28 23:32:25'),
('730abf4b-8316-41c6-8cd4-13ffb9ce1756', 'Android Kulas', 'kirito123456@gmail.com', '$2a$10$2csvhmhz1SWZ4xQvdTGNfuqaChr31is8bJ5sK4GHOTEsibv4vQ1ji', NULL, 'Dev', 'Android', '2026-09-28 23:26:20'),
('857ce02d-029c-4254-bdd8-985f369d4668', 'QA Kovenant', 'qakovenant123@gmail.com', '$2a$10$TvKX7B.Hra44uaU.P7O8tusoWx/vXZL0fGFtTaCbBjaC.iL3Zsxj6', NULL, 'QA', NULL, '2026-09-28 23:10:18'),
('8f2b72e0-2134-480a-8a8e-3327286c4dab', 'IOS Doki', 'doki123456@gmail.com', '$2a$10$AglUAkrCQTmn3jOppvXVmejKgamc7C5h.Zl5UH0b.ZFf9eGyiD7rO', NULL, 'Dev', 'iOS', '2026-09-28 23:29:24'),
('940c0d4f-22de-4642-90bd-bfce75d18321', 'QA Mikasa', 'qamikasa123@gmail.com', '$2a$10$a2/PknKqJSdDMymMuIduQuZKXs9QcYMHFoop9t5nEVvMEo7yRVDWC', NULL, 'QA', NULL, '2026-09-28 23:12:00'),
('b6a905dc-d649-47ba-9438-234cff0fb0af', 'Android Kenzo', 'kenzo123@gmail.com', '$2a$10$3//3.gv2OKHiIu4U4Cp8N.JNwbFZxoScN1aLM7B2O.ZfzPhC0JPS2', NULL, 'Dev', 'Android', '2026-09-28 23:21:30'),
('cd90287f-3f3f-4920-ae63-109aca29d230', 'Jayjay (qa - android)', 'jayjayqa1234@gmail.com', '$2a$10$HWs6B22iWxzSq7ESOv1Yj.UkrU1HpOgVoq39pKOXeKXM.yyJJX56S', NULL, 'Dev', 'Android', '2026-09-28 20:24:17'),
('d71a3db9-f1b7-4e88-a751-273c6e708762', 'QA Nine', 'qanine123@gmail.com', '$2a$10$W50ApB//eZ5nuN9l8oL7vufv3IguDQTR9Nfcyix8zqn4szj4uzy1G', NULL, 'QA', NULL, '2026-09-28 23:12:44'),
('e00d4b00-36b2-4d68-b4f6-9dd7ed74f053', 'QA Jay', 'jayjayqa01@gmail.com', '$2a$10$EzuD6QYg73mwSdUmetnlbeD279klvHOab0T7xBCo45YyD3XU8xn.6', NULL, 'QA', NULL, '2026-09-28 21:58:08'),
('e775adbb-4b34-48c0-9944-a79ae6378eb8', 'QA Lee', 'qalee123@gmail.com', '$2a$10$1nVxVbpn5jgnaCFzMmuaCOW/clphPwv3dR2X/eG4K8UR96MVRWFBa', NULL, 'QA', NULL, '2026-09-28 23:01:36');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `attachments`
--
ALTER TABLE `attachments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_ticket` (`ticket_id`);

--
-- Indexes for table `bugs`
--
ALTER TABLE `bugs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `project_id` (`project_id`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_priority` (`priority`),
  ADD KEY `idx_severity` (`severity`);

--
-- Indexes for table `bug_attachments`
--
ALTER TABLE `bug_attachments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `bug_id` (`bug_id`);

--
-- Indexes for table `bug_history`
--
ALTER TABLE `bug_history`
  ADD PRIMARY KEY (`id`),
  ADD KEY `bug_id` (`bug_id`);

--
-- Indexes for table `counters`
--
ALTER TABLE `counters`
  ADD PRIMARY KEY (`platform`);

--
-- Indexes for table `projects`
--
ALTER TABLE `projects`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `code` (`code`);

--
-- Indexes for table `tickets`
--
ALTER TABLE `tickets`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `share_token` (`share_token`),
  ADD UNIQUE KEY `ticket_number` (`ticket_number`),
  ADD KEY `assignee_id` (`assignee_id`),
  ADD KEY `filed_by_id` (`filed_by_id`),
  ADD KEY `idx_platform_status` (`platform`,`status`),
  ADD KEY `idx_share_token` (`share_token`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD UNIQUE KEY `google_id` (`google_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `bugs`
--
ALTER TABLE `bugs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `bug_attachments`
--
ALTER TABLE `bug_attachments`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `bug_history`
--
ALTER TABLE `bug_history`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `projects`
--
ALTER TABLE `projects`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `attachments`
--
ALTER TABLE `attachments`
  ADD CONSTRAINT `attachments_ibfk_1` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `bugs`
--
ALTER TABLE `bugs`
  ADD CONSTRAINT `bugs_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`);

--
-- Constraints for table `bug_attachments`
--
ALTER TABLE `bug_attachments`
  ADD CONSTRAINT `bug_attachments_ibfk_1` FOREIGN KEY (`bug_id`) REFERENCES `bugs` (`id`);

--
-- Constraints for table `bug_history`
--
ALTER TABLE `bug_history`
  ADD CONSTRAINT `bug_history_ibfk_1` FOREIGN KEY (`bug_id`) REFERENCES `bugs` (`id`);

--
-- Constraints for table `tickets`
--
ALTER TABLE `tickets`
  ADD CONSTRAINT `tickets_ibfk_1` FOREIGN KEY (`assignee_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `tickets_ibfk_2` FOREIGN KEY (`filed_by_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
