'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export type OnboardingStep = 'welcome' | 'create-workspace' | 'invite-team' | 'create-task' | 'complete'

interface OnboardingContextType {
  isOpen: boolean
  currentStep: OnboardingStep
  hasCompletedOnboarding: boolean
  completedSteps: OnboardingStep[]
  openOnboarding: () => void
  closeOnboarding: () => void
  skipOnboarding: () => void
  completeStep: (step: OnboardingStep) => void
  goToStep: (step: OnboardingStep) => void
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined)

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome')
  const [completedSteps, setCompletedSteps] = useState<OnboardingStep[]>([])
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)

  // Load onboarding state from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return

    const savedState = localStorage.getItem('saathi-onboarding')
    if (savedState) {
      try {
        const { completed, steps } = JSON.parse(savedState)
        setHasCompletedOnboarding(completed)
        setCompletedSteps(steps || [])
      } catch (e) {
        console.error('Failed to load onboarding state:', e)
      }
    }

    // Show onboarding on first visit
    const hasVisited = localStorage.getItem('saathi-first-visit')
    if (!hasVisited) {
      setIsOpen(true)
      localStorage.setItem('saathi-first-visit', 'true')
    }

    setIsHydrated(true)
  }, [])

  // Save state to localStorage
  useEffect(() => {
    if (!isHydrated) return
    
    localStorage.setItem('saathi-onboarding', JSON.stringify({
      completed: hasCompletedOnboarding,
      steps: completedSteps
    }))
  }, [hasCompletedOnboarding, completedSteps, isHydrated])

  const openOnboarding = () => {
    setIsOpen(true)
    setCurrentStep('welcome')
  }

  const closeOnboarding = () => {
    setIsOpen(false)
    if (completedSteps.length >= 4) {
      setHasCompletedOnboarding(true)
    }
  }

  const skipOnboarding = () => {
    setIsOpen(false)
    setHasCompletedOnboarding(true)
  }

  const completeStep = (step: OnboardingStep) => {
    if (!completedSteps.includes(step)) {
      setCompletedSteps([...completedSteps, step])
    }
  }

  const goToStep = (step: OnboardingStep) => {
    setCurrentStep(step)
  }

  return (
    <OnboardingContext.Provider
      value={{
        isOpen,
        currentStep,
        hasCompletedOnboarding,
        completedSteps,
        openOnboarding,
        closeOnboarding,
        skipOnboarding,
        completeStep,
        goToStep
      }}
    >
      {children}
    </OnboardingContext.Provider>
  )
}

export function useOnboarding() {
  const context = useContext(OnboardingContext)
  if (context === undefined) {
    throw new Error('useOnboarding must be used within OnboardingProvider')
  }
  return context
}
