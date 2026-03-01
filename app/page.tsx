'use client'

import React from "react"

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowRight, ShieldCheck, Users } from 'lucide-react'

export default function Home() {
  const router = useRouter()
  const [adminPassword, setAdminPassword] = useState('')
  const [showAdminForm, setShowAdminForm] = useState(false)
  const [error, setError] = useState('')

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: adminPassword }),
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.error || 'Incorrect password')
        setAdminPassword('')
        return
      }

      // Token is in HttpOnly cookie, no need to store manually
      localStorage.setItem('admin_role', 'admin')
      router.push('/admin')
    } catch (err) {
      setError('Login failed')
      setAdminPassword('')
    }
  }

  return (
    <main className="min-h-screen bg-[#fcfcfc] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-100/50 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-100/50 blur-[100px] pointer-events-none" />

      <div className="w-full max-w-5xl z-10">
        <div className="text-center mb-16 space-y-4">
          <div className="inline-flex items-center justify-center px-4 py-1.5 mb-4 rounded-full bg-white border border-gray-200 shadow-sm">
            <span className="text-xs font-semibold tracking-wide text-gray-600 uppercase">System Access</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold text-gray-900 tracking-tight">
            Lead Management <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">System</span>
          </h1>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto font-light">
            Streamline your sales pipeline, track employee performance, and manage leads efficiently from a single unified platform.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Employee Portal */}
          <Card 
            className="group relative overflow-hidden border-gray-200/60 bg-white/80 backdrop-blur-xl hover:shadow-2xl hover:shadow-blue-500/10 transition-all duration-300 cursor-pointer rounded-3xl" 
            onClick={() => router.push('/portal')}
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-blue-600 transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300" />
            <CardHeader className="pb-4 pt-8 px-8">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
              <CardTitle className="text-2xl font-bold text-gray-900">Employee Portal</CardTitle>
              <CardDescription className="text-base text-gray-500 mt-2">Access your workspace and manage assigned leads</CardDescription>
            </CardHeader>
            <CardContent className="px-8 pb-8">
              <p className="text-sm text-gray-500 mb-8 leading-relaxed">
                Browse leads by niche and city, track responses, schedule follow-ups, and monitor your daily performance metrics.
              </p>
              <Button className="w-full rounded-xl h-12 text-base font-medium bg-gray-900 hover:bg-gray-800 text-white group-hover:bg-blue-600 transition-colors">
                Enter Portal
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </CardContent>
          </Card>

          {/* Admin Portal */}
          <Card className="group relative overflow-hidden border-gray-200/60 bg-white/80 backdrop-blur-xl hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-300 rounded-3xl">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-400 to-indigo-600 transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300" />
            <CardHeader className="pb-4 pt-8 px-8">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <ShieldCheck className="w-6 h-6 text-indigo-600" />
              </div>
              <CardTitle className="text-2xl font-bold text-gray-900">Admin Portal</CardTitle>
              <CardDescription className="text-base text-gray-500 mt-2">System configuration and user management</CardDescription>
            </CardHeader>
            <CardContent className="px-8 pb-8">
              {!showAdminForm ? (
                <div className="flex flex-col h-full justify-between">
                  <p className="text-sm text-gray-500 mb-8 leading-relaxed">
                    Protected administrative access to manage employee accounts, view system-wide activity logs, and configure lead data.
                  </p>
                  <Button 
                    onClick={() => setShowAdminForm(true)} 
                    variant="outline"
                    className="w-full rounded-xl h-12 text-base font-medium border-gray-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-colors"
                  >
                    Access Admin
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleAdminLogin} className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">Admin Password</label>
                    <Input
                      type="password"
                      placeholder="Enter admin password"
                      value={adminPassword}
                      onChange={(e) => {
                        setAdminPassword(e.target.value)
                        setError('')
                      }}
                      autoFocus
                      className="h-12 rounded-xl border-gray-200 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  {error && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-100">
                      <p className="text-sm text-red-600 font-medium">{error}</p>
                    </div>
                  )}
                  <div className="flex gap-3 pt-2">
                    <Button type="submit" className="flex-1 rounded-xl h-12 bg-indigo-600 hover:bg-indigo-700 text-white">
                      Login
                    </Button>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      className="flex-1 rounded-xl h-12 text-gray-500 hover:text-gray-700 hover:bg-gray-100" 
                      onClick={() => {
                        setShowAdminForm(false)
                        setAdminPassword('')
                        setError('')
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
