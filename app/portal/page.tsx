'use client'

import React from "react"
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, ArrowLeft, LockKeyhole, User } from 'lucide-react'
import Link from 'next/link'

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
      <main className="min-h-screen bg-[#fcfcfc] flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#fcfcfc] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-100/40 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-100/40 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md z-10">
        <Link 
          href="/" 
          className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors mb-8 group"
        >
          <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
          Back to Home
        </Link>
        
        <Card className="border-gray-200/60 bg-white/80 backdrop-blur-xl shadow-2xl shadow-blue-900/5 rounded-3xl overflow-hidden">
          <div className="h-2 w-full bg-gradient-to-r from-blue-500 to-indigo-500" />
          <CardHeader className="pt-8 pb-6 px-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-6">
              <LockKeyhole className="w-8 h-8 text-blue-600" />
            </div>
            <CardTitle className="text-3xl font-extrabold text-gray-900 tracking-tight">Welcome Back</CardTitle>
            <CardDescription className="text-base text-gray-500 mt-2">
              Sign in to access your employee portal
            </CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Full Name</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <Input
                    type="text"
                    placeholder="Enter your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={loginLoading}
                    required
                    className="h-12 pl-11 rounded-xl border-gray-200 focus:ring-blue-500 focus:border-blue-500 bg-white/50"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <LockKeyhole className="h-5 w-5 text-gray-400" />
                  </div>
                  <Input
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loginLoading}
                    required
                    className="h-12 pl-11 rounded-xl border-gray-200 focus:ring-blue-500 focus:border-blue-500 bg-white/50"
                  />
                </div>
              </div>
              
              {loginError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-100 animate-in fade-in slide-in-from-top-2">
                  <p className="text-sm text-red-600 font-medium text-center">{loginError}</p>
                </div>
              )}
              
              <Button 
                type="submit" 
                disabled={loginLoading} 
                className="w-full h-12 rounded-xl text-base font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20 transition-all mt-2"
              >
                {loginLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
