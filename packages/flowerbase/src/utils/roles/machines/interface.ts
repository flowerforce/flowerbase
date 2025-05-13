/* eslint-disable @typescript-eslint/no-explicit-any */
import { Document } from 'mongodb'
import { User } from '../../../auth/dtos'
import { Params, Role } from '../interface'

export type PrevParams = Record<string, any>
export interface MachineContext {
  user: User
  role: Role
  params: Params
  prevParams?: PrevParams
  enableLog?: boolean
}

type StateFunction = (
  params: RunParams & {
    context: MachineContext
  } & {
    next: (step: string, params?: Record<string, any>) => void
    endValidation: ({
      success,
      document
    }: {
      success: boolean
      document?: Document
    }) => void
    goToNextValidationStage: (initialStep?: string | null) => void
  }
) => Promise<void>

export type States = Record<string, StateFunction>

export interface RunParams {
  initialStep: string | null
}

export interface ValidationStatus {
  status: boolean | null
  document?: Document
}

export interface StepResult {
  status: boolean | null
  nextInitialStep: string | null
  document?: Document
}

export interface EndValidationParams {
  success: boolean
  document?: Document
}

export type LogMachineInfoParams = {
  enabled?: boolean
  machine: string
  step: number
  stepName: string
}
