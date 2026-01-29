-- Auth Schema for SQLite
-- This is the SQLite-compatible version of auth_tables.sql

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL
);

-- Groups table
CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    meta TEXT,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    created_by TEXT NOT NULL
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    name TEXT PRIMARY KEY NOT NULL,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    created_by TEXT NOT NULL
);

-- Groups in projects (many-to-many relationship)
CREATE TABLE IF NOT EXISTS groups_in_projects (
    project_name TEXT NOT NULL,
    group_name TEXT NOT NULL,
    auth_level INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    created_by TEXT NOT NULL,
    PRIMARY KEY (project_name, group_name),
    FOREIGN KEY (project_name) REFERENCES projects(name) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (group_name) REFERENCES groups(name) ON UPDATE CASCADE ON DELETE CASCADE
);

-- Users in groups (many-to-many relationship)
CREATE TABLE IF NOT EXISTS users_in_groups (
    user_email TEXT NOT NULL,
    group_name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    created_by TEXT NOT NULL,
    PRIMARY KEY (user_email, group_name),
    FOREIGN KEY (user_email) REFERENCES users(email) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (group_name) REFERENCES groups(name) ON UPDATE CASCADE ON DELETE CASCADE
);

-- Logins table (audit log)
CREATE TABLE IF NOT EXISTS logins (
    user_email TEXT NOT NULL,
    project_name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    FOREIGN KEY (user_email) REFERENCES users(email),
    FOREIGN KEY (project_name) REFERENCES projects(name)
);

-- Signup requests table
CREATE TABLE IF NOT EXISTS signup_requests (
    user_email TEXT NOT NULL,
    project_name TEXT NOT NULL,
    state TEXT DEFAULT 'pending' NOT NULL,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    resolved_at TEXT,
    resolved_by TEXT,
    PRIMARY KEY (user_email, project_name),
    FOREIGN KEY (project_name) REFERENCES projects(name) ON UPDATE CASCADE ON DELETE CASCADE
);

-- User preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
    user_email TEXT NOT NULL,
    project_name TEXT,
    preferences TEXT,
    FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE,
    FOREIGN KEY (project_name) REFERENCES projects(name)
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT NOT NULL,
    heading TEXT NOT NULL,
    user_email TEXT NOT NULL,
    viewed INTEGER DEFAULT 0 NOT NULL,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    created_by TEXT NOT NULL,
    FOREIGN KEY (user_email) REFERENCES users(email),
    FOREIGN KEY (created_by) REFERENCES users(email)
);

-- Messages new table (updated messaging system)
CREATE TABLE IF NOT EXISTS messages_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    heading TEXT NOT NULL,
    message TEXT NOT NULL,
    sent_by TEXT NOT NULL,
    sent_to TEXT NOT NULL,
    sent_at TEXT DEFAULT (datetime('now')) NOT NULL,
    project_name TEXT,
    viewed INTEGER DEFAULT 0 NOT NULL,
    deleted INTEGER DEFAULT 0 NOT NULL,
    FOREIGN KEY (sent_by) REFERENCES users(email),
    FOREIGN KEY (sent_to) REFERENCES users(email),
    FOREIGN KEY (project_name) REFERENCES projects(name)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_groups_name ON groups(name);
CREATE INDEX IF NOT EXISTS idx_users_in_groups_user ON users_in_groups(user_email);
CREATE INDEX IF NOT EXISTS idx_users_in_groups_group ON users_in_groups(group_name);
CREATE INDEX IF NOT EXISTS idx_groups_in_projects_project ON groups_in_projects(project_name);
CREATE INDEX IF NOT EXISTS idx_groups_in_projects_group ON groups_in_projects(group_name);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_email);
CREATE INDEX IF NOT EXISTS idx_messages_new_sent_to ON messages_new(sent_to);

-- Insert default data
INSERT OR IGNORE INTO projects (name, created_at, created_by) VALUES ('avail_auth', datetime('now'), 'admin@availabs.org');
INSERT OR IGNORE INTO groups (name, created_at, created_by) VALUES ('AVAIL', datetime('now'), 'admin@availabs.org');
INSERT OR IGNORE INTO users (email, password, created_at) VALUES ('admin@availabs.org', '$2a$10$b1fJhYT.RiXWdL.rkEpMmuktmZJBRDdZ6rsSX2Euq.XUvw9ka00Um', datetime('now'));
INSERT OR IGNORE INTO users_in_groups (user_email, group_name, created_at, created_by) VALUES ('admin@availabs.org', 'AVAIL', datetime('now'), 'admin@availabs.org');
INSERT OR IGNORE INTO groups_in_projects (project_name, group_name, auth_level, created_at, created_by) VALUES ('avail_auth', 'AVAIL', 10, datetime('now'), 'admin@availabs.org');
