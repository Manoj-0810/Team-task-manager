TaskFlow — Team Task Manager
=============================

A full-stack team task management web app with role-based access control,
project management, task tracking, and a real-time dashboard.

LIVE URL
--------
team-task-manager-production-a245.up.railway.app

GITHUB REPO
-----------
[Add your GitHub URL]

---

TECH STACK
----------
- Backend:  Node.js (zero external dependencies — uses only built-in modules)
- Database: JSON file-based storage (db.json) — no setup required
- Auth:     Custom JWT (HMAC-SHA256) + password hashing
- Frontend: Vanilla JS SPA (no framework needed)
- Deploy:   Railway (one-click)

---

FEATURES
--------

Authentication
  • Signup / Login with email & password
  • JWT-based session (stored in localStorage)
  • Protected routes — all API endpoints require a valid token

Projects
  • Create, view, and delete projects
  • Role-based access: Admin vs Member
  • Progress tracking (% tasks completed)

Team Management
  • Admins can add members by email
  • Admins can remove members
  • Members can view project but not manage team

Tasks
  • Create tasks with title, description, assignee, due date, priority
  • Status flow: To Do → In Progress → Review → Done
  • Quick-complete toggle directly from task list
  • Filter tasks by status
  • Full task detail edit modal

Dashboard
  • Summary stats: projects, tasks, completed, overdue
  • Visual bar chart of task status distribution
  • Overdue task alerts
  • Recent tasks list

---

API ENDPOINTS
-------------

Auth
  POST   /api/auth/signup     { name, email, password }
  POST   /api/auth/login      { email, password }
  GET    /api/auth/me

Projects
  GET    /api/projects
  POST   /api/projects        { name, description }
  GET    /api/projects/:id
  DELETE /api/projects/:id

Members
  POST   /api/projects/:id/members        { email, role }
  DELETE /api/projects/:id/members/:uid

Tasks
  GET    /api/projects/:id/tasks
  POST   /api/projects/:id/tasks  { title, description, assigneeId, dueDate, priority }
  PATCH  /api/tasks/:id            { title, description, status, priority, dueDate, assigneeId }
  DELETE /api/tasks/:id

Dashboard
  GET    /api/dashboard

Users
  GET    /api/users?email=query

---

ROLE-BASED ACCESS CONTROL
--------------------------

Admin
  - Create/delete projects
  - Add/remove team members
  - Create, edit, delete any task
  - Assign tasks to team members

Member
  - View project and tasks
  - Create tasks
  - Update task status/details
  - Cannot manage team members

---

LOCAL DEVELOPMENT
-----------------

1. Clone the repository
   git clone <your-repo-url>
   cd taskflow

2. Run the server (no npm install needed!)
   node backend/server.js

3. Open http://localhost:3000 in your browser

The app serves the frontend automatically from backend/server.js.
Database file (db.json) is created automatically on first run.

---

DEPLOYMENT ON RAILWAY
---------------------

1. Push code to GitHub:
   git init
   git add .
   git commit -m "initial commit"
   git remote add origin <your-github-repo>
   git push -u origin main

2. Go to railway.app → New Project → Deploy from GitHub

3. Select your repository

4. Railway auto-detects Node.js and runs:  node backend/server.js

5. Click "Generate Domain" in Railway dashboard for a public URL

6. Done! Your app is live.

No environment variables required. No database setup.
The app uses a JSON file for storage (persists across deploys with Railway volumes if needed).

---

PROJECT STRUCTURE
-----------------

taskflow/
├── backend/
│   ├── server.js       ← Express-free HTTP server + all REST API routes
│   ├── db.json         ← Auto-created JSON database
│   └── package.json
├── frontend/
│   └── public/
│       └── index.html  ← Complete SPA (HTML + CSS + JS in one file)
├── package.json        ← Root (for Railway)
├── railway.toml        ← Railway config
└── README.txt

---

DEMO VIDEO SCRIPT (2-5 min)
----------------------------

0:00 - Introduction: "Hi, this is TaskFlow — a full-stack team task manager"
0:20 - Show signup flow: create two accounts
0:45 - Create a project, show the dashboard updating
1:10 - Add a team member (use the second account's email)
1:30 - Create several tasks with different priorities and due dates
2:00 - Show task filtering by status
2:20 - Update task statuses, show progress bar updating
2:40 - Show overdue task highlighting on dashboard
3:00 - Login as second user (member) — show restricted permissions
3:30 - Show the dashboard stats and bar chart
4:00 - Close: show Railway deployment URL

---

AUTHOR
------
Built for the Full-Stack Assignment
Timeline: ~10 hours
Stack chosen for: zero-dependency deployment, Railway compatibility
