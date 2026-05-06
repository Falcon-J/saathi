'use client'

import { useState } from 'react'
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={handleSkip}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-2xl mx-4 animate-in fade-in zoom-in-95"
      >
        <Card className="p-8 bg-white dark:bg-slate-900">
          {/* Progress Bar */}
          <div className="mb-8">
            <div className="flex gap-2">
              {steps.map((s) => (
                <div
                  key={s.id}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    completedSteps.includes(s.id)
                      ? 'bg-green-500'
                      : s.id === step
                      ? 'bg-blue-500'
                      : 'bg-gray-300'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="animate-in fade-in duration-300">
            {step === 'welcome' && <WelcomeStep />}
            {step === 'create-workspace' && <CreateWorkspaceStep />}
            {step === 'invite-team' && <InviteTeamStep />}
            {step === 'create-task' && <CreateTaskStep />}
            {step === 'complete' && <CompleteStep />}
          </div>

          {/* Actions */}
          <div className="flex justify-between items-center mt-8 pt-6 border-t">
            <button
              onClick={handleSkip}
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
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
        <p className="text-lg text-gray-600 dark:text-gray-400">
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

      <p className="text-sm text-gray-500">
        Let's get you set up in 4 quick steps
      </p>
    </div>
  )
}

function CreateWorkspaceStep() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Create Your First Workspace</h2>
        <p className="text-gray-600 dark:text-gray-400">
          A workspace is your dedicated space where team members collaborate on tasks together
        </p>
      </div>

      <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-3">
        <h3 className="font-semibold text-blue-900 dark:text-blue-100">How it works:</h3>
        <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
          <li>✓ Create a workspace for your team or project</li>
          <li>✓ Invite team members to collaborate</li>
          <li>✓ Add tasks and watch them sync in real-time</li>
          <li>✓ Track progress across all platforms instantly</li>
        </ul>
      </div>

      <div className="border rounded-lg p-4 bg-gray-50 dark:bg-slate-800">
        <p className="text-sm font-medium mb-2">Ready to create your workspace?</p>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Click "Next" to create your workspace and start collaborating!
        </p>
      </div>
    </div>
  )
}

function InviteTeamStep() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Invite Your Team</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Bring your team members into the workspace to enable real-time collaboration
        </p>
      </div>

      <div className="bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg p-4 space-y-3">
        <h3 className="font-semibold text-purple-900 dark:text-purple-100">Collaboration Features:</h3>
        <ul className="text-sm text-purple-800 dark:text-purple-200 space-y-2">
          <li>✓ Invite team members via email</li>
          <li>✓ See active users in real-time</li>
          <li>✓ Watch tasks update as teammates work</li>
          <li>✓ Manage roles and permissions</li>
        </ul>
      </div>

      <div className="border rounded-lg p-4 bg-gray-50 dark:bg-slate-800">
        <p className="text-sm font-medium mb-2">You can invite team members anytime!</p>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Start with your core team and expand as needed.
        </p>
      </div>
    </div>
  )
}

function CreateTaskStep() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Create Your First Task</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Tasks are the core of Saathi, with real-time synchronization across all devices
        </p>
      </div>

      <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4 space-y-3">
        <h3 className="font-semibold text-green-900 dark:text-green-100">Task Features:</h3>
        <ul className="text-sm text-green-800 dark:text-green-200 space-y-2">
          <li>✓ Create tasks with titles and descriptions</li>
          <li>✓ Set priority levels (Low, Medium, High)</li>
          <li>✓ Add due dates and assign to team members</li>
          <li>✓ Watch updates sync instantly (~50ms)</li>
        </ul>
      </div>

      <div className="border rounded-lg p-4 bg-gray-50 dark:bg-slate-800">
        <p className="text-sm font-medium mb-2">Real-time Synchronization</p>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Changes made by any team member appear across all devices in less than 100ms!
        </p>
      </div>
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
        <h2 className="text-3xl font-bold">You're All Set!</h2>
        <p className="text-lg text-gray-600 dark:text-gray-400">
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
            className="text-center p-3 rounded-lg bg-gray-50 dark:bg-slate-800"
          >
            <div className="text-2xl mb-1">{item.emoji}</div>
            <p className="text-xs font-medium">{item.text}</p>
          </div>
        ))}
      </div>

      <div className="pt-4 text-sm text-gray-600 dark:text-gray-400">
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
