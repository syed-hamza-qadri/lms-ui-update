import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
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

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    )

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
    const sessionUrl = new URL('/api/sessions', request.nextUrl.origin).toString()
    const sessionResponse = await fetch(
      sessionUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          role: user.role,
          userName: user.name,
        }),
      }
    )

    if (!sessionResponse.ok) throw new Error('Failed to create session')
    const sessionData = await sessionResponse.json()

    // Return user data with token in secure HttpOnly cookie
    const { password: _, ...userWithoutPassword } = user

    const response = NextResponse.json({
      user: userWithoutPassword,
      message: 'Login successful',
    })

    // Set HttpOnly secure cookie (cannot be accessed by JavaScript)
    response.cookies.set('session_token', sessionData.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
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

