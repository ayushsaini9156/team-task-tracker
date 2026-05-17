import mongoose from 'mongoose';

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

const projectSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

const projectMemberSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ['Admin', 'Member'], required: true, default: 'Member' },
  },
  { timestamps: true }
);

projectMemberSchema.index({ projectId: 1, userId: 1 }, { unique: true });

const taskSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    status: { type: String, enum: ['Todo', 'In Progress', 'Done'], default: 'Todo', index: true },
    priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium', index: true },
    dueDate: { type: String, default: null },
    assigneeId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    createdById: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Project = mongoose.models.Project || mongoose.model('Project', projectSchema);
const ProjectMember = mongoose.models.ProjectMember || mongoose.model('ProjectMember', projectMemberSchema);
const Task = mongoose.models.Task || mongoose.model('Task', taskSchema);

let connectPromise;

function toId(value) {
  if (!value) {
    return null;
  }

  return String(value);
}

function toUser(doc) {
  if (!doc) {
    return null;
  }

  return {
    id: toId(doc._id),
    name: doc.name,
    email: doc.email,
    passwordHash: doc.passwordHash,
    createdAt: doc.createdAt?.toISOString?.() || null,
  };
}

function toProject(doc, role = null) {
  if (!doc) {
    return null;
  }

  return {
    id: toId(doc._id),
    name: doc.name,
    description: doc.description || '',
    ownerId: toId(doc.ownerId),
    role,
    createdAt: doc.createdAt?.toISOString?.() || null,
  };
}

function toTask(doc, membersById = new Map()) {
  if (!doc) {
    return null;
  }

  const assigneeId = toId(doc.assigneeId);
  const assignee = assigneeId ? membersById.get(assigneeId) || null : null;

  return {
    id: toId(doc._id),
    projectId: toId(doc.projectId),
    title: doc.title,
    description: doc.description || '',
    status: doc.status,
    priority: doc.priority,
    dueDate: doc.dueDate || null,
    assigneeId,
    assigneeName: assignee?.name || null,
    createdById: toId(doc.createdById),
    createdAt: doc.createdAt?.toISOString?.() || null,
    updatedAt: doc.updatedAt?.toISOString?.() || null,
  };
}

async function connectDatabase() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!connectPromise) {
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/team-task-tracker';
    connectPromise = mongoose.connect(uri);
  }

  await connectPromise;
  return mongoose.connection;
}

function isValidId(value) {
  return mongoose.Types.ObjectId.isValid(String(value));
}

async function findUserById(userId) {
  if (!isValidId(userId)) {
    return null;
  }

  return toUser(await User.findById(userId).lean());
}

async function findUserByEmail(email) {
  return toUser(await User.findOne({ email: email.trim().toLowerCase() }).lean());
}

async function createUser({ name, email, passwordHash }) {
  const created = await User.create({ name, email: email.trim().toLowerCase(), passwordHash });
  return toUser(created.toObject());
}

async function createProject({ ownerId, name, description }) {
  const project = await Project.create({ ownerId, name, description });

  await ProjectMember.create({
    projectId: project._id,
    userId: ownerId,
    role: 'Admin',
  });

  return toProject(project.toObject(), 'Admin');
}

async function addProjectMember({ projectId, userId, role }) {
  const member = await ProjectMember.findOneAndUpdate(
    { projectId, userId },
    { projectId, userId, role },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  return member ? { id: toId(member._id), projectId: toId(member.projectId), userId: toId(member.userId), role: member.role } : null;
}

async function getProjectMember({ projectId, userId }) {
  const member = await ProjectMember.findOne({ projectId, userId }).lean();
  if (!member) {
    return null;
  }

  return {
    id: toId(member._id),
    projectId: toId(member.projectId),
    userId: toId(member.userId),
    role: member.role,
  };
}

async function listProjectMembers(projectId) {
  const members = await ProjectMember.find({ projectId }).lean();
  const userIds = members.map((member) => member.userId).filter(Boolean);
  const users = await User.find({ _id: { $in: userIds } }).lean();
  const usersById = new Map(users.map((user) => [toId(user._id), user]));

  return members.map((member) => {
    const user = usersById.get(toId(member.userId));
    return {
      id: toId(member._id),
      projectId: toId(member.projectId),
      userId: toId(member.userId),
      role: member.role,
      name: user?.name || 'Unknown user',
      email: user?.email || '',
      createdAt: member.createdAt?.toISOString?.() || null,
    };
  });
}

async function listAssignableMembers(projectId) {
  const members = await listProjectMembers(projectId);
  return members.map(({ id, name, email, role }) => ({ id, name, email, role }));
}

async function getProjectById(projectId) {
  if (!isValidId(projectId)) {
    return null;
  }

  return toProject(await Project.findById(projectId).lean());
}

async function getProjectForUser({ projectId, userId }) {
  if (!isValidId(projectId) || !isValidId(userId)) {
    return null;
  }

  const [project, member] = await Promise.all([
    Project.findById(projectId).lean(),
    ProjectMember.findOne({ projectId, userId }).lean(),
  ]);

  if (!project || !member) {
    return null;
  }

  return toProject(project, member.role);
}

async function listProjectsForUser(userId) {
  if (!isValidId(userId)) {
    return [];
  }

  const memberships = await ProjectMember.find({ userId }).lean();
  const projectIds = memberships.map((membership) => membership.projectId).filter(Boolean);
  const projects = await Project.find({ _id: { $in: projectIds } }).lean();
  const projectsById = new Map(projects.map((project) => [toId(project._id), project]));

  return memberships
    .map((membership) => {
      const project = projectsById.get(toId(membership.projectId));
      return project ? toProject(project, membership.role) : null;
    })
    .filter(Boolean);
}

async function listProjectTasks(projectId) {
  if (!isValidId(projectId)) {
    return [];
  }

  const tasks = await Task.find({ projectId }).lean();
  const assigneeIds = tasks.map((task) => task.assigneeId).filter(Boolean);
  const assignees = await User.find({ _id: { $in: assigneeIds } }).lean();
  const assigneesById = new Map(assignees.map((user) => [toId(user._id), user]));

  return tasks.map((task) => toTask(task, assigneesById));
}

async function createTask({ projectId, title, description, status, priority, dueDate, assigneeId, createdById }) {
  const task = await Task.create({
    projectId,
    title,
    description,
    status,
    priority,
    dueDate: dueDate ?? null,
    assigneeId: assigneeId || null,
    createdById,
  });

  const [assignee] = await User.find({ _id: { $in: [task.assigneeId].filter(Boolean) } }).lean();
  return toTask(task.toObject(), new Map(assignee ? [[toId(assignee._id), assignee]] : []));
}

async function getTaskById(taskId) {
  if (!isValidId(taskId)) {
    return null;
  }

  const task = await Task.findById(taskId).lean();
  if (!task) {
    return null;
  }

  const assignee = task.assigneeId ? await User.findById(task.assigneeId).lean() : null;
  return toTask(task, assignee ? new Map([[toId(assignee._id), assignee]]) : new Map());
}

async function updateTask(taskId, patch) {
  if (!isValidId(taskId)) {
    return null;
  }

  const updated = await Task.findByIdAndUpdate(taskId, { $set: patch }, { new: true }).lean();
  if (!updated) {
    return null;
  }

  const assignee = updated.assigneeId ? await User.findById(updated.assigneeId).lean() : null;
  return toTask(updated, assignee ? new Map([[toId(assignee._id), assignee]]) : new Map());
}

async function getDashboard(userId) {
  if (!isValidId(userId)) {
    return {
      projects: [],
      stats: {
        projectCount: 0,
        taskCount: 0,
        overdueCount: 0,
        assignedToMeCount: 0,
        statusBreakdown: [],
      },
    };
  }

  const [projects, memberships, tasks] = await Promise.all([
    listProjectsForUser(userId),
    ProjectMember.find({ userId }).lean(),
    Task.find({}).lean(),
  ]);

  const projectIds = new Set(memberships.map((membership) => toId(membership.projectId)));
  const projectTasks = tasks.filter((task) => projectIds.has(toId(task.projectId)));
  const assignedToMeCount = projectTasks.filter((task) => toId(task.assigneeId) === String(userId)).length;
  const overdueCount = projectTasks.filter((task) => task.dueDate && task.status !== 'Done' && new Date(task.dueDate).getTime() < new Date().setHours(0, 0, 0, 0)).length;

  const statusBreakdown = ['Todo', 'In Progress', 'Done'].map((status) => ({
    status,
    count: projectTasks.filter((task) => task.status === status).length,
  }));

  return {
    projects,
    stats: {
      projectCount: projects.length,
      taskCount: projectTasks.length,
      overdueCount,
      assignedToMeCount,
      statusBreakdown,
    },
  };
}

export {
  addProjectMember,
  connectDatabase as initDatabase,
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
  listAssignableMembers,
  listProjectMembers,
  listProjectTasks,
  listProjectsForUser,
  updateTask,
};