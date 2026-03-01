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
import { Loader2, Plus, Trash2, ArrowLeft, Key, Edit2, Eye, EyeOff } from 'lucide-react'
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
      <main className="min-h-screen bg-background p-8 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/admin')}
            className="h-10 w-10 p-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-foreground">Manage Users</h1>
            <p className="text-muted-foreground mt-2">Create, view, and manage admin, manager, lead generator, and caller accounts</p>
          </div>
          <Dialog open={openDialog} onOpenChange={(open) => {
            setOpenDialog(open)
            if (!open) {
              setFormData({ name: '', email: '', role: 'employee' })
              setEditingUserId(null)
            }
          }}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                New User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingUserId ? 'Edit User' : 'Add New User'}</DialogTitle>
                <DialogDescription>{editingUserId ? 'Update user information' : 'Create a new user account with appropriate role'}</DialogDescription>
              </DialogHeader>

              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <Label htmlFor="name" className="mb-2 block">Full Name</Label>
                  <Input
                    id="name"
                    placeholder="Enter name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="email" className="mb-2 block">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="role" className="mb-2 block">Role</Label>
                  <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
                    <SelectTrigger id="role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin - Full System Access</SelectItem>
                      <SelectItem value="manager">Manager - Assign Callers & Leads</SelectItem>
                      <SelectItem value="lead_generator">Lead Generator - Create Leads</SelectItem>
                      <SelectItem value="caller">Caller - View Assigned Leads</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button type="submit" disabled={creating} className="w-full">
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
        <Card>
          <CardContent className="p-0">
            {users.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No users yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-6 py-3 font-semibold">Name</th>
                      <th className="text-left px-6 py-3 font-semibold">Email</th>
                      <th className="text-left px-6 py-3 font-semibold">Role</th>
                      <th className="text-left px-6 py-3 font-semibold">Created</th>
                      <th className="text-left px-6 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user: any) => (
                      <tr key={user.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                        <td className="px-6 py-4 font-medium">{user.name}</td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">{user.email}</td>
                        <td className="px-6 py-4">
                          <Badge variant="outline">{user.role}</Badge>
                        </td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">
                          {new Date(user.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditUser(user)}
                              className="flex items-center gap-1"
                            >
                              <Edit2 className="w-4 h-4" />
                              Edit
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
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedUserId(user.id)
                                    setOpenPasswordDialog(true)
                                  }}
                                  className="flex items-center gap-1"
                                >
                                  <Key className="w-4 h-4" />
                                  Reset Password
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Update Password</DialogTitle>
                                  <DialogDescription>Set a new password for {user.name}</DialogDescription>
                                </DialogHeader>
                                <form onSubmit={handleUpdatePassword} className="space-y-4">
                                  <div>
                                    <Label htmlFor="new-password" className="mb-2 block">New Password</Label>
                                    <div className="relative">
                                      <Input
                                        id="new-password"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Enter new password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        disabled={updatingPassword}
                                        className="pr-10"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                      >
                                        {showPassword ? (
                                          <EyeOff className="w-4 h-4" />
                                        ) : (
                                          <Eye className="w-4 h-4" />
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                  <Button type="submit" disabled={updatingPassword} className="w-full">
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
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteUser(user.id)}
                              className="flex items-center gap-1"
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
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
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete User</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this user? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex gap-3 justify-end">
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-white hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </main>
  )
}
