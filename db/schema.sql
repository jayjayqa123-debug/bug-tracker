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
-- users first: tickets reference it
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password VARCHAR(255) DEFAULT NULL,
  google_id VARCHAR(64) DEFAULT NULL,
  role ENUM('QA','Dev') NOT NULL,
  platform ENUM('Android','iOS','Web') DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY email (email),
  UNIQUE KEY google_id (google_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS projects (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL,
  type ENUM('project','product') DEFAULT 'project',
  status ENUM('active','suspended','closed') DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by INT DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS tickets (
  id VARCHAR(36) NOT NULL,
  ticket_number VARCHAR(20) DEFAULT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT DEFAULT NULL,
  platform ENUM('Android','iOS','Web') NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'On Filing',
  priority VARCHAR(20) NOT NULL DEFAULT 'Medium',
  severity VARCHAR(20) NOT NULL DEFAULT 'Minor',
  assignee_id VARCHAR(36) DEFAULT NULL,
  filed_by_id VARCHAR(36) NOT NULL,
  filed_by_name VARCHAR(255) DEFAULT NULL,
  share_token VARCHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  fixed_at DATETIME DEFAULT NULL,
  closed_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY share_token (share_token),
  UNIQUE KEY ticket_number (ticket_number),
  KEY assignee_id (assignee_id),
  KEY filed_by_id (filed_by_id),
  KEY idx_platform_status (platform, status),
  CONSTRAINT tickets_ibfk_1 FOREIGN KEY (assignee_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT tickets_ibfk_2 FOREIGN KEY (filed_by_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS attachments (
  id VARCHAR(36) NOT NULL,
  ticket_id VARCHAR(36) NOT NULL,
  type ENUM('link','image','video') NOT NULL,
  url VARCHAR(1000) NOT NULL,
  name VARCHAR(255) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ticket (ticket_id),
  CONSTRAINT attachments_ibfk_1 FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS counters (
  platform ENUM('Android','iOS','Web') NOT NULL,
  last_number INT NOT NULL DEFAULT 0,
  PRIMARY KEY (platform)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- INSERT IGNORE means re-runs never duplicate or reset the counters
INSERT IGNORE INTO counters (platform, last_number) VALUES
('Android', 0),
('iOS', 0),
('Web', 0);

-- legacy bug tables: bugs must come before bug_attachments and bug_history
CREATE TABLE IF NOT EXISTS bugs (
  id INT NOT NULL AUTO_INCREMENT,
  project_id INT NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT DEFAULT NULL,
  steps TEXT DEFAULT NULL,
  expected_result TEXT DEFAULT NULL,
  actual_result TEXT DEFAULT NULL,
  severity ENUM('1','2','3','4') DEFAULT '3',
  priority ENUM('1','2','3','4') DEFAULT '3',
  type ENUM('codeerror','config_var','add_feature','ui','install') DEFAULT 'codeerror',
  status ENUM('0','1','2','3','4','5','6') DEFAULT '1',
  opened_by INT NOT NULL,
  assigned_to INT DEFAULT NULL,
  resolved_by INT DEFAULT NULL,
  closed_by INT DEFAULT NULL,
  opened_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_date TIMESTAMP NULL DEFAULT NULL,
  closed_date TIMESTAMP NULL DEFAULT NULL,
  last_edited_by INT DEFAULT NULL,
  last_edited_date TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY project_id (project_id),
  KEY idx_status (status),
  KEY idx_priority (priority),
  KEY idx_severity (severity),
  CONSTRAINT bugs_ibfk_1 FOREIGN KEY (project_id) REFERENCES projects (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS bug_attachments (
  id INT NOT NULL AUTO_INCREMENT,
  bug_id INT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size INT DEFAULT NULL,
  uploaded_by INT DEFAULT NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY bug_id (bug_id),
  CONSTRAINT bug_attachments_ibfk_1 FOREIGN KEY (bug_id) REFERENCES bugs (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS bug_history (
  id INT NOT NULL AUTO_INCREMENT,
  bug_id INT NOT NULL,
  action ENUM('opened','resolved','closed','activated','assigned','commented') DEFAULT NULL,
  comment TEXT DEFAULT NULL,
  assigned_to INT DEFAULT NULL,
  resolved_by INT DEFAULT NULL,
  created_by INT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY bug_id (bug_id),
  CONSTRAINT bug_history_ibfk_1 FOREIGN KEY (bug_id) REFERENCES bugs (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- seed users: INSERT IGNORE skips rows that already exist, so re-runs are safe
INSERT IGNORE INTO users (id, name, email, password, google_id, role, platform, created_at) VALUES
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