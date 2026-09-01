'use client'

import { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useOnboarding } from '@/context/onboarding-context'
import { OnboardingFlow } from './onboarding-flow'

export function OnboardingLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { isOpen, currentStep, closeOnboarding } = useOnboarding()
  const isWorkspaceRoute = pathname === '/dashboard' || pathname.startsWith('/tasks')

  return (
    <div className={isWorkspaceRoute ? 'saathi-dashboard min-h-screen' : undefined}>
      {children}
      {isWorkspaceRoute && (
        <OnboardingFlow
          isOpen={isOpen}
          onClose={closeOnboarding}
          currentStep={currentStep}
        />
      )}
    </div>
  )
}
