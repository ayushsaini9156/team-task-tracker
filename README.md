# Team Task Tracker

Team Task Tracker is a full-stack project management app with signup/login, project membership, task assignment, role-based access control, and a dashboard for overdue work.

## Stack

- React + Vite frontend
- Express REST API
- MongoDB database with `mongoose`
- JWT authentication and bcrypt password hashing

## Features

- Signup and login
- Project creation and member management
- Admin/member project roles
- Task creation, assignment, status updates, and overdue tracking
- Dashboard totals for tasks, status distribution, and overdue items

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the example environment file and set a strong secret:

```bash
copy .env.example .env
```

3. Start the app in development mode:

```bash
npm run dev
```

4. Make sure MongoDB is running locally or update `MONGODB_URI` to your Atlas connection string.
5. Open the frontend at the Vite dev server URL shown in the terminal.

## Demo Accounts

The database seeds two sample users on first launch:

- `admin@teamtask.local` / `Demo123!`
- `member@teamtask.local` / `Demo123!`

The seeded project includes tasks and overdue examples so the dashboard is immediately usable.

## Production Build

```bash
npm run build
npm start
```

The Express server serves the built frontend from `dist` in production.

## Railway Deployment

1. Create a Railway service from this repository.
2. Set `JWT_SECRET` in Railway variables.
3. Set `MONGODB_URI` to your Railway MongoDB add-on or Atlas connection string.
4. Set `PORT` to the Railway-provided value if needed.
5. Use `npm install`, `npm run build`, and `npm start` as the build/start commands.

## API Summary

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/dashboard`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:projectId`
- `POST /api/projects/:projectId/members`
- `GET /api/projects/:projectId/tasks`
- `POST /api/projects/:projectId/tasks`
- `PATCH /api/tasks/:taskId`
