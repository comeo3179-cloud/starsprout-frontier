# 星芽：荒原行动 · STARSPROUT FRONTIER

俯视角射击与探索生存游戏：手动走位、瞄准与射击，在撤离风险和继续探索之间作出选择。

[在线试玩](https://starsprout-playtest-d7bqa2fc8da1-1494842646.tcloudbaseapp.com/?v=9.0.1) · [更新记录](CHANGELOG.md) · [创作参考](REFERENCES.md)

## 当前内容

- **9.0.1 体验修正**：手机短横屏地图的返回操作固定在面板底部；战斗粒子复用每帧衰减计算，保留原有特效效果与玩法数值。
- **9.0 相位猎域**：危险回收可选锈港货场、霜线冰港和雷暴城区。三图有各自出生点、货物位置、巡逻、掩体与撤离路线；同种子再战保留战区、套装和难度。
- **相位反转**：射击唤醒核心，1.2 秒内冲刺穿核或用 EMP 接管；爆破、冰环和定向电轨变为友方，一次爆场后耗尽。反转给 4 秒内的下一枪 +25% 伤害，不增加技能按钮。
- **巡逻猎物与改装**：每区一名可绕过的精英；击败后亲自领取本局改装和 3 个未结算样本。破甲线圈接冲刺烙印，霜爆弹仓接精准装填，跃电导轨接 EMP 命中；改装不写永久存档。
- **8.1 界面整理**：深海蓝与冰青统一视觉层次，营地与模式入口居中，四组快捷键等宽且键帽居中；说明按需展开，暂停优先显示继续按钮，手机保留 44px 点击区域。
- **8.0 巨械猎场**：独立竞技场内猎杀移动巨械。三门炮座可分别击碎，EMP 接管落地残骸后，瞄准并交互发射有限重火力；也可用 EMP 把敌方慢速重弹朝准星改向。
- **三阶段与反制**：重火力真实命中两次可提前破甲；普通武器始终有效，60% 生命必进裸核阶段，25% 进入过载。锁向光矛、旧位爆圈和带缺口环弹都有预警与恢复窗口。增援有限，地图与菜单期间暂停。
- **7.5 回收流派**：自由回收保留原配置，另可选择飞刃＋冲刺诱饵、榴弹＋EMP 聚拢、轨道枪＋精准装填布雷。可随时换枪，同种子再战保留套装；不增加技能按钮或永久数值收益。
- **7.4 最后一箱**：首次呼叫接应后，附近出现 18 秒可选货箱。取货得到额外 4 份样本，成功带回计 320 分，并招来 2 名追兵；忽略或过期不影响撤离。
- **7.3 通讯站**：消耗一次可用 EMP，在工作圈内累计架设 5 秒，拦截下一波尚未触发的警戒增援；离圈保留进度。一次性使用，不清除既有追兵，也不阻止黑匣子广播或接应追兵。
- **危险回收**：每区五处来源共 17 份样本，成功撤离后每份计 80 分。快线接应 10 秒、空旷；掩体路线 16 秒，两处都需累计登舰 3 秒。加上可选猎物和应急箱，最多带回 24 样本。
- **黑匣子**：带回额外 480 分，携带时武器伤害 +15%；每 12 秒广播位置并招来追兵，可随时放下。
- **连续远征 / 星海远航**：跨地图保留局内构筑，在安全整备中选择路线、补给和装置。
- **单区行动 / 裂隙试炼**：五张战区和独立六波挑战；六把武器、升级进化、可选支线与隐藏技巧。
- 详细规则在游戏中的“ⓘ 说明”按需展开。电脑悬停查看、点击固定；手机点按查看。

原来的合成塔防原型保留在 [garden.html](garden.html)。

## 本地运行

游戏运行不需要安装 npm 依赖。安装 Node.js 后执行：

```sh
npm start
```

打开 <http://127.0.0.1:4173/>，按 Ctrl+C 停止；服务器只监听本机。也可直接打开 `index.html` 进行离线游客试玩。

手机推荐点击营地的“横屏游玩”后横置设备。系统不允许锁定横屏时，请开启自动旋转；旋转或切换显示模式会暂停战斗。

## 操作

| 动作 | 电脑 | 手机 |
| --- | --- | --- |
| 移动 / 瞄准射击 | WASD / 鼠标左键 | 左 / 右摇杆 |
| 冲刺 / EMP / 暴走 | Shift 或空格 / Q / F | 对应按钮 |
| 换枪 / 装填 | 1–6 / R | 武器卡 / 装填按钮 |
| 交互 / 弃货 | E / G | 交互 / 弃货按钮 |
| 地图 / 暂停 | M 或 Tab / P 或 Esc | 地图 / 暂停按钮 |

手机支持保持双摇杆时用第三指换枪、装填与弃货。装填绿色窗口内再次按 R / 点装填可精准装填。打开菜单后战斗与接应计时暂停。

巨械猎场沿用原操作：EMP 接管残骸，靠近并瞄准后按 E / 点交互开炮。每座残骸只有 3 发、间隔 1.2 秒，所有武器仍可切换；同种子再战保留难度和套装。

## 保存

游客进度只保存在当前浏览器；账号同步个人成就、最高分、试炼纪录和教程状态，进行中的关卡不保存。旧游客档案须主动认领后才并入账号。

自行部署账号功能需配置自己的 CloudBase 认证环境与授权域名。前端使用本地官方 SDK，云端接口及迁移见 [cloudbase/PROGRESS_CONTRACT.md](cloudbase/PROGRESS_CONTRACT.md)。游戏不提供公共排行榜或联机战斗。

## 构建网页包

开发依赖已锁定版本；仅构建和浏览器检查需要额外依赖，游戏本身无需它们：

```sh
npm ci --ignore-scripts
npm run build
```

上传 `release/web/` 中的文件即可静态托管。构建合并压缩 JS / CSS，保留 SDK 许可证，不生成源码映射；同时对实际压缩引擎执行回归测试。构建清单与 SHA-256 写入 `build-tools/web/build-report.json`，发布包和报告不进入版本库。

## 项目目录

| 路径 | 用途 |
| --- | --- |
| `action-engine.js` / `action-renderer.js` | 游戏规则 / Canvas 绘图 |
| `action.js` / `expedition.css` / `index.html` | 界面、输入与布局 |
| `audio.js` / `touch-actions.js` / `display-mode.js` | 声音、多指操作、显示模式 |
| `profile-store.js` / `cloud-profile.js` / `account-ui.js` | 玩家档案与账号 |
| `cloudbase/` / `vendor/` | 云存档接口、数据库测试、官方 SDK 与许可证 |
| `tests/` / `scripts/` | 自动测试、构建与场景检查 |
| `garden.html` / `engine.js` / `game.js` / `style.css` | 保留的合成塔防原型 |

## 检验

```sh
npm test
node scripts/check-salvage-layouts.cjs
```

云数据库测试为可选项，需要另装测试专用 PostgreSQL 运行库，不连接真实账号：

```sh
npm install --prefix build-tools/sql-verification --ignore-scripts --no-audit --no-fund @electric-sql/pglite@0.5.8
node --test cloudbase/tests/player-progress.test.cjs
```

浏览器检查需 Playwright，以下两项默认使用本机 Edge；依赖另装到本地工具目录：

```sh
npm install --prefix build-tools/browser --ignore-scripts --no-audit --no-fund playwright
node scripts/check-salvage-risk.cjs
node scripts/check-mobile-layout.cjs
```

没有 Edge 时，下载 Chromium 并为这两项设置各自的通道变量（PowerShell）：

```powershell
node build-tools/browser/node_modules/playwright/cli.js install chromium
$env:BROWSER_CHANNEL = 'chromium'
$env:PLAYWRIGHT_CHANNEL = 'chromium'
```

脚本默认检查源码，`--release` 检查构建包；具体选项、受控夹具和报告路径见脚本开头。浏览器触点模拟不代表实体手机或全部 Safari 兼容性；固定策略与几何检查也不代表真人胜率或全部种子保证。历史验证结论保留在 [更新记录](CHANGELOG.md)。

## 许可证

游戏逻辑、绘图与音效独立编写，以 [MIT](LICENSE) 开源；第三方参考与许可见 [REFERENCES.md](REFERENCES.md)。随附 CloudBase SDK 使用其 [独立许可证](vendor/cloudbase.LICENSE.txt)。
