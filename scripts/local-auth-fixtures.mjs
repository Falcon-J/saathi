// Disposable local fixture setup only. Never use these retries for measured work.
const pauseByDefault = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const transient = error => {
  if (typeof error?.status === 'number') return error.status === 0 || (error.status >= 500 && error.status <= 599)
  return ['TypeError', 'TimeoutError', 'AbortError', 'AuthRetryableFetchError'].includes(error?.name)
}
const failure = (code, retries) => Object.assign(new Error('Local Auth fixture preparation failed'), { code, retries })
const invoke = async operation => {
  try { return await operation() }
  catch (error) { return { error } }
}

/** findUserByEmail must query only this disposable fixture's exact owned email. */
export async function createLocalAuthFixture({ email, createUser, findUserByEmail, pause = pauseByDefault }) {
  const code = 'local_auth_fixture_create_failed'
  for (let retries = 0; retries < 3; retries++) {
    const result = await invoke(createUser)
    if (!result?.error && typeof result?.data?.user?.id === 'string' && result.data.user.id) {
      return { user: result.data.user, retries, recovered: false }
    }
    if (!transient(result?.error)) throw failure(code, retries)
    // A lost response can conceal a committed create, including the final attempt.
    let user
    try { user = await findUserByEmail(email) }
    catch { throw failure(code, retries) }
    if (typeof user?.id === 'string' && user.id) return { user, retries, recovered: true }
    if (retries === 2) throw failure(code, retries)
    try { await pause(250 * (retries + 1)) }
    catch { throw failure(code, retries) }
  }
}

/** Recovery of a created UUID never substitutes for a successful provider login. */
export async function signInLocalAuthFixture({ signIn, pause = pauseByDefault }) {
  const code = 'local_auth_fixture_sign_in_failed'
  for (let retries = 0; retries < 3; retries++) {
    const result = await invoke(signIn)
    if (!result?.error && typeof result?.data?.session?.access_token === 'string' && result.data.session.access_token) {
      return { session: result.data.session, retries }
    }
    if (!transient(result?.error) || retries === 2) throw failure(code, retries)
    try { await pause(250 * (retries + 1)) }
    catch { throw failure(code, retries) }
  }
}
