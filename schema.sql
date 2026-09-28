-- Bug Tracker Board - MySQL schema (final state)
-- The app also applies this automatically on startup (db/migrate.js),
-- so importing it by hand is optional. It is safe to run more than once.

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NULL,
  google_id VARCHAR(64) NULL UNIQUE,
  role ENUM('QA','Dev') NOT NULL,
  platform ENUM('Android','iOS','Web') NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS counters (
  platform ENUM('Android','iOS','Web') PRIMARY KEY,
  last_number INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tickets (
  id VARCHAR(36) PRIMARY KEY,
  ticket_number VARCHAR(20) NULL UNIQUE,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  platform ENUM('Android','iOS','Web') NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'On Filing',
  priority VARCHAR(20) NOT NULL DEFAULT 'Medium',
  severity VARCHAR(20) NOT NULL DEFAULT 'Minor',
  assignee_id VARCHAR(36) NULL,
  filed_by_id VARCHAR(36) NOT NULL,
  filed_by_name VARCHAR(255),
  share_token VARCHAR(36) NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  fixed_at DATETIME NULL,
  closed_at DATETIME NULL,
  FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (filed_by_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_platform_status (platform, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attachments (
  id VARCHAR(36) PRIMARY KEY,
  ticket_id VARCHAR(36) NOT NULL,
  type ENUM('link','image','video') NOT NULL,
  url VARCHAR(1000) NOT NULL,
  name VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  INDEX idx_ticket (ticket_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
