import { handleMcpRequest } from "../../features/mcp/runtime"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60
export const POST = handleMcpRequest
export const GET = handleMcpRequest
export const DELETE = handleMcpRequest
