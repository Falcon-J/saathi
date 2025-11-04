# Saathi Architecture Documentation

## Folder Structure Overview

The project has been restructured to follow Next.js 13+ App Router best practices with a clean separation of concerns:

```
saathi/
├── app/                          # Next.js App Router
│   ├── layout.tsx               # Root layout
│   ├── page.tsx                 # Landing page
│   ├── tasks/                   # Main task management feature
│   │   ├── page.tsx             # Tasks dashboard
│   │   ├── actions.ts           # Server Actions (CRUD operations)
│   │   ├── stream/route.ts      # SSE endpoint for real-time updates
│   │   └── components/          # Task-specific components
│   │       ├── TaskList.tsx     # Main task list container
│   │       ├── TaskItem.tsx     # Individual task component
│   │       ├── AddTaskForm.tsx  # Task creation form
│   │       └── TaskToolbar.tsx  # Filtering and sorting
│   ├── api/                     # API routes
│   │   └── users/route.ts       # User management API
│   └── (auth)/                  # Authentication routes (grouped)
│       ├── login/page.tsx       # Login page
│       ├── register/page.tsx    # Registration page
│       └── actions.ts           # Auth-related server actions
├── lib/                         # Core utilities and configurations
│   ├── redis.ts                 # Upstash Redis client with fallback
│   ├── sse.ts                   # Server-Sent Events utilities
│   ├── auth-simple.ts           # Authentication logic
│   ├── types.ts                 # Shared TypeScript interfaces
│   ├── utils.ts                 # Common utilities
│   └── env.ts                   # Environment configuration
├── components/                  # Reusable UI components
│   ├── ui/                      # Primitive UI components (Radix-based)
│   ├── Header.tsx               # Application header
│   ├── Footer.tsx               # Application footer
│   └── auth-form.tsx            # Authentication form
├── hooks/                       # Custom React hooks
│   ├── useSSE.ts                # Server-Sent Events hook
│   └── useTaskStore.ts          # Zustand store for task state
├── styles/                      # Global styles and themes
│   ├── globals.css              # Global CSS with Tailwind
│   └── theme.css                # Theme-specific customizations
├── proxy.ts                     # Route protection and auth proxy
├── next.config.js               # Next.js configuration
├── package.json                 # Dependencies and scripts
├── tsconfig.json                # TypeScript configuration
└── .env.local                   # Environment variables
```

## Key Design Principles

### 1. Feature-Based Organization

- Each major feature (tasks, auth) has its own directory
- Components are co-located with their related features
- Server actions are grouped by feature domain

### 2. Server Actions First

- `app/tasks/actions.ts` contains all task-related server operations
- Direct callable functions from components (addTask, updateTask, deleteTask, toggleTask)
- Built-in form handling and validation
- Automatic revalidation with `revalidatePath`

### 3. Real-time Architecture

- `app/tasks/stream/route.ts` provides SSE endpoint
- Redis Streams for broadcasting task changes
- `hooks/useSSE.ts` for client-side SSE consumption
- Automatic reconnection and error handling

### 4. Type Safety

- `lib/types.ts` contains all shared TypeScript interfaces
- Consistent type definitions across client and server
- Full type safety for API responses and form data

### 5. Authentication & Security

- `proxy.ts` handles route protection
- Session-based authentication with Redis storage
- Secure HTTP-only cookies
- Input validation and sanitization

## Data Flow

### Task Creation Flow

1. User submits form in `AddTaskForm.tsx`
2. Form calls `addTask()` server action
3. Server action validates input and stores in Redis
4. Redis Stream broadcasts change
5. SSE endpoint sends update to all connected clients
6. Client receives update via `useSSE` hook
7. UI updates automatically

### Real-time Updates

1. Task change occurs (create, update, delete, toggle)
2. Server action broadcasts to Redis Stream (`task-updates`)
3. SSE route (`/tasks/stream`) listens to stream
4. Connected clients receive SSE message
5. `useSSE` hook processes message
6. Component state updates trigger re-render

### Authentication Flow

1. User submits login/register form
2. `auth-form.tsx` calls server action from `(auth)/actions.ts`
3. Server validates credentials and creates session
4. Session stored in Redis with HTTP-only cookie
5. `proxy.ts` protects routes based on session
6. Automatic redirects for auth/unauth users

## Component Architecture

### Task Components

- **TaskList.tsx**: Container component managing task state and filters
- **TaskItem.tsx**: Individual task with actions (toggle, edit, delete)
- **AddTaskForm.tsx**: Form for creating new tasks with validation
- **TaskToolbar.tsx**: Filtering, sorting, and task statistics

### Layout Components

- **Header.tsx**: Navigation with user menu and auth state
- **Footer.tsx**: Site footer with links and branding
- **auth-form.tsx**: Unified login/register form component

### Hooks

- **useSSE.ts**: Server-Sent Events connection management
- **useTaskStore.ts**: Zustand store for task state management

## Server Actions

### Task Actions (`app/tasks/actions.ts`)

```typescript
addTask(workspaceId, title, description?, dueDate?, assigneeEmail?, priority?)
updateTask(taskId, updates)
deleteTask(taskId)
toggleTask(taskId)
getTasks(workspaceId)
```

### Auth Actions (`(auth)/actions.ts`)

```typescript
login(email, password);
signup(email, username, password);
logout();
getSession();
```

## API Routes

### SSE Endpoint (`app/tasks/stream/route.ts`)

- Provides Server-Sent Events for real-time updates
- Listens to Redis Stream `task-updates`
- Handles client connections and disconnections
- Sends heartbeat messages for connection health

### User API (`app/api/users/route.ts`)

- GET: Retrieve current user information
- PUT: Update user profile (username, etc.)
- Secure session validation

## State Management

### Client State (Zustand)

- Task list state and filters
- Real-time synchronization with server
- Optimistic updates for better UX

### Server State (Redis)

- User sessions and authentication
- Task data storage
- Real-time event streaming

## Security Features

### Route Protection

- Proxy validates sessions before protected routes
- Automatic redirects for auth flows
- Cookie-based session management

### Input Validation

- Server-side validation for all inputs
- XSS prevention with input sanitization
- Rate limiting for API endpoints

### Authentication

- Secure password handling
- HTTP-only cookies for sessions
- Session expiration and cleanup

## Performance Optimizations

### Real-time Efficiency

- Redis Streams for scalable event broadcasting
- SSE for low-latency updates
- Connection pooling and cleanup

### Client Optimizations

- Optimistic UI updates
- Component memoization
- Efficient re-rendering with Zustand

### Server Optimizations

- Server Actions for reduced client-server roundtrips
- Redis connection pooling
- Efficient data serialization

## Development Workflow

### Adding New Features

1. Define types in `lib/types.ts`
2. Create server actions in appropriate `actions.ts`
3. Build UI components in feature directory
4. Add real-time updates if needed
5. Update proxy for route protection

### Testing Strategy

- Unit tests for server actions
- Component testing with React Testing Library
- Integration tests for real-time features
- E2E tests for critical user flows

This architecture provides a scalable, maintainable foundation for the collaborative task management application while following Next.js best practices and modern React patterns.
