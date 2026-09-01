export function shouldUseMockRedis(
  environment: string,
  hasRedisCredentials: boolean,
): boolean {
  return environment === "development" && !hasRedisCredentials
}
