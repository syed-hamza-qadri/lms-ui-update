'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface Niche {
  id: string
  name: string
  lead_count: number
}

interface NichesListProps {
  isLoading: boolean
  niches: Niche[]
  onSelectNiche: (niche: Niche) => void
}

export function NichesList({ isLoading, niches, onSelectNiche }: NichesListProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    )
  }

  if (niches.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No niches available yet</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {niches.map((niche) => (
        <Card
          key={niche.id}
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => onSelectNiche(niche)}
        >
          <CardContent className="pt-6">
            <h3 className="font-semibold text-lg mb-2">{niche.name}</h3>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Leads</span>
              <Badge variant="secondary" className="text-lg py-1 px-3">
                {niche.lead_count}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
