# Team Task Tracker

Team Task Tracker is a full-stack project management app with signup/login, project membership, task assignment, role-based access control, and a dashboard for overdue work.

## Stack

- `frontend/`: React + Vite app
- `backend/`: Express REST API
- MongoDB database with `mongoose`
- JWT authentication and bcrypt password hashing

## Project Structure

- `backend/` contains the API server, auth, and database code.
- `frontend/` contains the Vite app, UI source, and frontend build config.
- The root `package.json` is a workspace helper so you can run both apps together during local development.

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

2. Copy the example environment files and set the values for each app:

```bash
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env
```

3. Install dependencies for the workspace and start the app in development mode:

```bash
npm run dev
```

4. Make sure MongoDB is running locally or update `MONGODB_URI` in `backend/.env` to your Atlas connection string.
	If the Atlas password contains special characters such as `#`, encode them in the URI, for example `#` -> `%23`.
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

If you deploy the frontend and backend separately, Railway should use:

- backend root directory: `backend`
- frontend root directory: `frontend`

For the frontend service, use `npm run build` and publish `dist`. For the backend service, use `npm start`.

## Railway Deployment

1. Create one Railway service for the backend and one for the frontend.
2. Set the backend service root directory to `backend` and the frontend service root directory to `frontend`.
3. Set `JWT_SECRET`, `MONGODB_URI`, and `CORS_ORIGIN` on the backend service.
4. Set `VITE_API_BASE_URL` on the frontend service to the backend public URL.
5. Use `npm install`/`npm start` for the backend service and `npm install`/`npm run build` for the frontend service.

## Environment Files

- `backend/.env.example` contains `JWT_SECRET`, `MONGODB_URI`, `PORT`, and `CORS_ORIGIN`.
- `frontend/.env.example` contains `VITE_API_BASE_URL`.

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
