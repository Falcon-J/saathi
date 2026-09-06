import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth-simple'
import { updateProfileUsername } from '@/lib/data/profiles'
import { isSameOrigin, validateUsername } from '@/lib/supabase/auth-boundary'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ user: session }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function PUT(request: NextRequest) {
  if (!isSameOrigin(request.headers.get('origin'), request.url)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const username = body && typeof body === 'object' && 'username' in body ? body.username : undefined
  const invalid = validateUsername(username)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })
  try {
    const profile = await updateProfileUsername(session.id, (username as string).trim())
    if (!profile) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    return NextResponse.json({ user: { ...profile, email: session.email } }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'Profile service is temporarily unavailable' }, { status: 503 })
  }
}
