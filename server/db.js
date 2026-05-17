import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/team-task-tracker';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    passwordHash: { type: String, required: true },
  },
  {
    timestamps: true,
  }
);

const projectMemberSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['Admin', 'Member'], required: true },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: { type: [projectMemberSchema], default: [] },
  },
  {
    timestamps: true,
  }
);

const taskSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    status: { type: String, enum: ['Todo', 'In Progress', 'Done'], default: 'Todo' },
    priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
    dueDate: { type: String, default: null },
    assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
  }
);

taskSchema.index({ projectId: 1, status: 1, priority: 1, dueDate: 1 });

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Project = mongoose.models.Project || mongoose.model('Project', projectSchema);
const Task = mongoose.models.Task || mongoose.model('Task', taskSchema);

function toId(value) {
  return value ? String(value) : null;
}

function nowIso(value) {
  return value ? new Date(value).toISOString() : null;
}

function publicUser(doc) {
  if (!doc) {
    return null;
  }

  const plain = doc.toObject ? doc.toObject() : doc;
  return {
    id: toId(plain._id),
    name: plain.name,
    email: plain.email,
    createdAt: nowIso(plain.createdAt),
  };
}

function authUser(doc) {
  if (!doc) {
    return null;
  }

  const plain = doc.toObject ? doc.toObject() : doc;
  return {
    id: toId(plain._id),
    name: plain.name,
    email: plain.email,
    passwordHash: plain.passwordHash,
    createdAt: nowIso(plain.createdAt),
  };
}

function projectStatsMap(doc, membersRole = null) {
  if (!doc) {
    return null;
  }

  return {
    id: toId(doc._id),
    name: doc.name,
    description: doc.description,
    ownerId: toId(doc.ownerId),
    ownerName: doc.ownerName,
    createdAt: nowIso(doc.createdAt),
    role: membersRole,
    taskCount: doc.taskCount || 0,
    todoCount: doc.todoCount || 0,
    inProgressCount: doc.inProgressCount || 0,
    doneCount: doc.doneCount || 0,
    overdueCount: doc.overdueCount || 0,
  };
}

function publicTask(doc) {
  if (!doc) {
    return null;
  }

  return {
    id: toId(doc._id),
    projectId: toId(doc.projectId),
    projectName: doc.projectName,
    title: doc.title,
    description: doc.description,
    status: doc.status,
    priority: doc.priority,
    dueDate: doc.dueDate,
    assigneeId: toId(doc.assigneeId),
    assigneeName: doc.assigneeName || null,
    assigneeEmail: doc.assigneeEmail || null,
    createdById: toId(doc.createdById),
    createdByName: doc.createdByName || null,
    createdAt: nowIso(doc.createdAt),
    updatedAt: nowIso(doc.updatedAt),
  };
}

async function connectMongo() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 10000,
  });

  await Promise.all([User.init(), Project.init(), Task.init()]);
  return mongoose.connection;
}

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

async function getTaskDocuments(filter = {}) {
  return Task.find(filter)
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();
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

async function projectRoleForUser(project, userId) {
  const member = project.members.find((entry) => String(entry.userId) === String(userId));
  return member?.role || null;
}

async function buildProjectSummary(project, role = null) {
  const tasks = await Task.find({ projectId: project._id }).lean();
  const owner = await User.findById(project.ownerId).lean();
  const taskCount = tasks.length;
  const todoCount = tasks.filter((task) => task.status === 'Todo').length;
  const inProgressCount = tasks.filter((task) => task.status === 'In Progress').length;
  const doneCount = tasks.filter((task) => task.status === 'Done').length;
  const overdueCount = tasks.filter(
    (task) =>
      task.status !== 'Done' &&
      task.dueDate &&
      new Date(task.dueDate).getTime() < new Date().setHours(0, 0, 0, 0)
  ).length;

  return projectStatsMap(
    {
      _id: project._id,
      name: project.name,
      description: project.description,
      ownerId: project.ownerId,
      ownerName: owner?.name || null,
      createdAt: project.createdAt,
      taskCount,
      todoCount,
      inProgressCount,
      doneCount,
      overdueCount,
    },
    role
  );
}

export async function initDatabase() {
  await connectMongo();
  await seedDemoData();
}

export async function findUserByEmail(email) {
  await connectMongo();
  const user = await User.findOne({ email: email.trim().toLowerCase() }).lean();
  return authUser(user);
}

export async function findUserById(id) {
  await connectMongo();
  if (!isValidObjectId(id)) {
    return null;
  }

  const user = await User.findById(id).lean();
  return authUser(user);
}

export async function createUser({ name, email, passwordHash }) {
  await connectMongo();
  const user = await User.create({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    passwordHash,
  });

  const createdUser = await User.findById(user._id).lean();
  return authUser(createdUser);
}

export async function addProjectMember({ projectId, userId, role }) {
  await connectMongo();
  if (!isValidObjectId(projectId) || !isValidObjectId(userId)) {
    return null;
  }

  await Project.updateOne(
    { _id: projectId, 'members.userId': { $ne: userId } },
    { $push: { members: { userId, role, joinedAt: new Date() } } }
  );

  await Project.updateOne(
    { _id: projectId, 'members.userId': userId },
    { $set: { 'members.$.role': role, 'members.$.joinedAt': new Date() } }
  );
}

export async function getProjectMember({ projectId, userId }) {
  await connectMongo();
  if (!isValidObjectId(projectId) || !isValidObjectId(userId)) {
    return null;
  }

  const project = await Project.findById(projectId).lean();
  if (!project) {
    return null;
  }

  return project.members.find((member) => String(member.userId) === String(userId)) || null;
}

export async function createProject({ ownerId, name, description }) {
  await connectMongo();
  if (!isValidObjectId(ownerId)) {
    return null;
  }

  const project = await Project.create({
    name: name.trim(),
    description: (description || '').trim(),
    ownerId,
    members: [{ userId: ownerId, role: 'Admin', joinedAt: new Date() }],
  });

  return getProjectForUser({ projectId: project._id, userId: ownerId });
}

export async function getProjectById(projectId) {
  await connectMongo();
  if (!isValidObjectId(projectId)) {
    return null;
  }

  return Project.findById(projectId).lean();
}

export async function listProjectsForUser(userId) {
  await connectMongo();
  if (!isValidObjectId(userId)) {
    return [];
  }

  const projects = await Project.find({ 'members.userId': userId }).sort({ createdAt: -1 }).lean();
  const ownerIds = [...new Set(projects.map((project) => String(project.ownerId)))];
  const owners = await User.find({ _id: { $in: ownerIds } }).lean();
  const ownerLookup = new Map(owners.map((owner) => [String(owner._id), owner.name]));

  const taskCounts = await Task.aggregate([
    { $match: { projectId: { $in: projects.map((project) => project._id) } } },
    {
      $group: {
        _id: '$projectId',
        taskCount: { $sum: 1 },
        todoCount: { $sum: { $cond: [{ $eq: ['$status', 'Todo'] }, 1, 0] } },
        inProgressCount: { $sum: { $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0] } },
        doneCount: { $sum: { $cond: [{ $eq: ['$status', 'Done'] }, 1, 0] } },
        overdueCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: ['$status', 'Done'] },
                  { $ne: ['$dueDate', null] },
                  { $lt: ['$dueDate', new Date().toISOString().slice(0, 10)] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  const countLookup = new Map(taskCounts.map((entry) => [String(entry._id), entry]));

  return projects.map((project) => {
    const role = project.members.find((member) => String(member.userId) === String(userId))?.role || null;
    const counts = countLookup.get(String(project._id)) || {};

    return projectStatsMap(
      {
        _id: project._id,
        name: project.name,
        description: project.description,
        ownerId: project.ownerId,
        ownerName: ownerLookup.get(String(project.ownerId)) || null,
        createdAt: project.createdAt,
        taskCount: counts.taskCount || 0,
        todoCount: counts.todoCount || 0,
        inProgressCount: counts.inProgressCount || 0,
        doneCount: counts.doneCount || 0,
        overdueCount: counts.overdueCount || 0,
      },
      role
    );
  });
}

export async function getProjectForUser({ projectId, userId }) {
  await connectMongo();
  if (!isValidObjectId(projectId) || !isValidObjectId(userId)) {
    return null;
  }

  const project = await Project.findOne({ _id: projectId, 'members.userId': userId }).lean();
  if (!project) {
    return null;
  }

  const role = project.members.find((member) => String(member.userId) === String(userId))?.role || null;
  return buildProjectSummary(project, role);
}

export async function listProjectMembers(projectId) {
  await connectMongo();
  if (!isValidObjectId(projectId)) {
    return [];
  }

  const project = await Project.findById(projectId).lean();
  if (!project) {
    return [];
  }

  const memberIds = project.members.map((member) => member.userId);
  const users = await User.find({ _id: { $in: memberIds } }).lean();
  const userLookup = new Map(users.map((user) => [String(user._id), user]));

  return project.members
    .map((member) => {
      const user = userLookup.get(String(member.userId));
      if (!user) {
        return null;
      }

      return {
        id: toId(user._id),
        name: user.name,
        email: user.email,
        role: member.role,
        createdAt: nowIso(member.joinedAt || project.createdAt),
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.role !== right.role) {
        return left.role === 'Admin' ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });
}

export async function listAssignableMembers(projectId) {
  await connectMongo();
  if (!isValidObjectId(projectId)) {
    return [];
  }

  const members = await listProjectMembers(projectId);
  return members.map((member) => ({
    id: member.id,
    name: member.name,
    email: member.email,
    role: member.role,
  }));
}

export async function listProjectTasks(projectId) {
  await connectMongo();
  if (!isValidObjectId(projectId)) {
    return [];
  }

  const tasks = await Task.find({ projectId }).sort({ status: 1, priority: 1, dueDate: 1, updatedAt: -1 }).lean();
  const project = await Project.findById(projectId).lean();
  const userIds = [...new Set(tasks.flatMap((task) => [task.createdById, task.assigneeId].filter(Boolean)).map(String))];
  const users = await User.find({ _id: { $in: userIds } }).lean();
  const userLookup = new Map(users.map((user) => [String(user._id), user]));

  return tasks.map((task) => {
    const createdBy = userLookup.get(String(task.createdById));
    const assignee = task.assigneeId ? userLookup.get(String(task.assigneeId)) : null;

    return publicTask({
      ...task,
      projectName: project?.name || null,
      createdByName: createdBy?.name || null,
      assigneeName: assignee?.name || null,
      assigneeEmail: assignee?.email || null,
    });
  });
}

export async function getTaskById(taskId) {
  await connectMongo();
  if (!isValidObjectId(taskId)) {
    return null;
  }

  const task = await Task.findById(taskId).lean();
  if (!task) {
    return null;
  }

  const [project, createdBy, assignee] = await Promise.all([
    Project.findById(task.projectId).lean(),
    User.findById(task.createdById).lean(),
    task.assigneeId ? User.findById(task.assigneeId).lean() : Promise.resolve(null),
  ]);

  return publicTask({
    ...task,
    projectName: project?.name || null,
    createdByName: createdBy?.name || null,
    assigneeName: assignee?.name || null,
    assigneeEmail: assignee?.email || null,
  });
}

export async function createTask({ projectId, title, description, status, priority, dueDate, assigneeId, createdById }) {
  await connectMongo();
  if (!isValidObjectId(projectId) || !isValidObjectId(createdById)) {
    return null;
  }

  const task = await Task.create({
    projectId,
    title: title.trim(),
    description: (description || '').trim(),
    status,
    priority,
    dueDate: dueDate || null,
    assigneeId: assigneeId || null,
    createdById,
  });

  return getTaskById(task._id);
}

export async function updateTask(taskId, patch) {
  await connectMongo();
  if (!isValidObjectId(taskId)) {
    return null;
  }

  const currentTask = await Task.findById(taskId).lean();
  if (!currentTask) {
    return null;
  }

  const nextTask = {
    title: patch.title ?? currentTask.title,
    description: patch.description ?? currentTask.description,
    status: patch.status ?? currentTask.status,
    priority: patch.priority ?? currentTask.priority,
    dueDate: Object.prototype.hasOwnProperty.call(patch, 'dueDate') ? patch.dueDate : currentTask.dueDate,
    assigneeId: Object.prototype.hasOwnProperty.call(patch, 'assigneeId') ? patch.assigneeId : currentTask.assigneeId,
  };

  await Task.updateOne(
    { _id: taskId },
    {
      $set: {
        title: nextTask.title.trim(),
        description: nextTask.description.trim(),
        status: nextTask.status,
        priority: nextTask.priority,
        dueDate: nextTask.dueDate || null,
        assigneeId: nextTask.assigneeId || null,
      },
    }
  );

  return getTaskById(taskId);
}

export async function getDashboard(userId) {
  await connectMongo();
  if (!isValidObjectId(userId)) {
    return {
      projects: [],
      stats: {
        projectCount: 0,
        taskCount: 0,
        todoCount: 0,
        inProgressCount: 0,
        doneCount: 0,
        overdueCount: 0,
        assignedToMeCount: 0,
      },
      recentTasks: [],
    };
  }

  const projects = await listProjectsForUser(userId);
  const projectIds = projects.map((project) => project.id);
  const mongoProjectIds = await Project.find({ _id: { $in: projectIds } }).select('_id').lean();
  const taskDocs = await Task.find({ projectId: { $in: mongoProjectIds.map((project) => project._id) } }).lean();

  const assignedToMeCount = taskDocs.filter((task) => String(task.assigneeId) === String(userId)).length;
  const overdueCount = taskDocs.filter(
    (task) =>
      task.status !== 'Done' &&
      task.dueDate &&
      new Date(task.dueDate).getTime() < new Date().setHours(0, 0, 0, 0)
  ).length;

  const recentTaskDocs = await Task.find({ projectId: { $in: mongoProjectIds.map((project) => project._id) } })
    .sort({ updatedAt: -1 })
    .limit(6)
    .lean();

  const userIds = [
    ...new Set(
      recentTaskDocs
        .flatMap((task) => [task.createdById, task.assigneeId].filter(Boolean))
        .map(String)
    ),
  ];
  const users = await User.find({ _id: { $in: userIds } }).lean();
  const userLookup = new Map(users.map((user) => [String(user._id), user]));
  const projectLookup = new Map((await Project.find({ _id: { $in: mongoProjectIds.map((project) => project._id) } }).lean()).map((project) => [String(project._id), project]));

  const recentTasks = recentTaskDocs.map((task) => {
    const createdBy = userLookup.get(String(task.createdById));
    const assignee = task.assigneeId ? userLookup.get(String(task.assigneeId)) : null;
    const project = projectLookup.get(String(task.projectId));

    return publicTask({
      ...task,
      projectName: project?.name || null,
      createdByName: createdBy?.name || null,
      assigneeName: assignee?.name || null,
      assigneeEmail: assignee?.email || null,
    });
  });

  return {
    projects,
    stats: {
      projectCount: projects.length,
      taskCount: taskDocs.length,
      todoCount: taskDocs.filter((task) => task.status === 'Todo').length,
      inProgressCount: taskDocs.filter((task) => task.status === 'In Progress').length,
      doneCount: taskDocs.filter((task) => task.status === 'Done').length,
      overdueCount,
      assignedToMeCount,
    },
    recentTasks,
  };
}

async function seedDemoData() {
  await connectMongo();

  const existingUsers = await User.countDocuments();
  if (existingUsers > 0) {
    return;
  }

  const adminPassword = bcrypt.hashSync('Demo123!', 10);
  const memberPassword = bcrypt.hashSync('Demo123!', 10);

  const admin = await User.create({
    name: 'Demo Admin',
    email: 'admin@teamtask.local',
    passwordHash: adminPassword,
  });

  const member = await User.create({
    name: 'Demo Member',
    email: 'member@teamtask.local',
    passwordHash: memberPassword,
  });

  const project = await Project.create({
    name: 'Website Refresh',
    description: 'Launch tasks, polish content, and coordinate the final release.',
    ownerId: admin._id,
    members: [
      { userId: admin._id, role: 'Admin', joinedAt: new Date() },
      { userId: member._id, role: 'Member', joinedAt: new Date() },
    ],
  });

  await Task.insertMany([
    {
      projectId: project._id,
      title: 'Draft homepage copy',
      description: 'Write concise launch messaging for the hero section.',
      status: 'In Progress',
      priority: 'High',
      dueDate: '2026-05-14',
      assigneeId: member._id,
      createdById: admin._id,
    },
    {
      projectId: project._id,
      title: 'Approve design tokens',
      description: 'Check spacing, color, and button styles before handoff.',
      status: 'Todo',
      priority: 'Medium',
      dueDate: '2026-05-20',
      assigneeId: admin._id,
      createdById: admin._id,
    },
    {
      projectId: project._id,
      title: 'Prepare launch checklist',
      description: 'Collect deployment notes and post-release checks.',
      status: 'Done',
      priority: 'Low',
      dueDate: '2026-05-10',
      assigneeId: admin._id,
      createdById: admin._id,
    },
  ]);
}
