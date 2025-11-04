// This route is deprecated - use /api/realtime instead
import { NextRequest } from "next/server"

export async function GET(request: NextRequest) {
    return new Response("This endpoint is deprecated. Use /api/realtime instead.", {
        status: 301,
        headers: {
            'Location': '/api/realtime'
        }
    })
}