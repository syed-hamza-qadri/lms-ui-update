import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { hashPassword } from '@/lib/password'

export async function PATCH(request: NextRequest) {
  const { userId, password } = await request.json()

  if (!userId || !password) {
    return NextResponse.json(
      { error: 'User ID and password are required' },
      { status: 400 }
    )
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: 'Password must be at least 6 characters long' },
      { status: 400 }
    )
  }

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

  try {
    // Hash the password
    const hashedPassword = await hashPassword(password)

    // Update user password
    const { data, error } = await supabase
      .from('users')
      .update({ password: hashedPassword })
      .eq('id', userId)
      .select()

    if (error) throw error

    return NextResponse.json({
      message: 'Password updated successfully',
      password: password, // Return the plain password to show in toast
      user: data[0],
    })
  } catch (error) {
    console.error('[v0] Error updating password:', error)
    return NextResponse.json(
      { error: 'Failed to update password' },
      { status: 500 }
    )
  }
}
