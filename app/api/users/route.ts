import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth-simple"
import { redis } from "@/lib/redis"

export async function GET(request: NextRequest) {
    try {
        const session = await getSession()
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        // Get user info from Redis
        const userData = await redis.get(`user:${session.email}`)
        if (!userData) {
            return NextResponse.json({ error: "User not found" }, { status: 404 })
        }

        const user = typeof userData === 'string' ? JSON.parse(userData) : userData

        // Remove sensitive information
        const { password, ...safeUser } = user

        return NextResponse.json({ user: safeUser })
    } catch (error) {
        console.error("Get user error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

export async function PUT(request: NextRequest) {
    try {
        const session = await getSession()
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const body = await request.json()
        const { username } = body

        if (!username || username.trim().length < 2) {
            return NextResponse.json({ error: "Username must be at least 2 characters" }, { status: 400 })
        }

        // Get current user data
        const userData = await redis.get(`user:${session.email}`)
        if (!userData) {
            return NextResponse.json({ error: "User not found" }, { status: 404 })
        }

        const user = typeof userData === 'string' ? JSON.parse(userData) : userData

        // Update user data
        const updatedUser = {
            ...user,
            username: username.trim(),
            updatedAt: new Date().toISOString()
        }

        await redis.set(`user:${session.email}`, JSON.stringify(updatedUser))

        // Remove sensitive information
        const { password, ...safeUser } = updatedUser

        return NextResponse.json({ user: safeUser })
    } catch (error) {
        console.error("Update user error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}