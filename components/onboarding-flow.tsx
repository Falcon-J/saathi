'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CheckCircle2, ArrowRight } from 'lucide-react'

export type OnboardingStep = 'welcome' | 'create-workspace' | 'invite-team' | 'create-task' | 'complete'

interface OnboardingFlowProps {
  isOpen: boolean
  onClose: () => void
  currentStep?: OnboardingStep
}

export function OnboardingFlow({ isOpen, onClose, currentStep = 'welcome' }: OnboardingFlowProps) {
  const [step, setStep] = useState<OnboardingStep>(currentStep)
  const [completedSteps, setCompletedSteps] = useState<OnboardingStep[]>([])

  const steps: { id: OnboardingStep; title: string; description: string }[] = [
    {
      id: 'welcome',
      title: 'Welcome to Saathi',
      description: 'Your collaborative task management hub for real-time team productivity'
    },
    {
      id: 'create-workspace',
      title: 'Create Your First Workspace',
      description: 'Set up a workspace where your team can collaborate on tasks'
    },
    {
      id: 'invite-team',
      title: 'Invite Your Team',
      description: 'Add team members to start collaborating in real-time'
    },
    {
      id: 'create-task',
      title: 'Create Your First Task',
      description: 'Add a task and watch it sync across all connected devices instantly'
    },
    {
      id: 'complete',
      title: 'You\'re All Set!',
      description: 'Start collaborating with your team in real-time'
    }
  ]

  const handleStepComplete = () => {
    if (step !== 'complete') {
      setCompletedSteps([...completedSteps, step])
    }

    const currentIndex = steps.findIndex(s => s.id === step)
    if (currentIndex < steps.length - 1) {
      setStep(steps[currentIndex + 1].id)
    } else {
      onClose()
    }
  }

  const handleSkip = () => {
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm" onClick={handleSkip}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-2xl animate-in fade-in zoom-in-95"
      >
        <Card className="border-border bg-card p-6 text-card-foreground shadow-2xl sm:p-8">
          {/* Progress Bar */}
          <div className="mb-8">
            <div className="flex gap-2">
              {steps.map((s) => (
                <div
                  key={s.id}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    completedSteps.includes(s.id)
                      ? 'bg-[var(--saathi-success)]'
                      : s.id === step
                      ? 'bg-primary'
                      : 'bg-secondary'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="animate-in fade-in duration-300">
            {step === 'welcome' && <WelcomeStep />}
            {step === 'create-workspace' && <CreateWorkspaceStep onClose={onClose} />}
            {step === 'invite-team' && <InviteTeamStep onClose={onClose} />}
            {step === 'create-task' && <CreateTaskStep onClose={onClose} />}
            {step === 'complete' && <CompleteStep />}
          </div>

          {/* Actions */}
          <div className="flex justify-between items-center mt-8 pt-6 border-t">
            <button
              onClick={handleSkip}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {step === 'complete' ? 'Close' : 'Skip'}
            </button>

            <div className="flex gap-3">
              {step !== 'welcome' && step !== 'complete' && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const currentIndex = steps.findIndex(s => s.id === step)
                    if (currentIndex > 0) {
                      setStep(steps[currentIndex - 1].id)
                    }
                  }}
                >
                  Back
                </Button>
              )}

              <Button
                onClick={handleStepComplete}
                className="gap-2"
              >
                {step === 'complete' ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Finish
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

function WelcomeStep() {
  return (
    <div className="text-center space-y-6">
      <div className="space-y-2">
        <h2 className="text-3xl font-bold">Welcome to Saathi</h2>
        <p className="text-lg text-muted-foreground">
          Your collaborative task management hub built for real-time team productivity
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 py-6">
        {[
          { icon: '⚡', label: 'Real-time Sync' },
          { icon: '👥', label: 'Team Collab' },
          { icon: '🎯', label: 'Task Focus' }
        ].map((feature, idx) => (
          <div key={idx} className="text-center">
            <div className="text-3xl mb-2">{feature.icon}</div>
            <p className="text-sm font-medium">{feature.label}</p>
          </div>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        Let&apos;s get you set up in 4 quick steps
      </p>
    </div>
  )
}

function CreateWorkspaceStep({ onClose }: { onClose: () => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Create Your First Workspace</h2>
        <p className="text-muted-foreground">
          A workspace is your dedicated space where team members collaborate on tasks together
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-primary/20 bg-accent p-4">
        <h3 className="font-semibold text-accent-foreground">How it works:</h3>
        <ul className="space-y-2 text-sm text-accent-foreground">
          <li>✓ Create a workspace for your team or project</li>
          <li>✓ Invite team members to collaborate</li>
          <li>✓ Add tasks and watch them sync in real-time</li>
          <li>✓ Track progress across all platforms instantly</li>
        </ul>
      </div>

      <div className="rounded-lg border border-border bg-secondary p-4">
        <p className="text-sm font-medium mb-2">Ready to create your workspace?</p>
        <p className="text-sm text-muted-foreground">
          Use the workspace switcher to create your first workspace.
        </p>
      </div>

      <Button asChild variant="outline" className="gap-2">
        <Link href="/dashboard#workspace-switcher" onClick={onClose}>
          Open workspace setup
          <ArrowRight className="w-4 h-4" />
        </Link>
      </Button>
    </div>
  )
}

function InviteTeamStep({ onClose }: { onClose: () => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Invite Your Team</h2>
        <p className="text-muted-foreground">
          Bring your team members into the workspace to enable real-time collaboration
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-primary/20 bg-accent p-4">
        <h3 className="font-semibold text-accent-foreground">Collaboration Features:</h3>
        <ul className="space-y-2 text-sm text-accent-foreground">
          <li>✓ Invite team members via email</li>
          <li>✓ See active users in real-time</li>
          <li>✓ Watch tasks update as teammates work</li>
          <li>✓ Manage roles and permissions</li>
        </ul>
      </div>

      <div className="rounded-lg border border-border bg-secondary p-4">
        <p className="text-sm font-medium mb-2">You can invite team members anytime!</p>
        <p className="text-sm text-muted-foreground">
          Open the Team panel after selecting a workspace.
        </p>
      </div>

      <Button asChild variant="outline" className="gap-2">
        <Link href="/dashboard#team-panel" onClick={onClose}>
          Open team panel
          <ArrowRight className="w-4 h-4" />
        </Link>
      </Button>
    </div>
  )
}

function CreateTaskStep({ onClose }: { onClose: () => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Create Your First Task</h2>
        <p className="text-muted-foreground">
          Tasks are the core of Saathi, with real-time synchronization across all devices
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-[var(--saathi-success)]/20 bg-[var(--saathi-success)]/10 p-4">
        <h3 className="font-semibold text-foreground">Task Features:</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>✓ Create tasks with titles and descriptions</li>
          <li>✓ Set priority levels (Low, Medium, High)</li>
          <li>✓ Add due dates and assign to team members</li>
          <li>✓ Watch updates arrive through the workspace event stream</li>
        </ul>
      </div>

      <div className="rounded-lg border border-border bg-secondary p-4">
        <p className="text-sm font-medium mb-2">Real-time Synchronization</p>
        <p className="text-sm text-muted-foreground">
          Add a task from the Project Board; changes are delivered through the workspace event stream.
        </p>
      </div>

      <Button asChild variant="outline" className="gap-2">
        <Link href="/dashboard#project-board" onClick={onClose}>
          Open project board
          <ArrowRight className="w-4 h-4" />
        </Link>
      </Button>
    </div>
  )
}

function CompleteStep() {
  return (
    <div className="text-center space-y-6">
      <div className="flex justify-center mb-4 animate-bounce">
        <div className="text-6xl">🎉</div>
      </div>

      <div className="space-y-2">
        <h2 className="text-3xl font-bold">You&apos;re All Set!</h2>
        <p className="text-lg text-muted-foreground">
          Your workspace is ready for real-time collaboration
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 py-4">
        {[
          { emoji: '📝', text: 'Create Tasks' },
          { emoji: '👥', text: 'Invite Team' },
          { emoji: '⚡', text: 'Real-time Sync' },
          { emoji: '🎯', text: 'Track Progress' }
        ].map((item, idx) => (
          <div
            key={idx}
            style={{
              animation: `fadeIn 0.5s ease-in ${idx * 0.1}s both`
            }}
            className="rounded-lg bg-secondary p-3 text-center"
          >
            <div className="text-2xl mb-1">{item.emoji}</div>
            <p className="text-xs font-medium">{item.text}</p>
          </div>
        ))}
      </div>

      <div className="pt-4 text-sm text-muted-foreground">
        <p>Ready to transform how your team works together?</p>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
}
