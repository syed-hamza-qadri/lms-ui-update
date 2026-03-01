import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { comparePassword } from '@/lib/password'
import { z } from 'zod'

// Validation schema
const LoginSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters'),
  password: z.string()
    .min(6, 'Password must be at least 6 characters')
    .max(100, 'Password must be less than 100 characters'),
})

export async function POST(request: NextRequest) {
  try {
    // Validate input
    const body = await request.json()
    const validation = LoginSchema.safeParse(body)
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation error', details: validation.error.errors },
        { status: 400 }
      )
    }
    
    const { name, password } = validation.data

    const supabase = await getSupabaseServerClient()

    // Verify employee/manager credentials using name - allow all non-admin roles
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, name, email, password, role')
      .eq('name', name)
      .in('role', ['employee', 'manager', 'caller', 'lead_generator'])

    if (userError) throw userError
    
    if (!userData || userData.length === 0) {
      console.log('[v0] Login failed: User not found with name:', name)
      return NextResponse.json(
        { error: 'User not found. Please contact admin to create your account.' },
        { status: 401 }
      )
    }

    const user = userData[0]
    console.log('[v0] Found user:', user.name, user.email, user.role)

    // Verify password using bcryptjs
    const passwordMatch = await comparePassword(password, user.password)
    if (!passwordMatch) {
      console.log('[v0] Login failed: Password mismatch for', name)
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      )
    }

    // Create session in database with minimal required data
    const { randomUUID } = await import('crypto')
    const token = randomUUID()
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    const { error: sessionError } = await supabase
      .from('sessions')
      .insert({
        user_id: user.id,
        token,
        role: user.role,
        user_name: user.name,
        expires_at: expiresAt.toISOString(),
      })

    if (sessionError) {
      throw new Error(`Failed to create session: ${sessionError.message}`)
    }

    // Return user data with token in secure HttpOnly cookie
    const { password: _, ...userWithoutPassword } = user

    const response = NextResponse.json({
      user: userWithoutPassword,
      message: 'Login successful',
    })

    // Set HttpOnly secure cookie (cannot be accessed by JavaScript)
    response.cookies.set('session_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
      path: '/',
    })

    return response
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[v0] Login error:', errorMessage, error)
    return NextResponse.json(
      { 
        error: 'Login failed',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      },
      { status: 500 }
    )
  }
}

