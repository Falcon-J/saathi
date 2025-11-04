# Saathi - Collaborative Task Manager

A real-time collaborative task management application built with **Next.js 16**, **TypeScript**, and **Redis**.

## ✨ Features

- **Real-time Collaboration** - Tasks sync instantly across all users
- **Multi-tenant Workspaces** - Separate spaces for different teams
- **Role-based Permissions** - Workspace owners and members
- **Team Invitations** - Email-based workspace invitations
- **Task Management** - Full CRUD with priority levels and due dates
- **Responsive Design** - Works on desktop and mobile
- **Type Safety** - Full TypeScript implementation

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm

### Installation

```bash
# Clone and install
git clone https://github.com/yourusername/saathi.git
cd saathi
pnpm install

# Start development server
pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000)

### Demo Account

- **Email**: `demo@saathi.build`
- **Password**: `demo`

## 🔧 Environment Setup

### Development

Works out of the box with mock Redis. Copy `.env.example` to `.env.local` if needed.

### Production

Required environment variables:

```env
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
NEXTAUTH_SECRET=your-secure-secret
NEXTAUTH_URL=https://your-domain.com
```

## 🏗️ Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript
- **Styling**: Tailwind CSS, Radix UI
- **Backend**: Next.js Server Actions
- **Database**: Redis (Upstash)
- **Real-time**: Server-Sent Events
- **Authentication**: Session-based auth

## 🚀 Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project in [Vercel](https://vercel.com)
3. Add environment variables
4. Deploy

### Redis Setup

1. Create free account at [Upstash](https://upstash.com)
2. Create Redis database
3. Copy REST URL and token to environment variables

## 🧪 Testing Real-time Features

1. Open app in two browser windows
2. Login with different accounts
3. Create workspace and invite users
4. Watch tasks sync in real-time

## 📊 Architecture

```
User Action → Server Action → Redis Event → SSE → All Users
```

- **Server Actions** for type-safe backend operations
- **Redis events** for real-time data synchronization
- **SSE** for pushing updates to connected clients
- **Optimistic UI** for instant user feedback

## 🔒 Security

- Role-based access control
- Server-side input validation
- Secure session management
- XSS protection
- Rate limiting

## 🛠️ Development

```bash
pnpm dev          # Development server
pnpm build        # Production build
pnpm start        # Production server
pnpm lint         # ESLint
pnpm type-check   # TypeScript check
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

Built with ❤️ using modern web technologies
"# saathi"
