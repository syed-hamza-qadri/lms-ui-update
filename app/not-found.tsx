'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SearchX } from 'lucide-react'
import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <Card className="border-0 shadow-lg">
          <CardHeader className="text-center space-y-4 pb-6">
            <div className="flex justify-center">
              <div className="bg-red-100 p-4 rounded-full">
                <SearchX className="w-12 h-12 text-red-600" />
              </div>
            </div>
            <div>
              <div className="text-6xl font-bold text-foreground mb-2">404</div>
              <CardTitle className="text-2xl">Page Not Found</CardTitle>
              <CardDescription className="text-base mt-2">
                The page you're looking for doesn't exist or has been moved.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The resource you requested could not be found on this server. Please check the URL and try again.
            </p>

            <div className="flex flex-col gap-2 pt-2">
              <Link href="/portal" className="w-full">
                <Button variant="default" className="w-full">
                  Go to Portal
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          If you believe this is a mistake, please contact support.
        </p>
      </div>
    </main>
  )
}
