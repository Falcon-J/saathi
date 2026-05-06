'use client'

import { ReactNode } from 'react'
import { useOnboarding } from '@/context/onboarding-context'
import { OnboardingFlow } from './onboarding-flow'

export function OnboardingLayout({ children }: { children: ReactNode }) {
  const { isOpen, currentStep, closeOnboarding } = useOnboarding()

  return (
    <>
      {children}
      <OnboardingFlow
        isOpen={isOpen}
        onClose={closeOnboarding}
        currentStep={currentStep}
      />
    </>
  )
}
