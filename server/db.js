import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';

const dataPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'team-task-tracker.db');

fs.mkdirSync(path.dirname(dataPath), { recursive: true });

const database = new Database(dataPath);
database.pragma('foreign_keys = ON');
database.pragma('journal_mode = WAL');

function now() {
  return new Date().toISOString();
}

function createTables() {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS project_members (
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('Admin', 'Member')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (project_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK(status IN ('Todo', 'In Progress', 'Done')) DEFAULT 'Todo',
      priority TEXT NOT NULL CHECK(priority IN ('Low', 'Medium', 'High')) DEFAULT 'Medium',
      due_date TEXT,
      assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_by_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function publicUser(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: row.created_at,
  };
}

function publicProject(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    createdAt: row.created_at,
    role: row.role,
    taskCount: row.task_count,
    todoCount: row.todo_count,
    inProgressCount: row.in_progress_count,
    doneCount: row.done_count,
    overdueCount: row.overdue_count,
  };
}

function publicTask(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date,
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name,
    assigneeEmail: row.assignee_email,
    createdById: row.created_by_id,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function initDatabase() {
  createTables();
  seedDemoData();
}

export function findUserByEmail(email) {
  return database
    .prepare('SELECT * FROM users WHERE lower(email) = lower(?)')
    .get(email.trim());
}

export function findUserById(id) {
  return database.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function createUser({ name, email, passwordHash }) {
  const statement = database.prepare(`
    INSERT INTO users (name, email, password_hash, created_at)
    VALUES (?, ?, ?, ?)
  `);
  const result = statement.run(name.trim(), email.trim().toLowerCase(), passwordHash, now());
  return findUserById(result.lastInsertRowid);
}

export function createProject({ ownerId, name, description }) {
  const result = database
    .prepare(`
      INSERT INTO projects (name, description, owner_id, created_at)
      VALUES (?, ?, ?, ?)
    `)
    .run(name.trim(), description.trim(), ownerId, now());

  const projectId = Number(result.lastInsertRowid);
  addProjectMember({ projectId, userId: ownerId, role: 'Admin' });
  return getProjectForUser({ projectId, userId: ownerId });
}

export function addProjectMember({ projectId, userId, role }) {
  database
    .prepare(`
      INSERT OR REPLACE INTO project_members (project_id, user_id, role, created_at)
      VALUES (?, ?, ?, ?)
    `)
    .run(projectId, userId, role, now());
}

export function getProjectMember({ projectId, userId }) {
  return database
    .prepare('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?')
    .get(projectId, userId);
}

export function listProjectsForUser(userId) {
  return database
    .prepare(
      `
        SELECT
          p.*,
          pm.role AS role,
          owner.name AS owner_name,
          (
            SELECT COUNT(*)
            FROM tasks t
            WHERE t.project_id = p.id
          ) AS task_count,
          (
            SELECT COUNT(*)
            FROM tasks t
            WHERE t.project_id = p.id AND t.status = 'Todo'
          ) AS todo_count,
          (
            SELECT COUNT(*)
            FROM tasks t
            WHERE t.project_id = p.id AND t.status = 'In Progress'
          ) AS in_progress_count,
          (
            SELECT COUNT(*)
            FROM tasks t
            WHERE t.project_id = p.id AND t.status = 'Done'
          ) AS done_count,
          (
            SELECT COUNT(*)
            FROM tasks t
            WHERE t.project_id = p.id
              AND t.status != 'Done'
              AND t.due_date IS NOT NULL
              AND date(t.due_date) < date('now')
          ) AS overdue_count
        FROM projects p
        INNER JOIN project_members pm ON pm.project_id = p.id
        INNER JOIN users owner ON owner.id = p.owner_id
        WHERE pm.user_id = ?
        ORDER BY datetime(p.created_at) DESC, p.id DESC
      `
    )
    .all(userId)
    .map(publicProject);
}

export function getProjectForUser({ projectId, userId }) {
  const row = database
    .prepare(
      `
        SELECT
          p.*,
          pm.role AS role,
          owner.name AS owner_name,
          (
            SELECT COUNT(*)
            FROM tasks t
            WHERE t.project_id = p.id
          ) AS task_count,
          (
            SELECT COUNT(*)
            FROM tasks t
            WHERE t.project_id = p.id AND t.status = 'Todo'
          ) AS todo_count,
          (
            SELECT COUNT(*)
            FROM tasks t
            WHERE t.project_id = p.id AND t.status = 'In Progress'
          ) AS in_progress_count,
          (
            SELECT COUNT(*)
            FROM tasks t
            WHERE t.project_id = p.id AND t.status = 'Done'
          ) AS done_count,
          (
            SELECT COUNT(*)
            FROM tasks t
            WHERE t.project_id = p.id
              AND t.status != 'Done'
              AND t.due_date IS NOT NULL
              AND date(t.due_date) < date('now')
          ) AS overdue_count
        FROM projects p
        INNER JOIN project_members pm ON pm.project_id = p.id
        INNER JOIN users owner ON owner.id = p.owner_id
        WHERE p.id = ? AND pm.user_id = ?
      `
    )
    .get(projectId, userId);

  return publicProject(row);
}

export function getProjectById(projectId) {
  return database.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
}

export function listProjectMembers(projectId) {
  return database
    .prepare(
      `
        SELECT
          u.id,
          u.name,
          u.email,
          pm.role,
          pm.created_at
        FROM project_members pm
        INNER JOIN users u ON u.id = pm.user_id
        WHERE pm.project_id = ?
        ORDER BY CASE pm.role WHEN 'Admin' THEN 0 ELSE 1 END, u.name COLLATE NOCASE
      `
    )
    .all(projectId)
    .map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      createdAt: row.created_at,
    }));
}

export function listAssignableMembers(projectId) {
  return database
    .prepare(
      `
        SELECT
          u.id,
          u.name,
          u.email,
          pm.role
        FROM project_members pm
        INNER JOIN users u ON u.id = pm.user_id
        WHERE pm.project_id = ?
        ORDER BY u.name COLLATE NOCASE
      `
    )
    .all(projectId);
}

export function listProjectTasks(projectId) {
  return database
    .prepare(
      `
        SELECT
          t.*,
          creator.name AS created_by_name,
          assignee.name AS assignee_name,
          assignee.email AS assignee_email
        FROM tasks t
        INNER JOIN users creator ON creator.id = t.created_by_id
        LEFT JOIN users assignee ON assignee.id = t.assignee_id
        WHERE t.project_id = ?
        ORDER BY
          CASE t.status WHEN 'Todo' THEN 0 WHEN 'In Progress' THEN 1 ELSE 2 END,
          CASE t.priority WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END,
          COALESCE(date(t.due_date), '9999-12-31') ASC,
          datetime(t.updated_at) DESC
      `
    )
    .all(projectId)
    .map(publicTask);
}

export function getTaskById(taskId) {
  return database
    .prepare(
      `
        SELECT
          t.*,
          creator.name AS created_by_name,
          assignee.name AS assignee_name,
          assignee.email AS assignee_email
        FROM tasks t
        INNER JOIN users creator ON creator.id = t.created_by_id
        LEFT JOIN users assignee ON assignee.id = t.assignee_id
        WHERE t.id = ?
      `
    )
    .get(taskId);
}

export function createTask({ projectId, title, description, status, priority, dueDate, assigneeId, createdById }) {
  const result = database
    .prepare(
      `
        INSERT INTO tasks (
          project_id,
          title,
          description,
          status,
          priority,
          due_date,
          assignee_id,
          created_by_id,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      projectId,
      title.trim(),
      description.trim(),
      status,
      priority,
      dueDate || null,
      assigneeId || null,
      createdById,
      now(),
      now()
    );

  return publicTask(getTaskById(result.lastInsertRowid));
}

export function updateTask(taskId, patch) {
  const currentTask = getTaskById(taskId);
  if (!currentTask) {
    return null;
  }

  const nextTask = {
    title: patch.title ?? currentTask.title,
    description: patch.description ?? currentTask.description,
    status: patch.status ?? currentTask.status,
    priority: patch.priority ?? currentTask.priority,
    dueDate: Object.prototype.hasOwnProperty.call(patch, 'dueDate') ? patch.dueDate : currentTask.due_date,
    assigneeId: Object.prototype.hasOwnProperty.call(patch, 'assigneeId') ? patch.assigneeId : currentTask.assignee_id,
  };

  database
    .prepare(
      `
        UPDATE tasks
        SET title = ?, description = ?, status = ?, priority = ?, due_date = ?, assignee_id = ?, updated_at = ?
        WHERE id = ?
      `
    )
    .run(
      nextTask.title.trim(),
      nextTask.description.trim(),
      nextTask.status,
      nextTask.priority,
      nextTask.dueDate || null,
      nextTask.assigneeId || null,
      now(),
      taskId
    );

  return publicTask(getTaskById(taskId));
}

export function getDashboard(userId) {
  const projects = listProjectsForUser(userId);
  const stats = database
    .prepare(
      `
        SELECT
          COUNT(*) AS task_count,
          SUM(CASE WHEN t.status = 'Todo' THEN 1 ELSE 0 END) AS todo_count,
          SUM(CASE WHEN t.status = 'In Progress' THEN 1 ELSE 0 END) AS in_progress_count,
          SUM(CASE WHEN t.status = 'Done' THEN 1 ELSE 0 END) AS done_count,
          SUM(CASE WHEN t.status != 'Done' AND t.due_date IS NOT NULL AND date(t.due_date) < date('now') THEN 1 ELSE 0 END) AS overdue_count,
          SUM(CASE WHEN t.assignee_id = ? THEN 1 ELSE 0 END) AS assigned_to_me_count
        FROM tasks t
        INNER JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = ?
      `
    )
    .get(userId, userId);

  const recentTasks = database
    .prepare(
      `
        SELECT
          t.*,
          p.name AS project_name,
          creator.name AS created_by_name,
          assignee.name AS assignee_name,
          assignee.email AS assignee_email
        FROM tasks t
        INNER JOIN projects p ON p.id = t.project_id
        INNER JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
        INNER JOIN users creator ON creator.id = t.created_by_id
        LEFT JOIN users assignee ON assignee.id = t.assignee_id
        ORDER BY datetime(t.updated_at) DESC
        LIMIT 6
      `
    )
    .all(userId)
    .map(publicTask);

  return {
    projects,
    stats: {
      projectCount: projects.length,
      taskCount: Number(stats.task_count || 0),
      todoCount: Number(stats.todo_count || 0),
      inProgressCount: Number(stats.in_progress_count || 0),
      doneCount: Number(stats.done_count || 0),
      overdueCount: Number(stats.overdue_count || 0),
      assignedToMeCount: Number(stats.assigned_to_me_count || 0),
    },
    recentTasks,
  };
}

function seedDemoData() {
  const existingUsers = database.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (existingUsers > 0) {
    return;
  }

  const adminPassword = bcrypt.hashSync('Demo123!', 10);
  const memberPassword = bcrypt.hashSync('Demo123!', 10);

  const admin = createUser({
    name: 'Demo Admin',
    email: 'admin@teamtask.local',
    passwordHash: adminPassword,
  });

  const member = createUser({
    name: 'Demo Member',
    email: 'member@teamtask.local',
    passwordHash: memberPassword,
  });

  const project = createProject({
    ownerId: admin.id,
    name: 'Website Refresh',
    description: 'Launch tasks, polish content, and coordinate the final release.',
  });

  addProjectMember({ projectId: project.id, userId: member.id, role: 'Member' });

  createTask({
    projectId: project.id,
    title: 'Draft homepage copy',
    description: 'Write concise launch messaging for the hero section.',
    status: 'In Progress',
    priority: 'High',
    dueDate: '2026-05-14',
    assigneeId: member.id,
    createdById: admin.id,
  });

  createTask({
    projectId: project.id,
    title: 'Approve design tokens',
    description: 'Check spacing, color, and button styles before handoff.',
    status: 'Todo',
    priority: 'Medium',
    dueDate: '2026-05-20',
    assigneeId: admin.id,
    createdById: admin.id,
  });

  createTask({
    projectId: project.id,
    title: 'Prepare launch checklist',
    description: 'Collect deployment notes and post-release checks.',
    status: 'Done',
    priority: 'Low',
    dueDate: '2026-05-10',
    assigneeId: admin.id,
    createdById: admin.id,
  });
}
