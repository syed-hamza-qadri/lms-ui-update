import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase-server'
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

  const supabase = await getSupabaseServerClient()

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
