import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { randomUUID } from 'crypto'

export async function POST(request: NextRequest) {
  const { userId, role, userName } = await request.json()

  if (!userId || !role || !userName) {
    return NextResponse.json(
      { error: 'User ID, role, and name are required' },
      { status: 400 }
    )
  }

  const supabase = await getSupabaseServerClient()

  try {
    // Generate token
    const token = randomUUID()
    
    // Session expires in 30 days
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    // Create session with minimal required data
    const { data, error } = await supabase
      .from('sessions')
      .insert({
        user_id: userId,
        token,
        role,
        user_name: userName,
        expires_at: expiresAt,
      })
      .select()

    if (error) throw error

    return NextResponse.json({
      token,
      session: data[0],
    })
  } catch (error) {
    console.error('[Session] Error creating session:', error)
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  // Get token from HttpOnly cookie
  const token = request.cookies.get('session_token')?.value

  if (!token) {
    return NextResponse.json(
      { error: 'Token is required' },
      { status: 400 }
    )
  }

  const supabase = await getSupabaseServerClient()

  try {
    // Delete session from database
    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('token', token)

    if (error) throw error

    // Clear the HttpOnly cookie
    const response = NextResponse.json({
      message: 'Session deleted successfully',
    })

    response.cookies.set('session_token', '', {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 0,
      path: '/',
    })

    return response
  } catch (error) {
    console.error('[v0] Error deleting session:', error)
    return NextResponse.json(
      { error: 'Failed to delete session' },
      { status: 500 }
    )
  }
}
