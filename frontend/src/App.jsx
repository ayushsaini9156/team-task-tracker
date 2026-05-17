import { useEffect, useMemo, useState } from 'react';
import { apiRequest, clearToken, getToken, setToken } from './api.js';

const emptyAuthForm = {
	name: '',
	email: '',
	password: '',
};

const emptyProjectForm = {
	name: '',
	description: '',
};

const emptyTaskForm = {
	title: '',
	description: '',
	status: 'Todo',
	priority: 'Medium',
	dueDate: '',
	assigneeId: '',
};

const statusOrder = ['Todo', 'In Progress', 'Done'];

function formatDate(value) {
	if (!value) {
		return 'No due date';
	}

	return new Intl.DateTimeFormat('en', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	}).format(new Date(value));
}

function isOverdue(task) {
	if (!task.dueDate || task.status === 'Done') {
		return false;
	}

	return new Date(task.dueDate).getTime() < new Date().setHours(0, 0, 0, 0);
}

function statusClass(status) {
	return `status-pill status-pill--${status.toLowerCase().replaceAll(' ', '-')}`;
}

function priorityClass(priority) {
	return `priority-pill priority-pill--${priority.toLowerCase()}`;
}

function MetricCard({ label, value, hint }) {
	return (
		<article className="metric-card">
			<span className="metric-card__label">{label}</span>
			<strong className="metric-card__value">{value}</strong>
			<span className="metric-card__hint">{hint}</span>
		</article>
	);
}

function SectionTitle({ eyebrow, title, description }) {
	return (
		<div className="section-title">
			<span>{eyebrow}</span>
			<h2>{title}</h2>
			<p>{description}</p>
		</div>
	);
}

function AuthScreen({ mode, setMode, authForm, setAuthForm, onSubmit, loading, error }) {
	return (
		<main className="auth-shell">
			<div className="auth-shell__backdrop auth-shell__backdrop--one" />
			<div className="auth-shell__backdrop auth-shell__backdrop--two" />

			<section className="hero-panel">
				<span className="brand-mark">Team Task Tracker</span>
				<h1>Project coordination for teams that ship on time.</h1>
				<p>
					Create projects, assign tasks, and keep progress visible with admin and member
					permissions built into the workflow.
				</p>

				<div className="hero-panel__features">
					<div>
						<strong>Auth</strong>
						<span>Signup and login with JWT sessions.</span>
					</div>
					<div>
						<strong>Access</strong>
						<span>Project-specific Admin and Member roles.</span>
					</div>
					<div>
						<strong>Tracking</strong>
						<span>Dashboard counts, overdue tasks, and status flow.</span>
					</div>
				</div>

				<div className="demo-credentials">
					<strong>Demo login</strong>
					<span>admin@teamtask.local / Demo123!</span>
					<span>member@teamtask.local / Demo123!</span>
				</div>
			</section>

			<section className="auth-card">
				<div className="auth-card__tabs">
					<button className={mode === 'login' ? 'is-active' : ''} onClick={() => setMode('login')}>
						Login
					</button>
					<button className={mode === 'signup' ? 'is-active' : ''} onClick={() => setMode('signup')}>
						Signup
					</button>
				</div>

				<form className="auth-form" onSubmit={onSubmit}>
					{mode === 'signup' && (
						<label>
							Full name
							<input
								value={authForm.name}
								onChange={(event) => setAuthForm((current) => ({ ...current, name: event.target.value }))}
								placeholder="Avery Johnson"
							/>
						</label>
					)}

					<label>
						Email
						<input
							type="email"
							value={authForm.email}
							onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
							placeholder="you@company.com"
						/>
					</label>

					<label>
						Password
						<input
							type="password"
							value={authForm.password}
							onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
							placeholder="Minimum 8 characters"
						/>
					</label>

					{error && <div className="notice notice--error">{error}</div>}

					<button className="primary-button" type="submit" disabled={loading}>
						{loading ? 'Working...' : mode === 'login' ? 'Enter dashboard' : 'Create account'}
					</button>
				</form>
			</section>
		</main>
	);
}

function DashboardScreen({ user, dashboard, selectedProject, setSelectedProjectId, reloadWorkspace, onLogout }) {
	const [projectForm, setProjectForm] = useState(emptyProjectForm);
	const [taskForm, setTaskForm] = useState(emptyTaskForm);
	const [memberForm, setMemberForm] = useState({ email: '', role: 'Member' });
	const [busy, setBusy] = useState(false);
	const [feedback, setFeedback] = useState('');

	const selectedProjectState = selectedProject;
	const isAdmin = selectedProjectState?.project?.role === 'Admin';
	const members = selectedProjectState?.members || [];
	const assignableMembers = selectedProjectState?.assignableMembers || [];
	const tasks = selectedProjectState?.tasks || [];

	useEffect(() => {
		if (!selectedProjectState) {
			return;
		}

		setTaskForm((current) => ({
			...current,
			assigneeId: assignableMembers[0]?.id ? String(assignableMembers[0].id) : '',
		}));
	}, [selectedProjectState?.project?.id]);

	async function handleCreateProject(event) {
		event.preventDefault();
		setBusy(true);
		setFeedback('');

		try {
			await apiRequest('/api/projects', {
				method: 'POST',
				body: projectForm,
			});

			setProjectForm(emptyProjectForm);
			await reloadWorkspace();
			setFeedback('Project created.');
		} catch (error) {
			setFeedback(error.message);
		} finally {
			setBusy(false);
		}
	}

	async function handleCreateTask(event) {
		event.preventDefault();
		if (!selectedProjectState) {
			return;
		}

		setBusy(true);
		setFeedback('');

		try {
			await apiRequest(`/api/projects/${selectedProjectState.project.id}/tasks`, {
				method: 'POST',
				body: {
					...taskForm,
					assigneeId: taskForm.assigneeId ? Number(taskForm.assigneeId) : null,
				},
			});

			setTaskForm({ ...emptyTaskForm, assigneeId: assignableMembers[0]?.id ? String(assignableMembers[0].id) : '' });
			await reloadWorkspace(selectedProjectState.project.id);
			setFeedback('Task created.');
		} catch (error) {
			setFeedback(error.message);
		} finally {
			setBusy(false);
		}
	}

	async function handleAddMember(event) {
		event.preventDefault();
		if (!selectedProjectState) {
			return;
		}

		setBusy(true);
		setFeedback('');

		try {
			await apiRequest(`/api/projects/${selectedProjectState.project.id}/members`, {
				method: 'POST',
				body: memberForm,
			});

			setMemberForm({ email: '', role: 'Member' });
			await reloadWorkspace(selectedProjectState.project.id);
			setFeedback('Member added.');
		} catch (error) {
			setFeedback(error.message);
		} finally {
			setBusy(false);
		}
	}

	async function updateTask(taskId, patch) {
		try {
			await apiRequest(`/api/tasks/${taskId}`, {
				method: 'PATCH',
				body: patch,
			});

			await reloadWorkspace(selectedProjectState.project.id);
		} catch (error) {
			setFeedback(error.message);
		}
	}

	const groupedTasks = useMemo(() => {
		return statusOrder.map((status) => ({
			status,
			tasks: tasks.filter((task) => task.status === status),
		}));
	}, [tasks]);

	return (
		<main className="workspace-shell">
			<aside className="sidebar">
				<div className="shell-header">
					<div>
						<span className="brand-mark brand-mark--small">Team Task Tracker</span>
						<p>Signed in as {user.name}</p>
					</div>
					<button className="ghost-button" onClick={onLogout}>
						Logout
					</button>
				</div>

				<section className="sidebar-card">
					<SectionTitle
						eyebrow="Overview"
						title="Workload snapshot"
						description="Cross-project counts keep the board readable at a glance."
					/>

					<div className="metric-grid metric-grid--compact">
						<MetricCard label="Projects" value={dashboard.stats.projectCount} hint="Active spaces" />
						<MetricCard label="Tasks" value={dashboard.stats.taskCount} hint="Across all projects" />
						<MetricCard label="Overdue" value={dashboard.stats.overdueCount} hint="Needs attention" />
						<MetricCard label="Assigned to me" value={dashboard.stats.assignedToMeCount} hint="Personal queue" />
					</div>
				</section>

				<section className="sidebar-card">
					<SectionTitle
						eyebrow="Projects"
						title="Switch context"
						description="Pick a project to manage its members and task flow."
					/>

					<div className="project-list">
						{dashboard.projects.map((project) => (
							<button
								key={project.id}
								className={selectedProjectState?.project?.id === project.id ? 'project-card is-selected' : 'project-card'}
								onClick={() => setSelectedProjectId(project.id)}
							>
								<strong>{project.name}</strong>
								<span>{project.role}</span>
								<p>{project.description || 'No description yet.'}</p>
							</button>
						))}
					</div>
				</section>

				<section className="sidebar-card">
					<SectionTitle
						eyebrow="New project"
						title="Create a space"
						description="Start a new board and become its admin automatically."
					/>

					<form className="stack-form" onSubmit={handleCreateProject}>
						<label>
							Project name
							<input
								value={projectForm.name}
								onChange={(event) => setProjectForm((current) => ({ ...current, name: event.target.value }))}
								placeholder="Website redesign"
							/>
						</label>

						<label>
							Description
							<textarea
								rows="4"
								value={projectForm.description}
								onChange={(event) => setProjectForm((current) => ({ ...current, description: event.target.value }))}
								placeholder="Track launch tasks, owners, and deadlines."
							/>
						</label>

						<button className="primary-button" type="submit" disabled={busy}>
							Create project
						</button>
					</form>
				</section>
			</aside>

			<section className="main-panel">
				<header className="shell-header shell-header--main">
					<div>
						<span className="brand-mark brand-mark--small">Team Task Tracker</span>
						<h1>{selectedProjectState?.project?.name || 'Select a project to continue'}</h1>
						<p>{selectedProjectState?.project?.description || 'Choose a project from the sidebar or create a new one.'}</p>
					</div>

					{selectedProjectState && (
						<div className="header-stats">
							<span>{members.length} members</span>
							<span>{tasks.length} tasks</span>
						</div>
					)}
				</header>

				{feedback && <div className="notice">{feedback}</div>}

				{!selectedProjectState ? (
					<section className="empty-state">
						<h2>No project selected</h2>
						<p>Pick a project from the sidebar to see tasks and members, or create a fresh project.</p>
					</section>
				) : (
					<>
						<section className="content-grid">
							<article className="panel-card panel-card--wide">
								<SectionTitle
									eyebrow="Tasks"
									title="Task board"
									description="Move work through Todo, In Progress, and Done."
								/>

								<div className="task-columns">
									{groupedTasks.map((group) => (
										<div key={group.status} className="task-column">
											<div className="task-column__header">
												<h3>{group.status}</h3>
												<span>{group.tasks.length}</span>
											</div>

											<div className="task-list">
												{group.tasks.length === 0 ? (
													<div className="task-card task-card--empty">No tasks in this lane.</div>
												) : (
													group.tasks.map((task) => (
														<article key={task.id} className={`task-card ${isOverdue(task) ? 'task-card--overdue' : ''}`}>
															<div className="task-card__topline">
																<strong>{task.title}</strong>
																<span className={priorityClass(task.priority)}>{task.priority}</span>
															</div>
															<p>{task.description || 'No description added.'}</p>
															<div className="task-card__meta">
																<span>{formatDate(task.dueDate)}</span>
																<span className={statusClass(task.status)}>{task.status}</span>
															</div>
															<div className="task-card__meta task-card__meta--subtle">
																<span>{task.assigneeName || 'Unassigned'}</span>
																{isAdmin && task.status !== 'Done' && (
																	<button type="button" className="inline-action" onClick={() => updateTask(task.id, { status: 'Done' })}>
																		Mark done
																	</button>
																)}
															</div>
														</article>
													))
												)}
											</div>
										</div>
									))}
								</div>
							</article>

							<article className="panel-card">
								<SectionTitle
									eyebrow="Members"
									title="Project access"
									description="Admins can invite other users and assign project roles."
								/>

								<div className="member-list">
									{members.map((member) => (
										<div key={member.id} className="member-card">
											<strong>{member.name}</strong>
											<span>{member.email}</span>
											<span>{member.role}</span>
										</div>
									))}
								</div>

								{isAdmin ? (
									<form className="stack-form" onSubmit={handleAddMember}>
										<label>
											Invite by email
											<input
												type="email"
												value={memberForm.email}
												onChange={(event) => setMemberForm((current) => ({ ...current, email: event.target.value }))}
												placeholder="teammate@company.com"
											/>
										</label>

										<label>
											Role
											<select
												value={memberForm.role}
												onChange={(event) => setMemberForm((current) => ({ ...current, role: event.target.value }))}
											>
												<option value="Member">Member</option>
												<option value="Admin">Admin</option>
											</select>
										</label>

										<button className="primary-button" type="submit" disabled={busy}>
											Add member
										</button>
									</form>
								) : (
									<p className="helper-copy">Only admins can invite other members.</p>
								)}
							</article>
						</section>

						{isAdmin && (
							<section className="panel-card panel-card--wide">
								<SectionTitle
									eyebrow="New task"
									title="Create work item"
									description="Assign the task immediately so the team can start tracking it."
								/>

								<form className="task-form" onSubmit={handleCreateTask}>
									<label>
										Title
										<input
											value={taskForm.title}
											onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))}
											placeholder="Draft release checklist"
										/>
									</label>

									<label>
										Description
										<textarea
											rows="3"
											value={taskForm.description}
											onChange={(event) => setTaskForm((current) => ({ ...current, description: event.target.value }))}
											placeholder="Include launch gates, sign-offs, and due dates."
										/>
									</label>

									<label>
										Status
										<select
											value={taskForm.status}
											onChange={(event) => setTaskForm((current) => ({ ...current, status: event.target.value }))}
										>
											{statusOrder.map((status) => (
												<option key={status} value={status}>
													{status}
												</option>
											))}
										</select>
									</label>

									<label>
										Priority
										<select
											value={taskForm.priority}
											onChange={(event) => setTaskForm((current) => ({ ...current, priority: event.target.value }))}
										>
											<option value="Low">Low</option>
											<option value="Medium">Medium</option>
											<option value="High">High</option>
										</select>
									</label>

									<label>
										Due date
										<input
											type="date"
											value={taskForm.dueDate}
											onChange={(event) => setTaskForm((current) => ({ ...current, dueDate: event.target.value }))}
										/>
									</label>

									<label>
										Assignee
										<select
											value={taskForm.assigneeId}
											onChange={(event) => setTaskForm((current) => ({ ...current, assigneeId: event.target.value }))}
										>
											<option value="">Unassigned</option>
											{assignableMembers.map((member) => (
												<option key={member.id} value={member.id}>
													{member.name} ({member.role})
												</option>
											))}
										</select>
									</label>

									<button className="primary-button" type="submit" disabled={busy}>
										Create task
									</button>
								</form>
							</section>
						)}
					</>
				)}
			</section>
		</main>
	);
}

export default function App() {
	const [mode, setMode] = useState('login');
	const [authForm, setAuthForm] = useState(emptyAuthForm);
	const [authUser, setAuthUser] = useState(null);
	const [dashboard, setDashboard] = useState(null);
	const [loading, setLoading] = useState(Boolean(getToken()));
	const [error, setError] = useState('');
	const [selectedProjectId, setSelectedProjectId] = useState(null);

	async function loadWorkspace(projectId) {
		const [dashboardResponse, projectsResponse] = await Promise.all([
			apiRequest('/api/dashboard'),
			apiRequest('/api/projects'),
		]);

		const projects = projectsResponse.projects;
		const preferredProjectId = projectId || selectedProjectId || projects[0]?.id || null;

		setDashboard({
			...dashboardResponse,
			projects,
		});

		if (!preferredProjectId) {
			setSelectedProjectId(null);
			return null;
		}

		setSelectedProjectId(preferredProjectId);
		const projectResponse = await apiRequest(`/api/projects/${preferredProjectId}`);

		setDashboard((current) => ({
			...current,
			projects,
			currentProject: projectResponse,
		}));

		return projectResponse;
	}

	useEffect(() => {
		const token = getToken();
		if (!token) {
			setLoading(false);
			return;
		}

		apiRequest('/api/auth/me')
			.then(async (response) => {
				setAuthUser(response.user);
				await loadWorkspace();
			})
			.catch(() => {
				clearToken();
				setAuthUser(null);
			})
			.finally(() => setLoading(false));
	}, []);

	const selectedProject = dashboard?.currentProject || null;

	async function handleAuthSubmit(event) {
		event.preventDefault();
		setLoading(true);
		setError('');

		try {
			const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
			const payload = mode === 'login'
				? { email: authForm.email, password: authForm.password }
				: authForm;

			const response = await apiRequest(endpoint, {
				method: 'POST',
				body: payload,
			});

			setToken(response.token);
			setAuthUser(response.user);
			setAuthForm(emptyAuthForm);
			await loadWorkspace();
		} catch (submissionError) {
			setError(submissionError.message);
		} finally {
			setLoading(false);
		}
	}

	async function reloadWorkspace(projectId) {
		const currentProject = await loadWorkspace(projectId || selectedProjectId);
		return currentProject;
	}

	function handleLogout() {
		clearToken();
		setAuthUser(null);
		setDashboard(null);
		setSelectedProjectId(null);
		setAuthForm(emptyAuthForm);
		setMode('login');
	}

	if (loading && !authUser) {
		return (
			<div className="loading-screen">
				<div className="loading-card">Loading workspace...</div>
			</div>
		);
	}

	if (!authUser) {
		return (
			<AuthScreen
				mode={mode}
				setMode={setMode}
				authForm={authForm}
				setAuthForm={setAuthForm}
				onSubmit={handleAuthSubmit}
				loading={loading}
				error={error}
			/>
		);
	}

	return dashboard ? (
		<DashboardScreen
			user={authUser}
			dashboard={dashboard}
			selectedProject={selectedProject}
			setSelectedProjectId={setSelectedProjectId}
			reloadWorkspace={reloadWorkspace}
			onLogout={handleLogout}
		/>
	) : (
		<div className="loading-screen">
			<div className="loading-card">Loading dashboard...</div>
		</div>
	);
}