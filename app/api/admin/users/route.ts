import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { hashPassword } from '@/lib/password'
import { cacheHeaders } from '@/lib/cache'

// Cache users list for 5 minutes
export const revalidate = 300 // ISR revalidation

export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient()

    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, role, is_active, created_at')
      .order('created_at', { ascending: false })

    if (error) throw error

    const response = NextResponse.json(data)
    
    // Add cache headers
    Object.entries(cacheHeaders.short).forEach(([key, value]) => {
      response.headers.set(key, value)
    })

    return response
  } catch (error) {
    console.error('[v0] Error fetching users:', error)
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const { name, email, role } = await request.json()

  if (!name || !email || !role) {
    return NextResponse.json(
      { error: 'Name, email, and role are required' },
      { status: 400 }
    )
  }

  const supabase = await getSupabaseServerClient()

  try {
    // Generate a temporary password
    const tempPassword = Math.random().toString(36).slice(-8)

    // Hash the password
    const hashedPassword = await hashPassword(tempPassword)

    // Create user
    const { data, error } = await supabase
      .from('users')
      .insert({
        name,
        email,
        role,
        password: hashedPassword,
      })
      .select()

    if (error) throw error

    return NextResponse.json({
      message: 'User created successfully',
      tempPassword,
      user: data[0],
    })
  } catch (error) {
    console.error('[v0] Error creating user:', error)
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    )
  }
}
