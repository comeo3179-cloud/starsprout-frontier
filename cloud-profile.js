(function (root) {
  'use strict';
  const ENV = 'starsprout-playtest-d7bqa2fc8da1';
  const MESSAGES = {
    CLOUD_UNAVAILABLE: '云服务暂时无法连接，请稍后重试；仍可使用游客模式。',
    CLOUD_SETUP: '云存档服务尚未就绪，请稍后重试。',
    CLOUD_RESPONSE: '云存档返回异常，请稍后重试。',
    AUTH_CREDENTIALS: '账号、密码或验证码不正确，请检查后重试。',
    AUTH_REQUIRED: '请先登录账号。',
    AUTH_DISABLED: '当前登录方式暂不可用，请稍后重试。',
    AUTH_BUSY: '正在处理账号操作，请稍候。',
    AUTH_VERIFY: '请先获取验证码；刷新页面后需要重新获取。',
    AUTH_RATE_LIMITED: '操作过于频繁，请稍后重试。',
    AUTH_CAPTCHA: '需要完成人机验证，请按验证提示操作。',
    AUTH_INVALID: '请检查邮箱、密码和验证码是否填写完整。',
    ACCOUNT_CHANGED: '账号已发生变化，本次同步已取消，请重新同步。'
  };
  let app, auth, sdkPromise, current = null, known = false, epoch = 0, authBusy = false;
  let signupVerification = null, resetVerification = null;
  const listeners = new Set();
  const requests = new Set();

  function failure(code) {
    const error = new Error(MESSAGES[code] || MESSAGES.CLOUD_UNAVAILABLE);
    error.code = code;
    return error;
  }
  function safeError(error) {
    if (error && Object.prototype.hasOwnProperty.call(MESSAGES, error.code)) return failure(error.code);
    const category = error && error.category;
    const code = String(error && (error.code || error.errorCode) || '').toUpperCase();
    if (code === 'UNAUTHENTICATED' || code === 'PGRST301' || code === 'PGRST303' || code === '401') return failure('AUTH_REQUIRED');
    if (category === 'INVALID_CREDENTIALS' || category === 'USER_NOT_FOUND' || category === 'VERIFICATION_FAILED') return failure('AUTH_CREDENTIALS');
    if (category === 'RATE_LIMITED' || code === '429' || code === 'RESOURCE_EXHAUSTED') return failure('AUTH_RATE_LIMITED');
    if (category === 'CAPTCHA_REQUIRED' || category === 'CAPTCHA_INVALID') return failure('AUTH_CAPTCHA');
    if (category === 'PROVIDER_NOT_ENABLED' || category === 'AUTH_METHOD_MISMATCH') return failure('AUTH_DISABLED');
    if (category === 'INVALID_PARAMS') return failure('AUTH_INVALID');
    if (code === 'PGRST202' || code === '42883' || code === '42501') return failure('CLOUD_SETUP');
    return failure('CLOUD_UNAVAILABLE');
  }
  function unwrap(result) {
    if (!result || result.error) throw safeError(result && result.error);
    return result.data;
  }
  function publicSession(session) {
    const user = session && session.user;
    if (!user || user.is_anonymous || typeof user.id !== 'string' || !user.id) return null;
    const metadata = user.user_metadata || {};
    const label = user.email || metadata.username || metadata.name || '已登录探险者';
    return { uid: user.id, label: String(label).slice(0, 160) };
  }
  function invalidate() {
    epoch++;
    for (const controller of requests) controller.abort();
  }
  function publish(session) {
    const next = publicSession(session);
    const changed = (current && current.uid) !== (next && next.uid);
    if (changed) {
      invalidate();
      signupVerification = resetVerification = null;
    }
    const notify = !known || changed || (current && current.label) !== (next && next.label);
    current = next;
    known = true;
    if (notify) for (const listener of listeners) {
      try { listener(current && { ...current }); } catch (_) { /* A UI callback cannot break authentication. */ }
    }
    return current && { ...current };
  }

  function loadSDK() {
    if (root.cloudbase) return Promise.resolve(root.cloudbase);
    if (!sdkPromise) sdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'vendor/cloudbase.full.js';
      script.async = true;
      const finish = error => {
        clearTimeout(timer);
        script.onload = script.onerror = null;
        if (error) { script.remove(); reject(failure('CLOUD_UNAVAILABLE')); }
        else resolve(root.cloudbase);
      };
      const timer = setTimeout(() => finish(true), 15000);
      script.onload = () => finish(!root.cloudbase);
      script.onerror = () => finish(true);
      document.head.appendChild(script);
    }).catch(error => { sdkPromise = null; throw error; });
    return sdkPromise;
  }
  async function ready() {
    if (auth) return;
    const sdk = await loadSDK();
    if (auth) return;
    app = sdk.init({ env: ENV, region: 'ap-shanghai', persistence: 'local', timeout: 15000 });
    auth = app.auth();
    auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') publish(null);
      else if (session) publish(session);
    });
  }
  async function readSession() {
    await ready();
    const before = epoch;
    const result = await auth.getSession();
    // SDK 3.10.1 reports a fresh guest as unauthenticated, not a null success.
    const guest = result.error && result.error.code === 'unauthenticated' && !result.data?.session;
    const session = guest ? null : unwrap(result).session || null;
    const next = publicSession(session);
    if (before !== epoch && (current && current.uid) !== (next && next.uid)) throw failure('ACCOUNT_CHANGED');
    publish(session);
    return session;
  }
  async function getSession() {
    try { return publicSession(await readSession()); }
    catch (error) { throw safeError(error); }
  }
  function required(value, trim = true) {
    if (typeof value !== 'string' || !value.trim()) throw failure('AUTH_INVALID');
    return trim ? value.trim() : value;
  }
  async function accountAction(action) {
    if (authBusy) throw failure('AUTH_BUSY');
    authBusy = true;
    invalidate();
    try { await readSession(); return await action(); }
    catch (error) { throw safeError(error); }
    finally { authBusy = false; }
  }
  async function signIn(identity, password) {
    return accountAction(async () => {
      signupVerification = resetVerification = null;
      identity = required(identity);
      unwrap(await auth.signInWithPassword({ [identity.includes('@') ? 'email' : 'username']: identity, password: required(password, false) }));
      return publicSession(await readSession());
    });
  }
  async function signUp(email, password) {
    return accountAction(async () => {
      signupVerification = resetVerification = null;
      email = required(email);
      if (!email.includes('@')) throw failure('AUTH_INVALID');
      const data = unwrap(await auth.signUp({ email, password: required(password, false) }));
      if (typeof data.verifyOtp === 'function') {
        signupVerification = { run: data.verifyOtp, uid: current && current.uid };
        return { verificationRequired: true };
      }
      return { verificationRequired: false, session: publicSession(await readSession()) };
    });
  }
  async function verifySignup(code) {
    return accountAction(async () => {
      const verification = signupVerification;
      if (!verification) throw failure('AUTH_VERIFY');
      await readSession();
      if (verification !== signupVerification || verification.uid !== (current && current.uid)) throw failure('ACCOUNT_CHANGED');
      unwrap(await verification.run({ token: required(code) }));
      signupVerification = null;
      return publicSession(await readSession());
    });
  }
  async function requestReset(email) {
    return accountAction(async () => {
      signupVerification = resetVerification = null;
      email = required(email);
      if (!email.includes('@')) throw failure('AUTH_INVALID');
      const data = unwrap(await auth.resetPasswordForEmail(email));
      if (typeof data.updateUser !== 'function') throw failure('CLOUD_RESPONSE');
      resetVerification = { run: data.updateUser, uid: current && current.uid };
      return { verificationRequired: true };
    });
  }
  async function resetPassword(code, password) {
    return accountAction(async () => {
      const verification = resetVerification;
      if (!verification) throw failure('AUTH_VERIFY');
      await readSession();
      if (verification !== resetVerification || verification.uid !== (current && current.uid)) throw failure('ACCOUNT_CHANGED');
      unwrap(await verification.run({ nonce: required(code), password: required(password, false) }));
      resetVerification = null;
      return publicSession(await readSession());
    });
  }
  async function signOut() {
    return accountAction(async () => {
      signupVerification = resetVerification = null;
      unwrap(await auth.signOut());
      return publicSession(await readSession());
    });
  }

  async function rpc(uid, name, args) {
    try {
      if (authBusy) throw failure('AUTH_BUSY');
      const session = await readSession();
      if (!current) throw failure('AUTH_REQUIRED');
      if (current.uid !== uid || authBusy) throw failure('ACCOUNT_CHANGED');
      const generation = epoch;
      const guard = () => {
        if (epoch !== generation || !current || current.uid !== uid || authBusy) throw failure('ACCOUNT_CHANGED');
      };
      // getSession reads credentials and user separately. Reject an interleaved
      // account change even if the SDK's cross-tab event has not arrived yet.
      let subject;
      try {
        const part = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        subject = JSON.parse(root.atob(part)).sub;
      } catch (_) { throw failure('AUTH_REQUIRED'); }
      if (subject !== uid) throw failure('ACCOUNT_CHANGED');

      // rdb() creates a fresh official PostgrestClient. Its public fetch hook
      // pins this request to this session; default SDK fetch reads credentials later.
      const client = app.rdb();
      client.fetch = async (url, options) => {
        guard();
        const controller = new AbortController();
        requests.add(controller);
        const timer = setTimeout(() => controller.abort(), 15000);
        const headers = new Headers(options.headers);
        headers.set('Authorization', 'Bearer ' + session.access_token);
        try {
          return await root.fetch(url, { ...options, headers, signal: controller.signal, credentials: 'omit' });
        } finally {
          clearTimeout(timer);
          requests.delete(controller);
        }
      };
      const result = await client.rpc(name, args);
      guard();
      await readSession();
      guard();
      const data = unwrap(result);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw failure('CLOUD_RESPONSE');
      return data;
    } catch (error) { throw safeError(error); }
  }
  const adapter = {
    load(uid) { return rpc(uid, 'frontier_load_progress', {}); },
    merge(uid, payload) {
      let copy;
      try { copy = JSON.parse(JSON.stringify(payload)); }
      catch (_) { return Promise.reject(failure('AUTH_INVALID')); }
      return rpc(uid, 'frontier_merge_progress', { payload: copy }).then(data => {
        if (!data.snapshot || !Array.isArray(data.acknowledgedRunIds) || typeof data.legacyAccepted !== 'boolean') throw failure('CLOUD_RESPONSE');
        return data;
      });
    }
  };
  root.FrontierCloud = Object.freeze({
    init: getSession, getSession,
    onSession(callback) { listeners.add(callback); return () => listeners.delete(callback); },
    signIn, signUp, verifySignup, requestReset, resetPassword, signOut,
    adapter: Object.freeze(adapter)
  });
})(window);
