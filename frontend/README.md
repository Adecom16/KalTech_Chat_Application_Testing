# Kaltech Frontend - Custom Auth

React frontend for Kaltech custom authentication with MongoDB backend.

## Setup

```bash
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`

## Pages

- `/` - User login
- `/register` - User registration
- `/admin` - Admin login
- `/admin/dashboard` - Admin panel (user management)

## Features

- Custom Kaltech branded UI
- User registration and login
- Admin panel for user management
- Zoho OAuth authorization (admin only)
- Direct redirect to Zoho Workspace after login
- Responsive design with Tailwind CSS

## How It Works

### User Flow:
1. Register at `/register`
2. Wait for admin to authorize
3. Login at `/` with email/password
4. Redirected to Zoho Workspace

### Admin Flow:
1. Login at `/admin`
2. See all registered users
3. Click "Authorize" for pending users
4. Complete Zoho OAuth
5. User can now login seamlessly

## Configuration

Backend API URL is set to `http://localhost:3001`

To change this, update all fetch calls in:
- `src/pages/Login.jsx`
- `src/pages/Register.jsx`
- `src/pages/AdminLogin.jsx`
- `src/pages/AdminDashboard.jsx`

## Build for Production

```bash
npm run build
```

Built files will be in `dist/` folder.
