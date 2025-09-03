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

export interface LoginDto {
  Body: LoginUserDto
  Reply: LoginSuccessDto
}
