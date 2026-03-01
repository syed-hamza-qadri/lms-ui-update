import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
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
    // Get session - optimized query without JOIN
    const { data, error } = await supabase
      .from('sessions')
      .select('user_id, role, user_name, expires_at')
      .eq('token', token)
      .single()

    if (error || !data) {
      const response = NextResponse.json(
        { error: 'Invalid or expired session' },
        { status: 401 }
      )
      response.cookies.set('session_token', '', {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 0,
        path: '/',
      })
      return response
    }

    // Check if expired
    if (new Date(data.expires_at) < new Date()) {
      const response = NextResponse.json(
        { error: 'Session expired' },
        { status: 401 }
      )
      response.cookies.set('session_token', '', {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 0,
        path: '/',
      })
      return response
    }

    // Return session info - only essential data for auth/display
    return NextResponse.json({
      user_id: data.user_id,
      user_role: data.role,
      user_name: data.user_name,
    })
  } catch (error) {
    console.error('[Session] Validation error:', error)
    return NextResponse.json(
      { error: 'Failed to validate session' },
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
    // Delete session
    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('token', token)

    if (error) throw error

    const response = NextResponse.json({
      message: 'Session deleted',
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
