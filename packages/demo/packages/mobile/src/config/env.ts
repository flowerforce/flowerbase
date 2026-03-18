const readEnv = (value: string | undefined, fallback: string) => value?.trim() || fallback

export const mobileDemoConfig = {
  appId: readEnv(process.env.EXPO_PUBLIC_APP_ID, 'flowerbase-demo'),
  baseUrl: readEnv(process.env.EXPO_PUBLIC_SERVER_URL, 'http://localhost:3000'),
  databaseName: readEnv(process.env.EXPO_PUBLIC_DB_NAME, 'flowerbase-demo')
}
