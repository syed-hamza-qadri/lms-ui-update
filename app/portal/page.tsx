'use client'

import React from "react"
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'

export default function PortalPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')

  // Check if user is already logged in using server-side session
  useEffect(() => {
    const validateAndRoute = async () => {
      try {
        const response = await fetch('/api/sessions/validate', {
          credentials: 'include',
        })

        if (response.ok) {
          const sessionData = await response.json()
          // Route based on role
          if (sessionData.user_role === 'admin') {
            router.push('/admin')
          } else if (sessionData.user_role === 'manager') {
            router.push('/portal/manager')
          } else if (sessionData.user_role === 'lead_generator') {
            router.push('/portal/lead-generator')
          } else if (sessionData.user_role === 'caller') {
            router.push('/portal/caller')
          }
        } else {
          setLoading(false)
        }
      } catch (error) {
        console.error('[Portal] Session validation error:', error)
        setLoading(false)
      }
    }

    validateAndRoute()
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError('')
    setLoginLoading(true)

    try {
      const response = await fetch('/api/portal/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast({
          title: 'Login Failed',
          description: data.error || 'Invalid email or password',
          variant: 'destructive',
        })
        setLoginError(data.error || 'Login failed')
        return
      }

      toast({
        title: 'Login Successful',
        description: `Welcome, ${data.user.name}!`,
      })

      // Route based on role
      const role = data.user.role
      if (role === 'admin') {
        router.push('/admin')
      } else if (role === 'manager') {
        router.push('/portal/manager')
      } else if (role === 'lead_generator') {
        router.push('/portal/lead-generator')
      } else if (role === 'caller') {
        router.push('/portal/caller')
      }
    } catch (error) {
      console.error('[Portal] Login error:', error)
      toast({
        title: 'Error',
        description: 'An error occurred during login',
        variant: 'destructive',
      })
      setLoginError('An error occurred during login')
    } finally {
      setLoginLoading(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-background p-8 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Portal Login</CardTitle>
          <CardDescription>Sign in to access your portal</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground block mb-2">Name</label>
              <Input
                type="text"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loginLoading}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-2">Password</label>
              <Input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loginLoading}
                required
              />
            </div>
            {loginError && <p className="text-sm text-destructive">{loginError}</p>}
            <Button type="submit" disabled={loginLoading} className="w-full">
              {loginLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Logging in...
                </>
              ) : (
                'Login'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
