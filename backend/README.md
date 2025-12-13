# Kaltech Backend - Custom Auth + MongoDB

Your own authentication system with MongoDB. Users login with email/password, then get redirected to Zoho Workspace.

## Setup

### 1. Install MongoDB

**Windows:**
Download from https://www.mongodb.com/try/download/community

**Mac:**
```bash
brew install mongodb-community
brew services start mongodb-community
```

**Linux:**
```bash
sudo apt-get install mongodb
sudo systemctl start mongodb
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Copy `.env.example` to `.env` and update values:
```bash
cp .env.example .env
```

### 4. Start Server

```bash
npm start
```

## How It Works

### User Flow:
1. User registers with email/password
2. Admin authorizes user (one-time Zoho OAuth)
3. User logs in with email/password
4. Backend validates credentials against MongoDB
5. Backend returns stored Zoho tokens
6. User is redirected to Zoho Workspace
7. **NO Zoho login required!**

### Admin Flow:
1. Admin logs in to admin panel
2. Sees list of registered users
3. Clicks "Authorize" for pending users
4. Completes Zoho OAuth (stores tokens for that user)
5. User can now login seamlessly

## API Endpoints

### User Auth
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login with email/password

### Admin
- `POST /api/admin/login` - Admin login
- `GET /api/admin/users` - Get all users
- `POST /api/admin/authorize-user` - Generate Zoho auth URL
- `DELETE /api/admin/users/:email` - Delete user
- `GET /admin/callback` - Zoho OAuth callback

## Database Schema

```javascript
User {
  email: String (unique)
  password: String (hashed)
  zohoAccessToken: String
  zohoRefreshToken: String
  zohoTokenExpiresAt: Date
  isAuthorized: Boolean
  createdAt: Date
  updatedAt: Date
}
```

## Security

- Passwords hashed with bcrypt (10 rounds)
- JWT tokens for sessions
- Zoho tokens stored encrypted in MongoDB
- Admin authentication required for user management
- Automatic token refresh

## Production

1. Use MongoDB Atlas (cloud database)
2. Set strong JWT_SECRET
3. Change admin credentials
4. Use environment variables
5. Enable HTTPS
6. Set proper CORS origins
