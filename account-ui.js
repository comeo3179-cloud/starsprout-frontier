(() => {
  'use strict';
  // Account forms stay in the camp menu; combat never gains another HUD panel.
  window.FrontierAccountPanel = class {
    constructor({ store, cloud, getIdentity, onIdentity, onClose, onSettled }) {
      Object.assign(this, { store, cloud, getIdentity, onIdentity, onClose, onSettled });
      this.busy = false;
      this.mode = 'login';
    }
    open(host) { this.host = host; this.mode = 'login'; this.render(); }
    close() { if (!this.busy) { this.host = null; this.onClose(); } }
    message(text, error = false) {
      if (!this.host) return;
      const node = this.host.querySelector('#account-message');
      node.textContent = text; node.classList.toggle('error', error);
    }
    async perform(action) {
      if (this.busy) return;
      this.busy = true;
      this.host.querySelectorAll('button').forEach(button => { button.disabled = true; });
      this.message('正在连接，请稍候…');
      try { await action(); }
      catch (error) { this.message(error.message || '暂时无法连接，请稍后重试。', true); }
      finally {
        this.busy = false;
        this.host?.querySelectorAll('button').forEach(button => { button.disabled = false; });
        this.onSettled?.();
      }
    }
    render() {
      if (!this.host) return;
      const identity = this.getIdentity(), loggedIn = !!identity;
      const verifying = this.mode === 'verify', resetting = this.mode === 'reset-code';
      this.host.innerHTML = '<div class="screen-kicker">PILOT ID / 个人档案</div><h2 id="screen-title">让每次领悟，属于你。</h2><p class="account-description">登录同一账号，在手机与电脑接续成就和纪录。每次远征仍从新的一局开始。</p><section class="account-card"><div id="account-body"></div><p id="account-message" role="status" aria-live="polite"></p></section><button class="secondary-button" id="account-back">返回营地</button><p class="account-privacy">邮箱与密码由腾讯云身份认证处理。云端保存你的成就、最高分与试炼纪录；音效和画面偏好留在本设备。</p>';
      const body = this.host.querySelector('#account-body');
      if (loggedIn && this.mode === 'login') {
        body.innerHTML = '<div class="account-name"></div><p class="account-sync-status"></p><div class="account-stats"><span>未知档案 <b></b></span><span>最佳得分 <b></b></span><span>试炼通关 <b></b></span></div><div class="account-actions"><button class="launch-button" id="account-sync">立即同步</button><button class="secondary-button" id="account-relogin">重新登录</button><button class="secondary-button" id="account-logout">退出账号</button></div><div id="legacy-claim"></div>';
        body.querySelector('.account-name').textContent = identity.label || '开拓者';
        this.refresh();
        body.querySelector('#account-sync').onclick = () => this.perform(async () => { const ok = await this.store.sync(); this.refresh(); this.message(ok && !this.store.status.pending ? '成就与纪录已同步到云端。' : '同步尚未完成，请稍后重试。', !ok); });
        body.querySelector('#account-relogin').onclick = () => { this.mode = 'reauth'; this.render(); };
        body.querySelector('#account-logout').onclick = () => {
          const pending = this.store.status.pending;
          this.message(pending ? (this.store.status.persistent ? '还有待同步进度，将留在本设备此账号下。退出后可重新登录补传。' : '浏览器未允许保存：待同步进度仅在当前页面内存中，关闭页面可能丢失。建议先完成同步。') : '退出后将回到独立的游客档案。');
          body.querySelector('#account-logout').textContent = '确认退出';
          body.querySelector('#account-logout').onclick = () => this.perform(async () => {
            await this.cloud.signOut(); await this.onIdentity(null); this.render();
          });
        };
      } else {
        const signup = this.mode === 'signup', reset = this.mode === 'reset';
        const title = verifying ? '填写邮箱验证码' : resetting ? '设置新密码' : signup ? '创建开拓者账号' : reset ? '找回密码' : '登录账号';
        body.innerHTML = '<h3>' + title + '</h3><form id="account-form">' +
          (!(verifying || resetting) ? '<label>' + (signup || reset ? '邮箱' : '邮箱 / 用户名') + '<input id="account-email" name="username" type="' + (signup || reset ? 'email' : 'text') + '" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="254" required></label>' : '<label>邮箱验证码<input id="account-code" name="one-time-code" autocomplete="one-time-code" inputmode="numeric" maxlength="32" required></label>') +
          (!(verifying || reset) ? '<label>' + (resetting ? '新密码' : '密码') + '<input id="account-password" name="password" type="password" autocomplete="' + (signup || resetting ? 'new-password' : 'current-password') + '" minlength="8" maxlength="32" required></label>' : '') +
          (signup || resetting ? '<small class="password-hint">8–32 位；大小写字母、数字、符号中至少三类，首位为字母或数字。</small>' : '') +
          '<button class="launch-button" type="submit">' + (verifying ? '验证并进入账号' : resetting ? '保存新密码' : signup || reset ? '发送验证码' : '登录并同步') + '</button></form><div class="account-actions"><button class="secondary-button" id="account-alternate">' + (this.mode === 'login' || this.mode === 'reauth' ? '注册新账号' : '返回登录') + '</button>' + (this.mode === 'login' || this.mode === 'reauth' ? '<button class="secondary-button" id="account-forgot">忘记密码</button>' : '') + '</div>';
        body.querySelector('#account-alternate').onclick = () => { this.mode = this.mode === 'login' || this.mode === 'reauth' ? 'signup' : 'reauth'; this.render(); };
        body.querySelector('#account-forgot')?.addEventListener('click', () => { this.mode = 'reset'; this.render(); });
        body.querySelector('#account-form').onsubmit = event => {
          event.preventDefault();
          const email = body.querySelector('#account-email')?.value.trim();
          const passwordNode = body.querySelector('#account-password');
          const password = passwordNode?.value;
          const code = body.querySelector('#account-code')?.value.trim();
          if ((signup || resetting) && (!/^[A-Za-z0-9]/.test(password) || [/[a-z]/, /[A-Z]/, /[0-9]/, /[()!@#$%^&*|?><_-]/].filter(pattern => pattern.test(password)).length < 3)) { this.message('请使用 8–32 位密码，首位为字母或数字，并包含大小写字母、数字、符号中的至少三类。', true); return; }
          this.perform(async () => {
            if (signup) {
              const result = await this.cloud.signUp(email, password);
              if (passwordNode) passwordNode.value = '';
              if (result.session) { await this.onIdentity(result.session); this.mode = 'login'; this.render(); }
              else { this.mode = 'verify'; this.render(); this.message('验证码已发往填写的邮箱。请检查收件箱与垃圾邮件。'); }
            } else if (reset) {
              await this.cloud.requestReset(email); this.mode = 'reset-code'; this.render(); this.message('验证码已发往邮箱，请填写验证码与新密码。');
            } else if (resetting) {
              const session = await this.cloud.resetPassword(code, password);
              if (passwordNode) passwordNode.value = '';
              if (session) await this.onIdentity(session);
              this.mode = session ? 'login' : 'reauth'; this.render(); this.message('密码已更新。' + (session ? '' : '请使用新密码登录。'));
            } else {
              const session = verifying ? await this.cloud.verifySignup(code) : await this.cloud.signIn(email, password);
              if (passwordNode) passwordNode.value = '';
              if (!session) throw new Error('登录未完成，请重试。');
              await this.onIdentity(session); this.mode = 'login'; this.render();
            }
          });
        };
        body.querySelector('input')?.focus({ preventScroll: true });
      }
      this.host.querySelector('#account-back').onclick = () => this.close();
    }
    refresh() {
      if (!this.host) return;
      const node = this.host.querySelector('.account-sync-status');
      if (!node) return;
      const { snapshot, status } = this.store;
      node.textContent = status.loading || status.syncing ? '正在同步云端档案…' : status.error ? '同步暂未完成，可保留本机进度并稍后重试。' : status.pending ? '有进度等待上传' : '云端同步完成';
      if (!status.persistent) node.textContent += ' · 浏览器未允许本地保存';
      this.host.querySelectorAll('.account-stats b').forEach((el, i) => { el.textContent = [snapshot.secrets.length + '/6', snapshot.bestScore, snapshot.trial.wins][i]; });
      const claim = this.host.querySelector('#legacy-claim');
      const legacy = this.store.legacy;
      if (!claim) return;
      if (!legacy?.available) { claim.replaceChildren(); return; }
      if (claim.childElementCount) return;
      claim.innerHTML = '<h3>认领本机试玩存档</h3><p></p><button class="secondary-button" id="account-import">这些是我的进度，合并到此账号</button><small>共用设备请确认归属。认领后，这份存档不能再给其他账号认领。</small>';
      claim.querySelector('p').textContent = legacy.snapshot.secrets.length + ' 项已发现 · 最佳 ' + legacy.snapshot.bestScore + ' 分 · 试炼通关 ' + legacy.snapshot.trial.wins + ' 次';
      claim.querySelector('button').onclick = () => this.perform(async () => { const accepted = await this.store.importLegacy(); claim.replaceChildren(); this.refresh(); this.message(accepted === true ? '本机进度已合并到当前账号。' : '尚未完成认领：请检查网络，或确认这份存档未被其他账号认领。', accepted !== true); });
    }
  };
})();
