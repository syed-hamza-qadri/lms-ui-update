'use client'

import React from "react"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase-client'
import { useSession } from '@/lib/session'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus, Trash2, ArrowLeft, Key, Edit2, Eye, EyeOff, Users, ShieldCheck } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface User {
  id: string
  name: string
  email: string
  role: string
  created_at: string
}

export default function UserManagement() {
  const router = useRouter()
  const { toast } = useToast()
  const { session, loading: sessionLoading } = useSession()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [openDialog, setOpenDialog] = useState(false)
  const [openPasswordDialog, setOpenPasswordDialog] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [userToDelete, setUserToDelete] = useState<string | null>(null)
  const [formData, setFormData] = useState({ name: '', email: '', role: 'caller' })
  const [newPassword, setNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [updatingPassword, setUpdatingPassword] = useState(false)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const supabase = getSupabaseClient()

  useEffect(() => {
    if (!sessionLoading && !session) {
      router.push('/')
      return
    }
    if (sessionLoading) return
    
    // Check if user role is admin
    if (session && session.user_role !== 'admin') {
      router.push('/')
      return
    }

    if (session?.user_role === 'admin') {
      fetchUsers()
    }
  }, [session, sessionLoading, router])

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)  // Pagination limit for performance

      if (error) throw error
      setUsers(data || [])
    } catch (error) {
      console.error('[v0] Error fetching users:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleEditUser = (user: User) => {
    setFormData({ name: user.name, email: user.email, role: user.role })
    setEditingUserId(user.id)
    setOpenDialog(true)
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name || !formData.email) {
      toast({
        title: 'Validation Error',
        description: 'Please fill all fields',
        variant: 'destructive',
      })
      return
    }

    // If editing, use update handler
    if (editingUserId) {
      handleUpdateUser(e)
      return
    }

    setCreating(true)
    try {
      // Call API to create user (password will be hashed on server)
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          role: formData.role,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create user')
      }

      toast({
        title: 'User Created Successfully',
        description: `Password: ${data.tempPassword}`,
      })
      
      // Show additional info in a second toast
      setTimeout(() => {
        toast({
          title: 'Important',
          description: 'Share the temporary password with the user',
        })
      }, 500)
      setFormData({ name: '', email: '', role: 'caller' })
      setOpenDialog(false)
      fetchUsers()
    } catch (error) {
      console.error('[v0] Error creating user:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to create user'
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUserId || !formData.name || !formData.email) {
      toast({
        title: 'Validation Error',
        description: 'Please fill all fields',
        variant: 'destructive',
      })
      return
    }

    setCreating(true)
    try {
      const { data, error } = await supabase
        .from('users')
        .update({
          name: formData.name,
          email: formData.email,
          role: formData.role,
        })
        .eq('id', editingUserId)

      if (error) {
        throw new Error(error.message || JSON.stringify(error))
      }

      toast({
        title: 'Success',
        description: 'User updated successfully',
      })
      setFormData({ name: '', email: '', role: 'caller' })
      setEditingUserId(null)
      setOpenDialog(false)
      fetchUsers()
    } catch (error) {
      console.error('[v0] Error updating user:', error)
      let errorMessage = 'Failed to update user'
      
      if (error instanceof Error) {
        errorMessage = error.message
      } else if (typeof error === 'object' && error !== null) {
        const errorObj = error as any
        errorMessage = errorObj.message || errorObj.msg || JSON.stringify(error)
      }
      
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteUser = async (userId: string) => {
    setUserToDelete(userId)
    setDeleteConfirmOpen(true)
  }

  const confirmDelete = async () => {
    if (!userToDelete) return

    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', userToDelete)

      if (error) throw error
      toast({
        title: 'Success',
        description: 'User deleted successfully',
      })
      setDeleteConfirmOpen(false)
      setUserToDelete(null)
      fetchUsers()
    } catch (error) {
      console.error('[v0] Error deleting user:', error)
      toast({
        title: 'Error',
        description: 'Failed to delete user',
        variant: 'destructive',
      })
      setDeleteConfirmOpen(false)
      setUserToDelete(null)
    }
  }

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPassword || !selectedUserId) {
      toast({
        title: 'Validation Error',
        description: 'Please enter a new password',
        variant: 'destructive',
      })
      return
    }

    if (newPassword.length < 6) {
      toast({
        title: 'Validation Error',
        description: 'Password must be at least 6 characters',
        variant: 'destructive',
      })
      return
    }

    setUpdatingPassword(true)
    try {
      const response = await fetch('/api/admin/users/password', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: selectedUserId,
          password: newPassword,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update password')
      }

      toast({
        title: 'Password Updated',
        description: `New Password: ${data.password}`,
      })
      
      // Show additional info in a second toast
      setTimeout(() => {
        toast({
          title: 'Important',
          description: 'Share the new password with the user',
        })
      }, 500)

      setNewPassword('')
      setSelectedUserId(null)
      setOpenPasswordDialog(false)
      fetchUsers()
    } catch (error) {
      console.error('[v0] Error updating password:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to update password'
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setUpdatingPassword(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#fcfcfc] flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#fcfcfc] pb-12">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/admin')}
              className="h-9 w-9 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-3 border-l border-gray-200 pl-4">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                <Users className="w-4 h-4 text-indigo-600" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">Manage Users</h1>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 mt-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Employees</h2>
            <p className="text-gray-500 mt-1">Create, view, and manage system access accounts</p>
          </div>
          
          <Dialog open={openDialog} onOpenChange={(open) => {
            setOpenDialog(open)
            if (!open) {
              setFormData({ name: '', email: '', role: 'employee' })
              setEditingUserId(null)
            }
          }}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm h-11 px-6">
                <Plus className="w-4 h-4" />
                New User
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md rounded-2xl border-0 shadow-2xl p-0 overflow-hidden">
              <div className="bg-indigo-600 p-6 text-white">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold text-white">{editingUserId ? 'Edit User' : 'Add New User'}</DialogTitle>
                  <DialogDescription className="text-indigo-100">{editingUserId ? 'Update user information' : 'Create a new user account with appropriate role'}</DialogDescription>
                </DialogHeader>
              </div>

              <form onSubmit={handleCreateUser} className="p-6 space-y-5 bg-white">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-semibold text-gray-700">Full Name</Label>
                  <Input
                    id="name"
                    placeholder="Enter name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="h-11 rounded-xl border-gray-200 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-semibold text-gray-700">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="h-11 rounded-xl border-gray-200 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role" className="text-sm font-semibold text-gray-700">Role</Label>
                  <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
                    <SelectTrigger id="role" className="h-11 rounded-xl border-gray-200 focus:ring-indigo-500 focus:border-indigo-500">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-gray-200 shadow-xl">
                      <SelectItem value="admin">Admin - Full System Access</SelectItem>
                      <SelectItem value="manager">Manager - Assign Callers & Leads</SelectItem>
                      <SelectItem value="lead_generator">Lead Generator - Create Leads</SelectItem>
                      <SelectItem value="caller">Caller - View Assigned Leads</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button type="submit" disabled={creating} className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white mt-2">
                  {creating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {editingUserId ? 'Updating...' : 'Creating...'}
                    </>
                  ) : (
                    editingUserId ? 'Save Changes' : 'Create User'
                  )}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Users Table */}
        <Card className="border-gray-200/60 shadow-sm rounded-2xl overflow-hidden bg-white">
          <CardContent className="p-0">
            {users.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                  <Users className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-gray-500 font-medium">No users found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-gray-500 uppercase bg-gray-50/80 border-b border-gray-100">
                    <tr>
                      <th className="px-6 py-4 font-semibold tracking-wider">Name</th>
                      <th className="px-6 py-4 font-semibold tracking-wider">Email</th>
                      <th className="px-6 py-4 font-semibold tracking-wider">Role</th>
                      <th className="px-6 py-4 font-semibold tracking-wider">Created</th>
                      <th className="px-6 py-4 font-semibold tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {users.map((user: any) => (
                      <tr key={user.id} className="hover:bg-gray-50/80 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs">
                              {user.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-semibold text-gray-900">{user.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-500">{user.email}</td>
                        <td className="px-6 py-4">
                          <Badge variant="secondary" className="px-2.5 py-1 rounded-md font-medium bg-gray-100 text-gray-700">
                            {user.role}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-gray-500">
                          {new Date(user.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditUser(user)}
                              className="h-8 w-8 rounded-lg text-gray-500 hover:text-indigo-600 hover:bg-indigo-50"
                              title="Edit User"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            
                            <Dialog open={openPasswordDialog && selectedUserId === user.id} onOpenChange={(open) => {
                              setOpenPasswordDialog(open)
                              if (!open) {
                                setSelectedUserId(null)
                                setNewPassword('')
                                setShowPassword(false)
                              }
                            }}>
                              <DialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setSelectedUserId(user.id)
                                    setOpenPasswordDialog(true)
                                  }}
                                  className="h-8 w-8 rounded-lg text-gray-500 hover:text-amber-600 hover:bg-amber-50"
                                  title="Reset Password"
                                >
                                  <Key className="w-4 h-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="sm:max-w-md rounded-2xl border-0 shadow-2xl p-0 overflow-hidden">
                                <div className="bg-amber-500 p-6 text-white">
                                  <DialogHeader>
                                    <DialogTitle className="text-xl font-bold text-white">Update Password</DialogTitle>
                                    <DialogDescription className="text-amber-100">Set a new password for {user.name}</DialogDescription>
                                  </DialogHeader>
                                </div>
                                <form onSubmit={handleUpdatePassword} className="p-6 space-y-5 bg-white">
                                  <div className="space-y-2">
                                    <Label htmlFor="new-password" className="text-sm font-semibold text-gray-700">New Password</Label>
                                    <div className="relative">
                                      <Input
                                        id="new-password"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Enter new password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        disabled={updatingPassword}
                                        className="h-11 pr-10 rounded-xl border-gray-200 focus:ring-amber-500 focus:border-amber-500"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                      >
                                        {showPassword ? (
                                          <EyeOff className="w-4 h-4" />
                                        ) : (
                                          <Eye className="w-4 h-4" />
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                  <Button type="submit" disabled={updatingPassword} className="w-full h-11 rounded-xl bg-amber-500 hover:bg-amber-600 text-white mt-2">
                                    {updatingPassword ? (
                                      <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Updating...
                                      </>
                                    ) : (
                                      'Update Password'
                                    )}
                                  </Button>
                                </form>
                              </DialogContent>
                            </Dialog>
                            
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteUser(user.id)}
                              className="h-8 w-8 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50"
                              title="Delete User"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent className="rounded-2xl border-0 shadow-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-bold text-gray-900">Delete User</AlertDialogTitle>
              <AlertDialogDescription className="text-gray-500">
                Are you sure you want to delete this user? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex gap-3 justify-end mt-4">
              <AlertDialogCancel className="rounded-xl h-11 border-gray-200 hover:bg-gray-50">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="rounded-xl h-11 bg-red-600 text-white hover:bg-red-700">
                Delete User
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </main>
  )
}
