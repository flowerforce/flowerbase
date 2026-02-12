/* eslint-disable no-undef */
export const loadUsers = async ({
  groupId,
  appId,
  lastUser,
  cookie,
  traceId,
  password = 'temp-password'
}) => {
  const users = []
  const BASE_URL = `https://services.cloud.mongodb.com/api/admin/v3.0/groups/${groupId}/apps/${appId}/users?`
  const URL = lastUser ? `${BASE_URL}after=${lastUser}` : BASE_URL
  const CONFIG = {
    headers: {
      accept: 'application/json',
      'accept-language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
      baggage: `sentry-environment=prod,sentry-release=4.115.0,sentry-public_key=db073c15b6c14ecf82cbf7ac43e037f3,sentry-trace_id=${traceId},sentry-sample_rate=0,sentry-sampled=false`,
      'content-type': 'application/json',
      priority: 'u=1, i',
      'sec-ch-ua': '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'sentry-trace': `${traceId}`,
      'x-baas-request-origin': 'mongodb-baas-ui',
      cookie: cookie,
      Referer:
        'https://services.cloud.mongodb.com/groups/600daac31bee660769895af1/apps/600dac958546a86b86a90927/auth/users',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    },
    body: null,
    method: 'GET'
  }
  try {
    const response = await fetch(URL, CONFIG)
    const data = await response.json()
    users.push(...data)
    if (data.length > 0) {
      const innerUsers = await loadUsers({
        groupId,
        appId,
        lastUser: data[data.length - 1]._id,
        cookie,
        password
      })
      users.push(...(innerUsers ?? []))
    }
    return users
  } catch (e) {
    console.log('🚀 ~ loadUsers ~ e:', e)
    return
  }
}
