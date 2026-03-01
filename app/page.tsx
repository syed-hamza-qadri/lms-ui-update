'use client'

import React from "react"

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

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
    <main className="min-h-screen bg-gradient-to-br from-primary/5 to-secondary/5 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-2">Lead Management System</h1>
          <p className="text-lg text-muted-foreground">Manage your sales leads efficiently</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Employee Portal */}
          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => router.push('/portal')}>
            <CardHeader>
              <CardTitle>Portal Login</CardTitle>
              <CardDescription>Access and manage your leads</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Browse leads by niche and city, track responses, and manage follow-ups
              </p>
              <Button className="w-full">Enter Portal</Button>
            </CardContent>
          </Card>

          {/* Admin Portal */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle>Admin Portal</CardTitle>
              <CardDescription>Manage system and users</CardDescription>
            </CardHeader>
            <CardContent>
              {!showAdminForm ? (
                <div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Protected admin access to manage users and view activity logs
                  </p>
                  <Button onClick={() => setShowAdminForm(true)} className="w-full">Access Admin</Button>
                </div>
              ) : (
                <form onSubmit={handleAdminLogin} className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Admin Password</label>
                    <Input
                      type="password"
                      placeholder="Enter admin password"
                      value={adminPassword}
                      onChange={(e) => {
                        setAdminPassword(e.target.value)
                        setError('')
                      }}
                      autoFocus
                    />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <div className="flex gap-2">
                    <Button type="submit" className="flex-1">Login</Button>
                    <Button type="button" variant="outline" className="flex-1 bg-transparent" onClick={() => {
                      setShowAdminForm(false)
                      setAdminPassword('')
                      setError('')
                    }}>Cancel</Button>
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
