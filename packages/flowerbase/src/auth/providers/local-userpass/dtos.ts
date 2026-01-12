export type RegisterUserDto = {
  email: string
  password: string
}

export type LoginUserDto = {
  username: string
  password: string
}

export type LoginSuccessDto = {
  access_token: string
  device_id: string
  refresh_token: string
  user_id: string
}

export type ErrorResponseDto = {
  message: string
}

export interface RegistrationDto {
  Body: RegisterUserDto
}

export interface LoginDto {
  Body: LoginUserDto
  Reply: LoginSuccessDto | ErrorResponseDto
}

export interface ResetPasswordSendDto {
  Body: {
    email: string
  }
}

export interface ResetPasswordCallDto {
  Body: {
    email: string
    password: string
    arguments?: unknown[]
  }
}

export interface ConfirmResetPasswordDto {
  Body: {
    token: string
    tokenId: string
    password: string
  }
}

export interface ConfirmUserDto {
  Body: {
    token: string
    tokenId: string
  }
}
