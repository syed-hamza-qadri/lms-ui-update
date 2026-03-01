import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { z } from 'zod'

// Admin password from server-only environment variable (NOT NEXT_PUBLIC_*)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'

// Validation schema
const AdminLoginSchema = z.object({
  password: z.string()
    .min(1, 'Password is required')
    .max(100, 'Password is invalid'),
})

export async function POST(request: NextRequest) {
  try {
    // Validate input
    const body = await request.json()
    const validation = AdminLoginSchema.safeParse(body)
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation error', details: validation.error.errors },
        { status: 400 }
      )
    }
    
    const { password } = validation.data

    // Verify admin password
    if (password !== ADMIN_PASSWORD) {
      return NextResponse.json(
        { error: 'Invalid admin password' },
        { status: 401 }
      )
    }

    // Create backend session for admin
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
              // Ignored
            }
          },
        },
      }
    )

    // Check if ANY admin already exists
    const { data: existingAdmins, error: checkError } = await supabase
      .from('users')
      .select('id, name, email, role')
      .eq('role', 'admin')

    if (checkError) throw checkError

    let adminUser: any = existingAdmins && existingAdmins.length > 0 ? existingAdmins[0] : null

    // If no admin exists, create one
    if (!adminUser) {
      console.log('[v0] No admin found, creating first admin user')
      const { data: newAdmin, error: createError } = await supabase
        .from('users')
        .insert({
          name: 'System Admin',
          email: 'admin@system.com',
          role: 'admin',
          password: '', // Password not used for admin login
        })
        .select()
        .single()

      if (createError) throw createError
      adminUser = newAdmin
      if (adminUser) {
        console.log('[v0] Created admin user:', adminUser.name)
      }
    } else {
      console.log('[v0] Admin already exists, reusing:', adminUser.name)
    }

    if (!adminUser) {
      throw new Error('Failed to get or create admin user')
    }

    // Create session for admin with minimal required data
    const sessionUrl = new URL('/api/sessions', request.nextUrl.origin).toString()
    const sessionResponse = await fetch(
      sessionUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: adminUser.id,
          role: 'admin',
          userName: adminUser.name,
        }),
      }
    )

    if (!sessionResponse.ok) {
      throw new Error('Failed to create session')
    }

    const sessionData = await sessionResponse.json()

    const response = NextResponse.json({
      message: 'Admin login successful',
      user: adminUser,
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
    console.error('Admin login error:', errorMessage, error)
    return NextResponse.json(
      { 
        error: 'Login failed',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      },
      { status: 500 }
    )
  }
}
