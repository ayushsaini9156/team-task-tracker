import express from 'express';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { authenticate, signToken } from './auth.js';
import {
  addProjectMember,
  createProject,
  createTask,
  createUser,
  findUserByEmail,
  findUserById,
  getDashboard,
  getProjectById,
  getProjectForUser,
  getProjectMember,
  getTaskById,
  initDatabase,
  listAssignableMembers,
  listProjectMembers,
  listProjectTasks,
  listProjectsForUser,
  updateTask,
} from './db.js';

initDatabase();

const app = express();
const port = Number(process.env.PORT || 3001);
const isProduction = process.env.NODE_ENV === 'production';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

app.use(express.json({ limit: '1mb' }));

const signupSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.'),
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

const projectSchema = z.object({
  name: z.string().trim().min(2, 'Project name must be at least 2 characters.'),
  description: z.string().trim().max(500).optional().default(''),
});

const memberSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  role: z.enum(['Admin', 'Member']).default('Member'),
});

const taskSchema = z.object({
  title: z.string().trim().min(2, 'Task title must be at least 2 characters.'),
  description: z.string().trim().max(1000).optional().default(''),
  status: z.enum(['Todo', 'In Progress', 'Done']).default('Todo'),
  priority: z.enum(['Low', 'Medium', 'High']).default('Medium'),
  dueDate: z.string().trim().nullable().optional(),
  assigneeId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
});

const taskPatchSchema = z.object({
  title: z.string().trim().min(2).optional(),
  description: z.string().trim().max(1000).optional(),
  status: z.enum(['Todo', 'In Progress', 'Done']).optional(),
  priority: z.enum(['Low', 'Medium', 'High']).optional(),
  dueDate: z.string().trim().nullable().optional(),
  assigneeId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
});

function requireProjectAccess(projectId, userId, res) {
  const project = getProjectForUser({ projectId, userId });
  if (!project) {
    res.status(404).json({ message: 'Project not found or access denied.' });
    return null;
  }

  return project;
}

function requireProjectAdmin(projectId, userId, res) {
  const project = requireProjectAccess(projectId, userId, res);
  if (!project) {
    return null;
  }

  if (project.role !== 'Admin') {
    res.status(403).json({ message: 'Only project admins can perform this action.' });
    return null;
  }

  return project;
}

function normalizeDate(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === '') {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/signup', (req, res) => {
  const result = signupSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ message: result.error.issues[0].message });
  }

  const { name, email, password } = result.data;

  if (findUserByEmail(email)) {
    return res.status(409).json({ message: 'A user with that email already exists.' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const user = createUser({ name, email, passwordHash });
  const token = signToken(user);

  return res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

app.post('/api/auth/login', (req, res) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ message: result.error.issues[0].message });
  }

  const { email, password } = result.data;
  const user = findUserByEmail(email);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  const token = signToken(user);
  return res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  const user = findUserById(req.user.id);
  return res.json({ user: { id: user.id, name: user.name, email: user.email, createdAt: user.created_at } });
});

app.get('/api/dashboard', authenticate, (req, res) => {
  return res.json(getDashboard(req.user.id));
});

app.get('/api/projects', authenticate, (req, res) => {
  return res.json({ projects: listProjectsForUser(req.user.id) });
});

app.post('/api/projects', authenticate, (req, res) => {
  const result = projectSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ message: result.error.issues[0].message });
  }

  const project = createProject({
    ownerId: req.user.id,
    name: result.data.name,
    description: result.data.description || '',
  });

  return res.status(201).json({ project, members: listProjectMembers(project.id) });
});

app.get('/api/projects/:projectId', authenticate, (req, res) => {
  const projectId = Number(req.params.projectId);
  const project = requireProjectAccess(projectId, req.user.id, res);
  if (!project) {
    return null;
  }

  return res.json({
    project,
    members: listProjectMembers(projectId),
    tasks: listProjectTasks(projectId),
    assignableMembers: listAssignableMembers(projectId),
    rawProject: getProjectById(projectId),
  });
});

app.post('/api/projects/:projectId/members', authenticate, (req, res) => {
  const projectId = Number(req.params.projectId);
  const project = requireProjectAdmin(projectId, req.user.id, res);
  if (!project) {
    return null;
  }

  const result = memberSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ message: result.error.issues[0].message });
  }

  const user = findUserByEmail(result.data.email);
  if (!user) {
    return res.status(404).json({ message: 'No user found with that email address.' });
  }

  addProjectMember({ projectId, userId: user.id, role: result.data.role });

  return res.status(201).json({
    project,
    members: listProjectMembers(projectId),
  });
});

app.get('/api/projects/:projectId/tasks', authenticate, (req, res) => {
  const projectId = Number(req.params.projectId);
  const project = requireProjectAccess(projectId, req.user.id, res);
  if (!project) {
    return null;
  }

  return res.json({ tasks: listProjectTasks(projectId) });
});

app.post('/api/projects/:projectId/tasks', authenticate, (req, res) => {
  const projectId = Number(req.params.projectId);
  const project = requireProjectAdmin(projectId, req.user.id, res);
  if (!project) {
    return null;
  }

  const result = taskSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ message: result.error.issues[0].message });
  }

  const dueDate = normalizeDate(result.data.dueDate ?? null);
  if (result.data.dueDate && !dueDate) {
    return res.status(400).json({ message: 'Enter a valid due date.' });
  }

  if (result.data.assigneeId) {
    const member = getProjectMember({ projectId, userId: result.data.assigneeId });
    if (!member) {
      return res.status(400).json({ message: 'Selected assignee is not part of this project.' });
    }
  }

  const task = createTask({
    projectId,
    title: result.data.title,
    description: result.data.description || '',
    status: result.data.status,
    priority: result.data.priority,
    dueDate,
    assigneeId: result.data.assigneeId ?? null,
    createdById: req.user.id,
  });

  return res.status(201).json({ task });
});

app.patch('/api/tasks/:taskId', authenticate, (req, res) => {
  const taskId = Number(req.params.taskId);
  const task = getTaskById(taskId);

  if (!task) {
    return res.status(404).json({ message: 'Task not found.' });
  }

  const project = requireProjectAccess(task.project_id, req.user.id, res);
  if (!project) {
    return null;
  }

  const result = taskPatchSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ message: result.error.issues[0].message });
  }

  if (project.role !== 'Admin') {
    const isAssignee = task.assignee_id === req.user.id;
    const patchKeys = Object.keys(result.data);
    const statusOnly = patchKeys.length === 1 && patchKeys[0] === 'status';

    if (!isAssignee || !statusOnly) {
      return res.status(403).json({ message: 'Members can only update the status of tasks assigned to them.' });
    }
  }

  if (Object.prototype.hasOwnProperty.call(result.data, 'dueDate')) {
    const normalized = normalizeDate(result.data.dueDate ?? null);
    if (result.data.dueDate && !normalized) {
      return res.status(400).json({ message: 'Enter a valid due date.' });
    }
    result.data.dueDate = normalized;
  }

  if (Object.prototype.hasOwnProperty.call(result.data, 'assigneeId') && result.data.assigneeId) {
    const member = getProjectMember({ projectId: task.project_id, userId: result.data.assigneeId });
    if (!member) {
      return res.status(400).json({ message: 'Selected assignee is not part of this project.' });
    }
  }

  const updatedTask = updateTask(taskId, result.data);
  return res.json({ task: updatedTask });
});

if (isProduction) {
  const distPath = path.join(projectRoot, 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }

    return res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ message: 'API route not found.' });
  }

  return res.status(404).send('Not found');
});

app.listen(port, () => {
  console.log(`Team Task Tracker is running on http://127.0.0.1:${port}`);
});
