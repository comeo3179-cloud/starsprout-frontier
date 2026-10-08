(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Expedition = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  // World coordinates and projectile speeds are bounded; no large-number scaling is needed.
  const vectorLength = (x, y) => Math.sqrt(x * x + y * y);
  const distance = (a, b) => vectorLength(a.x - b.x, a.y - b.y);
  const MAPS = [
    { id: 'frontier', name: '荒原边境', subtitle: '信标防线', description: '探索遗迹，坚守三个信标，再击退裂隙守卫。', objectiveLabel: '信标', briefing: '寻找三座信标，留在光圈内上传；全部完成后击败守卫。', color: '#78fbd6', mode: 'defense', boss: { name: '裂隙守卫', subtitle: '留意爆圈、环形弹幕和直线冲锋', color: '#ec83c7' }, threat: { name: '孢子喷发', description: '远离绿色爆圈；可引诱普通敌人进入圈内。' } },
    { id: 'foundry', name: '赤焰熔炉', subtitle: '反应堆拆毁', description: '打开熔炉护罩，顶住守卫火力，炸毁三座反应堆。', objectiveLabel: '反应堆', briefing: '靠近熔炉终端按 E 暴露核心，射击摧毁反应堆；无需留在圈内。', color: '#ffa45e', mode: 'demolition', boss: { name: '熔炉监工', subtitle: '斜向躲十字热浪，侧移避开扇形熔弹', color: '#ff9955' }, threat: { name: '地脉热浪', description: '从橙色热浪带的侧边躲开；热浪也会灼伤普通敌人。' } },
    { id: 'frost', name: '霜线远征', subtitle: '冰原护送', description: '在移动战线上护送勘探运输机，依次穿越三段冰原。', objectiveLabel: '护送段', briefing: '依次启动运输机，留在护送圈内让它前进；离开时运输机停下等待。', color: '#8fdcff', mode: 'escort', boss: { name: '霜棘猎手', subtitle: '冰环内圈安全；冰缓时仍可全速冲刺', color: '#8edcff' }, threat: { name: '霜脉冰爆', description: '移出蓝色爆圈；命中减速 2 秒，冲刺速度不受影响。' } },
    { id: 'storm', name: '雷鸣废港', subtitle: '引雷充能', description: '把雷击引入三座导雷塔，锁定后撤离爆圈，让风暴成为你的武器。', objectiveLabel: '导雷塔', briefing: '按 E 启动导雷塔，在塔圈内等待落雷锁定，再移出爆圈；每座塔接住三次雷击后充满。', color: '#d7bcff', mode: 'conduction', boss: { name: '雷铸裁决者', subtitle: '发招前靠近首领引雷，锁定后闪开，使雷击反噬', color: '#ccb1ff' }, threat: { name: '引雷充能', description: '塔圈内等待雷圈锁定，再移出爆圈；雷击落点在塔圈内才充能。' } },
    { id: 'ruins', name: '归星遗址', subtitle: '星火转运', description: '搬运三枚星火，沿追踪轰击穿越遗址，点亮对应接收站。', objectiveLabel: '接收站', briefing: '靠近星火按 E 拿取，搬到对应接收站再按 E 交付。携带时走速降低 12%；成功冲刺会放下星火，稍后可回收。', color: '#ffd9a0', mode: 'delivery', boss: { name: '归星守墓者', subtitle: '横移避开双斜光刃，移出固定坍缩圈，绕过齐射扇区', color: '#ffce8d' }, threat: { name: '星火追踪', description: '携带时旧位置会锁定轰击，移出金色爆圈；放下或交付后不再新增追踪。' } }
  ];
  const TRIAL_WAVES = [
    { title: '追击之环', briefing: '虫群从两侧逼近。保持移动，利用岩石改变飞刃回程。', enemies: ['crawler', 'crawler', 'crawler', 'crawler', 'crawler', 'crawler', 'crawler', 'crawler'], interval: 1.25 },
    { title: '交叉弹幕', briefing: '射手从对向进入。用掩体分割火线，把敌弹变成反击机会。', enemies: ['spitter', 'spitter', 'spitter', 'spitter', 'spitter', 'spitter', 'crawler', 'crawler', 'crawler', 'crawler'], interval: 1.2 },
    { title: '破阵冲锋', briefing: '冲锋前有短暂蓄势。侧移闪避，沿敌人队列贯穿射击。', enemies: ['charger', 'charger', 'charger', 'charger', 'charger', 'charger', 'crawler', 'crawler', 'crawler', 'crawler', 'tank'], interval: 1.15 },
    { title: '炮火封锁', briefing: '炮击锁定你的旧位置。移动穿出预警，再用榴弹清理后排。', enemies: ['mortar', 'mortar', 'mortar', 'mortar', 'crawler', 'crawler', 'crawler', 'crawler', 'crawler', 'tank'], interval: 1.25 },
    { title: '霜域突围', briefing: '冰爆预警会追踪落点。移出蓝圈；被冰缓后仍可冲刺脱困。', enemies: ['spitter', 'spitter', 'spitter', 'spitter', 'charger', 'charger', 'charger', 'charger', 'tank', 'tank'], interval: 1.2 },
    { title: '裂隙裁决', briefing: '击败双阶段首领，完成六波试炼。观察预警，抓住攻击后的空隙。', enemies: ['boss'], interval: 1 }
  ];
  const CAMPAIGN_DOCTRINES = [
    { id: 'skirmisher', title: '游击先锋', icon: '➶', color: '#8cf5d3', description: '实际移动时射击伤害增加 18%；初始生命上限降低 20。走位与换枪保持火力。' },
    { id: 'marksman', title: '精准猎手', icon: '⌖', color: '#ffd18c', description: '精准装填的强化弹药造成 50% 额外伤害（通常为 15%）；装填时间增加 20%。' },
    { id: 'conductor', title: '脉冲织者', icon: '◎', color: '#c9b3ff', description: 'EMP 冷却缩短 30%、范围增加 35；武器射击伤害降低 12%。' }
  ];
  const CAMPAIGN_AWAKENINGS = [
    { id: 'return-dash', doctrineId: 'skirmisher', title: '折返跃迁', icon: '↶', color: '#8cf5d3', description: '普通冲刺留下 1.4 秒折返窗口；再按冲刺朝起点方向短冲一次，距离不超过正常冲刺，岩石会阻挡。原冷却继续，折返不再次补弹或部署诱饵。', playHint: '冲入火线，再按冲刺折回' },
    { id: 'slide-reload', doctrineId: 'skirmisher', title: '滑步快装', icon: '⇢', color: '#8cf5d3', description: '当前武器正在装填时，成功冲刺立即完成普通装填；不会产生精准强化。', playHint: '先换弹，再冲刺接回火力' },
    { id: 'mag-relay', doctrineId: 'marksman', title: '弹仓接力', icon: '⇄', color: '#ffd18c', description: '精准装填后 3 秒内下一次切枪立即衔接，并使新枪第一发获得精准强化。不补弹、不取消新枪装填，不叠加已有强化。', playHint: '精准装填，再切枪打出强化首发' },
    { id: 'interrupt-round', doctrineId: 'marksman', title: '破招标定', icon: '⌖', color: '#ffd18c', description: '精准强化弹命中的第一个普通移动敌人被打断并眩晕 0.8 秒；每 4 秒最多一次。首领、虫巢和固定目标不受控制。', playHint: '用强化首击打断炮兵与冲锋' },
    { id: 'mobile-field', doctrineId: 'conductor', title: '随行电场', icon: '◌', color: '#c9b3ff', description: 'EMP 后生成随玩家移动的 2.4 秒电场，范围 100。每 0.2 秒最多清除一颗敌弹，总计最多八颗；不追加伤害。', playHint: '脉冲后贴着电场移动穿弹' },
    { id: 'charged-pulse', doctrineId: 'conductor', title: '蓄势脉冲', icon: '◉', color: '#c9b3ff', description: 'EMP 蓄能 0.9 秒，再按可提前释放基础脉冲；满蓄自动释放，范围增加 20%、伤害增加 25%。落点取释放时的位置与准星，仍可投送至远处榴弹。', playHint: '先蓄能再走位，危险时再次按 EMP' }
  ];
  const CAMPAIGN_CRISES = [
    { id: 'pursuit', title: '迅猎', description: '普通移动敌人的行走速度增加 14%。冲锋预警与冲锋速度不变。' },
    { id: 'armored', title: '装甲', description: '普通敌人生命增加 20%；首领、反应堆与能量锚不受影响。' },
    { id: 'reinforcements', title: '增援', description: '战斗期间每 20 秒出现两名追兵；安全整备和探索事件期间暂停。' }
  ];
  const CAMPAIGN_SUPPLIES = [
    { id: 'repair', title: '加固修复', icon: '+', color: '#9de6ca', description: '生命上限增加 10，额外恢复 50 生命。' },
    { id: 'power', title: '火力校准', icon: '✦', color: '#ffd18c', description: '武器伤害倍率增加 10 个百分点。' },
    { id: 'mobility', title: '机动电容', icon: 'ϟ', color: '#c9b3ff', description: '冲刺与 EMP 冷却再缩短 12%。' }
  ];
  const CAMPAIGN_NEXUS = { id: 'nexus', name: '裂隙中枢', subtitle: '远征终局', mode: 'nexus', objectiveLabel: '能量锚', color: '#d8b2ff',
    description: '摧毁两座能量锚，解除中枢主宰的护盾，封闭裂隙。', briefing: '两座能量锚使主宰减伤 65%。射击摧毁两锚后护盾永久解除；横移躲光栅，离开爆圈，穿过环弹间隙。',
    boss: { name: '中枢主宰', subtitle: '破坏两座能量锚解除护盾；横移躲光栅，移动避开追身爆圈', color: '#dfb9ff' },
    threat: { name: '中枢封锁', description: '先拆两锚解除减伤，再抓住攻击后的弱点窗口。' } };
  // Only persistent build fields cross a sector boundary; no combat timer or temporary buff is copied.
  const CAMPAIGN_PLAYER_FIELDS = ['hp', 'maxHp', 'speed', 'weapon', 'level', 'xp', 'xpNeeded', 'credits', 'magnetRadius',
    'damageMultiplier', 'fireRateMultiplier', 'reloadMultiplier', 'magazineMultiplier', 'resistance', 'critChance', 'lifeOnKill',
    'dashMultiplier', 'dashCooldownMax', 'skillCooldownMax', 'skillRadius', 'skillDamage',
    'arcRounds', 'repulsorRounds', 'shatterRounds', 'blastRadius', 'returnEdge', 'starCapacitor'];
  const VOYAGE_DIFFICULTIES = [
    { id: 'normal', title: '启航', description: '标准生命、伤害与敌群规模。', hp: 1, damage: 1, quota: 1 },
    { id: 'overload', title: '超载', description: '普通敌人生命增加 20%，敌方伤害增加 12%，敌群规模增加 20%。', hp: 1.2, damage: 1.12, quota: 1.2 }
  ];
  const VOYAGE_DEVICES = [
    { id: 'afterimage', title: '星尾推进器', icon: '➶', color: '#8fffe0', family: 'dash', description: '成功冲刺留下 2 秒星尾。触碰尾流的敌人承受 32 基础伤害，每条尾流对每个目标只结算一次。最多保留两条。', resonanceId: 'tail-collapse' },
    { id: 'needles', title: '越界猎针', icon: '⋙', color: '#b0ffe6', family: 'dash', description: '成功冲刺后 2 秒内，下次实际射击追加两枚猎针，各造成 22 基础伤害；岩石会阻挡。', resonanceId: 'tail-collapse' },
    { id: 'mirror', title: '镜匣校准仪', icon: '⌁', color: '#ffd9a2', family: 'reload', description: '精准装填后 4 秒内，下次实际射击追加一枚 28 基础伤害、可穿透两个目标的镜弹。校准间隔至少 3 秒。', resonanceId: 'cross-mirror' },
    { id: 'sentry', title: '悬停棱镜', icon: '◇', color: '#fff0b7', family: 'reload', description: '精准装填在脚下留下 3 秒镜台，向 300 范围内最近且无遮挡的敌人发射两枚 22 基础伤害镜弹。校准间隔至少 3 秒，最多一座。', resonanceId: 'cross-mirror' },
    { id: 'well', title: '潮汐引擎', icon: '◎', color: '#b6c5ff', family: 'pulse', description: 'EMP 留下 2.6 秒、半径 125 的引力井，牵引未发动攻击的普通移动敌人，牵引不穿过岩石。不牵引首领和固定目标。', resonanceId: 'tidal-collapse' },
    { id: 'battery', title: '极光电池', icon: 'ϟ', color: '#d5baff', family: 'pulse', description: 'EMP 后 3 秒内，下三次实际射击各追加一枚 26 基础伤害极光弹；不会把散弹的每个弹丸重复计作射击。', resonanceId: 'tidal-collapse' }
  ];
  const VOYAGE_RESONANCES = [
    { id: 'tail-collapse', title: '星门猎场', deviceIds: ['afterimage', 'needles'], color: '#8fffe0', description: '冲刺后的猎针射击同时塌缩现存星尾，在线内追加 45 基础伤害。先掠过敌阵，再开枪引爆航迹。' },
    { id: 'cross-mirror', title: '交叉镜海', deviceIds: ['mirror', 'sentry'], color: '#ffe4ab', description: '校准后的射击还从镜台沿当前准星方向发射 42 基础伤害镜弹。精准装填、移开站位，再形成交叉火线。' },
    { id: 'tidal-collapse', title: '反向潮汐', deviceIds: ['well', 'battery'], color: '#c8bdff', description: '引力井存在时，再按同一个 EMP 键引爆它，造成 75 基础伤害。原冷却继续，不再次清弹或补充电池。' }
  ];
  const VOYAGE_ROOMS = [
    { id: 'clear', title: '清剿封锁', description: '击败本房的有限敌群，点亮撤离门。' },
    { id: 'siege', title: '共鸣破阵', description: '射击拆毁三座共鸣柱，卫兵会从裂隙陆续抵达。' },
    { id: 'harvest', title: '星尘收割', description: '击杀为最近未满的收割器充一格；在它 185 范围内击杀充两格。三座各四格后撤离。' }
  ];
  const VOYAGE_BIOMES = [
    { id: 'cosmos', title: '星海碎岛', color: '#8fffe0' },
    { id: 'forge', title: '日冕船坞', color: '#ffc18b' },
    { id: 'tide', title: '镜海深域', color: '#bfc6ff' }
  ];
  const WEAPONS = [
    { id: 'assault', name: '日耀步枪', shortName: '步枪', description: '连续脉冲 · 全距离均衡', color: '#78fbd6', damage: 16, fireInterval: 0.115, magSize: 30, reloadTime: 1.3, speed: 1050, lifetime: 0.85, pellets: 1, spread: 0.055, pierce: 0 },
    { id: 'shotgun', name: '霰星散弹', shortName: '霰弹', description: '八重散射 · 近距离爆发', color: '#ffd083', damage: 15, fireInterval: 0.64, magSize: 7, reloadTime: 1.7, speed: 830, lifetime: 0.42, pellets: 8, spread: 0.35, pierce: 0 },
    { id: 'piercer', name: '离子穿透炮', shortName: '轨道', description: '高速轨道 · 贯穿四个目标', color: '#b3a5ff', damage: 86, fireInterval: 0.72, magSize: 6, reloadTime: 1.8, speed: 1600, lifetime: 0.9, pellets: 1, spread: 0.008, pierce: 3 },
    { id: 'grenade', name: '熔核榴弹', shortName: '榴弹', description: '碰撞引爆 · 预判落点清除虫群', color: '#ffb169', damage: 78, fireInterval: 0.82, magSize: 5, reloadTime: 1.9, speed: 640, lifetime: 0.9, pellets: 1, spread: 0, pierce: 0 },
    { id: 'boomerang', name: '回旋刃', shortName: '飞刃', description: '去返双击 · 走位改变回程路线', color: '#8ce8ff', damage: 42, fireInterval: 0.66, magSize: 8, reloadTime: 1.55, speed: 700, lifetime: 2.3, pellets: 1, spread: 0, pierce: 99 },
    { id: 'starline', name: '星索钉枪', shortName: '星索', description: '双钉连线 · 引敌穿线割裂', color: '#ffe0a6', damage: 34, fireInterval: 0.48, magSize: 10, reloadTime: 1.6, speed: 880, lifetime: 0.65, pellets: 1, spread: 0, pierce: 0 }
  ];
  const UPGRADES = [
    { id: 'damage', name: '高能弹芯', title: '高能弹芯', icon: '✦', description: '所有武器伤害提升 18%。', maxStacks: 5 },
    { id: 'rapid', name: '超频扳机', title: '超频扳机', icon: '»', description: '射速提升 14%。', maxStacks: 4 },
    { id: 'health', name: '纳米护甲', title: '纳米护甲', icon: '+', description: '生命上限增加 25，并恢复 35 点生命。', maxStacks: 4 },
    { id: 'speed', name: '轻量外骨骼', title: '轻量外骨骼', icon: '↗', description: '移动速度提升 10%。', maxStacks: 3 },
    { id: 'magnet', name: '引力收集器', title: '引力收集器', icon: '◎', description: '拾取范围增加 70，立即获得 12 芯片。', maxStacks: 3 },
    { id: 'dash', name: '相位驱动', title: '相位驱动', icon: 'ϟ', description: '冲刺冷却缩短 22%，冲刺距离增加 10%。', maxStacks: 3 },
    { id: 'pulse', name: '雷暴电容', title: '雷暴电容', icon: '◉', description: 'EMP 伤害增加 40、范围增加 30、冷却缩短 12%。', maxStacks: 3 },
    { id: 'reload', name: '快拆弹匣', title: '快拆弹匣', icon: '↻', description: '换弹时间缩短 22%，所有弹匣补满。', maxStacks: 3 },
    { id: 'crit', name: '弱点扫描', title: '弱点扫描', icon: '⌖', description: '暴击几率增加 12%，暴击造成双倍伤害。', maxStacks: 4 },
    { id: 'vampire', name: '战地回收', title: '战地回收', icon: '♡', description: '每击败一个敌人恢复 1 点生命。', maxStacks: 3 },
    { id: 'shield', name: '反应装甲', title: '反应装甲', icon: '◇', description: '受到的伤害降低 12%，立即恢复 20 生命。', maxStacks: 3 },
    { id: 'capacity', name: '扩容弹舱', title: '扩容弹舱', icon: '▣', description: '弹匣容量增加 25%，立即补满弹药。', maxStacks: 3 },
    { id: 'arc', name: '电弧导体', title: '电弧导体', icon: 'ϟ', description: '步枪命中后向邻近敌人传导一道 45% 伤害电弧。', maxStacks: 1, weapon: 0, category: '武器改造' },
    { id: 'repulsor', name: '震荡散射', title: '震荡散射', icon: '»', description: '霰弹击退并短暂打断普通敌人；重型敌人抵抗击退。', maxStacks: 1, weapon: 1, category: '武器改造' },
    { id: 'shatter', name: '裂解弹芯', title: '裂解弹芯', icon: '✧', description: '轨道弹首次命中时爆裂，对周围敌人造成 35% 伤害。', maxStacks: 1, weapon: 2, category: '武器改造' },
    { id: 'blast-radius', name: '熔核扩散', title: '熔核扩散', icon: '◉', description: '榴弹爆炸半径扩大 50%，更容易覆盖整片虫群。', maxStacks: 1, weapon: 3, category: '武器改造' },
    { id: 'return-edge', name: '逆刃回锋', title: '逆刃回锋', icon: '↶', description: '回旋刃回程伤害提升 60%，移动调整回收路线。', maxStacks: 1, weapon: 4, category: '武器改造' },
    { id: 'star-capacitor', name: '星索电容', title: '星索电容', icon: '⌁', description: '星索绊线持续时间由 4 秒延长至 5 秒，不增加伤害。', maxStacks: 1, weapon: 5, category: '武器改造' }
  ];
  const RELICS = [
    { id: 'phase-mag', title: '相位弹舱', icon: '⇢', description: '每次冲刺为当前武器补入 25% 弹匣容量的弹药。保持移动，连续压制。' },
    { id: 'echo-pulse', title: '回声电容', icon: '◎', description: '脉冲释放 0.65 秒后，在原地再次爆发，造成 65% 脉冲伤害并清除敌弹。' },
    { id: 'precision-burst', title: '猎手棱镜', icon: '⌖', description: '精准装填时向瞄准方向发射三束穿透弹，每束造成 45 点基础伤害，并恢复 10 生命。' }
  ];
  const EVOLUTIONS = [
    { id: 'assault-chain', name: '雷网步枪', title: '雷网步枪', icon: 'ϟ', color: '#95ffdf', weapon: 0, prerequisite: 'arc', minLevel: 4, maxStacks: 1, category: '武器进化', evolution: true, description: '替换单段电弧：每次命中串联至多三名额外敌人，依次造成 45% / 32% / 24% 伤害。每跳范围 160，岩石会阻断传导。', playHint: '拉成虫群，让电弧逐个串联' },
    { id: 'shotgun-breach', name: '破阵重弹', title: '破阵重弹', icon: '⋙', color: '#ffda92', weapon: 1, prerequisite: 'repulsor', minLevel: 4, maxStacks: 1, category: '武器进化', evolution: true, description: '冲刺后 2 秒内的下一次霰弹射击变为三枚窄角重弹：每枚 36 基础伤害、穿透一个目标，射程接近翻倍。其余射击保持八重散射。', playHint: '冲刺后 2 秒内，打出窄角贯穿' },
    { id: 'piercer-mirror', name: '折光轨道', title: '折光轨道', icon: '⌁', color: '#c9b5ff', weapon: 2, prerequisite: 'shatter', minLevel: 4, maxStacks: 1, category: '武器进化', evolution: true, description: '轨道弹碰到岩石后沿表面反射一次，保留 70% 伤害；第二次碰岩终止。反射前后不会重复伤害同一目标。', playHint: '斜射岩石，绕掩体反击' },
    { id: 'grenade-echo', name: '余震熔核', title: '余震熔核', icon: '◎', color: '#ffbb83', weapon: 3, prerequisite: 'blast-radius', minLevel: 4, maxStacks: 1, category: '武器进化', evolution: true, description: '榴弹爆炸后留下余震圈，0.55 秒后造成 45% 爆炸伤害，范围 110。把追兵引入落点；岩石可阻挡余震，余震不会再次分裂。', playHint: '预判追兵，原地二次爆破' },
    { id: 'boomerang-twin', name: '双星回旋', title: '双星回旋', icon: '∞', color: '#a5edff', weapon: 4, prerequisite: 'return-edge', minLevel: 4, maxStacks: 1, category: '武器进化', evolution: true, description: '每发弹药投出两片夹角 20° 的飞刃，各造成原伤害的 70%。两刃均可撞石回锋与冲刺接力，回收弹药仍共用每轮两发的上限。', playHint: '横移收网，冲刺接住双刃' },
    { id: 'star-bridge', name: '双极星桥', title: '双极星桥', icon: '⌁', color: '#fff0bb', weapon: 5, prerequisite: 'star-capacitor', minLevel: 4, maxStacks: 1, category: '武器进化', evolution: true, description: '同时保留上限提升至六钉、三条绊线。敌人触线时清除线附近 60 范围内最近的一颗敌弹，每条线最多清除两颗；伤害和减速不变。', playHint: '交叉布线，把追兵与敌弹引入星桥' }
  ];
  const TACTICS = [
    { id: 'decoy-dash', title: '折跃诱饵', icon: '◇', color: '#91e5ef', description: '冲刺在起点留下 2 秒诱饵，引走附近未发动攻击的追击敌人。6 秒可部署一次；不影响首领与已锁定的攻击。' },
    { id: 'reload-mine', title: '雷匣回收', icon: '✹', color: '#ffd086', description: '精准装填在脚下布置感应雷，敌人靠近即引爆，造成小范围 55 点基础伤害。5 秒失效，6 秒可部署一次；岩石阻挡感应与爆炸。' },
    { id: 'gravity-pulse', title: '引力脉冲', icon: '◎', color: '#cbb0ff', description: 'EMP 将范围内的普通移动敌人向爆心聚拢，方便榴弹与穿透武器收割；牵引保留爆心周围的空隙，且不会穿过岩石。首领、固定目标和已锁定冲锋不受牵引。' }
  ];
  const SECRETS = [
    { id: 'rebound', title: '借势回锋', icon: '↶', condition: '让去程飞刃撞上岩石，再用强化回程命中敌人。', description: '撞石高速返航，伤害提升 35%；返航穿掩体。命中后普通接住回收一发，每轮完整补弹最多回收两发；接力不回收。' },
    { id: 'blade-relay', title: '相位接力', icon: '➶', condition: '冲刺中接住一片返航飞刃。', description: '再次投出造成 120% 基础伤害；前 0.18 秒移动准星可甩弯最多 45°。每片飞刃最多接力一次。' },
    { id: 'bullet-reversal', title: '弹幕逆流', icon: '⇄', condition: '一次脉冲震荡清除至少五颗敌弹。', description: '蓄存最多八发逆流弹 2.5 秒；下一次实际射击沿当时准星释放，每发 18 基础伤害。蓄存不提供护盾。' },
    { id: 'fuse-resonance', title: '引信共鸣', icon: '✺', condition: '用脉冲震荡引爆范围内自己的榴弹。', description: '共鸣爆炸范围提升 35%。装备榴弹时瞄准 65 米内的远处榴弹，可把整次 EMP 投射过去；本次不保护身边。' },
    { id: 'rail-resonance', title: '贯穿超频', icon: '⋙', condition: '同一发穿透炮命中三个不同的存活敌人。', description: '第三击起伤害提升 25%、追加两次穿透，并留下 0.8 秒压制走廊，使普通敌人行走减速 30%；最多一条。' },
    { id: 'ice-break', title: '碎霜突围', icon: '❄', condition: '处于冰缓状态时成功冲刺。', description: '清冰缓并释放 110 范围冰爆，造成 35 基础伤害、冻住普通敌人一秒。1.2 秒内可朝仍冻结的目标提前追击一次，随后冲刺冷却增加 0.8 秒。' }
  ];
  const ENEMIES = {
    crawler: { hp: 38, speed: 92, radius: 15, damage: 7, xp: 5 },
    spitter: { hp: 62, speed: 72, radius: 18, damage: 9, xp: 8 },
    charger: { hp: 88, speed: 105, radius: 19, damage: 14, xp: 10 },
    tank: { hp: 225, speed: 56, radius: 29, damage: 18, xp: 20 },
    mortar: { hp: 108, speed: 61, radius: 23, damage: 18, xp: 14 },
    bulwark: { hp: 160, speed: 62, radius: 24, damage: 12, xp: 18 },
    breacher: { hp: 135, speed: 86, radius: 22, damage: 15, xp: 18 },
    engineer: { hp: 100, speed: 66, radius: 20, damage: 11, xp: 14 },
    nest: { hp: 310, speed: 0, radius: 34, damage: 5, xp: 24 },
    reactor: { hp: 900, speed: 0, radius: 42, damage: 0, xp: 0 },
    anchor: { hp: 360, speed: 0, radius: 28, damage: 0, xp: 0 },
    boss: { hp: 3200, speed: 65, radius: 58, damage: 23, xp: 0 }
  };
  const BATTLEFIELD_GUIDE = [
    { id: 'bulwark', title: '棱盾卫', icon: '◐', category: '破阵敌人', description: '前方棱盾抵消 55% 弹丸伤害，转盾需要时间。侧移或冲刺绕背；EMP 使盾敞开 2.5 秒，三弹齐射后也有短暂空隙。范围爆破与相位引爆不受前盾阻挡。' },
    { id: 'breacher', title: '破岩兽', icon: '➶', category: '破阵敌人', description: '锁定方向后直线冲锋。诱它撞上真正的岩石，会眩晕 1.35 秒并承受更多伤害；碎裂掩体会一同破坏。' },
    { id: 'engineer', title: '投雷工兵', icon: '✹', category: '破阵敌人', description: '锁定旧位置投雷，落地前有提示。感应雷可射爆，EMP 可接管成不伤自己的友方爆破；工兵倒下后已落地的雷仍存在。' },
    { id: 'capacitor', title: '电容筒', icon: 'ϟ', category: '战场物件', description: '射击引爆有 0.65 秒预警，会伤害敌我双方。EMP 接管后安全爆破；完整岩石能挡住雷与电容爆炸，注意预警边界。' },
    { id: 'fragile', title: '碎裂掩体', icon: '◇', category: '战场物件', description: '裂纹掩体可被武器、爆破或破岩兽撞碎。破坏后碰撞和射线同时开放；普通岩石仍然坚固。' }
  ];
  const SALVAGE_DIFFICULTIES = [
    { id: 'normal', title: '启航', description: '标准生命与伤害，有限巡逻和增援。', hp: 1, damage: 1 },
    { id: 'overload', title: '超载', description: '敌人生命增加 20%、伤害增加 12%；来源和增援数量不变。', hp: 1.2, damage: 1.12 }
  ];
  const SALVAGE_LOADOUTS = [
    { id: 'free', title: '自由回收', weapon: 0, tacticId: '' },
    { id: 'decoy', title: '游击飞刃', weapon: 4, tacticId: 'decoy-dash' },
    { id: 'gravity', title: '聚拢爆破', weapon: 3, tacticId: 'gravity-pulse' },
    { id: 'mine', title: '精准布雷', weapon: 2, tacticId: 'reload-mine' }
  ];
  const SALVAGE_MAP = { id: 'salvage', name: '危险回收区', subtitle: '自主撤离', mode: 'salvage', objectiveLabel: '样本', color: '#9fe9d4',
    description: '截停货运、启动钻探、选择静默或暴力开箱，带着样本自主撤离。',
    briefing: '样本带上舰才计奖金。E 回收或呼叫接应；舰到后在圈内累计 3 秒登舰，离圈暂停。空手也能返回。',
    boss: { name: '巡防守卫', subtitle: '无需击败首领，自主呼叫接应', color: '#9fe9d4' },
    threat: { name: '警戒扫描', description: '行动提高警戒；高警戒扫描锁定旧位置，移出预警圈。' } };
  const SALVAGE_SECTORS = [
    { id: 'scrapyard', name: '锈港货场', caption: '掩体与破甲', icon: '◇', color: '#e7bd82', hint: '诱敌穿场，冲刺反转爆破', modId: 'breach', exits: [
      { x: 260, y: 1650, name: '西侧接应点', arrivalDuration: 10, coverLabel: '空旷快线' },
      { x: 2320, y: 1700, name: '东侧接应点', arrivalDuration: 16, coverLabel: '固定掩体' }] },
    { id: 'frostport', name: '霜线冰港', caption: '环区与控场', icon: '❄', color: '#a8ddf4', hint: '抢过冰环，精准装填冰爆', modId: 'frost', exits: [
      { x: 340, y: 300, name: '北港快线', arrivalDuration: 10, coverLabel: '空旷快线' },
      { x: 2260, y: 1610, name: '南港护堤', arrivalDuration: 16, coverLabel: '固定掩体' }] },
    { id: 'stormcity', name: '雷暴城区', caption: '街巷与跃电', icon: 'ϟ', color: '#c6bcff', hint: '横切电轨，EMP 接续跃电', modId: 'arc', exits: [
      { x: 330, y: 1550, name: '西城快线', arrivalDuration: 10, coverLabel: '空旷快线' },
      { x: 2320, y: 1520, name: '东城车库', arrivalDuration: 16, coverLabel: '固定掩体' }] }
  ];
  const SALVAGE_MODS = [
    { id: 'breach', title: '破甲线圈', icon: '⋙', color: '#e7bd82', trigger: '冲刺烙印', hint: '4 秒内下一枪 +25% 伤害、额外穿透一敌，穿过棱盾；岩石仍挡弹。' },
    { id: 'frost', title: '霜爆弹仓', icon: '❄', color: '#a8ddf4', trigger: '精准装填', hint: '4 秒内下一枪 +25% 伤害；首次命中在 85 范围内冰缓敌人 1.4 秒，不穿岩石。' },
    { id: 'arc', title: '跃电导轨', icon: 'ϟ', color: '#c6bcff', trigger: 'EMP 命中', hint: '4 秒内下一枪 +25% 伤害；首次命中最多跃电两次，依次 35% / 20% 伤害，每跳 150，不穿岩石。' }
  ];
  const SALVAGE_LAYOUTS = {
    frostport: { spawn: { x: 350, y: 300 }, sources: [[650, 620], [1000, 930], [1820, 1140], [1570, 460]],
      dronePath: [[1900, 360], [2320, 360], [2320, 760], [1900, 760]],
      stations: [[780, 350, 'medical'], [1260, 1090, 'armory'], [2130, 1390, 'medical']],
      crates: [[450, 490], [860, 1240], [1220, 580], [1850, 900], [2330, 1470], [510, 1020]],
      cover: [[2090, 1540], [2430, 1540], [2260, 1430]], fields: [[800, 700], [1370, 1130], [1750, 600], [2140, 1090]],
      huntPath: [[1370, 1330], [1880, 1330], [1880, 1550], [1370, 1550]], huntType: 'engineer', huntName: '冰港投雷官', nodeKind: 'ring' },
    stormcity: { spawn: { x: 1300, y: 1650 }, sources: [[850, 1430], [700, 900], [1880, 1090], [1400, 440]],
      dronePath: [[1850, 300], [2310, 300], [2310, 650], [1850, 650]],
      stations: [[1100, 1680, 'medical'], [1290, 1070, 'armory'], [2140, 1310, 'medical']],
      crates: [[500, 1550], [800, 1180], [1100, 620], [1820, 790], [2240, 1430], [420, 690]],
      cover: [[2150, 1450], [2490, 1450], [2320, 1340]], fields: [[830, 1710], [1150, 830], [1680, 1240], [2160, 920]],
      huntPath: [[1080, 1190], [1530, 1190], [1530, 1430], [1080, 1430]], huntType: 'bulwark', huntName: '雷城棱盾长', nodeKind: 'lane' }
  };
  const SIEGE_DIFFICULTIES = [
    { id: 'normal', title: '强袭', hp: 1, damage: 1 },
    { id: 'overload', title: '超载', hp: 1.2, damage: 1.12 }
  ];
  const SIEGE_MAP = { id: 'siege', name: '巨械猎场', subtitle: '夺炮破甲', mode: 'siege', objectiveLabel: '巨械', color: '#ffd28b',
    description: '拆下移动巨械的炮座，以它的火力反击。', briefing: '射击拆炮，EMP 接管残骸，瞄准后 E 开火。普通武器全程有效。',
    boss: { name: '行城巨械', subtitle: '拆炮夺火力；两次重击破甲，低血量进入过载', color: '#ffc285' },
    threat: { name: '巨械火控', description: '横移避开锁定射线；EMP 可将主炮重弹按准星改向。' } };

  class Game {
    constructor(options = {}) {
      this.baseRandom = options.random || Math.random;
      this.random = this.baseRandom;
      this.discoveredSecrets = new Set((Array.isArray(options.discoveredSecrets) ? options.discoveredSecrets : []).filter(id => SECRETS.some(secret => secret.id === id)));
      this.reset(options.mapId, options);
    }

    reset(mapId = this.map ? this.map.id : 'frontier', options = {}, idBase = 1) {
      this.random = this.baseRandom;
      this.mode = options.mode === 'siege' ? 'siege' : options.mode === 'salvage' ? 'salvage' : options.mode === 'voyage' ? 'voyage' : options.mode === 'campaign' ? 'campaign' : options.mode === 'trial' ? 'trial' : 'expedition';
      this.trial = null;
      this.campaign = null;
      this.voyage = null;
      this.salvage = null;
      this.siege = null;
      this.battlefield = null;
      this.map = MAPS.find(map => map.id === mapId) || MAPS[0];
      this.nextId = idBase;
      this.phase = 'ready';
      this.elapsed = 0;
      this.kills = 0;
      this.score = 0;
      this.lastDamage = null;
      this.world = { width: 3200, height: 2400 };
      this.player = {
        x: 530, y: 1870, radius: 16, angle: -Math.PI / 2,
        hp: 120, maxHp: 120, speed: 218, weapon: 0,
        ammo: 30, magSize: 30, reloadTimer: 0, dashTimer: 0,
        reloadDuration: 0, reloadProgress: 0, reloadWindowStart: 0.52, reloadWindowEnd: 0.72,
        reloadAttempted: false, reloadResult: 'idle', overcharged: false,
        dashCooldown: 0, skillCooldown: 0, invulnerable: 0, slowTimer: 0,
        reversalAmmo: 0, reversalTimer: 0, reversalDamage: 0, iceChaseTimer: 0, iceChaseReady: false, iceChaseLockout: 0,
        level: 1, xp: 0, xpNeeded: 32, credits: 0,
        magnetRadius: 70, damageMultiplier: 1, fireRateMultiplier: 1,
        reloadMultiplier: 1, magazineMultiplier: 1, resistance: 0,
        critChance: 0.05, lifeOnKill: 0, dashMultiplier: 1,
        dashCooldownMax: 2.8, skillCooldownMax: 13, skillRadius: 210, skillDamage: 65,
        arcRounds: false, repulsorRounds: false, shatterRounds: false, blastRadius: false, returnEdge: false, starCapacitor: false
      };
      this.ammoByWeapon = WEAPONS.map(weapon => weapon.magSize);
      this.reloadByWeapon = WEAPONS.map(() => 0);
      this.reloadDurationByWeapon = WEAPONS.map(() => 0);
      this.reloadAttemptedByWeapon = WEAPONS.map(() => false);
      this.reloadResultByWeapon = WEAPONS.map(() => 'idle');
      this.overchargedByWeapon = WEAPONS.map(() => 0);
      this.fireTimer = 0;
      this.spawnTimer = 5;
      this.breathingTimer = 0;
      this.pressurePhase = 'arrival';
      this.dashVector = { x: 0, y: -1 };
      this.moveVector = { x: 0, y: -1 };
      this.movingShot = false;
      this.enemies = [];
      this.bullets = [];
      this.pickups = [];
      this.hazards = [];
      this.events = [];
      this.upgradeChoices = [];
      this.upgradeStacks = {};
      this.evolutionId = '';
      this.evolutionState = { breachTimer: 0, echoes: [] };
      this.starPins = []; this.starLines = [];
      this.delivery = null;
      this._clearAwakeningState();
      this.relics = [];
      this.relicChoices = [];
      this.tacticId = '';
      this.tacticChoices = [];
      this.tactical = { decoy: null, mine: null, cooldown: 0 };
      this.echoBursts = [];
      this.bladeRecoveryUsed = 0;
      this.iceChaseIds = new Set();
      this.railCorridor = null;
      this.reactor = { charge: 0, maxCharge: 100, timer: 0, duration: 7, captures: 0, detonations: 0 };
      this.combo = { count: 0, timer: 0, best: 0 };
      this.sectorThreat = { timer: 6, interval: 12, name: this.map.threat.name, description: this.map.threat.description, active: false, count: 0 };
      this.dashMarkedIds = new Set();
      this.phaseDashRefund = 0;
      this.bossSpawned = false;
      this.completedRelays = 0;
      this.relaySpawnTimer = 0;
      this.relays = [
        { id: this._id(), type: 'relay', x: 1080, y: 1670, radius: 147, name: '西境 · 回声站', theme: 'swarm', wave: 0, waveName: '虫群回声', waveSpawns: 0, status: 'idle', progress: 0, duration: 40 },
        { id: this._id(), type: 'relay', x: 2660, y: 530, radius: 147, name: '东境 · 棱镜站', theme: 'crossfire', wave: 0, waveName: '交叉火力', waveSpawns: 0, status: 'idle', progress: 0, duration: 40 },
        { id: this._id(), type: 'relay', x: 2540, y: 1920, radius: 147, name: '南境 · 潮汐站', theme: 'siege', wave: 0, waveName: '重装围攻', waveSpawns: 0, status: 'idle', progress: 0, duration: 40 }
      ];
      this.stations = [
        { id: this._id(), type: 'station', kind: 'medical', x: 580, y: 1630, radius: 29, name: '医疗舱', cost: 10, uses: 0 },
        { id: this._id(), type: 'station', kind: 'armory', x: 1570, y: 1210, radius: 31, name: '武器工坊', cost: 20, uses: 0 },
        { id: this._id(), type: 'station', kind: 'medical', x: 2460, y: 1040, radius: 29, name: '医疗舱', cost: 10, uses: 0 },
        { id: this._id(), type: 'station', kind: 'armory', x: 1230, y: 540, radius: 31, name: '武器工坊', cost: 20, uses: 0 }
      ];
      this.crates = [
        [760, 1740], [420, 1260], [850, 1010], [370, 690], [900, 400], [1530, 410],
        [2080, 380], [2330, 760], [2890, 1070], [1960, 1060], [1530, 1640],
        [960, 2070], [1990, 2050], [2770, 2180], [2800, 1580], [1880, 1510]
      ].map(([x, y]) => ({ id: this._id(), type: 'crate', x, y, radius: 20, opened: false }));
      this.contracts = [
        { kind: 'salvage', name: '失落的勘探队', x: 760, y: 1430, goal: 3, description: '回收三枚散落核心，再返回终端领取遗物。', offsets: [[-170, -110], [80, -240], [200, 70]] },
        { kind: 'hunt', name: '铁棘追猎', x: 1580, y: 690, goal: 2, description: '击败铁棘重甲与疾掠先锋，再返回终端。', offsets: [[-180, -110], [190, 100]] },
        { kind: 'purge', name: '潮汐虫巢', x: 2180, y: 1690, goal: 3, description: '摧毁三座持续孵化的虫巢，再返回终端。', offsets: [[-170, -100], [70, -210], [190, 90]] }
      ].map(contract => ({ ...contract, id: this._id(), type: 'contract', radius: 30, status: 'idle', progress: 0, spawned: 0, spawnTimer: 6,
        nodes: contract.offsets.map(([dx, dy]) => ({ id: this._id(), type: 'core', x: contract.x + dx, y: contract.y + dy, radius: 16, collected: false })) }));
      this._configureMap();
      this._configureEncounters();
      this.obstacles = [];
      const protectedPoints = [this.player, ...this.relays, ...(this.delivery?.cargos || []), ...(this.delivery?.cargos.flatMap(cargo => cargo.guardPoints.map(point => ({ ...point, clearance: 50 }))) || []), ...this.stations, ...this.crates, ...this.contracts, ...this.contracts.flatMap(contract => contract.nodes),
        ...this.encounters.map(point => ({ ...point, clearance: 80 })),
        ...this.encounters.flatMap(encounter => [...encounter.nodes.map(point => ({ ...point, clearance: point.radius + 24 })), ...encounter.guardPoints.map(point => ({ ...point, clearance: 50 }))]), { x: 1600, y: 650 }];
      for (let row = 0; row < 7; row += 1) {
        for (let col = 0; col < 10; col += 1) {
          if ((col + row * 3) % 4 === 0) continue;
          const x = 170 + col * 310 + Math.sin(row * 8 + col * 3) * 60;
          const y = 170 + row * 330 + Math.cos(col * 5 + row) * 65;
          const radius = 31 + ((row * 13 + col * 7) % 4) * 11;
          if (protectedPoints.some(point => distance({ x, y }, point) < radius + (point.clearance ?? 140))) continue;
          if (this.map.mode === 'escort' && this.relays.some(relay => relay.waypoints.some((point, index) => index > 0 && this._segmentHit(relay.waypoints[index - 1].x, relay.waypoints[index - 1].y, point.x - relay.waypoints[index - 1].x, point.y - relay.waypoints[index - 1].y, { x, y, radius }, 165) !== null))) continue;
          this.obstacles.push({ id: this._id(), type: 'rock', x, y, radius, variant: (row + col) % 3 });
        }
      }
      if (this.mode === 'trial') this._configureTrial(options.seed);
      if (this.mode === 'campaign') this._configureCampaign(options);
      if (this.mode === 'voyage') this._configureVoyage(options);
      if (this.mode === 'salvage') this._configureSalvage(options);
      if (this.mode === 'siege') this._configureSiege(options);
      this._objective();
      return this;
    }

    _configureSiege(options) {
      const seed = Number.isFinite(options.seed) ? Math.trunc(options.seed) >>> 0 : 1;
      const difficulty = SIEGE_DIFFICULTIES.find(item => item.id === options.difficulty) || SIEGE_DIFFICULTIES[0];
      let state = seed ^ 0x8F1BBCDC;
      this.random = () => {
        state = state + 0x6D2B79F5 | 0;
        let value = Math.imul(state ^ state >>> 15, 1 | state);
        value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
      };
      this.map = SIEGE_MAP; this.world = { width: 2000, height: 1500 };
      Object.assign(this.player, { x: 1000, y: 1320, angle: -Math.PI / 2 });
      this.spawn = { x: this.player.x, y: this.player.y };
      this.relays = []; this.stations = []; this.crates = []; this.contracts = []; this.encounters = [];
      this.delivery = null; this.escort = null; this.battlefield = null; this.sectorThreat.active = false;
      this.sectorThreat.name = this.map.threat.name; this.sectorThreat.description = this.map.threat.description;
      const route = [{ x: 660, y: 450 }, { x: 1380, y: 450 }, { x: 1380, y: 1000 }, { x: 660, y: 1000 }];
      const layout = [[250, 230], [570, 210], [1010, 190], [1550, 210], [1780, 320], [270, 660], [1730, 730],
        [260, 1120], [530, 1260], [1490, 1250], [1740, 1160], [990, 690], [850, 780], [1150, 790]];
      this.obstacles = layout.map(([x, y], index) => ({ id: this._id(), type: 'rock', radius: 32 + index % 3 * 5, variant: index % 3,
        x: x + ((seed + index * 7) % 17 - 8), y: y + ((seed + index * 11) % 17 - 8) }))
        .filter(rock => distance(rock, this.player) > rock.radius + 90 && !route.some((point, index) => {
          const next = route[(index + 1) % route.length];
          return this._segmentHit(point.x, point.y, next.x - point.x, next.y - point.y, rock, 164) !== null;
        }));
      this.terrainRevision = (this.terrainRevision || 0) + 1;
      const loadout = SALVAGE_LOADOUTS.find(item => item.id === options.loadoutId) || SALVAGE_LOADOUTS[0];
      this.player.weapon = loadout.weapon; this.tacticId = loadout.tacticId; this._syncWeapon();
      this.siege = { seed, difficulty: difficulty.id, loadoutId: loadout.id, status: 'hunting', route, waypoint: 1, bossId: null, parts: [], wrecks: [],
        armorHits: 0, aimTarget: null, selectedId: null, shotsFired: 0, captures: 0, reflections: 0, spawned: 0, spawnTimer: 8, quota: 12 };
      const boss = this.spawnEnemy('boss', route[0]);
      Object.assign(boss, { variant: 'siege', radius: 88, hp: 3600 * difficulty.hp, maxHp: 3600 * difficulty.hp,
        speed: 46, damage: 17 * difficulty.damage, shielded: true, attackTimer: 3, ringGapAngle: 0, ringGapWidth: Math.PI / 4 });
      this.siege.bossId = boss.id; this.bossSpawned = true;
      for (const [index, kind] of ['cannon', 'lance', 'mortar'].entries()) {
        const [offsetX, offsetY] = [[-116, 12], [116, 12], [0, -116]][index];
        const part = this.spawnEnemy('reactor', { x: boss.x + offsetX, y: boss.y + offsetY });
        Object.assign(part, { siegePart: kind, bossId: boss.id, offsetX, offsetY, radius: 26, hp: 400 * difficulty.hp,
          maxHp: 400 * difficulty.hp, xp: 12, color: ['#ffc285', '#c6afff', '#ff986f'][index],
          name: ['重弹主炮', '扫射光矛', '迫击炮座'][index], attackTimer: 3 + index * 1.5, windup: 0, shotAngle: 0 });
        this.siege.parts.push(part);
      }
      this._emit('boss-spawn', boss);
    }

    siegeTarget() {
      const siege = this.siege;
      if (!siege || ['complete', 'failed'].includes(siege.status)) return null;
      const available = siege.wrecks.filter(wreck => wreck.status === 'captured' && wreck.ammo > 0);
      const nearby = available.filter(wreck => distance(this.player, wreck) <= 94);
      const broken = siege.wrecks.filter(wreck => wreck.status === 'broken');
      const targets = nearby.length ? nearby : available.length ? available : broken.length ? broken : siege.parts.filter(part => part.hp > 0);
      const boss = this.enemies.find(enemy => enemy.id === siege.bossId && enemy.hp > 0);
      const selected = [...siege.parts.filter(part => part.hp > 0), ...siege.wrecks.filter(wreck => wreck.status !== 'spent'), ...(boss ? [boss] : [])]
        .find(target => target.id === siege.selectedId);
      const target = selected || targets.sort((a, b) => distance(this.player, a) - distance(this.player, b))[0] || boss;
      if (!target) return null;
      const wreck = target.type === 'siege-wreck';
      return { id: target.id, x: target.x, y: target.y, kind: wreck ? target.status === 'broken' ? 'capture' : 'turret' : target.siegePart ? 'part' : 'core',
        label: wreck ? target.name : target.name || this.map.boss.name,
        hint: wreck ? target.status === 'broken' ? 'Q · 接管残骸' : '瞄准后 E · 开火' : target.siegePart ? '射击拆下炮座' : '击败巨械核心',
        progress: wreck ? target.ammo : target.maxHp - target.hp, total: wreck ? 3 : target.maxHp };
    }

    selectSiegeTarget(id) {
      if (!this.siege || this.phase !== 'playing' || ![...this.siege.parts.filter(part => part.hp > 0),
        ...this.siege.wrecks.filter(wreck => wreck.status !== 'spent'), ...this.enemies.filter(enemy => enemy.id === this.siege.bossId && enemy.hp > 0)].some(target => target.id === id)) return false;
      this.siege.selectedId = id; this._objective(); return true;
    }

    _siegeInteraction() {
      const wreck = this.siege.wrecks.filter(item => item.status !== 'spent' && distance(this.player, item) <= 94)
        .sort((a, b) => distance(this.player, a) - distance(this.player, b))[0];
      const ready = wreck?.status === 'captured' && wreck.ammo > 0 && wreck.cooldown === 0;
      return { target: wreck || null, action: this.phase === 'playing' && ready ? '重炮开火' : '',
        hint: !wreck ? '' : wreck.status === 'broken' ? 'Q · 接管炮座 / 3 发' : wreck.cooldown > 0 ? '重炮冷却 · ' + wreck.cooldown.toFixed(1) + 's' : 'E · 瞄准开火 / ' + wreck.ammo + ' 发' };
    }

    _interactSiege(wreck) {
      if (this.phase !== 'playing' || !this.siege.wrecks.includes(wreck) || wreck.status !== 'captured' || wreck.ammo <= 0 || wreck.cooldown > 0 || distance(this.player, wreck) > 94) return false;
      const aim = this.siege.aimTarget, angle = aim ? Math.atan2(aim.y - wreck.y, aim.x - wreck.x) : this.player.angle;
      const lance = wreck.kind === 'lance', mortar = wreck.kind === 'mortar', speed = lance ? 1100 : mortar ? 540 : 700;
      this.bullets.push({ id: this._id(), type: 'bullet', owner: 'player', kind: mortar ? 'grenade' : 'siege', siegeHeavy: true,
        x: wreck.x + Math.cos(angle) * 36, y: wreck.y + Math.sin(angle) * 36, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        radius: lance ? 6 : mortar ? 7 : 10, age: 0, lifetime: mortar ? 1.3 : 2.4, damage: (lance ? 360 : mortar ? 480 : 650) * this.player.damageMultiplier,
        blastRadius: 150, pierce: lance ? 3 : 0, hitIds: [], color: lance ? '#d1bcff' : '#ffe0a6', critical: false });
      wreck.ammo--; wreck.cooldown = 1.2; if (wreck.ammo === 0) wreck.status = 'spent';
      this.siege.shotsFired++;
      this._emit('siege-turret-shot', wreck, { wreckId: wreck.id, kind: wreck.kind, ammo: wreck.ammo, angle, color: '#ffe0a6' });
      return true;
    }

    _siegePartKilled(part) {
      const wreck = { id: this._id(), type: 'siege-wreck', kind: part.siegePart, name: part.name, x: part.x, y: part.y,
        radius: 28, status: 'broken', ammo: 0, cooldown: 0 };
      // The patrol corridor fits all three mounts and their wrecks, including their interaction circles.
      this.siege.wrecks.push(wreck);
      this.hazards = this.hazards.filter(hazard => hazard.sourceId !== part.id);
      part.windup = 0;
      this._emit('siege-part-break', wreck, { partId: part.id, wreckId: wreck.id, kind: wreck.kind, radius: 60, color: part.color });
    }

    _captureSiege(origin, radius) {
      if (!this.siege || this.phase !== 'playing') return;
      for (const wreck of this.siege.wrecks) {
        if (wreck.status !== 'broken' || distance(origin, wreck) > radius ||
          this.obstacles.some(rock => this._segmentHit(origin.x, origin.y, wreck.x - origin.x, wreck.y - origin.y, rock, 0) !== null)) continue;
        wreck.status = 'captured'; wreck.ammo = 3; this.siege.captures++;
        this._emit('siege-capture', wreck, { wreckId: wreck.id, kind: wreck.kind, ammo: 3, radius: 45, color: '#9fe9d4' });
      }
    }

    _redirectSiegeShells(origin, radius) {
      if (!this.siege) return;
      for (const bullet of this.bullets) {
        if (bullet.owner !== 'enemy' || !bullet.siegeHeavy || bullet.lifetime <= 0 || distance(origin, bullet) > radius ||
          this.obstacles.some(rock => this._segmentHit(origin.x, origin.y, bullet.x - origin.x, bullet.y - origin.y, rock, 0) !== null)) continue;
        const aim = this.siege.aimTarget, angle = aim ? Math.atan2(aim.y - bullet.y, aim.x - bullet.x) : this.player.angle;
        Object.assign(bullet, { owner: 'player', vx: Math.cos(angle) * 700, vy: Math.sin(angle) * 700,
          damage: 500 * this.player.damageMultiplier, lifetime: 2.4, pierce: 2, hitIds: [], color: '#a4ffed', critical: false });
        this.siege.reflections++;
        this._emit('siege-redirect', bullet, { bulletId: bullet.id, angle, radius: 30, color: '#a4ffed' });
      }
    }

    _siegeHeavyHit(enemy, bullet) {
      if (!this.siege || !bullet.siegeHeavy || !enemy.shielded || enemy.id !== this.siege.bossId) return;
      this.siege.armorHits = Math.min(2, this.siege.armorHits + 1);
      if (this.siege.armorHits === 2) this._breakSiegeArmor(enemy);
    }

    _breakSiegeArmor(boss) {
      if (!boss.shielded) return;
      boss.shielded = false; boss.stage = 2; this.siege.status = 'core';
      boss.windup = 0; boss.attackKind = ''; boss.attackName = ''; boss.attackHint = ''; boss.recoveryTimer = 3; boss.attackTimer = 3;
      const sourceIds = [boss.id, ...this.siege.parts.map(part => part.id)];
      this.hazards = this.hazards.filter(hazard => !sourceIds.includes(hazard.sourceId));
      for (const part of this.siege.parts) part.windup = 0;
      this._emit('siege-armor-break', boss, { armorHits: this.siege.armorHits, stage: 2, radius: 150, color: '#ffd28b' });
      this._emit('boss-phase', boss, { stage: 2 });
    }

    _checkSiegePhase(boss) {
      if (boss.hp <= 0) return;
      if (boss.shielded && boss.hp <= boss.maxHp * .6) this._breakSiegeArmor(boss);
      if (boss.stage < 3 && boss.hp <= boss.maxHp * .25) {
        boss.stage = 3; this.siege.status = 'overload'; boss.windup = 0; boss.attackKind = ''; boss.attackName = ''; boss.attackHint = '';
        boss.attackTimer = 3; boss.recoveryTimer = 3;
        this.hazards = this.hazards.filter(hazard => hazard.sourceId !== boss.id);
        this._emit('siege-overload', boss, { stage: 3, radius: 120, color: '#ff8f8b' });
        this._emit('boss-phase', boss, { stage: 3 });
      }
    }

    _updateSiege(dt) {
      const siege = this.siege, boss = this.enemies.find(enemy => enemy.id === siege.bossId && enemy.hp > 0);
      if (!boss || this.phase !== 'playing') return;
      const difficulty = SIEGE_DIFFICULTIES.find(item => item.id === siege.difficulty);
      for (const wreck of siege.wrecks) {
        wreck.cooldown = Math.max(0, wreck.cooldown - dt); if (wreck.cooldown < 1e-9) wreck.cooldown = 0;
      }
      this.pressurePhase = 'hunting'; siege.spawnTimer = Math.max(0, siege.spawnTimer - dt);
      if (siege.spawned < siege.quota && siege.spawnTimer === 0 && this.enemies.filter(enemy => enemy.hp > 0 && !enemy.siegePart && enemy.type !== 'boss').length < 6) {
        const points = [{ x: 220, y: 780 }, { x: 1780, y: 780 }, { x: 1000, y: 220 }, { x: 1000, y: 1240 }];
        const point = points.map((_, index) => points[(siege.spawned + index) % points.length]).find(candidate =>
          distance(candidate, this.player) > 220 && !this.obstacles.some(rock => distance(candidate, rock) <= rock.radius + 26));
        if (point) {
          const enemy = this.spawnEnemy(['crawler', 'spitter', 'charger', 'crawler'][siege.spawned % 4], point);
          if (enemy) { siege.spawned++; siege.spawnTimer = 9; }
        } else siege.spawnTimer = 1;
      }
      for (const part of siege.parts) {
        if (part.hp <= 0 || boss.stage !== 1) continue;
        part.hitFlash = Math.max(0, (part.hitFlash || 0) - dt);
        if (part.stunTimer > 0) { part.stunTimer = Math.max(0, part.stunTimer - dt); continue; }
        part.attackTimer -= dt;
        if (part.windup > 0) {
          part.windup = Math.max(0, part.windup - dt);
          if (part.windup === 0 && part.siegePart === 'cannon') {
            this._enemyBullet(part, part.shotAngle, 240, 26 * difficulty.damage);
            Object.assign(this.bullets[this.bullets.length - 1], { kind: 'siege', siegeHeavy: true, age: 0, radius: 10, lifetime: 5.5 });
          }
          continue;
        }
        if (part.attackTimer > 0) continue;
        const angle = Math.atan2(this.player.y - part.y, this.player.x - part.x);
        part.shotAngle = angle; part.angle = angle;
        const extra = { sourceId: part.id, enemyType: 'boss', owner: 'enemy', siegeHazard: true, color: part.color,
          name: part.name, hint: part.siegePart === 'cannon' ? '侧移避开重弹，或用 EMP 改向' : '位置已锁定，移出预警' };
        if (part.siegePart === 'cannon') {
          part.windup = 1.2; part.attackTimer = 5.5;
          this._addHazard('charge', part.x, part.y, 18, 1.2, 0, { ...extra, angle, length: 700, visualOnly: true });
        } else if (part.siegePart === 'lance') {
          part.windup = 1.4; part.attackTimer = 7;
          this._addHazard('lane', part.x, part.y, 22, 1.4, 22 * difficulty.damage, { ...extra, angle, length: 720 });
        } else {
          part.windup = 1.3; part.attackTimer = 6.5;
          this._addHazard('blast', this.player.x, this.player.y, 85, 1.3, 18 * difficulty.damage, extra);
        }
      }
    }

    _updateSiegeBoss(boss, dt) {
      const siege = this.siege, point = siege.route[siege.waypoint], gap = distance(boss, point);
      const step = Math.min(gap, (boss.stage === 1 ? 46 : boss.stage === 2 ? 58 : 66) * dt);
      if (gap > 0) { boss.x += (point.x - boss.x) / gap * step; boss.y += (point.y - boss.y) / gap * step; }
      if (gap <= step + 1e-9) siege.waypoint = (siege.waypoint + 1) % siege.route.length;
      for (const part of siege.parts) if (part.hp > 0) { part.x = boss.x + part.offsetX; part.y = boss.y + part.offsetY; }
      if (boss.stage === 1) return;
      if (boss.windup > 0) {
        boss.windup = Math.max(0, boss.windup - dt);
        if (boss.windup === 0) {
          if (boss.attackKind === 'siege-ring') {
            const count = boss.stage === 3 ? 18 : 14, difficulty = SIEGE_DIFFICULTIES.find(item => item.id === siege.difficulty);
            for (let index = 0; index < count; index++) {
              const angle = TAU * index / count, delta = Math.atan2(Math.sin(angle - boss.ringGapAngle), Math.cos(angle - boss.ringGapAngle));
              if (Math.abs(delta) < boss.ringGapWidth / 2) continue;
              this._enemyBullet(boss, angle, boss.stage === 3 ? 215 : 185, 13 * difficulty.damage);
            }
            this._emit('boss-ring', boss, { radius: 100 });
          }
          boss.recoveryTimer = 3; boss.attackTimer = 3; boss.attackKind = ''; boss.attackName = ''; boss.attackHint = '';
        }
        return;
      }
      if (boss.attackTimer > 0) return;
      const difficulty = SIEGE_DIFFICULTIES.find(item => item.id === siege.difficulty);
      boss.attackCount++; boss.attackTimer = 5;
      if (boss.attackCount % 2 === 1) {
        boss.attackKind = 'siege-ring'; boss.windup = 1.25;
        boss.ringGapAngle = Math.atan2(this.player.y - boss.y, this.player.x - boss.x);
        boss.attackName = '断环齐射'; boss.attackHint = '穿过金色缺口，或冲刺越过弹环';
        this._addHazard('blast', boss.x, boss.y, 100, 1.25, 0, { sourceId: boss.id, visualOnly: true, siegeHazard: true, color: boss.color });
      } else {
        boss.attackKind = 'siege-collapse'; boss.windup = 1.4;
        boss.attackName = '过载落点'; boss.attackHint = '旧位置已锁定，移出爆圈';
        this._addHazard('blast', this.player.x, this.player.y, boss.stage === 3 ? 100 : 85, 1.4, 20 * difficulty.damage,
          { sourceId: boss.id, enemyType: 'boss', owner: 'enemy', siegeHazard: true, color: boss.color, name: boss.attackName, hint: boss.attackHint });
      }
      this._emit('boss-attack', boss, { name: boss.attackName, hint: boss.attackHint, color: boss.color });
    }

    _configureSalvage(options) {
      const seed = Number.isFinite(options.seed) ? Math.trunc(options.seed) >>> 0 : 1;
      const sector = SALVAGE_SECTORS.find(item => item.id === options.sectorId) || SALVAGE_SECTORS[0];
      const layout = SALVAGE_LAYOUTS[sector.id];
      const loadout = SALVAGE_LOADOUTS.find(item => item.id === options.loadoutId) || SALVAGE_LOADOUTS[0];
      this.player.weapon = loadout.weapon; this.tacticId = loadout.tacticId; this._syncWeapon();
      const seeded = initial => {
        let state = initial;
        return () => {
          state = state + 0x6D2B79F5 | 0;
          let value = Math.imul(state ^ state >>> 15, 1 | state);
          value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
          return ((value ^ value >>> 14) >>> 0) / 4294967296;
        };
      };
      const layoutRandom = seeded(seed), offset = () => Math.floor(layoutRandom() * 71) - 35;
      this.random = seeded(seed ^ 0x8CB92BA7);
      this.map = { ...SALVAGE_MAP, name: sector.name, color: sector.color }; this.world = { width: 2600, height: 1900 };
      this.spawn = layout ? { ...layout.spawn } : { x: 350, y: 1580 };
      Object.assign(this.player, this.spawn, { angle: -Math.PI / 2 });
      this.relays = []; this.contracts = []; this.encounters = []; this.delivery = null; this.escort = null;
      this.completedRelays = 0; this.bossSpawned = false; this.sectorThreat.active = false;
      this.sectorThreat.name = this.map.threat.name; this.sectorThreat.description = this.map.threat.description;
      const sources = [
        { kind: 'vault', name: '货道保险箱', x: 630, y: 1430, radius: 26, value: 3, hp: 90, maxHp: 90, status: 'locked', quietTimer: 0 },
        { kind: 'drill', name: '荒坡采样井', x: 1050, y: 1180, radius: 28, value: 4, hp: 0, maxHp: 0, status: 'idle', progress: 0, duration: 8, workRadius: 150 },
        { kind: 'vault', name: '废场保险箱', x: 1800, y: 1040, radius: 26, value: 3, hp: 90, maxHp: 90, status: 'locked', quietTimer: 0 },
        { kind: 'drill', name: '高地采样井', x: 1560, y: 470, radius: 28, value: 4, hp: 0, maxHp: 0, status: 'idle', progress: 0, duration: 8, workRadius: 150 }
      ].map((source, index) => ({ ...source, x: (layout?.sources[index][0] ?? source.x) + offset(), y: (layout?.sources[index][1] ?? source.y) + offset(),
        ...(layout ? { name: (sector.id === 'frostport' ? '冰港' : '雷城') + (source.kind === 'drill' ? '采样井 ' : '保险箱 ') + (Math.floor(index / 2) + 1) } : {}),
        id: this._id(), type: 'salvage-source', hitFlash: 0 }));
      const path = layout ? layout.dronePath.map(([x, y]) => ({ x, y })) : [{ x: 1860, y: 380 }, { x: 2310, y: 380 }, { x: 2310, y: 720 }, { x: 1860, y: 720 }];
      sources.push({ id: this._id(), type: 'salvage-source', kind: 'drone', name: '运输无人机', ...path[0], radius: 25,
        value: 3, hp: 90, maxHp: 90, status: 'flying', speed: 80, path, pathIndex: 1, angle: 0, hitFlash: 0 });
      const exits = sector.exits
        .map(point => ({ ...point, id: this._id(), type: 'salvage-exit', radius: 100 }));
      const cargoRandom = seeded(seed ^ 0xA24BAED5), cargoPoints = [{ x: 1190, y: 800 }, { x: 1590, y: 780 }, { x: 1920, y: 1260 }];
      const cargoPoint = cargoPoints[Math.floor(cargoRandom() * cargoPoints.length)];
      const hotCargo = { id: this._id(), type: 'salvage-cargo', name: '黑匣子', x: cargoPoint.x + Math.floor(cargoRandom() * 61) - 30,
        y: cargoPoint.y + Math.floor(cargoRandom() * 61) - 30, radius: 20, status: 'ground', bonus: 480, weaponBonus: .15,
        pulseInterval: 12, pulseRemaining: 12, pickupLock: 0 };
      const commsRandom = seeded(seed ^ 0xB4D6F125), commsPoints = [{ x: 870, y: 850 }, { x: 1260, y: 440 }, { x: 1700, y: 1410 }];
      const commsPoint = commsPoints[Math.floor(commsRandom() * commsPoints.length)];
      const comms = { id: this._id(), type: 'salvage-comms', name: '通讯站', x: commsPoint.x + Math.floor(commsRandom() * 51) - 25,
        y: commsPoint.y + Math.floor(commsRandom() * 51) - 25, radius: 28, workRadius: 120, duration: 5, progress: 0, status: 'idle' };
      this.salvage = { seed, sectorId: sector.id, loadoutId: loadout.id, difficulty: SALVAGE_DIFFICULTIES.some(item => item.id === options.difficulty) ? options.difficulty : 'normal',
        status: 'exploring', carried: 0, settled: 0, lostSamples: 0, bonus: 0, cargoBonus: 0, hotCargo, comms, alarm: 0, alertLevel: 1,
        thresholds: [false, false, false], sources, exits, selectedId: null, evac: null, lastChance: null, pending: [], spawnTimer: 3, spawned: 0,
        hazardTimer: 9, fieldStats: { fractures: 0, detonations: 0, captures: 0, reversals: 0 },
        nodes: [], hunt: null, modId: '', round: { remaining: 0, duration: 4, modId: '' },
        fields: layout?.fields.map(([x, y]) => ({ x, y })) };
      this.stations = (layout ? layout.stations.map(([x, y, kind]) => ({ x, y, kind })) : [{ x: 710, y: 1650, kind: 'medical' }, { x: 1320, y: 960, kind: 'armory' }, { x: 2170, y: 1470, kind: 'medical' }])
        .map(point => ({ ...point, id: this._id(), type: 'station', radius: 29, name: point.kind === 'medical' ? '医疗舱' : '武器工坊', cost: point.kind === 'medical' ? 10 : 20, uses: 0 }));
      this.crates = (layout ? layout.crates : [[530, 1710], [960, 1480], [1160, 670], [1850, 830], [2250, 1530], [470, 950]])
        .map(([x, y]) => ({ id: this._id(), type: 'crate', x, y, radius: 20, opened: false }));
      const coverPoints = layout ? layout.cover.map(([x, y]) => ({ x, y })) : [{ x: 2150, y: 1630 }, { x: 2490, y: 1630 }, { x: 2320, y: 1520 }];
      const protectedPoints = [this.player, { ...hotCargo, clearance: 100 }, { ...comms, clearance: 150 }, ...coverPoints.map(point => ({ ...point, clearance: 70 })),
        ...(this.salvage.fields || [{ x: 780, y: 1580 }, { x: 1440, y: 1280 }, { x: 1740, y: 820 }, { x: 2200, y: 1050 }]).map(point => ({ ...point, clearance: 60 })), ...exits.map((point, index) => ({ ...point, clearance: index ? 125 : 240 })),
        ...sources.map(source => ({ ...source, clearance: source.kind === 'drill' ? 175 : 100 })), ...this.stations, ...this.crates];
      const routes = [[this.player, sources[0]], [sources[0], sources[1]], [sources[1], sources[2]], [sources[1], sources[3]], [sources[1], comms],
        [sources[2], exits[1]], [sources[3], path[0]], ...path.map((point, index) => [point, path[(index + 1) % path.length]])];
      if (layout) routes.push([this.player, exits[0]], ...layout.huntPath.map(([x, y], index) => [{ x, y }, { x: layout.huntPath[(index + 1) % layout.huntPath.length][0], y: layout.huntPath[(index + 1) % layout.huntPath.length][1] }]));
      this.obstacles = [];
      for (let row = 0; row < 6; row++) for (let col = 0; col < 8; col++) {
        const rock = { id: this._id(), type: 'rock', x: 230 + col * 310 + offset() + (sector.id === 'stormcity' ? row % 2 * 75 : 0),
          y: 210 + row * 290 + offset() + (sector.id === 'frostport' ? col % 2 * 55 : 0), radius: 30 + (row + col) % 3 * 8, variant: (row + col) % 3 };
        if ((row + col * 3) % 4 === 0 || protectedPoints.some(point => distance(rock, point) < rock.radius + (point.clearance || 80)) ||
          routes.some(([a, b]) => this._segmentHit(a.x, a.y, b.x - a.x, b.y - a.y, rock, 60) !== null)) continue;
        this.obstacles.push(rock);
      }
      this.terrainRevision = (this.terrainRevision || 0) + 1;
      this._configureBattlefield();
      this.obstacles.push(...coverPoints.map((point, index) => ({ ...point, id: this._id(), type: 'rock', radius: 40, variant: index, evacCover: true })));
      this._queueSalvage(['crawler', 'crawler', 'spitter', 'crawler', 'breacher', 'spitter', 'crawler', 'bulwark'], 'patrol');
      const nodePoints = [];
      const occupied = [...sources, ...exits, hotCargo, comms, ...this.stations, ...this.crates, ...this.battlefield.props];
      const nodeRoutes = [[sources[0], sources[1]], [sources[1], sources[2]], [sources[1], sources[3]], [this.spawn, sources[0]], [sources[2], exits[1]], [sources[3], path[0]]];
      this.salvage.nodes = [0, 1, 2].map(index => {
        const kind = layout?.nodeKind || 'blast';
        const point = [...nodeRoutes.slice(index), ...nodeRoutes.slice(0, index)].flatMap(([a, b]) =>
          [.5, ...Array.from({ length: 25 }, (_, at) => .2 + at * .025)].map(amount => ({ x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount })))
          .find(candidate => [...occupied, ...nodePoints].every(item => distance(candidate, item) >= Math.max(90, (item.radius || 24) + 64)));
        nodePoints.push(point);
        return { id: this._id(), type: 'salvage-node', kind, name: kind === 'ring' ? '霜环核心' : kind === 'lane' ? '电轨核心' : '爆破核心',
          ...point, radius: 24, fieldRadius: kind === 'ring' ? 150 : kind === 'lane' ? 28 : 140,
          innerRadius: 70, length: 320, angle: index % 2 ? Math.PI / 2 : 0, status: 'idle', duration: 1.2, remaining: 0, hazardId: null };
      });
      const huntPath = layout ? layout.huntPath.map(([x, y]) => ({ x, y })) : [.2, .8].map(amount => ({ x: sources[2].x + (exits[1].x - sources[2].x) * amount, y: sources[2].y + (exits[1].y - sources[2].y) * amount }));
      this.salvage.hunt = { enemyId: null, modId: sector.modId, status: 'patrolling', path: huntPath, pathIndex: 1,
        type: layout?.huntType || 'breacher', name: layout?.huntName || '货场破岩王',
        drop: { id: this._id(), type: 'salvage-mod', kind: 'mod', name: SALVAGE_MODS.find(item => item.id === sector.modId).title,
          ...huntPath[0], radius: 24, status: 'locked', value: 3, modId: sector.modId } };
    }

    _openSalvageLastChance(exit) {
      const salvage = this.salvage;
      if (salvage.lastChance) return;
      let state = salvage.seed ^ 0xE76A952D;
      state = Math.imul(state ^ state >>> 16, 0x7FEB352D);
      state = Math.imul(state ^ state >>> 15, 0x846CA68B);
      const angle = ((state ^ state >>> 16) >>> 0) / 4294967296 * TAU;
      const targets = [...salvage.sources, ...salvage.exits, salvage.hotCargo, salvage.comms, ...this.stations, ...this.crates];
      let point;
      for (let index = 0; index < 64; index++) {
        const reach = [280, 320, 360, 420][Math.floor(index / 16)], direction = angle + index % 16 * TAU / 16;
        const candidate = { x: exit.x + Math.cos(direction) * reach, y: exit.y + Math.sin(direction) * reach };
        if (candidate.x < 50 || candidate.y < 50 || candidate.x > this.world.width - 50 || candidate.y > this.world.height - 50 ||
          targets.some(target => distance(candidate, target) <= (target.type === 'salvage-exit' ? target.radius + 94 : 188)) ||
          this.obstacles.some(rock => this._segmentHit(exit.x, exit.y, candidate.x - exit.x, candidate.y - exit.y, rock, this.player.radius + 8) !== null) ||
          this.battlefield.props.some(field => distance(candidate, field) <= field.blastRadius + 24)) continue;
        point = candidate; break;
      }
      if (!point) return;
      const cargo = salvage.lastChance = { ...point, id: this._id(), type: 'salvage-lastchance', name: '应急货箱', radius: 24,
        status: 'available', value: 4, duration: 18, remaining: 18 };
      this._emit('salvage-lastchance-appear', cargo, { sourceId: cargo.id, value: cargo.value, duration: cargo.duration, remaining: cargo.remaining, color: '#ffc18a' });
    }

    _armSalvageNode(node, friendly = false, method = 'shot') {
      if (this.phase !== 'playing' || !this.salvage?.nodes.includes(node) || node.status === 'spent' || node.status === 'friendly') return false;
      if (node.status === 'idle') {
        node.status = 'primed'; node.remaining = node.duration;
        this._addHazard(node.kind, node.x, node.y, node.fieldRadius, node.duration, node.kind === 'ring' ? 16 : node.kind === 'lane' ? 20 : 18,
          { owner: 'environment', salvageNodeId: node.id, friendly: false, innerRadius: node.innerRadius, angle: node.angle, length: node.length,
            effect: node.kind === 'ring' ? 'slow' : '', enemyDamage: node.kind === 'ring' ? 45 : node.kind === 'lane' ? 55 : 60,
            color: this.map.color, name: node.name, hint: '冲刺穿过核心或用 EMP 反转；移出预警场域也可避险。' });
        node.hazardId = this.hazards[this.hazards.length - 1].id;
        this._emit('salvage-node-arm', node, { nodeId: node.id, kind: node.kind, radius: node.fieldRadius, innerRadius: node.innerRadius,
          angle: node.angle, length: node.length, duration: node.duration, color: this.map.color });
      } else if (!friendly) return false;
      if (friendly) {
        const hazard = this.hazards.find(item => item.id === node.hazardId && !item.resolved && item.remaining > 0);
        if (!hazard) return false;
        node.status = 'friendly'; hazard.friendly = true; hazard.color = '#8fffe0';
        hazard.enemyDamage = node.kind === 'ring' ? 110 : node.kind === 'lane' ? 140 : 150;
        this.salvage.fieldStats.reversals++;
        this._primeSalvageRound('node');
        this._emit('salvage-node-reverse', node, { nodeId: node.id, kind: node.kind, radius: node.fieldRadius, method, duration: 4, color: '#8fffe0' });
      }
      return true;
    }

    _reverseSalvageNodes(origin, radius) {
      if (!this.salvage || this.phase !== 'playing') return;
      for (const node of this.salvage.nodes) {
        if (!['idle', 'primed'].includes(node.status) || distance(origin, node) > radius + node.radius ||
          this.obstacles.some(rock => this._segmentHit(origin.x, origin.y, node.x - origin.x, node.y - origin.y, rock, 0) !== null)) continue;
        this._armSalvageNode(node, true, 'pulse');
      }
    }

    _primeSalvageRound(reason) {
      const salvage = this.salvage;
      if (!salvage || this.phase !== 'playing' || reason !== 'node' && ({ breach: 'dash', frost: 'reload', arc: 'pulse' }[salvage.modId] !== reason)) return false;
      salvage.round.remaining = salvage.round.duration; salvage.round.modId = salvage.modId;
      this._emit('salvage-round-ready', this.player, { modId: salvage.modId, duration: salvage.round.duration, reason, color: this.map.color });
      return true;
    }

    _salvageTargets() {
      const salvage = this.salvage;
      if (!salvage || ['extracted', 'withdrawn', 'failed'].includes(salvage.status)) return [];
      const elite = this.enemies.find(enemy => enemy.id === salvage.hunt.enemyId && enemy.hp > 0);
      return [...salvage.sources.filter(source => source.status !== 'collected'), ...salvage.exits,
        ...(['ground', 'dropped'].includes(salvage.hotCargo.status) ? [salvage.hotCargo] : []),
        ...(['idle', 'linking'].includes(salvage.comms.status) ? [salvage.comms] : []),
        ...(salvage.lastChance?.status === 'available' && salvage.lastChance.remaining > 0 ? [salvage.lastChance] : []),
        ...salvage.nodes.filter(node => node.status !== 'spent'),
        ...(elite ? [{ ...elite, type: 'salvage-hunt', kind: 'hunt' }] : []),
        ...(salvage.hunt.drop.status === 'open' ? [salvage.hunt.drop] : [])];
    }

    salvageTarget() {
      const salvage = this.salvage, targets = this._salvageTargets();
      if (!targets.length) return null;
      const available = salvage.sources.filter(source => source.status !== 'collected');
      let target = targets.find(item => item.id === salvage.selectedId);
      if (!target) target = salvage.evac ? salvage.exits.find(exit => exit.id === salvage.evac.exitId) :
        available.sort((a, b) => distance(this.player, a) - distance(this.player, b))[0] || salvage.exits[0];
      if (target.type === 'salvage-exit') {
        const active = salvage.evac && salvage.evac.exitId === target.id, boarding = active && salvage.status === 'boarding';
        return { id: target.id, x: target.x, y: target.y, kind: 'exit', label: target.name,
          hint: active ? boarding ? '进入接应圈累计 3 秒；离圈暂停' : '接应途中，可继续作战' : salvage.evac ? '接应已锁定另一个点' : target.coverLabel + ' · ' + target.arrivalDuration + ' 秒接应，圈内累计 3 秒登舰',
          progress: active ? boarding ? salvage.evac.progress : salvage.evac.duration - salvage.evac.remaining : 0,
          total: active ? boarding ? salvage.evac.boardingDuration : salvage.evac.duration : 0 };
      }
      if (target.type === 'salvage-cargo') return { id: target.id, x: target.x, y: target.y, kind: 'cargo', label: target.name,
        hint: '带回奖金 +' + target.bonus + ' · 武器伤害 +15% · 携带每 12 秒广播，可随时放下', progress: 0, total: 0 };
      if (target.type === 'salvage-comms') return { id: target.id, x: target.x, y: target.y, kind: 'comms', label: target.name,
        hint: target.status === 'linking' ? '圈内架设，离圈暂停' : '可用 EMP 换一次拦截 · 架设 5 秒 · 只挡下一波警戒增援', progress: target.progress, total: target.duration };
      if (target.type === 'salvage-lastchance') return { id: target.id, x: target.x, y: target.y, kind: 'lastchance', label: target.name,
        hint: Math.ceil(target.remaining) + ' 秒 · 样本 +4 / 带回 320 · 取货后 2 名追兵', progress: target.duration - target.remaining, total: target.duration };
      if (target.type === 'salvage-node') return { id: target.id, x: target.x, y: target.y, kind: 'node', label: target.name, color: this.map.color,
        hint: target.status === 'friendly' ? '已反转 · 只伤敌方' : target.status === 'primed' ? '冲刺穿过核心反转；也可 EMP 接管' : '射击唤醒，再冲刺穿核心；或 EMP 直接接管',
        progress: target.status === 'idle' ? 0 : target.duration - target.remaining, total: target.status === 'idle' ? 0 : target.duration };
      if (target.type === 'salvage-hunt') return { id: target.id, x: target.x, y: target.y, kind: 'hunt', label: target.name, color: this.map.color,
        hint: '可绕过 · 击败后可拾取本局改装和 3 样本', progress: target.maxHp - target.hp, total: target.maxHp };
      if (target.type === 'salvage-mod') return { id: target.id, x: target.x, y: target.y, kind: 'mod', label: target.name, color: this.map.color,
        hint: 'E 装备本局单槽改装 · 样本 +3，登舰才结算', progress: 0, total: 0 };
      const hint = target.kind === 'drill' ? target.status === 'drilling' ? '圈内推进，离圈暂停；可以继续作战' : '靠近按 E 钻探，圈内累计 8 秒' :
        target.status === 'open' ? '靠近按 E 回收货物' : target.kind === 'vault' ? target.quietTimer > 0 ? '临时解锁中，靠近按 E 安静领取' : '近处 EMP 静默解锁，或射击暴力破锁' : '射击截停，再靠近按 E 回收';
      return { id: target.id, x: target.x, y: target.y, kind: target.kind, label: target.status === 'open' && target.kind === 'drone' ? '无人机货物' : target.name, hint,
        progress: target.kind === 'drill' ? target.progress : target.maxHp - target.hp, total: target.kind === 'drill' ? target.duration : target.maxHp };
    }

    selectSalvageTarget(id) {
      if (this.phase !== 'playing' || !this._salvageTargets().some(item => item.id === id)) return false;
      this.salvage.selectedId = id; this._objective(); return true;
    }

    _queueSalvage(plan, reason) {
      if (!this.salvage || ['extracted', 'withdrawn', 'failed'].includes(this.salvage.status)) return;
      const tickets = plan.map(type => ({ type, reason }));
      // A new action's response arrives before leftover patrols; all old tickets remain finite and intact.
      if (reason === 'patrol') this.salvage.pending.push(...tickets);
      else this.salvage.pending.unshift(...tickets);
    }

    _raiseSalvageAlarm(amount) {
      const salvage = this.salvage;
      if (!salvage || this.phase !== 'playing') return;
      salvage.alarm = clamp(salvage.alarm + amount, 0, 100);
      const plans = [['engineer', 'crawler'], ['bulwark', 'spitter', 'charger'], ['breacher', 'engineer', 'tank', 'mortar']];
      for (const [index, threshold] of [25, 55, 80].entries()) {
        if (salvage.alarm < threshold || salvage.thresholds[index]) continue;
        salvage.thresholds[index] = true; salvage.alertLevel = index + 2;
        const blocked = salvage.comms.status === 'armed';
        if (blocked) {
          salvage.comms.status = 'spent';
          this._emit('salvage-comms-block', salvage.comms, { stationId: salvage.comms.id, level: salvage.alertLevel, alarm: salvage.alarm, blocked: plans[index].length, color: '#9fe9d4' });
        } else this._queueSalvage(plans[index], 'alert-' + salvage.alertLevel);
        this._emit('salvage-alert', this.player, { level: salvage.alertLevel, alarm: salvage.alarm, ...(blocked ? { blocked: true } : {}), color: '#ffc18a' });
      }
      if (salvage.thresholds.every(Boolean) && ['idle', 'linking'].includes(salvage.comms.status)) {
        salvage.comms.status = 'expired';
        if (salvage.selectedId === salvage.comms.id) salvage.selectedId = null;
        this._emit('salvage-comms-expired', salvage.comms, { stationId: salvage.comms.id, color: '#ffc18a' });
      }
    }

    _collectSalvage(source) {
      if (!this.salvage || this.phase !== 'playing' || source.status === 'collected' ||
        !(source.status === 'open' || source.kind === 'vault' && source.quietTimer > 0 || source.kind === 'drill' && source.status === 'drilling' && source.progress >= source.duration)) return false;
      source.status = 'collected'; source.quietTimer = 0; this.salvage.carried += source.value;
      if (this.salvage.selectedId === source.id) this.salvage.selectedId = null;
      this._emit('salvage-collected', source, { sourceId: source.id, kind: source.kind, value: source.value, carried: this.salvage.carried, color: '#9fe9d4' });
      this._objective(); return true;
    }

    _damageSalvageSource(source, amount) {
      if (!this.salvage || this.phase !== 'playing' || !['locked', 'flying'].includes(source.status) || source.hp <= 0) return;
      source.hp = Math.max(0, source.hp - amount); source.hitFlash = .08;
      this._emit('spark', source, { color: '#ffc18a' });
      if (source.hp > 0) return;
      source.status = 'open'; source.quietTimer = 0;
      this._raiseSalvageAlarm(source.kind === 'vault' ? 18 : 12);
      this._emit('salvage-source-open', source, { sourceId: source.id, kind: source.kind, value: source.value, color: '#ffc18a' });
      this._objective();
    }

    _unlockSalvageVaults(origin) {
      if (!this.salvage || this.phase !== 'playing') return;
      for (const source of this.salvage.sources) {
        if (source.kind !== 'vault' || source.status !== 'locked' || distance(origin, source) > 110 ||
          this.obstacles.some(rock => this._segmentHit(origin.x, origin.y, source.x - origin.x, source.y - origin.y, rock, 0) !== null)) continue;
        source.quietTimer = 4;
        this._emit('salvage-vault-unlock', source, { sourceId: source.id, kind: source.kind, duration: 4, color: '#9fe9d4' });
      }
    }

    _salvageInteraction() {
      const salvage = this.salvage;
      const drop = salvage.hunt.drop;
      if (drop.status === 'open' && distance(this.player, drop) <= 94)
        return { target: drop, action: this.phase === 'playing' ? '装备改装' : '', hint: 'E · ' + drop.name + ' / 样本 +3，登舰后结算' };
      const source = salvage.sources.filter(item => item.status !== 'collected' && distance(this.player, item) <= 94)
        .sort((a, b) => distance(this.player, a) - distance(this.player, b))[0];
      if (source) {
        const action = source.status === 'open' ? '回收' : source.kind === 'vault' && source.quietTimer > 0 ? '静默领取' : source.kind === 'drill' && source.status === 'idle' ? '钻探' : '';
        const hint = action ? 'E · ' + action + ' / 样本 +' + source.value : source.kind === 'drill' ? '钻探 ' + source.progress.toFixed(1) + '/8 秒 · 圈内推进，离圈暂停' :
          source.kind === 'vault' ? '近处 EMP 静默解锁，或射击暴力破锁' : '先射击截停运输无人机';
        return { target: source, action: this.phase === 'playing' ? action : '', hint };
      }
      const cargo = salvage.lastChance;
      if (cargo?.status === 'available' && cargo.remaining > 0 && distance(this.player, cargo) <= 94)
        return { target: cargo, action: this.phase === 'playing' ? '回收应急货箱' : '', hint: 'E · 样本 +4 / 带回 320 · 剩余 ' + Math.ceil(cargo.remaining) + ' 秒 · 取货后 2 名追兵' };
      const exit = salvage.exits.filter(item => distance(this.player, item) <= item.radius)
        .sort((a, b) => distance(this.player, a) - distance(this.player, b))[0];
      if (!exit) {
        const node = salvage.nodes.find(item => item.status !== 'spent' && distance(this.player, item) <= 94);
        return node ? { target: node, action: '', hint: node.status === 'friendly' ? '已反转 · 只伤敌方' : node.status === 'primed' ? '冲刺穿过核心或 EMP 反转' : '射击核心，再冲刺穿过；EMP 可直接接管' } : null;
      }
      return { target: exit, action: this.phase === 'playing' && !salvage.evac ? '呼叫接应' : '',
        hint: !salvage.evac ? 'E · 呼叫接应 / ' + exit.coverLabel + ' · ' + exit.arrivalDuration + ' 秒到达，再在圈内累计 3 秒登舰' : salvage.evac.exitId !== exit.id ? '接应已锁定另一处，请按箭头返回' :
          salvage.status === 'boarding' ? '圈内累计登舰 ' + salvage.evac.progress.toFixed(1) + '/3 秒 · 可以继续作战' : '接应途中 · ' + Math.ceil(salvage.evac.remaining) + ' 秒' };
    }

    _salvageCargoInteraction() {
      const cargo = this.salvage?.hotCargo;
      if (!cargo || !['ground', 'dropped'].includes(cargo.status) || distance(this.player, cargo) > 94) return null;
      return { target: cargo, action: this.phase === 'playing' && cargo.pickupLock === 0 ? '拾取黑匣子' : '',
        hint: cargo.pickupLock > 0 ? '黑匣子刚放下，稍后可重新拾取' : 'E · 拾取黑匣子 / 带回 +480 · 武器 +15% · 每 12 秒广播，可随时放下' };
    }

    _salvageCommsInteraction() {
      const comms = this.salvage?.comms;
      if (!comms || distance(this.player, comms) > 94) return null;
      const available = comms.status === 'idle' && this.salvage.thresholds.some(value => !value);
      return { target: comms, action: this.phase === 'playing' && available && this.player.skillCooldown === 0 ? '架设通讯' : '',
        hint: comms.status === 'linking' ? '架设 ' + comms.progress.toFixed(1) + '/5 秒 · 离圈暂停' : comms.status === 'armed' ? '已待命 · 只拦截下一波警戒增援' :
          comms.status === 'spent' ? '通讯拦截已使用' : !available ? '增援已全部出动' : this.player.skillCooldown > 0 ? 'EMP 冷却 ' + Math.ceil(this.player.skillCooldown) + ' 秒' : 'E · 消耗可用 EMP，架设 5 秒，拦截下一波警戒增援' };
    }

    dropSalvageCargo() {
      const cargo = this.salvage?.hotCargo;
      if (this.phase !== 'playing' || !cargo || cargo.status !== 'carried') return false;
      Object.assign(cargo, { status: 'dropped', x: this.player.x, y: this.player.y, pickupLock: .75 });
      this._emit('salvage-cargo-dropped', cargo, { cargoId: cargo.id, pulseRemaining: cargo.pulseRemaining, bonus: cargo.bonus, color: '#ffc18a' });
      this._objective(); return true;
    }

    _interactSalvage(target) {
      const salvage = this.salvage;
      if (target.type === 'salvage-mod') {
        if (this.phase !== 'playing' || this.player.hp <= 0 || target !== salvage.hunt.drop || target.status !== 'open' || distance(this.player, target) > 94) return false;
        target.status = 'collected'; salvage.hunt.status = 'claimed'; salvage.modId = target.modId; salvage.carried += target.value;
        if (salvage.selectedId === target.id) salvage.selectedId = null;
        if (salvage.round.remaining > 0) salvage.round.modId = target.modId;
        this._emit('salvage-mod-equipped', target, { dropId: target.id, modId: target.modId, value: target.value, carried: salvage.carried, color: this.map.color });
      } else if (target.type === 'salvage-lastchance') {
        if (this.phase !== 'playing' || this.player.hp <= 0 || target !== salvage.lastChance || target.status !== 'available' || target.remaining <= 0 || distance(this.player, target) > 94) return false;
        target.status = 'collected'; salvage.carried += target.value;
        if (salvage.selectedId === target.id) salvage.selectedId = null;
        this._queueSalvage(['charger', 'spitter'], 'lastchance');
        this._emit('salvage-lastchance-collected', target, { sourceId: target.id, value: target.value, duration: target.duration, remaining: target.remaining, carried: salvage.carried, color: '#ffc18a' });
      } else if (target.type === 'salvage-comms') {
        if (this.phase !== 'playing' || target !== salvage.comms || target.status !== 'idle' || this.player.skillCooldown > 0 ||
          distance(this.player, target) > 94 || salvage.thresholds.every(Boolean)) return false;
        target.status = 'linking'; this.player.skillCooldown = this.player.skillCooldownMax;
        this._emit('salvage-comms-start', target, { stationId: target.id, duration: target.duration, color: '#9fe9d4' });
      } else if (target.type === 'salvage-cargo') {
        if (this.phase !== 'playing' || target !== salvage.hotCargo || !['ground', 'dropped'].includes(target.status) || target.pickupLock > 0 || distance(this.player, target) > 94) return false;
        target.status = 'carried'; target.x = this.player.x; target.y = this.player.y;
        if (salvage.selectedId === target.id) salvage.selectedId = null;
        this._emit('salvage-cargo-picked', target, { cargoId: target.id, bonus: target.bonus, weaponBonus: target.weaponBonus, pulseRemaining: target.pulseRemaining, color: '#ffc18a' });
      } else if (target.type === 'salvage-exit') {
        if (salvage.evac) return false;
        salvage.evac = { exitId: target.id, remaining: target.arrivalDuration, progress: 0, duration: target.arrivalDuration, boardingDuration: 3 };
        salvage.status = 'approaching'; salvage.selectedId = target.id;
        this._queueSalvage(['crawler', 'spitter', 'crawler', 'engineer', 'charger', 'bulwark'], 'evac');
        this._emit('salvage-call', target, { exitId: target.id, duration: target.arrivalDuration, color: '#9fe9d4' });
        this._openSalvageLastChance(target);
      } else if (target.kind === 'drill' && target.status === 'idle') {
        target.status = 'drilling';
        this._queueSalvage(['crawler', 'crawler', 'spitter', 'crawler', 'breacher', 'crawler'], 'drill-' + target.id);
        this._raiseSalvageAlarm(8);
        this._emit('salvage-source-start', target, { sourceId: target.id, kind: target.kind, duration: target.duration, color: '#9fe9d4' });
      } else {
        const quiet = target.kind === 'vault' && target.status === 'locked';
        if (!this._collectSalvage(target)) return false;
        if (quiet) this._raiseSalvageAlarm(5);
      }
      this._objective(); return true;
    }

    _salvageSpawnPoint(type) {
      const salvage = this.salvage, radius = ENEMIES[type].radius;
      for (let index = 0; index < 24; index++) {
        const angle = (salvage.spawned * 7 + index * 5 + salvage.seed % 24) * TAU / 24;
        const reach = 300 + index % 3 * 45;
        const point = { x: clamp(this.player.x + Math.cos(angle) * reach, radius + 30, this.world.width - radius - 30),
          y: clamp(this.player.y + Math.sin(angle) * reach, radius + 30, this.world.height - radius - 30) };
        if (distance(point, this.player) < 260 || this.obstacles.some(rock => distance(point, rock) < rock.radius + radius + 12) ||
          this.enemies.some(enemy => enemy.hp > 0 && distance(point, enemy) < enemy.radius + radius + 12)) continue;
        return point;
      }
      return null;
    }

    _updateSalvage(dt) {
      const salvage = this.salvage;
      if (!salvage || this.phase !== 'playing') return;
      salvage.round.remaining = Math.max(0, salvage.round.remaining - dt);
      if (salvage.round.remaining < 1e-9) salvage.round.remaining = 0;
      this.pressurePhase = salvage.evac ? 'evac' : salvage.pending.length || this.enemies.some(enemy => enemy.hp > 0) ? 'pressure' : 'recovery';
      const lastChance = salvage.lastChance;
      if (lastChance?.status === 'available') {
        lastChance.remaining = Math.max(0, lastChance.remaining - dt);
        if (lastChance.remaining < 1e-9) {
          lastChance.remaining = 0; lastChance.status = 'expired';
          if (salvage.selectedId === lastChance.id) salvage.selectedId = null;
          this._emit('salvage-lastchance-expired', lastChance, { sourceId: lastChance.id, value: lastChance.value, duration: lastChance.duration, remaining: 0, color: '#ffc18a' });
        }
      }
      const cargo = salvage.hotCargo;
      cargo.pickupLock = Math.max(0, cargo.pickupLock - dt);
      if (cargo.pickupLock < 1e-9) cargo.pickupLock = 0;
      if (cargo.status === 'carried') {
        cargo.x = this.player.x; cargo.y = this.player.y; cargo.pulseRemaining = Math.max(0, cargo.pulseRemaining - dt);
        if (cargo.pulseRemaining < 1e-9) {
          cargo.pulseRemaining = cargo.pulseInterval;
          const slots = Math.max(0, 4 - salvage.pending.filter(ticket => ticket.reason === 'cargo').length);
          const plan = ['charger', 'spitter'].slice(0, slots);
          this._queueSalvage(plan, 'cargo'); this._raiseSalvageAlarm(6);
          this._emit('salvage-cargo-pulse', cargo, { cargoId: cargo.id, duration: cargo.pulseInterval, reinforcements: plan.length, color: '#ffc18a' });
        }
      }
      for (const source of salvage.sources) {
        source.hitFlash = Math.max(0, source.hitFlash - dt);
        if (source.kind === 'vault') source.quietTimer = Math.max(0, source.quietTimer - dt);
        if (source.kind !== 'drone' || source.status !== 'flying') continue;
        let travel = source.speed * dt;
        while (travel > 0) {
          const point = source.path[source.pathIndex], dx = point.x - source.x, dy = point.y - source.y, gap = vectorLength(dx, dy);
          const amount = Math.min(travel, gap);
          if (gap > 0) { source.x += dx / gap * amount; source.y += dy / gap * amount; source.angle = Math.atan2(dy, dx); }
          travel -= amount;
          if (gap <= amount + 1e-9) source.pathIndex = (source.pathIndex + 1) % source.path.length;
        }
      }
      salvage.spawnTimer = Math.max(0, salvage.spawnTimer - dt);
      if (salvage.pending.length && salvage.spawnTimer === 0 && this.enemies.filter(enemy => enemy.hp > 0).length < 14) {
        const ticket = salvage.pending[0], point = this._salvageSpawnPoint(ticket.type);
        const enemy = point && this.spawnEnemy(ticket.type, point);
        if (enemy) { salvage.pending.shift(); salvage.spawned++; enemy.salvageReason = ticket.reason; salvage.spawnTimer = 1.7; }
        else salvage.spawnTimer = .25;
      }
      if (salvage.alertLevel >= 3) {
        salvage.hazardTimer = Math.max(0, salvage.hazardTimer - dt);
        if (salvage.hazardTimer === 0 && this.hazards.filter(hazard => hazard.salvageScan && !hazard.resolved).length < 8) {
          salvage.hazardTimer = 9;
          this._addHazard('blast', this.player.x, this.player.y, 85, 1.15, 14,
            { owner: 'environment', salvageScan: true, enemyDamage: 45, color: '#ffc18a', name: '警戒扫描', hint: '扫描锁定旧位置；在圈亮起前移出预警边界。' });
        }
      }
    }

    _finishSalvageStep(dt) {
      const salvage = this.salvage;
      if (!salvage || this.phase !== 'playing') return;
      for (const source of salvage.sources) {
        if (source.kind !== 'drill' || source.status !== 'drilling' || distance(this.player, source) > source.workRadius) continue;
        source.progress = Math.min(source.duration, source.progress + dt);
        if (source.duration - source.progress < 1e-9) source.progress = source.duration;
        if (source.progress === source.duration && this._collectSalvage(source)) this._raiseSalvageAlarm(8);
      }
      const comms = salvage.comms;
      if (comms.status === 'linking' && distance(this.player, comms) <= comms.workRadius) {
        comms.progress = Math.min(comms.duration, comms.progress + dt);
        if (comms.duration - comms.progress < 1e-9) comms.progress = comms.duration;
        if (comms.progress === comms.duration) {
          comms.status = 'armed';
          if (salvage.selectedId === comms.id) salvage.selectedId = null;
          this._emit('salvage-comms-ready', comms, { stationId: comms.id, color: '#9fe9d4' });
        }
      }
      if (!salvage.evac) return;
      const evac = salvage.evac, exit = salvage.exits.find(item => item.id === evac.exitId);
      let boardingTime = dt;
      if (salvage.status === 'approaching') {
        const remaining = evac.remaining;
        evac.remaining = Math.max(0, evac.remaining - dt);
        if (evac.remaining < 1e-9) evac.remaining = 0;
        if (evac.remaining > 0) return;
        salvage.status = 'boarding'; boardingTime = Math.max(0, dt - remaining);
        this._emit('salvage-arrive', exit, { exitId: exit.id, color: '#9fe9d4' });
      }
      if (salvage.status !== 'boarding' || distance(this.player, exit) > exit.radius) return;
      evac.progress = Math.min(evac.boardingDuration, evac.progress + boardingTime);
      if (evac.boardingDuration - evac.progress < 1e-9) evac.progress = evac.boardingDuration;
      if (evac.progress === evac.boardingDuration) this._finishSalvage();
    }

    _finishSalvage() {
      const salvage = this.salvage;
      if (!salvage || this.phase !== 'playing' || this.player.hp <= 0 || salvage.status !== 'boarding' || salvage.evac.progress < salvage.evac.boardingDuration) return false;
      salvage.settled = salvage.carried; salvage.carried = 0;
      salvage.cargoBonus = salvage.hotCargo.status === 'carried' ? salvage.hotCargo.bonus : 0;
      if (salvage.cargoBonus) salvage.hotCargo.status = 'banked';
      salvage.bonus = salvage.settled * 80 + salvage.cargoBonus;
      salvage.status = salvage.settled || salvage.cargoBonus ? 'extracted' : 'withdrawn'; this.score += salvage.bonus; this.phase = 'won';
      salvage.pending = []; this.bullets = []; this.hazards = []; this.pickups = [];
      this._clearSalvageEffects();
      this.echoBursts = []; this._clearAwakeningState(); this.dashMarkedIds.clear(); this.phaseDashRefund = 0;
      this.reactor.timer = 0; this.player.dashTimer = 0;
      this._clearBattlefield(); this._clearStarline(); this._clearSecretTechniques();
      this.evolutionState = { breachTimer: 0, echoes: [] }; this.tactical = { decoy: null, mine: null, cooldown: 0 };
      this._objective();
      this._emit(salvage.status === 'extracted' ? 'salvage-complete' : 'salvage-withdraw', this.player, { samples: salvage.settled, bonus: salvage.bonus, cargoBonus: salvage.cargoBonus, color: '#9fe9d4' });
      if (salvage.status === 'extracted') this._emit('win', this.player);
      return true;
    }

    _startSalvageHunt() {
      const salvage = this.salvage, hunt = salvage.hunt;
      // The optional elite must not consume the existing salvage combat stream.
      const random = this.random;
      this.random = () => ((salvage.seed ^ 0x93CD0A53) >>> 0) / 4294967296;
      const enemy = this.spawnEnemy(hunt.type, hunt.path[0]);
      this.random = random;
      if (!enemy) return;
      hunt.enemyId = enemy.id;
      Object.assign(enemy, { elite: true, salvageHunt: true, name: hunt.name, color: this.map.color,
        hp: Math.round(enemy.hp * 2.2), maxHp: Math.round(enemy.maxHp * 2.2), damage: enemy.damage * 1.1 });
    }

    _alertSalvageHunt(enemy) {
      const hunt = this.salvage?.hunt;
      if (!hunt || hunt.enemyId !== enemy.id || hunt.status !== 'patrolling') return;
      hunt.status = 'alert'; enemy.attackTimer = Math.max(enemy.attackTimer, .8);
      this._emit('salvage-hunt-alert', enemy, { enemyId: enemy.id, modId: hunt.modId, color: this.map.color });
    }

    _clearSalvageEffects() {
      if (!this.salvage) return;
      this.salvage.round.remaining = 0;
      for (const node of this.salvage.nodes) {
        if (node.status === 'primed' || node.status === 'friendly') node.status = 'spent';
        node.remaining = 0; node.hazardId = null;
      }
    }

    _configureVoyage(options) {
      const seed = Number.isFinite(options.seed) ? Math.trunc(options.seed) >>> 0 : 1;
      const seeded = initial => {
        let state = initial;
        return () => {
          state = state + 0x6D2B79F5 | 0;
          let value = Math.imul(state ^ state >>> 15, 1 | state);
          value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
          return ((value ^ value >>> 14) >>> 0) / 4294967296;
        };
      };
      // The route graph has its own stream: firing and critical hits cannot change a friend's route seed.
      const routeRandom = seeded(seed);
      this.random = seeded(seed ^ 0xA54FF53A);
      const difficulty = VOYAGE_DIFFICULTIES.some(item => item.id === options.difficulty) ? options.difficulty : 'normal';
      const deviceId = VOYAGE_DEVICES.some(item => item.id === options.deviceId) ? options.deviceId : 'afterimage';
      const plans = Array.from({ length: 7 }, (_, index) => {
        const node = index + 1;
        if (node === 7) return [{ id: 'voyage-7-finale', node, type: 'finale', biome: 'cosmos', risk: 'calm', title: '航界终局', description: '击败三阶段航界吞星者，封闭星海裂口。', color: '#d8b8ff', reward: 0 }];
        const offset = Math.floor(routeRandom() * VOYAGE_ROOMS.length), biomeOffset = Math.floor(routeRandom() * VOYAGE_BIOMES.length);
        return ['calm', 'surge'].map((risk, branch) => {
          const type = node === 1 ? 'clear' : VOYAGE_ROOMS[(offset + branch) % VOYAGE_ROOMS.length].id;
          const biome = VOYAGE_BIOMES[(biomeOffset + branch + index) % VOYAGE_BIOMES.length];
          const room = VOYAGE_ROOMS.find(item => item.id === type);
          return { id: 'voyage-' + node + '-' + risk, node, type, biome: biome.id, risk,
            title: biome.title + ' · ' + room.title, description: room.description + (risk === 'surge' ? ' 超载路线：敌群增多、普通敌人生命增加 15%，并有旧位轰击；通关奖励 65 芯片。' : ' 平稳路线：通关奖励 35 芯片。'), color: biome.color, reward: risk === 'surge' ? 65 : 35 };
        });
      });
      this.voyage = { seed, difficulty, initialDeviceId: deviceId, node: 1, totalNodes: 7, status: 'combat', plans, devices: [deviceId, null, null],
        history: [], routeChoices: [], deviceChoices: [], shopChoices: [], purchased: false, room: null, effects: null,
        fieldStats: { fractures: 0, detonations: 0, captures: 0 } };
      this._clearVoyageEffects();
      this._configureVoyageRoom(plans[0][0]);
    }

    _clearVoyageEffects() {
      if (!this.voyage) return;
      this.voyage.effects = { trails: [], activeTrailId: null, needleTimer: 0, mirrorTimer: 0, sentry: null, well: null,
        batteryTimer: 0, batteryCharges: 0, reloadLockout: 0 };
    }

    _configureVoyageRoom(route) {
      const voyage = this.voyage, biome = VOYAGE_BIOMES.find(item => item.id === route.biome), definition = VOYAGE_ROOMS.find(item => item.id === route.type);
      this.battlefield = null;
      this.map = { id: 'voyage-' + route.biome, name: biome.title, subtitle: route.type === 'finale' ? '航界终局' : definition.title, mode: 'voyage',
        color: biome.color, objectiveLabel: '航路节点', description: route.description, briefing: route.description,
        boss: { name: '航界吞星者', subtitle: '穿过弹环缺口，横移躲光栅，旧位坍缩锁定后持续走位', color: '#d8b8ff' },
        threat: { name: route.risk === 'surge' ? '通路震荡' : '星海裂隙', description: route.risk === 'surge' ? '旧位置锁定后移出紫色预警圈。' : '观察裂隙入口，利用掩体与装置共鸣分割敌群。' } };
      this.world = { width: 1700, height: 1200 };
      Object.assign(this.player, { x: 850, y: 1010, angle: -Math.PI / 2 });
      this.spawn = { x: 850, y: 1010 };
      this.relays = []; this.stations = []; this.crates = []; this.contracts = []; this.encounters = []; this.delivery = null; this.escort = null;
      this.bossSpawned = false; this.completedRelays = 0; this.sectorThreat.active = false;
      this.terrainRevision = (this.terrainRevision || 0) + 1;
      const portals = Array.from({ length: 12 }, (_, index) => {
        const angle = index * TAU / 12 - Math.PI / 2;
        return { x: 850 + Math.cos(angle) * 720, y: 600 + Math.sin(angle) * 490, radius: 24 };
      });
      const difficulty = VOYAGE_DIFFICULTIES.find(item => item.id === voyage.difficulty);
      const quota = route.type === 'finale' ? 0 : Math.ceil((12 + (voyage.node - 1) * 2 + (route.risk === 'surge' ? 4 : 0)) * difficulty.quota);
      const pool = voyage.node < 3 ? ['crawler', 'spitter', 'crawler', 'charger'] : voyage.node < 5 ? ['crawler', 'spitter', 'charger', 'crawler', 'tank'] : ['crawler', 'spitter', 'charger', 'tank', 'mortar', 'crawler'];
      const plan = Array.from({ length: quota }, (_, index) => pool[(index + voyage.seed % pool.length + voyage.node) % pool.length]);
      if (voyage.node >= 3 && voyage.node <= 6) {
        const specialists = ['bulwark', 'breacher', 'engineer'];
        for (const [slot, index] of [3, 9].entries()) plan[index] = specialists[(voyage.seed + voyage.node + slot) % specialists.length];
      }
      const room = { id: route.id, type: route.type, biome: route.biome, risk: route.risk, title: route.title, elapsed: 0,
        spawned: 0, quota, kills: 0, plan, spawnTimer: 2.5, hazardTimer: 8, cores: [], collectors: [], portals, objectiveDone: false,
        exit: { id: this._id(), type: 'voyage-exit', x: 850, y: 1050, radius: 36, ready: false }, status: 'combat', reward: route.reward };
      voyage.room = room;
      const points = [{ x: 450, y: 480 }, { x: 850, y: 300 }, { x: 1250, y: 480 }];
      const protectedPoints = [this.player, room.exit, ...portals, ...points.map(point => ({ ...point, radius: route.type === 'harvest' ? 185 : 110 }))];
      const layouts = {
        cosmos: [[320, 210], [1380, 210], [190, 480], [1510, 480], [320, 830], [1380, 830], [610, 720], [1090, 720], [850, 610], [580, 930], [1120, 930]],
        forge: [[330, 190], [1370, 190], [190, 450], [1510, 450], [190, 710], [1510, 710], [430, 910], [1270, 910], [630, 750], [1070, 750], [760, 590], [940, 590]],
        tide: [[240, 250], [1460, 250], [230, 610], [1470, 610], [380, 900], [1320, 900], [590, 840], [1110, 840], [710, 660], [990, 660], [580, 170], [1120, 170]]
      };
      // Small deterministic offsets vary each node without consuming the combat random stream.
      this.obstacles = layouts[route.biome]
        .map(([x, y], index) => ({ id: this._id(), type: 'rock',
          x: x + ((voyage.seed + voyage.node * 11 + index * 7) % 17 - 8), y: y + ((voyage.seed + voyage.node * 5 + index * 11) % 17 - 8),
          radius: 30 + index % 3 * 4, variant: index % 3 }))
        .filter(rock => !protectedPoints.some(point => distance(rock, point) < rock.radius + (point.radius || 65) + 22));
      if (voyage.node >= 3 && voyage.node <= 6) this._configureBattlefield();
      if (route.type === 'siege') for (const point of points) {
        const core = this.spawnEnemy('reactor', point);
        Object.assign(core, { hp: 260, maxHp: 260, voyageCore: true, voyageRoomId: room.id, name: '共鸣柱', color: biome.color });
        room.cores.push(core);
      }
      if (route.type === 'harvest') room.collectors = points.map(point => ({ ...point, id: this._id(), radius: 185, charge: 0, goal: 4, progress: 0, status: 'charging' }));
      if (route.type === 'finale') {
        const boss = this.spawnEnemy('boss', { x: 850, y: 390 });
        Object.assign(boss, { variant: 'voyage', hp: 4800, maxHp: 4800, speed: 56,
          attackTimer: 3, ringGapAngle: 0, ringGapWidth: Math.PI / 6, ringCount: 12, teleportTarget: null });
        this.bossSpawned = true;
        this._emit('boss-spawn', boss);
      }
      this._emit('voyage-room', this.player, { node: voyage.node, roomId: room.id, roomType: room.type, biome: room.biome, risk: room.risk, title: room.title, color: biome.color });
      this._objective();
    }

    _configureBattlefield() {
      this.battlefield = { props: [], mines: [], fractures: 0, detonations: 0, captures: 0 };
      const positions = this.salvage ? this.salvage.fields || [{ x: 780, y: 1580 }, { x: 1440, y: 1280 }, { x: 1740, y: 820 }, { x: 2200, y: 1050 }] : [{ x: 550, y: 760 }, { x: 1150, y: 760 }];
      for (const point of positions) {
        if (this.obstacles.some(rock => distance(rock, point) < rock.radius + 38)) continue;
        this.battlefield.props.push({ id: this._id(), kind: 'capacitor', ...point, radius: 20, hp: 50, maxHp: 50,
          status: 'idle', friendly: false, remaining: 0, duration: 0, blastRadius: 125, damageEnemy: 140, damagePlayer: 22 });
      }
      this.obstacles.filter(rock => distance(rock, this.player) > 260 &&
        !positions.some(point => distance(rock, point) < rock.radius + 90)).slice(0, this.salvage ? 6 : 3)
        .forEach(rock => Object.assign(rock, { fragile: true, hp: 95, maxHp: 95 }));
    }

    _fieldCount(name) {
      this.battlefield[name]++;
      if (this.voyage) this.voyage.fieldStats[name]++;
      if (this.salvage) this.salvage.fieldStats[name]++;
    }

    _damageCover(rock, amount) {
      if (this.phase !== 'playing' || !rock.fragile || rock.hp <= 0) return false;
      rock.hp = Math.max(0, rock.hp - amount);
      if (rock.hp > 0) return false;
      this.obstacles = this.obstacles.filter(item => item.id !== rock.id);
      this.terrainRevision = (this.terrainRevision || 0) + 1;
      if (this.battlefield) this._fieldCount('fractures');
      this._emit('cover-break', rock, { rockId: rock.id, radius: rock.radius + 15, color: '#c8ead8' });
      return true;
    }

    _armField(field, friendly = false, delay = .65) {
      if (this.phase !== 'playing' || field.status === 'spent') return false;
      const changed = friendly && !field.friendly;
      if (field.status === 'armed') {
        if (!changed) return false;
        field.remaining = Math.min(field.remaining, delay);
      } else { field.status = 'armed'; field.remaining = delay; }
      field.friendly = field.friendly || friendly;
      field.duration = field.remaining;
      this._emit(changed ? 'field-capture' : 'field-arm', field, { kind: field.kind, fieldId: field.id, friendly: field.friendly,
        radius: field.blastRadius, duration: field.duration, color: field.friendly ? '#86ffe1' : '#ffc18a' });
      if (changed) this._fieldCount('captures');
      return true;
    }

    _captureBattlefield(origin, radius) {
      if (!this.battlefield || this.phase !== 'playing') return;
      for (const field of [...this.battlefield.props, ...this.battlefield.mines]) {
        if (field.status === 'spent' || distance(origin, field) > radius + field.radius ||
          this.obstacles.some(rock => this._segmentHit(origin.x, origin.y, field.x - origin.x, field.y - origin.y, rock, 0) !== null)) continue;
        this._armField(field, true, .35);
      }
    }

    _spawnMine(origin, engineerId) {
      if (!this.battlefield || this.phase !== 'playing' || this.battlefield.mines.length >= 12 ||
        this.battlefield.mines.filter(item => item.engineerId === engineerId && item.status !== 'spent').length >= 2) return null;
      if (this.obstacles.some(rock => distance(rock, origin) < rock.radius + 11)) return null;
      const mine = { id: this._id(), kind: 'mine', x: clamp(origin.x, 35, this.world.width - 35), y: clamp(origin.y, 35, this.world.height - 35),
        radius: 11, hp: 1, maxHp: 1, engineerId, settleTimer: .65, lifetime: 14, status: 'idle', friendly: false,
        remaining: 0, duration: 0, blastRadius: 125, damageEnemy: 140, damagePlayer: 22 };
      this.battlefield.mines.push(mine);
      return mine;
    }

    _updateBattlefield(dt) {
      if (!this.battlefield || this.phase !== 'playing') return;
      for (const field of [...this.battlefield.props, ...this.battlefield.mines]) {
        if (this.phase !== 'playing') break;
        if (field.status === 'spent') continue;
        if (field.status === 'armed') {
          field.remaining = Math.max(0, field.remaining - dt);
          if (field.remaining > 0) continue;
          field.status = 'spent';
          const blockers = [...this.obstacles];
          const visible = target => !blockers.some(rock => rock.id !== target.id && this._segmentHit(field.x, field.y, target.x - field.x, target.y - field.y, rock, 0) !== null);
          this._fieldCount('detonations');
          this._emit('field-burst', field, { kind: field.kind, fieldId: field.id, friendly: field.friendly,
            radius: field.blastRadius, damage: field.damageEnemy, color: field.friendly ? '#86ffe1' : '#ffc18a' });
          if (!field.friendly && distance(field, this.player) <= field.blastRadius + this.player.radius && visible(this.player))
            this._damagePlayer(field.damagePlayer, { kind: 'environment', name: field.kind === 'mine' ? '工兵感应雷' : '电容筒爆破', hint: '射爆会伤害双方；移出预警圈、躲在完整掩体后，或先用 EMP 接管。' });
          for (const enemy of this.enemies) {
            if (this.phase !== 'playing') break;
            if (enemy.hp > 0 && distance(field, enemy) <= field.blastRadius + enemy.radius && visible(enemy))
              this._damageEnemy(enemy, field.damageEnemy * (enemy.type === 'boss' ? .5 : 1));
          }
          if (this.salvage) for (const source of this.salvage.sources) {
            if (this.phase !== 'playing') break;
            if (source.hp > 0 && distance(field, source) <= field.blastRadius + source.radius && visible(source)) this._damageSalvageSource(source, field.damageEnemy);
          }
          for (const rock of blockers) {
            if (this.phase !== 'playing') break;
            if (rock.fragile && distance(field, rock) <= field.blastRadius + rock.radius && visible(rock)) this._damageCover(rock, field.damageEnemy);
          }
        } else if (field.kind === 'mine') {
          field.settleTimer = Math.max(0, field.settleTimer - dt);
          field.lifetime -= dt;
          if (field.lifetime <= 0) field.status = 'spent';
          else if (field.settleTimer === 0 && distance(field, this.player) <= 70 + this.player.radius) this._armField(field);
        }
      }
      this.battlefield.mines = this.battlefield.mines.filter(field => field.status !== 'spent');
    }

    _clearBattlefield() {
      if (!this.battlefield) return;
      this.battlefield.props = []; this.battlefield.mines = [];
    }

    _fieldDamage(enemy, bullet) {
      this._siegeHeavyHit(enemy, bullet);
      if (enemy.type !== 'bulwark' || enemy.shieldOpenTimer > 0 || bullet.refitShot?.modId === 'breach') return bullet.damage;
      const length = vectorLength(bullet.vx, bullet.vy);
      if (!length || (-bullet.vx * Math.cos(enemy.shieldAngle) - bullet.vy * Math.sin(enemy.shieldAngle)) / length < .5 - 1e-9) return bullet.damage;
      this._emit('shield-block', enemy, { enemyId: enemy.id, angle: enemy.shieldAngle, color: '#9ad6ff' });
      return bullet.damage * .45;
    }

    _voyageSpawnPoint(type) {
      const room = this.voyage.room, radius = ENEMIES[type].radius;
      for (let index = 0; index < room.portals.length; index++) {
        const point = room.portals[(room.spawned * 5 + index + this.voyage.seed) % room.portals.length];
        if (distance(point, this.player) < 235 || this.obstacles.some(rock => distance(point, rock) < rock.radius + radius + 12)) continue;
        if (this.enemies.some(enemy => enemy.hp > 0 && distance(point, enemy) < enemy.radius + radius + 12)) continue;
        return point;
      }
      return null;
    }

    _updateVoyage(dt) {
      const voyage = this.voyage, room = voyage.room;
      if (voyage.status !== 'combat' || room.objectiveDone || room.type === 'finale') return;
      room.spawnTimer = Math.max(0, room.spawnTimer - dt);
      if (room.spawned < room.quota && room.spawnTimer === 0 && this.enemies.filter(enemy => enemy.hp > 0 && !enemy.voyageCore).length < 14) {
        const type = room.plan[room.spawned], point = this._voyageSpawnPoint(type), enemy = point && this.spawnEnemy(type, point);
        if (enemy) { enemy.voyageRoomId = room.id; room.spawned++; room.spawnTimer = room.risk === 'surge' ? 1.05 : 1.3; }
        else room.spawnTimer = .25;
      }
      if (room.risk === 'surge') {
        room.hazardTimer = Math.max(0, room.hazardTimer - dt);
        if (room.hazardTimer === 0) {
          room.hazardTimer = 8;
          const difficulty = VOYAGE_DIFFICULTIES.find(item => item.id === voyage.difficulty);
          this._addHazard('blast', this.player.x, this.player.y, 78, 1.6, 18 * difficulty.damage,
            { owner: 'enemy', color: '#bfaaff', name: '通路震荡', hint: '旧位置已经锁定，移出紫色预警圈。', voyageHazard: true });
          this._emit('sector-warning', this.player, { name: '通路震荡', hint: '旧位置已经锁定，继续走位', color: '#bfaaff' });
        }
      }
      this._checkVoyageObjective();
    }

    _voyageKill(enemy) {
      const voyage = this.voyage, room = voyage.room;
      if (room.type === 'finale' || room.objectiveDone || enemy.voyageRoomId !== room.id || ['boss', 'reactor', 'anchor', 'nest'].includes(enemy.type)) return;
      room.kills++;
      if (room.type !== 'harvest') return;
      const collector = room.collectors.filter(item => item.charge < item.goal).sort((a, b) => distance(a, enemy) - distance(b, enemy))[0];
      if (!collector) return;
      const amount = distance(collector, enemy) <= collector.radius ? 2 : 1;
      collector.charge = Math.min(collector.goal, collector.charge + amount);
      collector.progress = collector.charge / collector.goal; collector.status = collector.charge === collector.goal ? 'active' : 'charging';
      this._emit('voyage-harvest', enemy, { toX: collector.x, toY: collector.y, collectorId: collector.id, amount, charge: collector.charge, goal: collector.goal, color: this.map.color });
    }

    _checkVoyageObjective() {
      if (!this.voyage || this.phase !== 'playing') return;
      const room = this.voyage.room;
      if (room.objectiveDone || room.type === 'finale') return;
      const complete = room.type === 'clear' ? room.spawned === room.quota && !this.enemies.some(enemy => enemy.hp > 0 && enemy.voyageRoomId === room.id) :
        room.type === 'siege' ? room.cores.every(core => core.hp <= 0) : room.collectors.every(item => item.charge === item.goal);
      if (!complete) return;
      room.objectiveDone = true; room.exit.ready = true; room.status = 'exit';
      this._emit('voyage-objective', room.exit, { node: this.voyage.node, roomId: room.id, message: '目标完成 · 返回亮起的星门按 E 撤离', color: this.map.color });
      this._objective();
    }

    _finishVoyageRoom(finale = false) {
      const voyage = this.voyage;
      if (!voyage || voyage.status !== 'combat' || this.phase !== 'playing') return false;
      const room = voyage.room;
      if (finale ? room.type !== 'finale' : !room.objectiveDone) return false;
      for (const pickup of this.pickups) {
        if (pickup.type === 'xp') this.player.xp += pickup.value;
        else if (pickup.type === 'credits') this.player.credits += pickup.value;
        else this.player.hp = Math.min(this.player.maxHp, this.player.hp + pickup.value);
      }
      voyage.history.push({ node: voyage.node, roomId: room.id, title: room.title, type: room.type, biome: room.biome, risk: room.risk, elapsed: room.elapsed, reward: room.reward });
      this.player.credits += room.reward; this.player.hp = Math.min(this.player.maxHp, this.player.hp + 12); this.score += finale ? 1500 : 400;
      this._clearCampaignCombat(); this._clearVoyageEffects();
      this.phase = finale ? 'won' : 'voyage-rest'; voyage.status = finale ? 'complete' : 'rest'; room.status = 'complete';
      if (finale) {
        voyage.routeChoices = []; voyage.deviceChoices = []; voyage.shopChoices = [];
        this._emit('voyage-complete', this.player, { node: 7, seed: voyage.seed }); this._emit('win', this.player);
      } else {
        voyage.routeChoices = voyage.plans[voyage.node].map(route => ({ ...route }));
        voyage.deviceChoices = VOYAGE_DEVICES.filter(device => !voyage.devices.includes(device.id)).map(device => ({ ...device }));
        voyage.shopChoices = [{ id: 'repair', title: '舰载修复', description: '恢复 35 生命。生命已满时不可购买。', cost: 25 },
          ...UPGRADES.filter(item => ['damage', 'health', 'dash', 'reload', 'pulse'].includes(item.id) && (this.upgradeStacks[item.id] || 0) < item.maxStacks)
            .map(item => ({ ...item, cost: 35, stacks: this.upgradeStacks[item.id] || 0 }))];
        voyage.purchased = false;
        this._emit('voyage-rest', this.player, { node: voyage.node, roomId: room.id, reward: room.reward });
      }
      this._objective();
      return true;
    }

    purchaseVoyage(id) {
      const voyage = this.voyage;
      if (!voyage || this.phase !== 'voyage-rest' || voyage.status !== 'rest' || voyage.purchased) return false;
      const choice = voyage.shopChoices.find(item => item.id === id), player = this.player;
      if (!choice || player.credits < choice.cost || id === 'repair' && player.hp >= player.maxHp) return false;
      if (id !== 'repair' && (this.upgradeStacks[id] || 0) >= choice.maxStacks) return false;
      player.credits -= choice.cost; voyage.purchased = true;
      if (id === 'repair') player.hp = Math.min(player.maxHp, player.hp + 35);
      else {
        this.upgradeStacks[id] = (this.upgradeStacks[id] || 0) + 1;
        if (id === 'damage') player.damageMultiplier += .18;
        if (id === 'health') { player.maxHp += 25; player.hp = Math.min(player.maxHp, player.hp + 35); }
        if (id === 'dash') { player.dashCooldownMax *= .78; player.dashMultiplier *= 1.1; }
        if (id === 'reload') player.reloadMultiplier *= .78;
        if (id === 'pulse') { player.skillDamage += 40; player.skillRadius += 30; player.skillCooldownMax *= .88; }
      }
      this._refillWeapons();
      this._emit('voyage-purchase', player, { purchaseId: id, cost: choice.cost });
      return true;
    }

    chooseVoyageRoute(routeId, deviceId = null, slotIndex = null) {
      const voyage = this.voyage;
      if (!voyage || this.phase !== 'voyage-rest' || voyage.status !== 'rest') return false;
      const route = voyage.routeChoices.find(item => item.id === routeId);
      if (!route) return false;
      if (deviceId !== null && (!VOYAGE_DEVICES.some(item => item.id === deviceId) || voyage.devices.includes(deviceId) || !Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 2)) return false;
      if (deviceId === null && slotIndex !== null) return false;
      const oldResonance = this.voyageResonance()?.id;
      const player = Object.fromEntries(CAMPAIGN_PLAYER_FIELDS.map(key => [key, this.player[key]]));
      const persistent = { elapsed: this.elapsed, kills: this.kills, score: this.score, upgradeStacks: { ...this.upgradeStacks }, evolutionId: this.evolutionId,
        relics: [...this.relics], tacticId: this.tacticId, best: this.combo.best, captures: this.reactor.captures, detonations: this.reactor.detonations };
      const events = this.events, random = this.random;
      if (deviceId !== null) voyage.devices[slotIndex] = deviceId;
      voyage.node++; voyage.status = 'combat'; voyage.routeChoices = []; voyage.deviceChoices = []; voyage.shopChoices = [];
      this.reset('frontier', {}, this.nextId);
      this.mode = 'voyage'; this.voyage = voyage; this.random = random;
      Object.assign(this.player, player);
      for (const key of ['elapsed', 'kills', 'score', 'upgradeStacks', 'evolutionId', 'relics', 'tacticId']) this[key] = persistent[key];
      this.combo.best = persistent.best; this.reactor.captures = persistent.captures; this.reactor.detonations = persistent.detonations;
      this.events = events;
      this._clearVoyageEffects(); this._configureVoyageRoom(route); this._refillWeapons();
      this.phase = 'playing'; this.player.invulnerable = 1.2;
      if (deviceId !== null) this._emit('voyage-device', this.player, { deviceId, stage: 'equipped', slotIndex, color: VOYAGE_DEVICES.find(item => item.id === deviceId).color });
      const resonance = this.voyageResonance();
      if (resonance && resonance.id !== oldResonance) this._emit('voyage-resonance', this.player, { resonanceId: resonance.id, stage: 'acquired', title: resonance.title, color: resonance.color });
      this._objective();
      if (this.player.xp >= this.player.xpNeeded) this._levelUp();
      return true;
    }

    voyageResonance() { return this.voyage ? VOYAGE_RESONANCES.find(item => item.deviceIds.every(id => this.voyage.devices.includes(id))) || null : null; }

    voyageActionState() {
      const well = this.voyage?.effects.well;
      return { collapseReady: this.phase === 'playing' && !!well && well.remaining > 0 && this.voyageResonance()?.id === 'tidal-collapse', remaining: well?.remaining || 0, radius: well?.radius || 0 };
    }

    voyageTarget() {
      if (!this.voyage) return null;
      const room = this.voyage.room;
      if (room.objectiveDone) return { ...room.exit, kind: 'exit', label: '撤离星门', hint: '返回星门按 E 进入安全航路', progress: 1, total: 1 };
      if (room.type === 'siege') {
        const core = room.cores.filter(item => item.hp > 0).sort((a, b) => distance(a, this.player) - distance(b, this.player))[0];
        return core ? { x: core.x, y: core.y, kind: 'core', label: '共鸣柱', hint: '射击拆毁共鸣柱', progress: 3 - room.cores.filter(item => item.hp > 0).length, total: 3 } : null;
      }
      if (room.type === 'harvest') {
        const collector = room.collectors.filter(item => item.charge < item.goal).sort((a, b) => distance(a, this.player) - distance(b, this.player))[0];
        return collector ? { x: collector.x, y: collector.y, kind: 'collector', label: '星尘收割器', hint: '靠近收割器击杀充两格；远处击杀也能充一格', progress: room.collectors.reduce((sum, item) => sum + item.charge, 0), total: 12 } : null;
      }
      const enemy = this.enemies.filter(item => item.hp > 0).sort((a, b) => distance(a, this.player) - distance(b, this.player))[0];
      return { x: enemy?.x ?? 850, y: enemy?.y ?? 420, kind: 'enemy', label: room.type === 'finale' ? this.map.boss.name : '清剿敌群', hint: room.type === 'finale' ? this.map.boss.subtitle : '击败本房全部敌人', progress: room.kills, total: room.quota };
    }

    _voyageDash() {
      if (!this.voyage || this.phase !== 'playing') return;
      const { devices, effects } = this.voyage, player = this.player;
      if (devices.includes('afterimage')) {
        const trail = { id: this._id(), x: player.x, y: player.y, endX: player.x, endY: player.y, width: 24, remaining: 2, duration: 2, hitIds: [] };
        effects.trails.push(trail);
        while (effects.trails.length > 2) effects.trails.shift();
        effects.activeTrailId = trail.id;
        this._emit('voyage-device', player, { deviceId: 'afterimage', stage: 'trail', trailId: trail.id, duration: 2, color: '#8fffe0' });
      }
      if (devices.includes('needles')) {
        effects.needleTimer = 2;
        this._emit('voyage-device', player, { deviceId: 'needles', stage: 'ready', duration: 2, color: '#b0ffe6' });
      }
    }

    _voyagePerfectReload() {
      if (!this.voyage || this.phase !== 'playing' || this.voyage.effects.reloadLockout > 0) return;
      const { devices, effects } = this.voyage, player = this.player;
      if (!devices.includes('mirror') && !devices.includes('sentry')) return;
      effects.reloadLockout = 3;
      if (devices.includes('mirror')) {
        effects.mirrorTimer = 4;
        this._emit('voyage-device', player, { deviceId: 'mirror', stage: 'ready', duration: 4, color: '#ffd9a2' });
      }
      if (devices.includes('sentry')) {
        effects.sentry = { x: player.x, y: player.y, radius: 14, remaining: 3, duration: 3, shots: 0, maxShots: 2, fireTimer: .15 };
        this._emit('voyage-device', player, { deviceId: 'sentry', stage: 'placed', duration: 3, color: '#fff0b7' });
      }
    }

    _voyagePulse(origin) {
      if (!this.voyage || this.phase !== 'playing') return;
      const { devices, effects } = this.voyage;
      if (devices.includes('well')) {
        effects.well = { x: origin.x, y: origin.y, radius: 125, remaining: 2.6, duration: 2.6 };
        this._emit('voyage-device', origin, { deviceId: 'well', stage: 'placed', radius: 125, duration: 2.6, color: '#b6c5ff' });
      }
      if (devices.includes('battery')) {
        effects.batteryTimer = 3; effects.batteryCharges = 3;
        this._emit('voyage-device', this.player, { deviceId: 'battery', stage: 'ready', duration: 3, charges: 3, color: '#d5baff' });
      }
    }

    _voyageExtraBullet(origin, angle, damage, pierce, deviceId) {
      if (this.phase !== 'playing') return;
      const color = VOYAGE_DEVICES.find(item => item.id === deviceId)?.color || '#d8b8ff';
      this.bullets.push({ id: this._id(), type: 'bullet', kind: 'voyage', age: 0, owner: 'player', weapon: -1, voyageDevice: true, deviceId,
        x: origin.x + Math.cos(angle) * 22, y: origin.y + Math.sin(angle) * 22, vx: Math.cos(angle) * 1000, vy: Math.sin(angle) * 1000,
        radius: 4, lifetime: .65, damage: damage * this.player.damageMultiplier, pierce, hitIds: [], color });
      this._emit('voyage-device', origin, { deviceId, stage: 'shot', angle, color });
    }

    _voyageShot() {
      if (!this.voyage || this.phase !== 'playing') return;
      const effects = this.voyage.effects, player = this.player, resonance = this.voyageResonance();
      if (effects.needleTimer > 0) {
        effects.needleTimer = 0;
        for (const offset of [-Math.PI / 22.5, Math.PI / 22.5]) this._voyageExtraBullet(player, player.angle + offset, 22, 0, 'needles');
        if (resonance?.id === 'tail-collapse') {
          const trails = effects.trails; effects.trails = []; effects.activeTrailId = null;
          for (const trail of trails) {
            if (this.phase !== 'playing') break;
            this._emit('voyage-resonance', trail, { resonanceId: resonance.id, stage: 'collapse', endX: trail.endX, endY: trail.endY, width: trail.width, color: resonance.color });
            for (const enemy of this.enemies) {
              if (this.phase !== 'playing') break;
              if (enemy.hp <= 0 || this._segmentHit(trail.x, trail.y, trail.endX - trail.x, trail.endY - trail.y, enemy, trail.width / 2) === null) continue;
              this._damageEnemy(enemy, 45 * player.damageMultiplier);
            }
          }
        }
      }
      if (this.phase !== 'playing') return;
      if (effects.mirrorTimer > 0) {
        effects.mirrorTimer = 0;
        this._voyageExtraBullet(player, player.angle, 28, 2, 'mirror');
        if (resonance?.id === 'cross-mirror' && effects.sentry && effects.sentry.remaining > 0) {
          const target = this.voyage.aimTarget || { x: player.x + Math.cos(player.angle) * 600, y: player.y + Math.sin(player.angle) * 600 };
          const angle = Math.atan2(target.y - effects.sentry.y, target.x - effects.sentry.x);
          this._voyageExtraBullet(effects.sentry, angle, 42, 1, 'mirror');
          this._emit('voyage-resonance', effects.sentry, { resonanceId: resonance.id, stage: 'crossfire', angle, color: resonance.color });
        }
      }
      if (effects.batteryTimer > 0 && effects.batteryCharges > 0) {
        effects.batteryCharges--;
        this._voyageExtraBullet(player, player.angle, 26, 0, 'battery');
      }
    }

    _collapseVoyageWell() {
      if (!this.voyageActionState().collapseReady) return false;
      const well = this.voyage.effects.well;
      this.voyage.effects.well = null;
      this._emit('voyage-resonance', well, { resonanceId: 'tidal-collapse', stage: 'collapse', radius: well.radius, color: '#c8bdff' });
      for (const enemy of this.enemies) {
        if (this.phase !== 'playing') break;
        if (enemy.hp <= 0 || distance(well, enemy) > well.radius + enemy.radius || this.obstacles.some(rock => this._segmentHit(well.x, well.y, enemy.x - well.x, enemy.y - well.y, rock, 0) !== null)) continue;
        this._damageEnemy(enemy, 75 * this.player.damageMultiplier);
      }
      return true;
    }

    _updateVoyageEffects(dt) {
      if (!this.voyage || this.phase !== 'playing') return;
      const effects = this.voyage.effects;
      for (const key of ['needleTimer', 'mirrorTimer', 'batteryTimer', 'reloadLockout']) effects[key] = Math.max(0, effects[key] - dt);
      if (effects.batteryTimer === 0) effects.batteryCharges = 0;
      for (const trail of effects.trails) {
        trail.remaining = Math.max(0, trail.remaining - dt);
        if (trail.remaining === 0) continue;
        for (const enemy of this.enemies) {
          if (this.phase !== 'playing') return;
          if (enemy.hp <= 0 || trail.hitIds.includes(enemy.id) || this._segmentHit(trail.x, trail.y, trail.endX - trail.x, trail.endY - trail.y, enemy, trail.width / 2) === null) continue;
          trail.hitIds.push(enemy.id);
          this._damageEnemy(enemy, 32 * this.player.damageMultiplier);
          if (this.phase !== 'playing') return;
          this._emit('voyage-device', enemy, { deviceId: 'afterimage', stage: 'hit', color: '#8fffe0' });
        }
      }
      effects.trails = effects.trails.filter(trail => trail.remaining > 0);
      const sentry = effects.sentry;
      if (sentry) {
        sentry.remaining = Math.max(0, sentry.remaining - dt); sentry.fireTimer = Math.max(0, sentry.fireTimer - dt);
        if (sentry.remaining === 0) effects.sentry = null;
        else if (sentry.shots < sentry.maxShots && sentry.fireTimer === 0) {
          const target = this.enemies.filter(enemy => enemy.hp > 0 && distance(sentry, enemy) <= 300 && !this.obstacles.some(rock => this._segmentHit(sentry.x, sentry.y, enemy.x - sentry.x, enemy.y - sentry.y, rock, 4) !== null))
            .sort((a, b) => distance(a, sentry) - distance(b, sentry))[0];
          if (target) { sentry.shots++; sentry.fireTimer = 1.25; this._voyageExtraBullet(sentry, Math.atan2(target.y - sentry.y, target.x - sentry.x), 22, 0, 'sentry'); }
        }
      }
      const well = effects.well;
      if (well) {
        well.remaining = Math.max(0, well.remaining - dt);
        if (well.remaining === 0) effects.well = null;
        else for (const enemy of this.enemies) {
          if (enemy.hp <= 0 || ['boss', 'reactor', 'anchor', 'nest'].includes(enemy.type) || enemy.windup > 0 || enemy.chargeTimer > 0) continue;
          const gap = distance(well, enemy);
          if (gap <= 45 || gap > well.radius + enemy.radius || this.obstacles.some(rock => this._segmentHit(well.x, well.y, enemy.x - well.x, enemy.y - well.y, rock, 0) !== null)) continue;
          const step = Math.min(gap - 45, (enemy.type === 'tank' ? 20 : 40) * dt);
          this._move(enemy, (well.x - enemy.x) / gap * step, (well.y - enemy.y) / gap * step);
        }
      }
    }

    _configureCampaign(options) {
      const seed = Number.isFinite(options.seed) ? Math.trunc(options.seed) >>> 0 : 1;
      let state = seed;
      this.random = () => {
        state = state + 0x6D2B79F5 | 0;
        let value = Math.imul(state ^ state >>> 15, 1 | state);
        value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
      };
      const doctrineId = CAMPAIGN_DOCTRINES.some(item => item.id === options.doctrineId) ? options.doctrineId : 'skirmisher';
      this.campaign = { seed, doctrineId, awakeningId: '', stage: 1, totalStages: 3, visited: [this.map.id], completedStages: 0,
        crisisId: '', routeChoices: [], supplyChoices: [], rewards: [], stages: [], stageElapsed: 0, reinforcementTimer: 20, status: 'combat' };
      if (doctrineId === 'skirmisher') { this.player.maxHp -= 20; this.player.hp = this.player.maxHp; }
      if (doctrineId === 'marksman') this.player.reloadMultiplier *= 1.2;
      if (doctrineId === 'conductor') { this.player.skillCooldownMax *= .7; this.player.skillRadius += 35; }
    }

    _finishCampaignStage(boss) {
      const campaign = this.campaign;
      campaign.completedStages = campaign.stage;
      campaign.stages.push({ mapId: this.map.id, crisisId: campaign.crisisId, elapsed: campaign.stageElapsed });
      this.phase = campaign.stage === campaign.totalStages ? 'won' : 'campaign-rest';
      campaign.status = this.phase === 'won' ? 'complete' : 'rest';
      // Resolve earned pickups before resetting the field, but defer level choices until after travel.
      for (const pickup of this.pickups) {
        if (pickup.type === 'xp') this.player.xp += pickup.value;
        else if (pickup.type === 'credits') this.player.credits += pickup.value;
        else this.player.hp = Math.min(this.player.maxHp, this.player.hp + pickup.value);
      }
      this._clearCampaignCombat();
      if (this.phase === 'campaign-rest') {
        const routes = campaign.stage === 1 ? MAPS.filter(map => !campaign.visited.includes(map.id)) : [CAMPAIGN_NEXUS];
        const offset = Math.floor(this.random() * CAMPAIGN_CRISES.length);
        campaign.routeChoices = routes.map((map, index) => ({ id: map.id, mapId: map.id, title: map.name, description: map.description, color: map.color,
          crisisId: map.id === 'nexus' ? '' : CAMPAIGN_CRISES[(offset + index) % CAMPAIGN_CRISES.length].id }));
        campaign.supplyChoices = CAMPAIGN_SUPPLIES.map(item => ({ ...item }));
        this._emit('campaign-rest', boss, { stage: campaign.stage, mapId: this.map.id, completedStages: campaign.completedStages });
      } else {
        this._emit('campaign-complete', boss, { stage: campaign.stage, completedStages: campaign.completedStages });
        this._emit('win', boss);
      }
      this._objective();
    }

    _clearCampaignCombat() {
      this.enemies = []; this.bullets = []; this.hazards = []; this.pickups = []; this.echoBursts = [];
      this._clearStarline(); this.delivery = null;
      this._clearBattlefield();
      this._clearSecretTechniques();
      this.evolutionState = { breachTimer: 0, echoes: [] };
      this._clearAwakeningState();
      this.tactical = { decoy: null, mine: null, cooldown: 0 };
      this.dashMarkedIds.clear(); this.phaseDashRefund = 0;
      this.reactor.charge = 0; this.reactor.timer = 0;
      this.combo.count = 0; this.combo.timer = 0;
      this.fireTimer = 0; this.movingShot = false;
      Object.assign(this.player, { dashTimer: 0, dashCooldown: 0, skillCooldown: 0, slowTimer: 0, invulnerable: 0 });
      this.sectorThreat.active = false;
      this._refillWeapons();
    }

    chooseCampaignRoute(mapId, supplyId, awakeningId) {
      const campaign = this.campaign;
      if (this.phase !== 'campaign-rest' || !campaign || campaign.status !== 'rest') return false;
      const route = campaign.routeChoices.find(item => item.mapId === mapId);
      if (!route || !campaign.supplyChoices.some(item => item.id === supplyId)) return false;
      const awakening = CAMPAIGN_AWAKENINGS.find(item => item.id === awakeningId && item.doctrineId === campaign.doctrineId);
      if (campaign.stage === 1 ? !awakening : awakeningId !== undefined && awakeningId !== campaign.awakeningId) return false;
      const acquired = campaign.stage === 1;
      const persistentPlayer = Object.fromEntries(CAMPAIGN_PLAYER_FIELDS.map(key => [key, this.player[key]]));
      const persistent = { elapsed: this.elapsed, kills: this.kills, score: this.score, upgradeStacks: { ...this.upgradeStacks }, evolutionId: this.evolutionId,
        relics: [...this.relics], tacticId: this.tacticId, best: this.combo.best, captures: this.reactor.captures, detonations: this.reactor.detonations };
      const random = this.random, events = this.events;
      this.reset(mapId, {}, this.nextId);
      this.mode = 'campaign'; this.campaign = campaign; this.random = random;
      if (acquired) campaign.awakeningId = awakening.id;
      Object.assign(this.player, persistentPlayer);
      for (const key of ['elapsed', 'kills', 'score', 'upgradeStacks', 'evolutionId', 'relics', 'tacticId']) this[key] = persistent[key];
      this.combo.best = persistent.best; this.reactor.captures = persistent.captures; this.reactor.detonations = persistent.detonations;
      campaign.stage++; campaign.visited.push(mapId); campaign.stageElapsed = 0; campaign.reinforcementTimer = 20;
      campaign.crisisId = route.crisisId; campaign.routeChoices = []; campaign.supplyChoices = []; campaign.status = 'combat';
      campaign.rewards.push(supplyId);
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 20);
      if (supplyId === 'repair') { this.player.maxHp += 10; this.player.hp = Math.min(this.player.maxHp, this.player.hp + 50); }
      if (supplyId === 'power') this.player.damageMultiplier += .1;
      if (supplyId === 'mobility') { this.player.dashCooldownMax *= .88; this.player.skillCooldownMax *= .88; }
      this._refillWeapons();
      this.phase = 'playing'; this.breathingTimer = 6; this.spawnTimer = 5; this.player.invulnerable = 1.2;
      this.events = events;
      if (mapId === 'nexus') this._configureNexus();
      if (acquired) this._emit('awakening-acquired', this.player, { awakeningId: awakening.id, title: awakening.title, color: awakening.color });
      this._emit('campaign-stage', this.player, { stage: campaign.stage, mapId, crisisId: campaign.crisisId, doctrineId: campaign.doctrineId });
      this._objective();
      if (this.player.xp >= this.player.xpNeeded) this._levelUp();
      return true;
    }

    _configureNexus() {
      this.delivery = null;
      this.map = CAMPAIGN_NEXUS;
      this.world = { width: 1800, height: 1400 };
      Object.assign(this.player, { x: 900, y: 1150, angle: -Math.PI / 2 });
      this.spawn = { x: 900, y: 1150 };
      this.relays = []; this.stations = []; this.crates = []; this.contracts = []; this.encounters = []; this.escort = null;
      this.obstacles = [[390, 350], [1410, 350], [390, 950], [1410, 950]].map(([x, y], index) => ({ id: this._id(), type: 'rock', x, y, radius: 44, variant: index % 3 }));
      Object.assign(this.sectorThreat, { name: this.map.threat.name, description: this.map.threat.description, active: false });
      const boss = this.spawnEnemy('boss', { x: 900, y: 500 });
      Object.assign(boss, { hp: 5400, maxHp: 5400, shielded: true, attackTimer: 6, recoveryTimer: 3, speed: 54 });
      for (const x of [650, 1150]) {
        const anchor = this.spawnEnemy('anchor', { x, y: 600 });
        Object.assign(anchor, { name: '能量锚', anchorBossId: boss.id, color: '#bb9aff' });
      }
      this.bossSpawned = true;
      this._emit('boss-spawn', boss);
    }

    _configureTrial(seed) {
      this.delivery = null;
      seed = Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 1;
      let state = seed;
      this.trialRandom = () => {
        state = state + 0x6D2B79F5 | 0;
        let value = Math.imul(state ^ state >>> 15, 1 | state);
        value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
      };
      const bossMaps = MAPS.filter(map => ['frontier', 'foundry', 'frost'].includes(map.id));
      const bossMap = bossMaps[Math.floor(this.trialRandom() * bossMaps.length)];
      this.map = { ...bossMap, id: 'trial', mode: 'trial', name: '裂隙试炼', subtitle: '六波竞技场', objectiveLabel: '波次', color: '#cfb6ff',
        briefing: '完成六波主题遭遇。每次清波后安全整备，最后击败首领。' };
      this.world = { width: 1800, height: 1400 };
      Object.assign(this.player, { x: 900, y: 700, angle: -Math.PI / 2 });
      this.spawn = { x: 900, y: 700 };
      this.relays = []; this.stations = []; this.crates = []; this.contracts = []; this.encounters = []; this.escort = null;
      this.obstacles = [[-280, -200], [280, -200], [-280, 200], [280, 200], [-600, -390], [600, -390], [-600, 390], [600, 390]].map(([x, y], index) => ({
        id: this._id(), type: 'rock', x: 900 + x + (this.trialRandom() - .5) * 60, y: 700 + y + (this.trialRandom() - .5) * 60,
        radius: 38 + this.trialRandom() * 18, variant: index % 3
      }));
      const plans = TRIAL_WAVES.map(wave => {
        const enemies = [...wave.enemies];
        for (let i = enemies.length - 1; i > 0; i--) { const j = Math.floor(this.trialRandom() * (i + 1)); [enemies[i], enemies[j]] = [enemies[j], enemies[i]]; }
        return enemies;
      });
      const portals = Array.from({ length: 12 }, (_, index) => ({ x: 900 + Math.cos(index * TAU / 12) * 680, y: 700 + Math.sin(index * TAU / 12) * 510 }));
      this.trial = { seed, bossMapId: bossMap.id, plans, portals, wave: 0, totalWaves: TRIAL_WAVES.length, completedWaves: 0, choices: [], rewards: [] };
      this._beginTrialWave(1);
    }

    _beginTrialWave(wave) {
      const trial = this.trial, definition = TRIAL_WAVES[wave - 1];
      Object.assign(trial, { wave, title: definition.title, briefing: definition.briefing, status: 'warning', countdown: 3,
        spawned: 0, quota: trial.plans[wave - 1].length, remaining: trial.plans[wave - 1].length, spawnTimer: 0, hazardTimer: 5,
        entryOffset: Math.floor(this.trialRandom() * 12), choices: [] });
      this.pressurePhase = 'arrival';
      this._emit('trial-warning', this.player, { wave, title: trial.title, message: trial.briefing, countdown: 3 });
      this._objective();
    }

    _trialSpawnPoint(type) {
      const trial = this.trial, offset = trial.entryOffset + (trial.spawned % 2) * 6 + Math.floor(trial.spawned / 2);
      for (let i = 0; i < 12; i++) {
        const point = trial.portals[(offset + i) % trial.portals.length];
        if (distance(point, this.player) < 320 || this.obstacles.some(rock => distance(point, rock) < rock.radius + ENEMIES[type].radius + 8)) continue;
        return point;
      }
      return null;
    }

    _updateTrial(dt) {
      const trial = this.trial;
      if (this.phase !== 'playing' || !trial) return;
      if (trial.status === 'warning') {
        trial.countdown = Math.max(0, trial.countdown - dt);
        if (trial.countdown > 1e-8) return;
        trial.status = 'combat'; this.pressurePhase = 'pressure';
        this._emit('trial-wave', this.player, { wave: trial.wave, title: trial.title, message: trial.briefing });
      }
      if (trial.status !== 'combat') return;
      trial.spawnTimer = Math.max(0, trial.spawnTimer - dt);
      if (trial.spawned < trial.quota && trial.spawnTimer === 0 && this.enemies.filter(enemy => enemy.hp > 0).length < 16) {
        const type = trial.plans[trial.wave - 1][trial.spawned];
        if (type === 'boss') { if (this._spawnBoss()) trial.spawned++; }
        else {
          const point = this._trialSpawnPoint(type), enemy = point && this.spawnEnemy(type, point);
          if (enemy) { enemy.trialWave = trial.wave; trial.spawned++; }
        }
        trial.spawnTimer = TRIAL_WAVES[trial.wave - 1].interval;
      }
      trial.remaining = trial.quota - trial.spawned + this.enemies.filter(enemy => enemy.hp > 0).length;
      if (trial.wave === 5 && this.enemies.some(enemy => enemy.hp > 0)) {
        trial.hazardTimer = Math.max(0, trial.hazardTimer - dt);
        if (trial.hazardTimer === 0) {
          trial.hazardTimer = 7;
          this._addHazard('blast', this.player.x, this.player.y, 90, 1.5, 10, { owner: 'environment', name: '霜域试炼 · 冰爆',
            hint: '移出蓝色爆圈；冰缓后仍可冲刺破冰。', color: '#a6e9ff', effect: 'slow', enemyDamage: 35 });
          this._emit('sector-warning', this.player, { name: '霜域冰爆', hint: '蓝圈将在 1.5 秒后爆发，立即移出。', color: '#a6e9ff' });
        }
      }
    }

    _finishTrialWave() {
      const trial = this.trial;
      if (!trial || this.phase !== 'playing' || trial.status !== 'combat') return;
      trial.remaining = trial.quota - trial.spawned + this.enemies.filter(enemy => enemy.hp > 0).length;
      if (trial.remaining > 0 || trial.wave === trial.totalWaves) return;
      trial.completedWaves = trial.wave; trial.status = 'reward';
      this.phase = 'trial-reward'; this.pressurePhase = 'recovery'; this.score += 300;
      for (const pickup of this.pickups) {
        if (pickup.type === 'xp') this.player.xp += pickup.value;
        else if (pickup.type === 'credits') this.player.credits += pickup.value;
        else this.player.hp = Math.min(this.player.maxHp, this.player.hp + pickup.value);
      }
      this.pickups = []; this.bullets = []; this.hazards = []; this.echoBursts = []; this.enemies = [];
      this._clearStarline();
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 12);
      Object.assign(this.player, { dashTimer: 0, dashCooldown: 0, skillCooldown: 0, slowTimer: 0 });
      this._refillWeapons(); this._clearSecretTechniques();
      this.evolutionState = { breachTimer: 0, echoes: [] };
      trial.choices = [
        { id: 'patch', title: '战地修复', icon: '+', description: '生命上限增加 12，并恢复 40 生命。' },
        { id: 'power', title: '火力校准', icon: '✦', description: '本局所有武器伤害增加 12%。' },
        { id: 'mobility', title: '机动电容', icon: 'ϟ', description: '冲刺与脉冲震荡冷却各缩短 10%。' }
      ];
      this._emit('trial-complete', this.player, { wave: trial.wave, title: trial.title });
      this._emit('trial-reward', this.player, { wave: trial.wave });
      this._objective();
    }

    chooseTrialReward(id) {
      const trial = this.trial;
      if (this.phase !== 'trial-reward' || !trial || !trial.choices.some(choice => choice.id === id)) return false;
      if (id === 'patch') { this.player.maxHp += 12; this.player.hp = Math.min(this.player.maxHp, this.player.hp + 40); }
      if (id === 'power') this.player.damageMultiplier += .12;
      if (id === 'mobility') { this.player.dashCooldownMax *= .9; this.player.skillCooldownMax *= .9; }
      trial.rewards.push(id); this.phase = 'playing';
      this._beginTrialWave(trial.wave + 1);
      if (this.player.xp >= this.player.xpNeeded) this._levelUp();
      return true;
    }

    _configureMap() {
      const relocate = (entities, points) => entities.forEach((entity, index) => { entity.x = points[index][0]; entity.y = points[index][1]; });
      this.escort = null;
      this.relays.forEach(relay => { relay.mode = this.map.mode; });
      if (this.map.id === 'foundry') {
        Object.assign(this.player, { x: 360, y: 350 });
        relocate(this.relays, [[900, 600], [2460, 600], [1700, 1870]]);
        this.relays.forEach((relay, index) => { relay.name = ['西炉 · 炽心核心', '东炉 · 余烬核心', '南炉 · 地脉核心'][index]; relay.reactorId = null; });
        relocate(this.stations, [[500, 800], [1560, 800], [2620, 1800], [700, 1770]]);
        relocate(this.crates, [[560, 460], [800, 930], [1190, 340], [1650, 380], [2020, 340], [2760, 540], [2790, 1050], [2280, 1130], [1860, 1190], [1330, 1220], [400, 1220], [520, 2050], [1090, 2070], [1450, 2160], [2110, 2100], [2720, 2090]]);
        relocate(this.contracts, [[850, 1280], [2250, 1260], [2460, 2020]]);
      } else if (this.map.id === 'frost') {
        Object.assign(this.player, { x: 430, y: 2080 });
        const routes = [[[740, 1930], [1090, 1790], [1500, 1640]], [[1600, 1590], [1980, 1380], [2300, 1000]], [[2340, 910], [2040, 680], [1560, 420]]];
        this.relays.forEach((relay, index) => {
          relay.name = ['冰湾 · 起运段', '裂谷 · 穿越段', '极光 · 撤离段'][index];
          relay.x = routes[index][0][0]; relay.y = routes[index][0][1]; relay.radius = 165;
          relay.status = index === 0 ? 'idle' : 'locked';
          relay.waypoints = routes[index].map(([x, y]) => ({ x, y }));
          relay.waypointIndex = 1; relay.escortDistance = 0; relay.escortSpeed = 60;
          relay.routeLength = relay.waypoints.reduce((sum, point, step) => step ? sum + distance(point, relay.waypoints[step - 1]) : 0, 0);
        });
        relocate(this.stations, [[500, 1770], [1410, 1410], [2500, 1230], [1940, 400]]);
        relocate(this.crates, [[620, 2100], [870, 1570], [1160, 1990], [1500, 1890], [1790, 1740], [2200, 1590], [2660, 1710], [2730, 1060], [2110, 1090], [2440, 530], [2180, 350], [1560, 700], [1230, 350], [900, 670], [480, 1050], [1230, 1150]]);
        relocate(this.contracts, [[740, 1120], [1670, 920], [2700, 1900]]);
      } else if (this.map.id === 'storm') {
        Object.assign(this.player, { x: 420, y: 2040 });
        relocate(this.relays, [[950, 1760], [2580, 1740], [1750, 500]]);
        this.relays.forEach((relay, index) => { relay.name = ['西港 · 接闪塔', '东港 · 蓄雷塔', '北港 · 风暴塔'][index]; relay.charges = 0; relay.chargeGoal = 3; });
        relocate(this.stations, [[550, 1650], [1510, 1580], [2720, 1160], [1210, 510]]);
        relocate(this.crates, [[620, 2040], [390, 1400], [730, 1040], [490, 620], [880, 390], [1330, 330], [2020, 420], [2510, 440], [2820, 820], [2100, 1100], [1510, 1120], [1240, 2110], [1900, 2020], [2820, 2110], [2890, 1520], [1930, 1530]]);
        relocate(this.contracts, [[850, 740], [2440, 900], [2040, 1960]]);
        this.sectorThreat.interval = 5;
      } else if (this.map.id === 'ruins') {
        Object.assign(this.player, { x: 450, y: 2050 });
        relocate(this.relays, [[900, 1500], [2480, 650], [2520, 1920]]);
        this.relays.forEach((relay, index) => { relay.name = ['西庭 · 回星站', '北庭 · 曙光站', '东庭 · 归航站'][index]; relay.radius = 110; });
        this.delivery = { carriedId: null, carrySpeed: .88, cargos: [[550, 2050], [1820, 340], [2880, 1200]].map(([x, y], index) => ({
          id: this._id(), type: 'cargo', relayId: this.relays[index].id, x, y, radius: 18, status: 'source', pickupLock: 0,
          label: this.relays[index].name.split(' · ')[1] + '星火', color: this.map.color
        })) };
        this.delivery.cargos.forEach(cargo => {
          const relay = this.relays.find(item => item.id === cargo.relayId), dx = relay.x - cargo.x, dy = relay.y - cargo.y, length = vectorLength(dx, dy);
          cargo.guardPoints = [0, 1, 2].map(index => {
            const side = index % 2 ? -260 : 260, fraction = index === 2 ? .7 : .45;
            return { x: cargo.x + dx * fraction - dy / length * side, y: cargo.y + dy * fraction + dx / length * side };
          });
        });
        relocate(this.stations, [[500, 1600], [1500, 1600], [2620, 1050], [1400, 500]]);
        relocate(this.crates, [[610, 2090], [400, 1320], [700, 1030], [450, 510], [1000, 390], [1560, 300], [2070, 690], [2700, 460], [2870, 1040], [2270, 1160], [1570, 1090], [1260, 2070], [1850, 2130], [2820, 2080], [3000, 1400], [1850, 1510]]);
        relocate(this.contracts, [[900, 750], [1900, 950], [1950, 1900]]);
        this.sectorThreat.interval = 5.5;
      }
      if (this.map.id !== 'frontier') this.contracts.forEach(contract => contract.nodes.forEach((node, index) => { node.x = contract.x + contract.offsets[index][0]; node.y = contract.y + contract.offsets[index][1]; }));
      this.spawn = { x: this.player.x, y: this.player.y };
    }

    _configureEncounters() {
      const positions = {
        frontier: [[1420, 1150], [2100, 730], [2650, 1390]],
        foundry: [[1370, 840], [620, 1500], [2500, 1480]],
        frost: [[1170, 1130], [2360, 1840], [1850, 620]],
        storm: [[1200, 1120], [2170, 710], [2660, 1350]],
        ruins: [[1280, 1150], [2630, 1300], [1580, 500]]
      }[this.map.id];
      this.encounters = [
        { kind: 'race', name: '逐光回收', description: '45 秒内依次触碰三个信号节点，再返回终端领取战术模块。', goal: 3, duration: 45, spawnPlan: ['crawler', 'crawler', 'spitter', 'crawler'] },
        { kind: 'rings', name: '双环校准', description: '45 秒内在发光圆环累计停留 12 秒；圆环每 4 秒切换。完成后返回终端。', goal: 12, duration: 45, spawnPlan: ['crawler', 'spitter', 'crawler', 'charger', 'spitter', 'crawler'] },
        { kind: 'hunt', name: '裂隙精英', description: '60 秒内击败三名标记守卫，再返回终端领取战术模块。其他敌人不计数。', goal: 3, duration: 60, spawnPlan: ['tank', 'charger', 'spitter'] }
      ].map((plan, index) => {
        const [x, y] = positions[index];
        const offsets = plan.kind === 'race' ? [[-170, -140], [120, -210], [220, 130]] : plan.kind === 'rings' ? [[-130, 0], [130, 0]] : [];
        return { ...plan, id: this._id(), type: 'encounter', x, y, radius: 30, status: 'idle', remaining: plan.duration,
          elapsed: 0, progress: 0, activeNode: 0, spawned: 0, spawnTotal: plan.spawnPlan.length, spawnTimer: 0,
          nodes: offsets.map(([dx, dy]) => ({ x: x + dx, y: y + dy, radius: plan.kind === 'rings' ? 85 : 36, collected: false })),
          guardPoints: [[-270, -240], [270, -240], [0, 300]].map(([dx, dy]) => ({ x: x + dx, y: y + dy })) };
      });
    }

    encounterTarget(encounter) {
      if (!encounter || encounter.status !== 'active') return encounter;
      if (encounter.kind === 'race' || encounter.kind === 'rings') return encounter.nodes[encounter.activeNode] || encounter;
      return this.enemies.filter(enemy => enemy.hp > 0 && enemy.encounterId === encounter.id)
        .sort((a, b) => distance(a, this.player) - distance(b, this.player))[0] || encounter;
    }

    _readyEncounter(encounter) {
      if (encounter.status !== 'active') return;
      encounter.progress = encounter.goal;
      encounter.status = 'ready';
      this.breathingTimer = Math.max(this.breathingTimer, 5);
      this._emit('encounter-ready', encounter, { encounterId: encounter.id, kind: encounter.kind, message: encounter.name + '完成 · 返回终端选择战术模块' });
    }

    _updateEncounters(dt, moveStart = this.player) {
      if (this.phase !== 'playing' || this.trial) return;
      const encounter = this.encounters.find(item => item.status === 'active');
      if (!encounter) return;
      const duration = Math.min(dt, encounter.remaining);
      const oldProgress = encounter.progress, oldNode = encounter.activeNode;
      if (encounter.kind === 'race') {
        const node = encounter.nodes[encounter.activeNode];
        const hit = node && duration > 0 ? this._segmentHit(moveStart.x, moveStart.y, this.player.x - moveStart.x, this.player.y - moveStart.y, node, this.player.radius) : null;
        if (hit !== null && hit * dt <= duration + 1e-9) {
          node.collected = true; encounter.progress++; encounter.activeNode++;
        }
      } else if (encounter.kind === 'rings') {
        let left = duration, elapsed = encounter.elapsed;
        while (left > 1e-9) {
          const slot = Math.floor((elapsed + 1e-9) / 4);
          const step = Math.min(left, (slot + 1) * 4 - elapsed);
          const node = encounter.nodes[slot % 2];
          if (distance(this.player, node) <= node.radius) encounter.progress = Math.min(encounter.goal, encounter.progress + step);
          elapsed += step; left -= step;
        }
        encounter.activeNode = Math.floor((encounter.elapsed + duration + 1e-9) / 4) % 2;
      }
      encounter.elapsed += duration;
      encounter.remaining = Math.max(0, encounter.duration - encounter.elapsed);
      if (Math.floor(encounter.progress + 1e-9) !== Math.floor(oldProgress + 1e-9) || encounter.activeNode !== oldNode) {
        this._emit('encounter-progress', encounter, { encounterId: encounter.id, kind: encounter.kind, message: encounter.name + ' · ' + Math.floor(encounter.progress + 1e-9) + '/' + encounter.goal });
      }
      if (encounter.progress >= encounter.goal - 1e-9) { this._readyEncounter(encounter); return; }
      if (encounter.remaining <= 1e-9) {
        encounter.status = 'failed'; encounter.remaining = 0;
        this._emit('encounter-failed', encounter, { encounterId: encounter.id, kind: encounter.kind, message: encounter.name + '信号消失 · 可继续主线探索' });
        return;
      }
      encounter.spawnTimer = Math.max(0, encounter.spawnTimer - duration);
      if (encounter.spawned >= encounter.spawnTotal || encounter.spawnTimer > 0) return;
      const type = encounter.spawnPlan[encounter.spawned];
      // Never spend a quota slot until a clear location and population slot exist.
      let spawnPoint = null;
      for (let i = 0; i < encounter.guardPoints.length; i++) {
        const candidate = encounter.guardPoints[(i + encounter.spawned) % encounter.guardPoints.length];
        if (distance(candidate, this.player) > 140 && !this.obstacles.some(rock => distance(candidate, rock) <= rock.radius + ENEMIES[type].radius)) { spawnPoint = candidate; break; }
      }
      if (!spawnPoint) return;
      const enemy = this.spawnEnemy(type, spawnPoint);
      if (!enemy) return;
      enemy.encounterId = encounter.id;
      if (encounter.kind === 'hunt') {
        enemy.elite = true; enemy.hp = enemy.maxHp = Math.round(enemy.maxHp * 1.35);
        enemy.name = ['裂隙铁卫', '裂隙突袭者', '裂隙射手'][encounter.spawned];
      }
      encounter.spawned++;
      encounter.spawnTimer = encounter.kind === 'race' ? 1.15 : encounter.kind === 'hunt' ? 1.5 : 3;
    }

    chooseTactic(id) {
      if (this.phase !== 'tactic' || !this.tacticChoices.some(tactic => tactic.id === id)) return false;
      const keeping = this.tacticId === id;
      this.tacticId = id; this.tacticChoices = [];
      if (!keeping) { this.tactical.decoy = null; this.tactical.mine = null; }
      this.phase = 'playing';
      this.player.invulnerable = Math.max(this.player.invulnerable, 1);
      this._emit('tactic-equipped', this.player, { tacticId: id, message: (keeping ? '保留当前战术：' : '战术已装备：') + TACTICS.find(tactic => tactic.id === id).title });
      if (this.player.xp >= this.player.xpNeeded) this._levelUp();
      return true;
    }

    _updateTactics(dt) {
      const tactical = this.tactical;
      tactical.cooldown = Math.max(0, tactical.cooldown - dt);
      if (tactical.decoy) {
        tactical.decoy.remaining = Math.max(0, tactical.decoy.remaining - dt);
        if (tactical.decoy.remaining === 0) tactical.decoy = null;
      }
      const mine = tactical.mine;
      if (!mine) return;
      if (mine.remaining <= 0) { tactical.mine = null; return; }
      const clear = enemy => !this.obstacles.some(rock => this._segmentHit(mine.x, mine.y, enemy.x - mine.x, enemy.y - mine.y, rock, 0) !== null);
      if (!this.enemies.some(enemy => enemy.hp > 0 && distance(mine, enemy) <= mine.radius + enemy.radius && clear(enemy))) {
        mine.remaining = mine.remaining <= dt + 1e-9 ? 0 : mine.remaining - dt;
        if (mine.remaining === 0) tactical.mine = null;
        return;
      }
      tactical.mine = null;
      this._emit('tactic-trigger', mine, { tacticId: 'reload-mine', stage: 'burst', radius: mine.blastRadius, color: '#ffd086', message: '感应雷引爆' });
      for (const enemy of this.enemies) {
        if (this.phase !== 'playing') break;
        if (enemy.hp > 0 && distance(mine, enemy) <= mine.blastRadius + enemy.radius && clear(enemy)) this._damageEnemy(enemy, mine.damage);
      }
    }

    _pullTacticEnemies(origin, radius = this.player.skillRadius) {
      if (this.phase !== 'playing' || this.tacticId !== 'gravity-pulse') return;
      const targets = [];
      for (const enemy of this.enemies) {
        const gap = distance(origin, enemy);
        if (enemy.hp <= 0 || ['boss', 'nest', 'reactor', 'anchor'].includes(enemy.type) || enemy.chargeTimer > 0 || (enemy.type === 'charger' && enemy.windup > 0)
            || gap <= 60 || gap > radius + enemy.radius) continue;
        const step = Math.min(80, gap - 60), dx = (origin.x - enemy.x) / gap * step, dy = (origin.y - enemy.y) / gap * step;
        let fraction = 1;
        for (const rock of this.obstacles) {
          const hit = this._segmentHit(enemy.x, enemy.y, dx, dy, rock, enemy.radius);
          // Surface contact blocks entry, but must not pin an enemy moving away.
          if (hit === 0 && distance(enemy, rock) >= rock.radius + enemy.radius - 1e-7
              && (enemy.x - rock.x) * dx + (enemy.y - rock.y) * dy >= 0) continue;
          if (hit !== null) fraction = Math.min(fraction, Math.max(0, hit - 1e-7));
        }
        const fromX = enemy.x, fromY = enemy.y;
        enemy.x = clamp(enemy.x + dx * fraction, enemy.radius + 20, this.world.width - enemy.radius - 20);
        enemy.y = clamp(enemy.y + dy * fraction, enemy.radius + 20, this.world.height - enemy.radius - 20);
        if (distance(enemy, { x: fromX, y: fromY }) > .001) targets.push({ fromX, fromY, x: enemy.x, y: enemy.y });
      }
      if (targets.length) this._emit('tactic-trigger', origin, { tacticId: 'gravity-pulse', radius, targets, color: '#cbb0ff', message: '引力聚拢' });
    }

    start() {
      if (this.phase !== 'ready') return false;
      this.phase = 'playing';
      this._emit('start', this.player);
      if (this.salvage) { this._startSalvageHunt(); this._emit('salvage-start', this.player, { seed: this.salvage.seed, sectorId: this.salvage.sectorId, color: this.map.color }); }
      if (this.siege) this._emit('siege-start', this.player, { seed: this.siege.seed, color: this.map.color });
      return true;
    }

    _id() { return this.nextId++; }
    _emit(type, position = this.player, extra = {}) { this.events.push({ type, x: position.x, y: position.y, ...extra }); }
    drainEvents() { const events = this.events; this.events = []; return events; }

    _discoverSecret(id, position = this.player) {
      if (this.phase !== 'playing' || this.discoveredSecrets.has(id) || !SECRETS.some(secret => secret.id === id)) return false;
      this.discoveredSecrets.add(id);
      this._emit('secret-discovered', position, { secretId: id });
      return true;
    }

    _clearSecretTechniques() {
      Object.assign(this.player, { reversalAmmo: 0, reversalTimer: 0, reversalDamage: 0, iceChaseTimer: 0, iceChaseReady: false, iceChaseLockout: 0 });
      this.iceChaseIds.clear();
      this.railCorridor = null;
    }

    _clearAwakeningState() {
      this.awakeningState = { returnAnchor: null, returning: false, relayTimer: 0, relayPending: WEAPONS.map(() => false), interruptCooldown: 0, field: null, charge: null };
    }

    _updateAwakenings(dt) {
      const state = this.awakeningState;
      state.relayTimer = Math.max(0, state.relayTimer - dt);
      state.interruptCooldown = Math.max(0, state.interruptCooldown - dt);
      if (state.returnAnchor) {
        state.returnAnchor.remaining = Math.max(0, state.returnAnchor.remaining - dt);
        if (state.returnAnchor.remaining <= 1e-9) state.returnAnchor = null;
      }
      if (this.player.dashTimer <= 1e-9) state.returning = false;
      if (state.field) {
        const field = state.field;
        field.remaining = Math.max(0, field.remaining - dt); field.tick += dt;
        if (field.tick + 1e-9 >= .2 && field.remaining > 1e-9) {
          field.tick -= .2;
          const bullet = this.bullets.find(item => item.owner === 'enemy' && item.lifetime > 0 && distance(this.player, item) <= field.radius);
          if (bullet) {
            bullet.lifetime = 0; field.captured++;
            this._emit('awakening-trigger', bullet, { awakeningId: 'mobile-field', stage: 'field-capture', radius: 18, color: '#c9b3ff', message: '随行电场消弹' });
          }
        }
        if (field.remaining <= 1e-9 || field.captured >= 8) state.field = null;
      }
      if (state.charge) {
        state.charge.remaining = Math.max(0, state.charge.remaining - dt);
        if (state.charge.remaining <= 1e-9) { state.charge = null; this._releaseSkill(true); }
      }
    }

    _interruptAwakening(bullet, enemy) {
      if (this.phase !== 'playing' || this.campaign?.awakeningId !== 'interrupt-round' || !bullet.overcharged
          || this.awakeningState.interruptCooldown > 0 || enemy.hp <= 0 || ['boss', 'reactor', 'anchor', 'nest'].includes(enemy.type)) return;
      this.awakeningState.interruptCooldown = 4;
      Object.assign(enemy, { stunTimer: Math.max(enemy.stunTimer, .8), windup: 0, chargeTimer: 0, attackKind: '', attackTimer: Math.max(enemy.attackTimer, .8) });
      this.hazards = this.hazards.filter(hazard => hazard.sourceId !== enemy.id);
      this._emit('awakening-trigger', enemy, { awakeningId: 'interrupt-round', stage: 'interrupt', radius: 42, color: '#ffd18c', message: '破招标定' });
    }

    _updateSecretTechniques(dt) {
      if (this.phase !== 'playing') return;
      const player = this.player;
      for (const key of ['reversalTimer', 'iceChaseTimer', 'iceChaseLockout']) player[key] = Math.max(0, player[key] - dt);
      if (player.reversalTimer === 0) player.reversalAmmo = 0;
      for (const enemy of this.enemies) enemy.iceBreakTimer = Math.max(0, (enemy.iceBreakTimer || 0) - dt);
      player.iceChaseReady = player.iceChaseTimer > 0 && this.enemies.some(enemy => enemy.hp > 0 && enemy.iceBreakTimer > 0 && enemy.stunTimer > 0 && this.iceChaseIds.has(enemy.id));
      if (!player.iceChaseReady) { player.iceChaseTimer = 0; this.iceChaseIds.clear(); }
      if (this.railCorridor) {
        this.railCorridor.remaining = Math.max(0, this.railCorridor.remaining - dt);
        if (this.railCorridor.remaining === 0) this.railCorridor = null;
      }
    }

    _updateEvolutionEffects(dt) {
      const state = this.evolutionState;
      state.breachTimer = Math.max(0, state.breachTimer - dt);
      if (state.breachTimer < 1e-9) state.breachTimer = 0;
      for (const echo of state.echoes) {
        if (this.phase !== 'playing') break;
        echo.remaining = Math.max(0, echo.remaining - dt);
        if (echo.remaining > 1e-9) continue;
        this._emit('evolution-trigger', echo, { evolutionId: echo.evolutionId, stage: 'echo', radius: echo.radius, color: echo.color });
        for (const enemy of this.enemies) {
          if (this.phase !== 'playing') break;
          if (enemy.hp <= 0 || distance(echo, enemy) > echo.radius + enemy.radius) continue;
          if (this.obstacles.some(rock => this._segmentHit(echo.x, echo.y, enemy.x - echo.x, enemy.y - echo.y, rock, 0) !== null)) continue;
          this._damageEnemy(enemy, echo.damage, echo.critical);
        }
      }
      state.echoes = state.echoes.filter(echo => echo.remaining > 1e-9);
    }

    _iceChaseTarget(direction) {
      const player = this.player;
      if (!player.iceChaseReady || player.iceChaseTimer <= 0) return null;
      let closest = null, closestDistance = Infinity;
      for (const enemy of this.enemies) {
        const gap = distance(player, enemy);
        if (enemy.hp <= 0 || enemy.iceBreakTimer <= 0 || enemy.stunTimer <= 0 || !this.iceChaseIds.has(enemy.id) || gap < 80 || gap > 280) continue;
        if (((enemy.x - player.x) * direction.x + (enemy.y - player.y) * direction.y) / gap < Math.cos(35 * Math.PI / 180)) continue;
        if (gap < closestDistance) { closest = enemy; closestDistance = gap; }
      }
      return closest;
    }

    skillTarget() {
      const player = this.player;
      let target = null, closest = Infinity;
      if (this.phase === 'playing' && player.weapon === 3) for (const bullet of this.bullets) {
        if (bullet.owner !== 'player' || bullet.kind !== 'grenade' || bullet.exploded || bullet.lifetime <= 0) continue;
        const gap = distance(player, bullet);
        if (gap <= player.skillRadius || gap > 650 || gap >= closest) continue;
        if (((bullet.x - player.x) * Math.cos(player.angle) + (bullet.y - player.y) * Math.sin(player.angle)) / gap < Math.cos(Math.PI / 18)) continue;
        target = bullet; closest = gap;
      }
      return { x: target ? target.x : player.x, y: target ? target.y : player.y, radius: player.skillRadius, remote: Boolean(target), target };
    }

    _objective() {
      if (this.siege) {
        const boss = this.enemies.find(enemy => enemy.id === this.siege.bossId), target = this.siegeTarget();
        this.currentObjective = this.siege.status === 'complete' ? '巨械击破' : this.siege.status === 'failed' ? '强袭失败' :
          (boss?.stage === 3 ? '过载终局' : boss?.shielded ? '拆炮 · 夺火力' : '核心暴露') + (target ? ' · ' + target.label : '');
        return;
      }
      if (this.salvage) {
        const salvage = this.salvage, level = ['I', 'II', 'III', 'IV'][salvage.alertLevel - 1];
        const drill = salvage.sources.find(source => source.status === 'drilling' && distance(this.player, source) <= source.workRadius);
        const prefix = '样本 ' + salvage.carried + ' · 警戒 ' + level;
        this.currentObjective = salvage.status === 'extracted' ? '回收成功 · 样本 ' + salvage.settled + (salvage.cargoBonus ? ' · 黑匣子 +' + salvage.cargoBonus : '') : salvage.status === 'withdrawn' ? '安全撤回 · 未带回样本' :
          salvage.status === 'failed' ? '回收失败 · 丢失样本 ' + salvage.lostSamples + (salvage.hotCargo.status === 'lost' ? ' · 黑匣子遗失' : '') : salvage.status === 'approaching' ? prefix + ' · 接应 ' + Math.ceil(salvage.evac.remaining) + 's' :
          salvage.status === 'boarding' ? prefix + ' · 登舰 ' + salvage.evac.progress.toFixed(1) + '/3s' :
          drill ? prefix + ' · 钻探 ' + drill.progress.toFixed(1) + '/8s' : salvage.comms.status === 'linking' ? prefix + ' · 架设 ' + salvage.comms.progress.toFixed(1) + '/5s' : prefix + ' · 自选目标，随时撤离';
        return;
      }
      if (this.voyage) {
        const voyage = this.voyage, room = voyage.room, target = this.voyageTarget();
        this.currentObjective = this.phase === 'won' ? '星海远航完成 · 航界裂口已封闭' : this.phase === 'lost' ? '远航中断 · 第 ' + voyage.node + '/7 节点' :
          this.phase === 'voyage-rest' ? '安全航路 · 整备装置并选择下一节点' : room.objectiveDone ? '星门已亮 · 返回出口按 E 撤离' :
          room.type === 'finale' ? '航界终局 · 击败三阶段吞星者' : '节点 ' + voyage.node + '/7 · ' + this.map.subtitle + ' · ' + target.progress + '/' + target.total;
        return;
      }
      if (this.campaign && (this.phase === 'campaign-rest' || this.map.id === 'nexus' || this.phase === 'won' || this.phase === 'lost')) {
        const anchors = this.enemies.filter(enemy => enemy.type === 'anchor' && enemy.hp > 0).length;
        this.currentObjective = this.phase === 'won' ? '远征完成 · 裂隙中枢已封闭' : this.phase === 'lost' ? '远征中断 · 第 ' + this.campaign.stage + '/3 幕' :
          this.phase === 'campaign-rest' ? '安全整备 · 选择下一路线与一项补给' : anchors ? '摧毁能量锚 ' + (2 - anchors) + '/2 · 解除主宰减伤护盾' : '护盾已破 · 击败中枢主宰';
        return;
      }
      if (this.trial) {
        this.currentObjective = this.phase === 'won' ? '裂隙已封闭 · 六波试炼完成' : this.phase === 'lost' ? '试炼中断 · 第 ' + this.trial.wave + ' 波' :
          this.trial.status === 'reward' ? '安全整备 · 选择下一波强化' : '第 ' + this.trial.wave + '/6 波 · ' + this.trial.title + (this.trial.status === 'warning' ? ' · 准备迎战' : ' · 剩余 ' + this.trial.remaining);
        return;
      }
      const charging = this.relays.find(relay => relay.status === 'charging');
      const encounter = this.encounters.find(item => item.status === 'active' || item.status === 'ready');
      if (this.phase === 'won') this.currentObjective = '撤离成功 · 黎明已经抵达';
      else if (this.phase === 'lost') this.currentObjective = '信号中断 · 再次出发';
      else if (this.bossSpawned) this.currentObjective = `击败${this.map.boss.name}，完成撤离`;
      else if (encounter) this.currentObjective = encounter.status === 'ready' ? encounter.name + ' · 返回终端领取战术模块' : encounter.name + ' · ' + Math.floor(encounter.progress) + '/' + encounter.goal + ' · 剩余 ' + Math.ceil(encounter.remaining) + ' 秒';
      else if (this.delivery) {
        const cargo = this.delivery.cargos.find(item => item.id === this.delivery.carriedId);
        const dropped = this.delivery.cargos.find(item => item.status === 'dropped');
        const relay = cargo && this.relays.find(item => item.id === cargo.relayId);
        this.currentObjective = cargo ? '携带星火 → ' + relay.name + ' · 冲刺会放下' : dropped ? '回收放下的星火 · 接收站 ' + this.completedRelays + '/3' : '找到星火并送至对应接收站 · ' + this.completedRelays + '/3';
      }
      else if (charging) this.currentObjective = this.map.mode === 'demolition' ? `摧毁${charging.name} · 射击暴露的反应堆` : this.map.mode === 'escort' ? `护送${charging.name} · 留在移动光圈内` : this.map.mode === 'conduction' ? `引雷${charging.name} · ${charging.charges}/${charging.chargeGoal} 格 · 锁定后撤出爆圈` : `坚守${charging.name} · 留在信标光圈内`;
      else this.currentObjective = this.map.mode === 'defense' ? `探索荒原，激活信标 ${this.completedRelays} / 3` : `${this.map.mode === 'demolition' ? '寻找熔炉终端' : this.map.mode === 'conduction' ? '寻找导雷塔' : '前往下一段运输机'} · ${this.map.objectiveLabel} ${this.completedRelays} / 3`;
    }

    update(dt, input = {}) {
      if (this.phase !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
      let remaining = Math.min(dt, 0.25);
      while (remaining > 0 && this.phase === 'playing') {
        const step = Math.min(remaining, 1 / 60, this.player.dashTimer > 0 ? this.player.dashTimer : Infinity);
        this._step(step, input);
        remaining -= step;
      }
    }

    _step(dt, input) {
      const player = this.player;
      this.elapsed += dt;
      if (this.campaign) this.campaign.stageElapsed += dt;
      if (this.voyage) this.voyage.room.elapsed += dt;
      if (this.reactor.timer > 0) {
        this.reactor.timer = Math.max(0, this.reactor.timer - dt);
        if (this.reactor.timer === 0) this._emit('overdrive-end');
      }
      this.combo.timer = Math.max(0, this.combo.timer - dt);
      if (this.combo.timer === 0) this.combo.count = 0;
      for (const enemy of this.enemies) enemy.phaseMarkTimer = Math.max(0, (enemy.phaseMarkTimer || 0) - dt);
      this.fireTimer = Math.max(0, this.fireTimer - dt);
      for (const key of ['dashCooldown', 'skillCooldown', 'invulnerable', 'slowTimer']) player[key] = Math.max(0, player[key] - dt);
      if (this.delivery) for (const cargo of this.delivery.cargos) {
        cargo.pickupLock = Math.max(0, cargo.pickupLock - dt);
        if (cargo.pickupLock < 1e-9) cargo.pickupLock = 0;
      }
      this._ageStarline(dt);
      this._updateSecretTechniques(dt);
      this._updateTactics(dt);
      this._updateEvolutionEffects(dt);
      if (this.phase !== 'playing') return;
      this.breathingTimer = Math.max(0, this.breathingTimer - dt);
      WEAPONS.forEach((weapon, index) => {
        if (this.reloadByWeapon[index] <= 0) return;
        this.reloadByWeapon[index] = Math.max(0, this.reloadByWeapon[index] - dt);
        if (this.reloadByWeapon[index] === 0) {
          this._finishReload(index, false);
        }
      });
      this._syncWeapon();
      if (Number.isFinite(input.aimX) && Number.isFinite(input.aimY)) {
        player.angle = Math.atan2(input.aimY - player.y, input.aimX - player.x);
        if (this.voyage) this.voyage.aimTarget = { x: input.aimX, y: input.aimY };
        if (this.siege) this.siege.aimTarget = { x: input.aimX, y: input.aimY };
      }
      let mx = clamp(Number(input.moveX) || 0, -1, 1);
      let my = clamp(Number(input.moveY) || 0, -1, 1);
      const magnitude = vectorLength(mx, my);
      if (magnitude > 0) {
        this.moveVector = { x: mx / magnitude, y: my / magnitude };
        mx /= Math.max(1, magnitude); my /= Math.max(1, magnitude);
      }
      const moveStart = { x: player.x, y: player.y };
      let walkTime = dt, dashTime = 0;
      if (player.dashTimer > 0) {
        dashTime = Math.min(dt, player.dashTimer);
        const start = { x: player.x, y: player.y };
        this._move(player, this.dashVector.x * 810 * player.dashMultiplier * dashTime, this.dashVector.y * 810 * player.dashMultiplier * dashTime);
        const trail = this.voyage?.effects.trails.find(item => item.id === this.voyage.effects.activeTrailId);
        if (trail) {
          const dx = player.x - trail.x, dy = player.y - trail.y;
          let limit = 1;
          for (const rock of this.obstacles) {
            const hit = this._segmentHit(trail.x, trail.y, dx, dy, rock, trail.width / 2);
            if (hit !== null) limit = Math.min(limit, Math.max(0, hit - .001));
          }
          trail.endX = trail.x + dx * limit; trail.endY = trail.y + dy * limit;
        }
        this._phaseDash(start);
        player.dashTimer -= dashTime;
        walkTime -= dashTime;
      }
      if (walkTime > 0) {
        const speed = player.speed * (player.slowTimer > 0 ? .6 : 1) * (this.delivery?.carriedId ? this.delivery.carrySpeed : 1);
        this._move(player, mx * speed * walkTime, my * speed * walkTime);
      }
      if (this.phase !== 'playing') return;
      this.movingShot = distance(moveStart, player) > 1e-6;
      this._updateAwakenings(dt);
      if (this.phase !== 'playing') return;
      if (input.shoot) this._shoot();
      if (!this.trial && !this.voyage && !this.salvage && !this.siege) this._updateContracts(dt);
      this._updateEncounters(dt, moveStart);
      this._updateEchoes(dt);
      if (this.phase !== 'playing') return;
      if (!this.trial && !this.voyage && !this.salvage && !this.siege) this._updateRelays(dt);
      this._spawnDirector(dt);
      this._updateEnemies(dt);
      if (this.phase !== 'playing') return;
      this._updateVoyageEffects(dt);
      if (this.phase !== 'playing') return;
      this._updateStarline();
      if (this.phase !== 'playing') return;
      if (!this.trial && !this.voyage && !this.salvage && !this.siege) this._updateSectorThreat(dt);
      this._updateHazards(dt);
      if (this.phase !== 'playing') return;
      this._updateBattlefield(dt);
      if (this.phase !== 'playing') return;
      this._updateBullets(dt, dashTime);
      if (this.phase !== 'playing') return;
      this._finishSalvageStep(dt);
      if (this.phase !== 'playing') return;
      this._finishTrialWave();
      if (this.phase !== 'playing') return;
      this._checkVoyageObjective();
      this._updatePickups(dt);
      this._objective();
    }

    _move(entity, dx, dy) {
      entity.x = clamp(entity.x + dx, entity.radius + 20, this.world.width - entity.radius - 20);
      entity.y = clamp(entity.y + dy, entity.radius + 20, this.world.height - entity.radius - 20);
      for (const rock of this.obstacles) {
        const ox = entity.x - rock.x, oy = entity.y - rock.y;
        const length = vectorLength(ox, oy), limit = entity.radius + rock.radius;
        if (length >= limit) continue;
        if (length < 0.001) entity.x = rock.x + limit;
        else { entity.x = rock.x + ox / length * limit; entity.y = rock.y + oy / length * limit; }
      }
    }

    dash(direction) {
      const player = this.player;
      if (this.phase !== 'playing' || player.dashTimer > 1e-9) return false;
      const anchor = this.awakeningState.returnAnchor;
      if (anchor && distance(player, anchor) < 16) this.awakeningState.returnAnchor = null;
      if (this.campaign?.awakeningId === 'return-dash' && this.awakeningState.returnAnchor && anchor.remaining > 0) {
        const gap = distance(player, anchor);
        this.dashVector = { x: (anchor.x - player.x) / gap, y: (anchor.y - player.y) / gap };
        this.moveVector = { ...this.dashVector };
        player.dashTimer = Math.min(.2, gap / (810 * player.dashMultiplier));
        player.invulnerable = Math.max(player.invulnerable, .16);
        this.awakeningState.returnAnchor = null; this.awakeningState.returning = true;
        this.dashMarkedIds.clear(); this.phaseDashRefund = 0;
        this._emit('dash', player, { dx: this.dashVector.x, dy: this.dashVector.y, angle: Math.atan2(this.dashVector.y, this.dashVector.x) });
        this._emit('awakening-trigger', player, { awakeningId: 'return-dash', stage: 'return', radius: 38, color: '#8cf5d3', angle: Math.atan2(this.dashVector.y, this.dashVector.x), message: '折返跃迁' });
        return true;
      }
      const dx = direction && Number.isFinite(direction.x) ? direction.x : 0;
      const dy = direction && Number.isFinite(direction.y) ? direction.y : 0;
      const length = vectorLength(dx, dy);
      const vector = length > 0 ? { x: dx / length, y: dy / length } : { ...this.moveVector };
      const chase = player.dashCooldown > 0 && this._iceChaseTarget(vector);
      if (player.dashCooldown > 0 && !chase) return false;
      this._dropCargo();
      const breakIce = player.slowTimer > 0;
      this.dashVector = vector;
      this.moveVector = { ...this.dashVector };
      player.dashTimer = 0.2;
      player.invulnerable = Math.max(player.invulnerable, 0.28);
      player.dashCooldown = player.dashCooldownMax + (chase ? 0.8 : 0);
      player.iceChaseLockout = chase ? player.dashCooldown : 0;
      player.iceChaseTimer = 0; player.iceChaseReady = false; this.iceChaseIds.clear();
      this.dashMarkedIds.clear();
      this.phaseDashRefund = 0.9;
      if (this.campaign?.awakeningId === 'return-dash' && !chase) {
        this.awakeningState.returnAnchor = { x: player.x, y: player.y, remaining: 1.4 };
        this._emit('awakening-trigger', player, { awakeningId: 'return-dash', stage: 'anchor', radius: 30, color: '#8cf5d3', message: '折返锚已留下' });
      }
      if (this.campaign?.awakeningId === 'slide-reload' && this.reloadByWeapon[player.weapon] > 0) {
        this._finishReload(player.weapon, false); this._syncWeapon();
        this._emit('awakening-trigger', player, { awakeningId: 'slide-reload', stage: 'slide', radius: 42, color: '#8cf5d3', message: '滑步快装' });
      }
      if (this.tacticId === 'decoy-dash' && this.tactical.cooldown <= 0) {
        this.tactical.decoy = { x: player.x, y: player.y, radius: 320, remaining: 2 };
        this.tactical.cooldown = 6;
        this._emit('tactic-trigger', player, { tacticId: this.tacticId, radius: 320, color: '#91e5ef', message: '折跃诱饵部署' });
      }
      if (this.relics.includes('phase-mag')) {
        this.ammoByWeapon[player.weapon] = Math.min(this._magSize(player.weapon), this.ammoByWeapon[player.weapon] + Math.ceil(this._magSize(player.weapon) * .25));
        this._syncWeapon();
        this._emit('relic-trigger', player, { message: '相位补弹', color: '#91f0df' });
      }
      this._emit('dash', player, { dx: this.dashVector.x, dy: this.dashVector.y, angle: Math.atan2(this.dashVector.y, this.dashVector.x) });
      if (this.evolutionId === 'shotgun-breach') {
        this.evolutionState.breachTimer = 2;
        this._emit('evolution-trigger', player, { evolutionId: this.evolutionId, stage: 'primed', radius: 50, color: '#ffda92' });
      }
      if (chase) this._emit('secret-trigger', player, { secretId: 'ice-break', message: '碎霜追击', color: '#a6e9ff', radius: 65, angle: Math.atan2(this.dashVector.y, this.dashVector.x), chase: true });
      if (breakIce) {
        player.slowTimer = 0;
        this._discoverSecret('ice-break', player);
        this._emit('secret-trigger', player, { secretId: 'ice-break', message: '碎霜突围', color: '#a6e9ff', radius: 110, angle: Math.atan2(this.dashVector.y, this.dashVector.x) });
        for (const enemy of this.enemies) {
          if (this.phase !== 'playing') break;
          if (enemy.hp <= 0 || distance(player, enemy) > 110 + enemy.radius) continue;
          if (enemy.type !== 'boss' && enemy.type !== 'reactor') {
            enemy.stunTimer = Math.max(enemy.stunTimer, 1);
            enemy.iceBreakTimer = 1;
            if (!chase) this.iceChaseIds.add(enemy.id);
            enemy.windup = 0; enemy.chargeTimer = 0; enemy.attackKind = '';
            enemy.attackTimer = Math.max(enemy.attackTimer, 1);
            this.hazards = this.hazards.filter(hazard => hazard.sourceId !== enemy.id);
          }
          this._damageEnemy(enemy, 35 * player.damageMultiplier);
        }
        if (!chase && this.phase === 'playing' && this.enemies.some(enemy => enemy.hp > 0 && this.iceChaseIds.has(enemy.id))) {
          player.iceChaseTimer = 1.2; player.iceChaseReady = true;
        }
      }
      this._voyageDash();
      return true;
    }

    _chargeReactor(amount) {
      if (this.phase !== 'playing' || this.reactor.timer > 0) return;
      this.reactor.charge = Math.min(this.reactor.maxCharge, this.reactor.charge + amount);
    }

    activateOverdrive() {
      if (this.phase !== 'playing' || this.reactor.timer > 0 || this.reactor.charge < this.reactor.maxCharge) return false;
      this.reactor.charge = 0;
      this.reactor.timer = this.reactor.duration;
      this._refillWeapons();
      this.fireTimer = 0;
      this.player.dashCooldown = this.player.iceChaseLockout;
      this._emit('overdrive-start', this.player, { duration: this.reactor.duration });
      return true;
    }

    _capturePhaseBullet(bullet) {
      bullet.lifetime = 0;
      this.reactor.captures += 1;
      this._chargeReactor(7);
      this._emit('phase-capture', bullet, { count: 1 });
    }

    _phaseDash(start) {
      const dx = this.player.x - start.x, dy = this.player.y - start.y;
      let marked = false;
      for (const enemy of this.enemies) {
        if (enemy.hp <= 0 || this.dashMarkedIds.has(enemy.id) || this._segmentHit(start.x, start.y, dx, dy, enemy, 60) === null) continue;
        this.dashMarkedIds.add(enemy.id);
        enemy.phaseMarkTimer = 4;
        marked = true;
        this._emit('phase-mark', enemy, { enemyId: enemy.id });
      }
      if (marked) this._primeSalvageRound('dash');
      if (dx * dx + dy * dy > 1e-8 && this.salvage) for (const node of this.salvage.nodes) {
        if (node.status !== 'primed' || this._segmentHit(start.x, start.y, dx, dy, node, this.player.radius) === null ||
          this.obstacles.some(rock => this._segmentHit(start.x, start.y, node.x - start.x, node.y - start.y, rock, 0) !== null)) continue;
        this._armSalvageNode(node, true, 'dash');
      }
      for (const bullet of this.bullets) {
        if (bullet.owner !== 'enemy' || bullet.lifetime <= 0 || this._segmentHit(start.x, start.y, dx, dy, { ...bullet, radius: 0 }, 80) === null) continue;
        this._capturePhaseBullet(bullet);
      }
    }

    _detonatePhase(target) {
      if (this.phase !== 'playing' || !(target.phaseMarkTimer > 0)) return;
      const queue = [target], radius = 125;
      target.phaseMarkTimer = 0;
      for (let index = 0; index < queue.length && this.phase === 'playing'; index += 1) {
        const origin = queue[index];
        this.reactor.detonations += 1;
        this._chargeReactor(8);
        const refund = Math.min(0.45, this.phaseDashRefund);
        this.player.dashCooldown = Math.max(this.player.iceChaseLockout, this.player.dashCooldown - refund);
        this.phaseDashRefund -= refund;
        this._emit('phase-burst', origin, { radius, color: '#8cfff1', chain: index });
        for (const enemy of this.enemies) {
          if (this.phase !== 'playing') break;
          if (enemy.hp <= 0 || distance(origin, enemy) > radius + enemy.radius) continue;
          if (enemy.phaseMarkTimer > 0 && queue.length < 8) {
            enemy.phaseMarkTimer = 0;
            queue.push(enemy);
          }
          this._damageEnemy(enemy, 55 * this.player.damageMultiplier * (enemy.type === 'boss' ? 0.55 : 1));
        }
      }
    }

    _magSize(index) { return Math.ceil(WEAPONS[index].magSize * this.player.magazineMultiplier); }
    _syncWeapon() {
      const player = this.player;
      player.ammo = this.ammoByWeapon[player.weapon];
      player.magSize = this._magSize(player.weapon);
      player.reloadTimer = this.reloadByWeapon[player.weapon];
      player.reloadDuration = this.reloadDurationByWeapon[player.weapon];
      player.reloadProgress = player.reloadDuration > 0 ? clamp(1 - player.reloadTimer / player.reloadDuration, 0, 1) : 0;
      player.reloadAttempted = this.reloadAttemptedByWeapon[player.weapon];
      player.reloadResult = this.reloadResultByWeapon[player.weapon];
      player.overcharged = this.overchargedByWeapon[player.weapon] > 0;
    }

    switchWeapon(index) {
      if (this.phase !== 'playing' || !Number.isInteger(index) || index < 0 || index >= WEAPONS.length || this.player.weapon === index) return false;
      this.player.weapon = index;
      this.fireTimer = Math.max(this.fireTimer, 0.16);
      if (this.campaign?.awakeningId === 'mag-relay' && this.awakeningState.relayTimer > 0) {
        this.awakeningState.relayTimer = 0; this.fireTimer = 0;
        this.awakeningState.relayPending[index] = true;
        this.overchargedByWeapon[index] = Math.max(this.overchargedByWeapon[index], 1);
        this._emit('awakening-trigger', this.player, { awakeningId: 'mag-relay', stage: 'relay', radius: 42, color: '#ffd18c', message: '弹仓接力' });
      }
      this._syncWeapon();
      this._emit('switch', this.player, { weapon: index });
      return true;
    }

    reload() {
      const index = this.player.weapon;
      if (this.phase !== 'playing') return false;
      if (this.reloadByWeapon[index] > 0) {
        if (this.reloadAttemptedByWeapon[index]) return false;
        this.reloadAttemptedByWeapon[index] = true;
        const progress = 1 - this.reloadByWeapon[index] / this.reloadDurationByWeapon[index];
        if (progress + 1e-9 >= this.player.reloadWindowStart && progress - 1e-9 <= this.player.reloadWindowEnd) {
          this._finishReload(index, true);
          this._syncWeapon();
          this._emit('reload-perfect', this.player, { weapon: index });
          return true;
        }
        this.reloadResultByWeapon[index] = 'miss';
        this._syncWeapon();
        this._emit('reload-miss', this.player, { weapon: index });
        return false;
      }
      if (this.ammoByWeapon[index] >= this._magSize(index)) return false;
      this.reloadDurationByWeapon[index] = WEAPONS[index].reloadTime * this.player.reloadMultiplier;
      this.reloadByWeapon[index] = this.reloadDurationByWeapon[index];
      this.reloadAttemptedByWeapon[index] = false;
      this.reloadResultByWeapon[index] = 'loading';
      this.overchargedByWeapon[index] = 0;
      this._syncWeapon();
      this._emit('reload', this.player, { weapon: index });
      return true;
    }

    _finishReload(index, perfect) {
      this.reloadByWeapon[index] = 0;
      if (index === 4) this.bladeRecoveryUsed = 0;
      this.ammoByWeapon[index] = this._magSize(index);
      this.overchargedByWeapon[index] = perfect ? this._magSize(index) : this.awakeningState.relayPending[index] ? 1 : 0;
      this.reloadResultByWeapon[index] = perfect ? 'perfect' : this.reloadAttemptedByWeapon[index] ? 'miss' : 'idle';
      if (perfect) this._chargeReactor(10);
      if (perfect && this.phase === 'playing' && this.campaign?.awakeningId === 'mag-relay') {
        this.awakeningState.relayTimer = 3;
        this._emit('awakening-trigger', this.player, { awakeningId: 'mag-relay', stage: 'relay-ready', radius: 42, color: '#ffd18c', message: '精准装填 · 接力就绪' });
      }
      if (perfect && this.phase === 'playing' && this.tacticId === 'reload-mine' && this.tactical.cooldown <= 0) {
        const player = this.player;
        this.tactical.mine = { x: player.x, y: player.y, radius: 70, blastRadius: 110, remaining: 5, damage: 55 * player.damageMultiplier };
        this.tactical.cooldown = 6;
        this._emit('tactic-trigger', player, { tacticId: this.tacticId, stage: 'placed', radius: 70, color: '#ffd086', message: '感应雷已布置' });
      }
      if (perfect && this.relics.includes('precision-burst')) {
        const player = this.player;
        player.hp = Math.min(player.maxHp, player.hp + 10);
        for (const spread of [-.16, 0, .16]) {
          const angle = player.angle + spread;
          this.bullets.push({ id: this._id(), type: 'bullet', owner: 'player', weapon: 2, x: player.x + Math.cos(angle) * 24, y: player.y + Math.sin(angle) * 24,
            vx: Math.cos(angle) * 1250, vy: Math.sin(angle) * 1250, radius: 4, lifetime: .8, damage: 45 * player.damageMultiplier, pierce: 2, hitIds: [], color: '#ffd897' });
        }
        this._emit('relic-trigger', player, { message: '猎手齐射', color: '#ffd897' });
      }
      this._emit('reload-complete', this.player, { weapon: index, perfect });
      if (perfect) this._primeSalvageRound('reload');
      if (perfect) this._voyagePerfectReload();
    }

    _refillWeapons() {
      this.bladeRecoveryUsed = 0;
      this.ammoByWeapon = WEAPONS.map((weapon, index) => this._magSize(index));
      this.reloadByWeapon.fill(0);
      this.reloadDurationByWeapon.fill(0);
      this.reloadAttemptedByWeapon.fill(false);
      this.reloadResultByWeapon.fill('idle');
      this.overchargedByWeapon = WEAPONS.map((weapon, index) => this.awakeningState.relayPending[index] ? 1 : 0);
      this._syncWeapon();
    }

    _clearStarline() {
      this.starPins = []; this.starLines = [];
      for (const enemy of this.enemies) enemy.starSlowTimer = 0;
    }

    _ageStarline(dt) {
      for (const pin of this.starPins) pin.remaining = Math.max(0, pin.remaining - dt);
      for (const line of this.starLines) line.remaining = Math.max(0, line.remaining - dt);
      this.starPins = this.starPins.filter(pin => pin.remaining > 0);
      this.starLines = this.starLines.filter(line => line.remaining > 0 && line.pinIds.every(id => this.starPins.some(pin => pin.id === id)));
    }

    _starPinPartner(point) {
      return [...this.starPins].reverse().find(pin => !pin.paired && pin.remaining > 0 && distance(pin, point) >= 35 && distance(pin, point) <= 520
        && !this.obstacles.some(rock => this._segmentHit(pin.x, pin.y, point.x - pin.x, point.y - pin.y, rock, 0) !== null));
    }

    _placeStarPin(bullet, x, y, obstacleId = null) {
      if (this.phase !== 'playing' || bullet.starPinned) return;
      bullet.starPinned = true;
      const evolved = this.evolutionId === 'star-bridge', cap = evolved ? 6 : 4;
      const pin = { id: this._id(), x, y, radius: 5, remaining: 6, damageMultiplier: bullet.starMultiplier, obstacleId, paired: false, color: '#ffe0a6' };
      this.starPins.push(pin);
      while (this.starPins.length > cap) this.starPins.shift();
      this.starLines = this.starLines.filter(line => line.pinIds.every(id => this.starPins.some(item => item.id === id)));
      const partner = this._starPinPartner(pin);
      this._emit('star-pin', pin, { pinId: pin.id, color: pin.color, radius: 18 });
      if (!partner) return;
      pin.paired = true; partner.paired = true;
      const duration = this.player.starCapacitor ? 5 : 4;
      const line = { id: this._id(), x: partner.x, y: partner.y, endX: pin.x, endY: pin.y, pinIds: [partner.id, pin.id],
        remaining: Math.min(duration, partner.remaining), damage: 55 * Math.min(partner.damageMultiplier, pin.damageMultiplier),
        hitIds: [], clearedBullets: 0, bridge: evolved, color: evolved ? '#fff0bb' : pin.color };
      this.starLines.push(line);
      while (this.starLines.length > (evolved ? 3 : 2)) this.starLines.shift();
      this._emit('starline-created', line, { lineId: line.id, endX: line.endX, endY: line.endY, color: line.color, duration: line.remaining, message: evolved ? '双极星桥连通' : '星索绊线连通' });
    }

    _pointStarDistance(point, line) {
      const dx = line.endX - line.x, dy = line.endY - line.y;
      const t = clamp(((point.x - line.x) * dx + (point.y - line.y) * dy) / (dx * dx + dy * dy), 0, 1);
      return distance(point, { x: line.x + dx * t, y: line.y + dy * t });
    }

    _updateStarline() {
      for (const line of this.starLines) {
        if (this.phase !== 'playing') break;
        for (const enemy of this.enemies) {
          if (this.phase !== 'playing') break;
          if (enemy.hp <= 0 || ['nest', 'reactor', 'anchor'].includes(enemy.type) || line.hitIds.includes(enemy.id)
            || this._segmentHit(line.x, line.y, line.endX - line.x, line.endY - line.y, enemy, 4) === null) continue;
          line.hitIds.push(enemy.id);
          if (enemy.type !== 'boss') enemy.starSlowTimer = Math.max(enemy.starSlowTimer || 0, 1.2);
          if (line.bridge && line.clearedBullets < 2) {
            const target = this.bullets.filter(bullet => bullet.owner === 'enemy' && bullet.lifetime > 0 && this._pointStarDistance(bullet, line) <= 60)
              .sort((a, b) => distance(a, enemy) - distance(b, enemy))[0];
            if (target) { target.lifetime = 0; line.clearedBullets++; this._emit('starline-capture', target, { lineId: line.id, color: line.color, radius: 26 }); }
          }
          this._emit('starline-trigger', enemy, { lineId: line.id, enemyId: enemy.id, startX: line.x, startY: line.y, endX: line.endX, endY: line.endY, color: line.color, radius: 28, message: '星索割裂' });
          this._damageEnemy(enemy, line.damage * (enemy.type === 'boss' ? .5 : 1));
        }
      }
    }

    starlinePreview() {
      const player = this.player, weapon = WEAPONS[player.weapon];
      if (this.phase !== 'playing' || weapon.id !== 'starline') return null;
      const cosine = Math.cos(player.angle), sine = Math.sin(player.angle);
      const startX = player.x + cosine * 22, startY = player.y + sine * 22;
      const dx = cosine * weapon.speed * weapon.lifetime, dy = sine * weapon.speed * weapon.lifetime;
      let amount = Math.min(1, dx > 0 ? (this.world.width - startX) / dx : dx < 0 ? -startX / dx : Infinity,
        dy > 0 ? (this.world.height - startY) / dy : dy < 0 ? -startY / dy : Infinity);
      let obstacleId = null;
      const fields = this.battlefield ? [...this.battlefield.props, ...this.battlefield.mines].filter(field => field.status === 'idle' && field.hp > 0) : [];
      const sources = this.salvage ? this.salvage.sources.filter(source => source.hp > 0 && ['locked', 'flying'].includes(source.status)) : [];
      for (const target of [...this.obstacles, ...this.enemies.filter(enemy => enemy.hp > 0), ...fields, ...sources]) {
        const contact = this._segmentHit(startX, startY, dx, dy, target, 3);
        if (contact !== null && contact <= amount) { amount = contact; obstacleId = target.type === 'rock' ? target.id : null; }
      }
      const x = startX + dx * Math.max(0, amount), y = startY + dy * Math.max(0, amount);
      const partner = this._starPinPartner({ x, y });
      return { startX, startY, x, y, pinX: x, pinY: y, obstacleId, blocked: obstacleId !== null,
        link: partner ? { x: partner.x, y: partner.y, endX: x, endY: y } : null };
    }

    grenadePreview() {
      const player = this.player, weapon = WEAPONS[player.weapon];
      if (this.phase !== 'playing' || weapon.id !== 'grenade') return null;
      const cosine = Math.cos(player.angle), sine = Math.sin(player.angle);
      const startX = player.x + cosine * 22, startY = player.y + sine * 22;
      const dx = cosine * weapon.speed * weapon.lifetime, dy = sine * weapon.speed * weapon.lifetime;
      let amount = 1, explodes = true;
      const boundary = Math.min(dx > 0 ? (this.world.width - startX) / dx : dx < 0 ? -startX / dx : Infinity,
        dy > 0 ? (this.world.height - startY) / dy : dy < 0 ? -startY / dy : Infinity);
      if (boundary < amount) { amount = Math.max(0, boundary); explodes = false; }
      // This is a snapshot of current silhouettes, not a prediction of enemy movement.
      const fields = this.battlefield ? [...this.battlefield.props, ...this.battlefield.mines].filter(field => field.status === 'idle' && field.hp > 0) : [];
      const sources = this.salvage ? this.salvage.sources.filter(source => source.hp > 0 && ['locked', 'flying'].includes(source.status)) : [];
      for (const target of [...this.obstacles, ...this.enemies.filter(enemy => enemy.hp > 0), ...fields, ...sources]) {
        const contact = this._segmentHit(startX, startY, dx, dy, target, 7);
        if (contact !== null && contact <= amount) { amount = contact; explodes = true; }
      }
      return { startX, startY, x: startX + dx * amount, y: startY + dy * amount,
        radius: player.blastRadius ? 202.5 : 135, explodes };
    }

    _shoot() {
      const player = this.player, index = player.weapon, weapon = WEAPONS[index];
      if (this.phase !== 'playing' || this.fireTimer > 0 || this.reloadByWeapon[index] > 0) return;
      if (this.ammoByWeapon[index] <= 0) { this.reload(); return; }
      const overcharged = this.overchargedByWeapon[index] > 0;
      const reactor = this.reactor.timer > 0;
      const cargoPower = this.salvage?.hotCargo.status === 'carried' ? 1 + this.salvage.hotCargo.weaponBonus : 1;
      const refitShot = this.salvage?.round.remaining > 0 ? { id: this._id(), modId: this.salvage.round.modId, triggered: false } : null;
      if (refitShot) {
        this.salvage.round.remaining = 0;
        this._emit('salvage-round-shot', player, { shotId: refitShot.id, modId: refitShot.modId, angle: player.angle, color: this.map.color });
      }
      const evolution = EVOLUTIONS.find(item => item.id === this.evolutionId && item.weapon === index);
      const breach = evolution?.id === 'shotgun-breach' && this.evolutionState.breachTimer > 0;
      const twin = evolution?.id === 'boomerang-twin';
      const pellets = breach ? 3 : twin ? 2 : weapon.pellets;
      if (breach) this.evolutionState.breachTimer = 0;
      if (!reactor) this.ammoByWeapon[index] -= 1;
      this.overchargedByWeapon[index] = Math.max(0, this.overchargedByWeapon[index] - 1);
      this.awakeningState.relayPending[index] = false;
      this.fireTimer = weapon.fireInterval / player.fireRateMultiplier / (reactor ? 1.45 : 1);
      if (player.reversalAmmo > 0 && player.reversalTimer > 0) {
        const count = player.reversalAmmo;
        for (let shot = 0; shot < count; shot += 1) {
          const angle = player.angle + (shot / (count - 1) - 0.5) * 0.8;
          this.bullets.push({ id: this._id(), type: 'bullet', owner: 'player', isEnemy: false, reflected: true, weapon: 0,
            x: player.x + Math.cos(angle) * 22, y: player.y + Math.sin(angle) * 22,
            vx: Math.cos(angle) * 650, vy: Math.sin(angle) * 650, radius: 4, lifetime: 0.9,
            damage: player.reversalDamage, pierce: 0, hitIds: [], color: '#a4ffed' });
        }
        player.reversalAmmo = 0; player.reversalTimer = 0;
        this._emit('secret-release', player, { secretId: 'bullet-reversal', count, color: '#a4ffed', angle: player.angle });
      }
      for (let pellet = 0; pellet < pellets; pellet += 1) {
        const spread = pellets > 1 ? ((pellet / (pellets - 1)) * 2 - 1) * (breach ? .12 : twin ? Math.PI / 18 : weapon.spread) : (this.random() * 2 - 1) * weapon.spread;
        const angle = player.angle + spread;
        const critical = this.random() < player.critChance;
        this.bullets.push({
          id: this._id(), type: 'bullet', owner: 'player', weapon: index,
          x: player.x + Math.cos(angle) * 22, y: player.y + Math.sin(angle) * 22,
          vx: Math.cos(angle) * (breach ? 960 : weapon.speed), vy: Math.sin(angle) * (breach ? 960 : weapon.speed),
          radius: index === 4 ? 10 : index === 3 ? 7 : index === 2 || breach ? 4 : 3, lifetime: breach ? .7 : weapon.lifetime,
          damage: (breach ? 36 : weapon.damage) * (twin ? .7 : 1) * player.damageMultiplier * cargoPower * (refitShot ? 1.25 : 1) * (critical ? 2 : 1) *
            (overcharged ? this.campaign?.doctrineId === 'marksman' ? 1.5 : 1.15 : 1) *
            (this.campaign?.doctrineId === 'conductor' ? .88 : this.campaign?.doctrineId === 'skirmisher' && this.movingShot ? 1.18 : 1) * (reactor ? 1.2 : 1),
          pierce: (breach ? 1 : weapon.pierce) + (refitShot?.modId === 'breach' && index !== 3 ? 1 : 0),
          hitIds: [], color: evolution?.color || weapon.color, critical, overcharged, reactor, ...(refitShot ? { refitShot } : {}),
          evolutionId: evolution?.id || '', breach,
          arc: index === 0 && player.arcRounds, repulsor: index === 1 && player.repulsorRounds,
          shatter: index === 2 && player.shatterRounds
        });
        if (index === 2) Object.assign(this.bullets[this.bullets.length - 1], { railResonanceEligible: true,
          originX: player.x + Math.cos(angle) * 22, originY: player.y + Math.sin(angle) * 22 });
        if (index === 3 || index === 4) Object.assign(this.bullets[this.bullets.length - 1], {
          kind: weapon.id, age: 0, returning: false, returnAfter: 0.52,
          blastRadius: player.blastRadius ? 202.5 : 135, returnMultiplier: player.returnEdge ? 1.6 : 1
        });
        if (index === 4) Object.assign(this.bullets[this.bullets.length - 1], {
          baseDamage: this.bullets[this.bullets.length - 1].damage, rockRebounded: false, relayCount: 0, reboundHit: false
        });
        if (index === 5) Object.assign(this.bullets[this.bullets.length - 1], { kind: 'starline', age: 0,
          starMultiplier: player.damageMultiplier * cargoPower * (overcharged ? this.campaign?.doctrineId === 'marksman' ? 1.5 : 1.15 : 1) *
            (this.campaign?.doctrineId === 'conductor' ? .88 : this.campaign?.doctrineId === 'skirmisher' && this.movingShot ? 1.18 : 1) * (reactor ? 1.2 : 1) });
      }
      this._syncWeapon();
      this._emit('shot', player, { angle: player.angle, weapon: index, owner: 'player', color: evolution?.color || weapon.color, overcharged, reactor });
      if (breach || twin) this._emit('evolution-trigger', player, { evolutionId: evolution.id, stage: breach ? 'breach' : 'twin', angle: player.angle, color: evolution.color });
      this._voyageShot();
    }

    useSkill() {
      const player = this.player;
      if (this.phase !== 'playing') return false;
      if (this.voyageActionState().collapseReady) return this._collapseVoyageWell();
      if (this.awakeningState.charge) {
        this.awakeningState.charge = null;
        return this._releaseSkill(false);
      }
      if (player.skillCooldown > 0) return false;
      if (this.campaign?.awakeningId === 'charged-pulse') {
        player.skillCooldown = player.skillCooldownMax;
        this.awakeningState.charge = { remaining: .9, duration: .9 };
        this._emit('awakening-trigger', this.skillTarget(), { awakeningId: 'charged-pulse', stage: 'charge', radius: player.skillRadius, color: '#c9b3ff', message: '脉冲开始蓄势' });
        return true;
      }
      player.skillCooldown = player.skillCooldownMax;
      return this._releaseSkill(false);
    }

    _releaseSkill(charged) {
      if (this.phase !== 'playing') return false;
      const player = this.player;
      const origin = this.skillTarget();
      const radius = player.skillRadius * (charged ? 1.2 : 1), damage = player.skillDamage * (charged ? 1.25 : 1);
      if (this.campaign?.awakeningId === 'charged-pulse') this._emit('awakening-trigger', origin, { awakeningId: 'charged-pulse', stage: 'release', radius, charged, color: '#c9b3ff', message: charged ? '满蓄脉冲' : '提前释放' });
      if (this.campaign?.awakeningId === 'mobile-field') {
        this.awakeningState.field = { remaining: 2.4, duration: 2.4, radius: 100, tick: 0, captured: 0 };
        this._emit('awakening-trigger', player, { awakeningId: 'mobile-field', stage: 'field', radius: 100, color: '#c9b3ff', message: '随行电场展开' });
      }
      this._emit('pulse', origin, { radius, remote: origin.remote });
      this._redirectSiegeShells(origin, radius);
      const cleared = this.bullets.filter(bullet => bullet.owner === 'enemy' && bullet.lifetime > 0 && distance(origin, bullet) <= radius);
      const grenades = this.bullets.filter(bullet => bullet.owner === 'player' && bullet.kind === 'grenade' && bullet.lifetime > 0 && !bullet.exploded && distance(origin, bullet) <= radius);
      this.bullets = this.bullets.filter(bullet => bullet.owner !== 'enemy' || distance(origin, bullet) > radius);
      if (cleared.length >= 5) {
        this._discoverSecret('bullet-reversal', player);
        this._emit('secret-trigger', player, { secretId: 'bullet-reversal', message: '弹幕逆流', color: '#a4ffed', radius: 90, angle: player.angle });
        player.reversalAmmo = Math.min(8, cleared.length); player.reversalTimer = 2.5;
        player.reversalDamage = 18 * player.damageMultiplier;
      }
      for (const grenade of grenades) {
        if (this.phase !== 'playing') break;
        grenade.blastRadius *= 1.35;
        this._discoverSecret('fuse-resonance', grenade);
        this._emit('secret-trigger', grenade, { secretId: 'fuse-resonance', message: '引信共鸣', color: '#ffc18a', radius: grenade.blastRadius });
        this._burstGrenade(grenade);
      }
      this.bullets = this.bullets.filter(bullet => !bullet.exploded);
      this._pullTacticEnemies(origin, radius);
      let hitEnemy = false;
      for (const enemy of this.enemies) {
        if (this.phase !== 'playing') break;
        if (enemy.hp <= 0 || distance(origin, enemy) > radius + enemy.radius) continue;
        hitEnemy = true;
        if (enemy.type === 'bulwark') {
          enemy.shieldOpenTimer = 2.5;
          this._emit('shield-open', enemy, { enemyId: enemy.id, duration: 2.5, color: '#86ffe1' });
        }
        if (enemy.type === 'engineer') enemy.throwTarget = null;
        enemy.stunTimer = enemy.type === 'boss' ? 0.65 : 2.1;
        enemy.windup = 0;
        enemy.chargeTimer = 0;
        enemy.attackKind = '';
        enemy.attackTimer = Math.max(enemy.attackTimer, 1.2);
        this.hazards = this.hazards.filter(hazard => hazard.sourceId !== enemy.id);
        this._damageEnemy(enemy, damage);
      }
      if (this.phase === 'playing') this._captureBattlefield(origin, radius);
      if (this.phase === 'playing') this._captureSiege(origin, radius);
      if (this.phase === 'playing') this._unlockSalvageVaults(origin);
      if (this.phase === 'playing') this._reverseSalvageNodes(origin, radius);
      if (hitEnemy) this._primeSalvageRound('pulse');
      if (this.phase === 'playing' && this.relics.includes('echo-pulse')) this.echoBursts.push({ x: origin.x, y: origin.y, radius, damage: damage * .65, remaining: .65 });
      if (this.phase === 'playing') this._voyagePulse(origin);
      return true;
    }

    _updateEchoes(dt) {
      for (const echo of this.echoBursts) {
        echo.remaining -= dt;
        if (echo.remaining > 0) continue;
        for (const enemy of this.enemies) {
          if (this.phase !== 'playing') break;
          if (enemy.hp > 0 && distance(echo, enemy) <= echo.radius + enemy.radius) this._damageEnemy(enemy, echo.damage);
        }
        this.bullets = this.bullets.filter(bullet => bullet.owner !== 'enemy' || distance(echo, bullet) > echo.radius);
        this._emit('pulse', echo, { radius: echo.radius });
        if (this.phase !== 'playing') break;
      }
      this.echoBursts = this.echoBursts.filter(echo => echo.remaining > 0);
    }

    _updateContracts(dt) {
      const contract = this.contracts.find(item => item.status === 'active');
      if (!contract) return;
      if (contract.kind !== 'salvage') {
        while (contract.spawned < contract.goal) {
          const point = contract.nodes[contract.spawned];
          const enemy = this.spawnEnemy(contract.kind === 'purge' ? 'nest' : contract.spawned === 0 ? 'tank' : 'charger', point);
          if (!enemy) break;
          enemy.contractId = contract.id;
          if (contract.kind === 'hunt') {
            enemy.elite = true; enemy.hp = enemy.maxHp = Math.round(enemy.maxHp * 1.8); enemy.damage *= 1.2; enemy.xp *= 2;
            enemy.name = contract.spawned === 0 ? '铁棘重甲' : '疾掠先锋';
          }
          contract.spawned++;
        }
      }
      contract.spawnTimer -= dt;
      if (contract.kind === 'salvage' && contract.spawnTimer <= 0 && distance(this.player, contract) < 650) {
        contract.spawnTimer = 9;
        if (this.enemies.filter(enemy => enemy.hp > 0).length < 28) this.spawnEnemy(contract.spawned++ % 3 === 0 ? 'mortar' : 'crawler');
      }
    }

    _advanceContract(contract) {
      contract.progress = Math.min(contract.goal, contract.progress + 1);
      if (contract.progress === contract.goal) {
        contract.status = 'ready';
        this.breathingTimer = Math.max(this.breathingTimer, 5);
        this._emit('contract-ready', contract, { message: contract.name + '完成 · 返回紫色终端领取遗物' });
      } else this._emit('contract-progress', contract, { message: contract.name + ' · ' + contract.progress + '/' + contract.goal });
    }

    contractTarget(contract) {
      if (!contract || contract.status !== 'active') return contract;
      const targets = contract.kind === 'salvage' ? contract.nodes.filter(node => !node.collected) : this.enemies.filter(enemy => enemy.contractId === contract.id && enemy.hp > 0);
      return targets.sort((a, b) => distance(a, this.player) - distance(b, this.player))[0] || contract;
    }

    chooseRelic(id) {
      if (this.phase !== 'relic' || !this.relicChoices.some(relic => relic.id === id)) return false;
      this.relics.push(id); this.relicChoices = []; this.phase = 'playing';
      this.player.invulnerable = Math.max(this.player.invulnerable, 1);
      this._emit('relic-acquired', this.player, { message: '遗物已装备：' + RELICS.find(relic => relic.id === id).title });
      if (this.player.xp >= this.player.xpNeeded) this._levelUp();
      return true;
    }

    _nearestInteractable() {
      return this.interactionState().target;
    }

    deliveryTarget(relay) {
      if (!this.delivery) return null;
      const carried = this.delivery.cargos.find(cargo => cargo.id === this.delivery.carriedId);
      if (carried) {
        const receiver = this.relays.find(item => item.id === carried.relayId);
        return receiver && { ...receiver, label: '交付 · ' + receiver.name.split(' · ')[1], color: this.map.color };
      }
      const dropped = this.delivery.cargos.find(cargo => cargo.status === 'dropped');
      if (dropped) return { ...dropped, label: '回收 · ' + dropped.label };
      const source = this.delivery.cargos.filter(cargo => cargo.status === 'source' && (!relay || cargo.relayId === relay.id))
        .sort((a, b) => distance(a, this.player) - distance(b, this.player))[0];
      return source && { ...source, label: '拿取 · ' + source.label } || null;
    }

    _dropCargo() {
      const cargo = this.delivery?.cargos.find(item => item.id === this.delivery.carriedId);
      if (!cargo) return;
      Object.assign(cargo, { status: 'dropped', x: this.player.x, y: this.player.y, pickupLock: .35 });
      this.delivery.carriedId = null;
      this.sectorThreat.active = false;
      this._emit('cargo-dropped', cargo, { cargoId: cargo.id, relayId: cargo.relayId, color: this.map.color, message: '星火已放下 · 回身按交互回收' });
      this._objective();
    }

    interactionState() {
      if (this.siege) return this._siegeInteraction();
      const salvageState = this.salvage ? this._salvageInteraction() : null;
      const cargoState = this._salvageCargoInteraction();
      const commsState = this._salvageCommsInteraction();
      if (salvageState?.action) return salvageState;
      if (this.voyage) {
        const exit = this.voyage.room.exit, near = distance(this.player, exit) <= 94;
        return { target: exit, action: this.phase === 'playing' && exit.ready && near ? '撤离' : '',
          hint: exit.ready ? near ? 'E · 撤离星门 / 进入安全航路' : '返回亮起的星门按 E 撤离' : '先完成本房目标，星门才会点亮' };
      }
      if (this.delivery) {
        const carried = this.delivery.cargos.find(cargo => cargo.id === this.delivery.carriedId);
        if (carried) {
          const receiver = this.relays.find(relay => relay.id === carried.relayId);
          const near = receiver && distance(this.player, receiver) <= 94;
          return { target: receiver, action: near && this.phase === 'playing' ? '交付' : '', hint: near ? 'E · 交付星火 / 点亮' + receiver.name : '携带星火 → ' + receiver.name + ' / 冲刺会放下' };
        }
        const charging = this.relays.find(relay => relay.status === 'charging');
        const nearby = this.delivery.cargos.filter(cargo => ['source', 'dropped'].includes(cargo.status) && distance(this.player, cargo) <= 94)
          .sort((a, b) => distance(a, this.player) - distance(b, this.player));
        if (nearby.length) {
          const cargo = nearby.find(item => charging && item.relayId === charging.id) || nearby[0];
          let hint = '', action = '';
          if (charging && cargo.relayId !== charging.id) hint = '先回收当前放下的星火';
          else if (this.encounters.some(item => item.status === 'active' || item.status === 'ready')) hint = '先完成当前遭遇并领取模块';
          else if (cargo.pickupLock > 0 || this.player.dashTimer > 1e-9) hint = '冲刺结束后按 E 回收星火';
          else { action = cargo.status === 'dropped' ? '回收' : '拿取'; hint = 'E · ' + action + cargo.label + ' / 送往对应接收站'; }
          if (this.phase !== 'playing') action = '';
          return { target: cargo, action, hint };
        }
      }
      const entities = [...this.relays.filter(relay => relay.status === 'idle'), ...this.crates.filter(crate => !crate.opened), ...this.stations,
        ...this.encounters.filter(encounter => encounter.status !== 'complete' && encounter.status !== 'failed'),
        ...this.contracts.filter(contract => contract.status !== 'complete'),
        ...this.contracts.filter(contract => contract.kind === 'salvage' && contract.status === 'active').flatMap(contract => contract.nodes.filter(node => !node.collected))];
      const nearby = entities.filter(entity => distance(this.player, entity) <= 94).sort((a, b) => distance(this.player, a) - distance(this.player, b));
      if (!nearby.length) {
        if (cargoState) return cargoState;
        if (commsState) return commsState;
        if (salvageState) return salvageState;
        const charging = this.relays.find(relay => relay.status === 'charging');
        if (this.delivery && charging) return { target: null, action: '', hint: '回收放下的星火，再送往' + charging.name };
        const hint = charging && distance(this.player, charging) > charging.radius ? (this.map.mode === 'demolition' ? '射击反应堆核心，无需留在圈内' : this.map.mode === 'escort' ? '返回运输机光圈，继续护送' : this.map.mode === 'conduction' ? (this.hazards.some(hazard => hazard.conductionRelayId === charging.id) ? '雷圈已锁定，远离爆圈等待落雷' : '返回塔圈引雷，锁定后再撤出爆圈') : '返回信标光圈，继续上传') : '';
        return { target: null, action: '', hint };
      }
      const states = nearby.map(target => {
        let action = '', hint = '';
        if (target.type === 'relay') {
          if (target.mode === 'delivery') hint = '先找到对应星火，再搬运到本站交付';
          else if (this.encounters.some(encounter => encounter.status === 'active' || encounter.status === 'ready')) hint = '先完成当前遭遇并领取模块';
          else if (this.relays.some(relay => relay.status === 'charging')) hint = '先完成当前主目标';
          else {
            action = this.map.mode === 'demolition' ? '暴露' : '启动';
            hint = `E · ${action}${target.name} / ${this.map.mode === 'demolition' ? '射击拆毁' : this.map.mode === 'escort' ? '跟随护送' : this.map.mode === 'conduction' ? '引雷三次，锁定后闪开' : '坚守 40 秒'}`;
          }
        } else if (target.type === 'crate') { action = '开启'; hint = 'E · 打开补给箱'; }
        else if (target.type === 'core') { action = '回收'; hint = 'E · 回收勘探核心'; }
        else if (target.type === 'encounter') {
          if (target.status === 'ready') { action = '领取'; hint = 'E · 选择战术模块 / +20 芯片 / +20 生命'; }
          else if (target.status === 'active') hint = target.name + ' · ' + Math.floor(target.progress) + '/' + target.goal + ' · 剩余 ' + Math.ceil(target.remaining) + ' 秒';
          else if (this.bossSpawned || this.relays.some(relay => relay.status === 'charging')) hint = '先完成当前主目标';
          else if (this.contracts.some(contract => contract.status === 'active' || contract.status === 'ready')) hint = '先完成当前支线并领取奖励';
          else if (this.encounters.some(encounter => encounter.status === 'active' || encounter.status === 'ready')) hint = '先完成当前遭遇并领取模块';
          else { action = '挑战'; hint = 'E · ' + target.name + ' / 限时 ' + target.duration + ' 秒 / 奖励战术模块'; }
        }
        else if (target.type === 'contract') {
          if (target.status === 'ready') { action = '领取'; hint = RELICS.some(relic => !this.relics.includes(relic.id)) ? 'E · 领取遗物 / +30 芯片 / +35 生命' : 'E · 遗物已集齐 / +30 芯片 / +35 生命'; }
          else if (target.status === 'active') hint = target.name + ' · ' + target.progress + '/' + target.goal + ' · 按地图查看目标';
          else if (this.encounters.some(encounter => encounter.status === 'active' || encounter.status === 'ready')) hint = '先完成当前遭遇并领取模块';
          else if (this.contracts.some(contract => contract.status === 'active' || contract.status === 'ready')) hint = '先完成当前支线并领取奖励';
          else if (target.status === 'idle') { action = '接取'; hint = 'E · 接受支线：' + target.name; }
        } else if (target.kind === 'medical' && this.player.hp >= this.player.maxHp) hint = '生命已满';
        else if (target.kind === 'armory' && target.uses >= 4) hint = '工坊强化已达上限';
        else if (this.player.credits < target.cost) hint = `芯片不足 · 需要 ${target.cost} / 当前 ${this.player.credits}`;
        else if (target.kind === 'medical') { action = '治疗'; hint = `E · 恢复 50 生命 / ${target.cost} 芯片`; }
        else if (target.kind === 'armory') { action = '强化'; hint = `E · 全武器伤害 +8% / ${target.cost} 芯片`; }
        return { target, action, hint };
      });
      const state = states.find(candidate => candidate.action) || states[0];
      if (this.phase !== 'playing') state.action = '';
      return state.action ? state : cargoState || commsState || salvageState || state;
    }

    interactionHint() {
      return this.interactionState().hint;
    }

    interact() {
      if (this.phase !== 'playing') return false;
      const { target, action } = this.interactionState();
      if (!action) return false;
      if (this.siege && target.type === 'siege-wreck') return this._interactSiege(target);
      if (this.salvage && ['salvage-source', 'salvage-exit', 'salvage-cargo', 'salvage-comms', 'salvage-lastchance', 'salvage-mod'].includes(target.type)) return this._interactSalvage(target);
      if (target.type === 'voyage-exit') return this._finishVoyageRoom();
      if (target.type === 'cargo') {
        if (!this.delivery || this.delivery.carriedId || !['source', 'dropped'].includes(target.status) || target.pickupLock > 0 || this.player.dashTimer > 1e-9) return false;
        const relay = this.relays.find(item => item.id === target.relayId);
        if (!relay || relay.status === 'active' || this.relays.some(item => item.status === 'charging' && item.id !== relay.id)) return false;
        const first = target.status === 'source';
        target.status = 'carried'; this.delivery.carriedId = target.id;
        relay.status = 'charging'; relay.progress = .5; relay.wave = 2; relay.waveSpawns = 0; relay.waveName = this._relayWaveName(relay);
        if (first) {
          this.sectorThreat.timer = 1.4; this.relaySpawnTimer = 1.2;
          for (const [index, type] of ['crawler', 'crawler', 'spitter'].entries()) {
            const guard = this.spawnEnemy(type, target.guardPoints[index]);
            if (guard) this._move(guard, 0, 0);
          }
        }
        this._emit('cargo-picked', this.player, { cargoId: target.id, relayId: relay.id, recovered: !first, color: this.map.color, message: '星火已携带 → ' + relay.name + ' · 冲刺会放下' });
      } else if (target.type === 'relay' && target.mode === 'delivery') {
        const cargo = this.delivery?.cargos.find(item => item.id === this.delivery.carriedId);
        if (!cargo || cargo.relayId !== target.id || target.status !== 'charging') return false;
        cargo.status = 'delivered'; cargo.x = target.x; cargo.y = target.y; this.delivery.carriedId = null;
        this._emit('cargo-delivered', target, { cargoId: cargo.id, relayId: target.id, color: this.map.color, message: '星火归位 · ' + target.name });
        this._completeRelay(target);
      } else if (target.type === 'relay') {
        if (this.relays.some(relay => relay.status === 'charging')) return false;
        target.status = 'charging';
        target.wave = 1;
        target.waveSpawns = 0;
        target.waveName = this._relayWaveName(target);
        if (target.mode === 'demolition') this._spawnReactor(target);
        if (target.mode === 'escort') this.escort = target;
        if (target.mode === 'conduction') this.sectorThreat.timer = 2.5;
        this.relaySpawnTimer = 1.2;
        this._emit('relay-start', target, { name: target.name, theme: target.theme, wave: target.wave, waveName: target.waveName });
      } else if (target.type === 'crate') {
        target.opened = true;
        this.player.credits += 14;
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 16);
        this._drop('xp', 18, target.x + 10, target.y);
        this._emit('interact', target, { message: '补给：+14 芯片 · +16 生命 · 经验核心', kind: 'crate' });
      } else if (target.type === 'core') {
        target.collected = true;
        this._advanceContract(this.contracts.find(contract => contract.nodes.includes(target)));
      } else if (target.type === 'encounter') {
        if (target.status === 'ready') {
          target.status = 'complete'; this.player.credits += 20; this.player.hp = Math.min(this.player.maxHp, this.player.hp + 20); this.score += 300;
          this.tacticChoices = [...TACTICS];
          this.phase = 'tactic';
          this._emit('encounter-reward', target, { encounterId: target.id, kind: target.kind, message: '遭遇完成 · 选择一项本局战术模块' });
        } else if (target.status === 'idle') {
          target.status = 'active';
          this._emit('encounter-start', target, { encounterId: target.id, kind: target.kind, message: target.name + ' · ' + target.description });
          this._updateEncounters(0);
        } else return false;
      } else if (target.type === 'contract') {
        if (target.status === 'ready') {
          target.status = 'complete'; this.player.credits += 30; this.player.hp = Math.min(this.player.maxHp, this.player.hp + 35); this.score += 450;
          this.relicChoices = RELICS.filter(relic => !this.relics.includes(relic.id));
          if (this.relicChoices.length) this.phase = 'relic';
          this._emit('contract-reward', target, { message: this.relicChoices.length ? '支线完成 · 选择一件本局遗物' : '遗物已集齐 · +30 芯片 / +35 生命' });
        } else if (target.status === 'idle' && !this.contracts.some(contract => contract.status === 'active' || contract.status === 'ready')) {
          target.status = 'active'; this._updateContracts(0);
          this._emit('contract-start', target, { contractId: target.id, message: target.name + ' · ' + target.description });
        } else return false;
      } else {
        if (this.player.credits < target.cost || (target.kind === 'medical' && this.player.hp >= this.player.maxHp) || (target.kind === 'armory' && target.uses >= 4)) return false;
        this.player.credits -= target.cost;
        target.uses += 1;
        if (target.kind === 'medical') this.player.hp = Math.min(this.player.maxHp, this.player.hp + 50);
        else { this.player.damageMultiplier += 0.08; target.cost += 10; }
        this._refillWeapons();
        this._emit('interact', target, { message: target.kind === 'medical' ? '生命恢复 · 弹药补满' : '全武器伤害提升 · 弹药补满', kind: target.kind });
      }
      this._objective();
      return true;
    }

    _updateRelays(dt) {
      const relay = this.relays.find(item => item.status === 'charging');
      if (!relay) return;
      if (relay.mode === 'demolition') {
        this._spawnReactor(relay);
        const core = this.enemies.find(enemy => enemy.id === relay.reactorId && enemy.hp > 0);
        if (core) relay.progress = clamp(1 - core.hp / core.maxHp, 0, 1);
      } else if (relay.mode === 'escort') {
        if (distance(this.player, relay) <= relay.radius) {
          let movement = relay.escortSpeed * dt;
          while (movement > 0 && relay.waypointIndex < relay.waypoints.length) {
            const point = relay.waypoints[relay.waypointIndex], gap = distance(relay, point);
            const step = Math.min(movement, gap);
            if (gap > 0) { relay.x += (point.x - relay.x) / gap * step; relay.y += (point.y - relay.y) / gap * step; }
            movement -= step; relay.escortDistance += step;
            if (step >= gap) relay.waypointIndex += 1;
          }
          relay.progress = relay.waypointIndex >= relay.waypoints.length ? 1 : Math.min(1, relay.escortDistance / relay.routeLength);
        }
      } else if (relay.mode === 'defense' && distance(this.player, relay) <= relay.radius) relay.progress = Math.min(1, relay.progress + dt / relay.duration);
      const wave = Math.min(3, Math.floor(relay.progress * 3) + 1);
      if (wave !== relay.wave) {
        relay.wave = wave;
        relay.waveSpawns = 0;
        relay.waveName = this._relayWaveName(relay);
        this.relaySpawnTimer = Math.min(this.relaySpawnTimer, 1.2);
        this._emit('relay-wave', relay, { name: relay.name, theme: relay.theme, wave, waveName: relay.waveName });
      }
      this.relaySpawnTimer -= dt;
      if (this.relaySpawnTimer <= 0 && (this.campaign ? this.campaign.stageElapsed : this.elapsed) >= (relay.mode === 'defense' ? 25 : 5) && this.breathingTimer <= 0 && this.pressurePhase !== 'recovery') {
        this.relaySpawnTimer = Math.max(3.4, 6 - relay.wave * 0.6);
        if (this.enemies.length < 30) {
          let type = 'crawler';
          if (relay.theme === 'swarm') type = relay.wave === 3 && relay.waveSpawns % 2 === 0 ? 'charger' : 'crawler';
          if (relay.theme === 'crossfire') type = relay.wave === 3 && relay.waveSpawns % 3 === 2 ? 'charger' : 'spitter';
          if (relay.theme === 'siege') type = relay.waveSpawns === 0 ? 'tank' : relay.wave === 3 ? 'charger' : 'crawler';
          this.spawnEnemy(type);
          relay.waveSpawns += 1;
        }
      }
      if (relay.progress < 1 || relay.mode === 'demolition') return;
      this._completeRelay(relay);
    }

    _spawnReactor(relay) {
      if (relay.reactorId !== null) return;
      const core = this.spawnEnemy('reactor', relay);
      if (!core) return;
      core.objectiveRelayId = relay.id;
      core.name = relay.name;
      relay.reactorId = core.id;
    }

    _completeRelay(relay) {
      if (!relay || relay.status !== 'charging') return;
      relay.progress = 1;
      relay.status = 'active';
      this.hazards = this.hazards.filter(hazard => hazard.owner !== 'environment');
      this.sectorThreat.active = false;
      this.sectorThreat.timer = 6;
      if (relay.mode === 'escort') {
        this.escort = null;
        const next = this.relays[this.relays.indexOf(relay) + 1];
        if (next) next.status = 'idle';
      }
      this.completedRelays += 1;
      this.score += 600;
      this.player.credits += 30;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 35);
      this.player.xp += 60;
      this.breathingTimer = this.map.mode === 'defense' ? 7 : 3;
      this._emit('relay-complete', relay, { name: relay.name, completed: this.completedRelays, xp: 60, credits: 30, healing: 35 });
      if (this.completedRelays === this.relays.length) this._spawnBoss();
      this._objective();
    }

    _relayWaveName(relay) {
      const names = {
        swarm: ['虫群探路', '密集虫潮', '冲锋尾波'],
        crossfire: ['毒液前哨', '交叉弹幕', '突袭掩护'],
        siege: ['重装先锋', '铁壁护卫', '破阵强袭']
      };
      return names[relay.theme][Math.max(0, relay.wave - 1)];
    }

    _spawnDirector(dt) {
      if (this.siege) { this._updateSiege(dt); return; }
      if (this.salvage) { this._updateSalvage(dt); return; }
      if (this.voyage) { this._updateVoyage(dt); return; }
      if (this.trial) { this._updateTrial(dt); return; }
      if (this.encounters.some(encounter => encounter.status === 'active')) {
        this.pressurePhase = 'encounter'; this.spawnTimer = Math.max(this.spawnTimer, .8); return;
      }
      const elapsed = this.campaign ? this.campaign.stageElapsed : this.elapsed;
      this.pressurePhase = this.breathingTimer > 0 ? 'recovery' : elapsed < 25 ? 'arrival' : (elapsed - 25) % 32 < 24 ? 'pressure' : 'recovery';
      if (this.pressurePhase === 'recovery') {
        this.spawnTimer = Math.max(this.spawnTimer, 0.8);
        return;
      }
      if (this.campaign?.crisisId === 'reinforcements') {
        this.campaign.reinforcementTimer = Math.max(0, this.campaign.reinforcementTimer - dt);
        if (this.campaign.reinforcementTimer === 0) {
          this.campaign.reinforcementTimer = 20;
          let spawned = 0;
          for (let index = 0; index < 2; index++) if (this.spawnEnemy('crawler')) spawned++;
          if (spawned) this._emit('campaign-crisis', this.player, { crisisId: 'reinforcements', count: spawned, message: '增援追兵抵达' });
        }
      }
      this.spawnTimer -= dt;
      if (this.spawnTimer > 0) return;
      if (this.map.id === 'nexus') {
        this.spawnTimer = 6;
        if (this.enemies.filter(enemy => enemy.hp > 0 && enemy.type !== 'anchor').length < 6) this.spawnEnemy('crawler');
        return;
      }
      const pressure = Math.min(4, elapsed / 100) + this.completedRelays * 0.75;
      this.spawnTimer = elapsed < 25 ? 4.2 : this.bossSpawned ? 2.8 : Math.max(0.95, 2.45 - pressure * 0.23);
      const cap = elapsed < 25 ? 3 : this.bossSpawned ? 20 : Math.min(38, 11 + Math.floor(elapsed / 75) * 3 + this.completedRelays * 4);
      if (this.enemies.filter(enemy => enemy.hp > 0).length >= cap) return;
      const roll = this.random();
      const type = elapsed > 100 && roll > .975 ? 'mortar' : elapsed < 25 ? (elapsed >= 12 && roll > .7 ? 'spitter' : 'crawler') : roll < 0.49 ? 'crawler' : roll < 0.78 ? 'spitter' : roll < 0.94 && elapsed > 45 ? 'charger' : elapsed > 70 ? 'tank' : 'crawler';
      this.spawnEnemy(type);
    }

    spawnEnemy(type = 'crawler', position) {
      if (this.enemies.filter(enemy => enemy.hp > 0).length >= 55 || !ENEMIES[type]) return null;
      const data = ENEMIES[type];
      const elapsed = this.campaign ? this.campaign.stageElapsed : this.elapsed;
      const ordinary = !['boss', 'reactor', 'anchor'].includes(type);
      let point = position;
      if (!point) {
        const safeDistance = elapsed < 25 ? 600 : 400;
        for (let attempt = 0; attempt < 16; attempt += 1) {
          const angle = this.random() * TAU + attempt * 2.399963, range = (elapsed < 25 ? 710 : 570) + this.random() * 180;
          point = { x: clamp(this.player.x + Math.cos(angle) * range, 70, this.world.width - 70), y: clamp(this.player.y + Math.sin(angle) * range, 70, this.world.height - 70) };
          if (distance(point, this.player) > safeDistance && !this.obstacles.some(rock => distance(point, rock) < rock.radius + data.radius)) break;
        }
        if (distance(point, this.player) <= safeDistance || this.obstacles.some(rock => distance(point, rock) < rock.radius + data.radius)) return null;
      }
      const voyageDifficulty = this.voyage && VOYAGE_DIFFICULTIES.find(item => item.id === this.voyage.difficulty);
      const salvageDifficulty = this.salvage && SALVAGE_DIFFICULTIES.find(item => item.id === this.salvage.difficulty);
      const siegeDifficulty = this.siege && SIEGE_DIFFICULTIES.find(item => item.id === this.siege.difficulty);
      const scale = type === 'boss' || type === 'anchor' ? 1 : this.siege ? siegeDifficulty.hp : this.salvage ? salvageDifficulty.hp : this.voyage ?
        (1 + (this.voyage.node - 1) * .08) * (ordinary ? voyageDifficulty.hp * (this.voyage.room.risk === 'surge' ? 1.15 : 1) : 1) :
        (1 + this.completedRelays * 0.2 + Math.min(0.8, elapsed / 900)) * (ordinary && this.campaign?.crisisId === 'armored' ? 1.2 : 1);
      const enemy = {
        id: this._id(), type, x: point.x, y: point.y, radius: data.radius,
        hp: Math.round(data.hp * scale), maxHp: Math.round(data.hp * scale),
        speed: data.speed * (ordinary && this.campaign?.crisisId === 'pursuit' ? 1.14 : 1), damage: data.damage * (voyageDifficulty ? voyageDifficulty.damage : salvageDifficulty ? salvageDifficulty.damage : siegeDifficulty ? siegeDifficulty.damage : 1), xp: data.xp, angle: 0,
        attackTimer: 1 + this.random(), contactTimer: 0, stunTimer: 0,
        windup: 0, chargeTimer: 0, chargeX: 0, chargeY: 0, stage: 1, attackCount: 0,
        recoveryTimer: 0, knockbackTimer: 0, knockbackX: 0, knockbackY: 0, attackKind: '', phaseMarkTimer: 0
      };
      if (type === 'bulwark') Object.assign(enemy, { shieldAngle: Math.atan2(this.player.y - point.y, this.player.x - point.x), shieldOpenTimer: 0 });
      if (type === 'engineer') enemy.throwTarget = null;
      if (type === 'boss') Object.assign(enemy, { variant: this.map.id, name: this.map.boss.name, color: this.map.boss.color, attackName: '', attackHint: '' });
      this.enemies.push(enemy);
      return enemy;
    }

    _spawnBoss() {
      if (this.bossSpawned) return false;
      const player = this.player;
      let position = { x: clamp(player.x - 470, 150, this.world.width - 150), y: clamp(player.y - 350, 150, this.world.height - 150) };
      if (this.trial) position = this._trialSpawnPoint('boss');
      if (!position) return false;
      if (this.enemies.filter(enemy => enemy.hp > 0).length >= 55) this.enemies.splice(this.enemies.findIndex(enemy => enemy.hp > 0 && !enemy.contractId && !enemy.objectiveRelayId), 1);
      const boss = this.spawnEnemy('boss', position);
      if (!boss) return false;
      this.bossSpawned = true;
      this.hazards = this.hazards.filter(hazard => hazard.owner !== 'environment');
      this.sectorThreat.active = false;
      if (this.trial) Object.assign(boss, { variant: this.trial.bossMapId, hp: 2400, maxHp: 2400, trialWave: 6 });
      this._move(boss, 0, 0);
      boss.attackTimer = 3.5;
      this._emit('boss-spawn', boss);
      return true;
    }

    _updateEnemies(dt) {
      const player = this.player;
      for (const enemy of this.enemies) {
        if (this.phase !== 'playing') break;
        if (enemy.hp <= 0) continue;
        enemy.hitFlash = Math.max(0, (enemy.hitFlash || 0) - dt);
        if (enemy.type === 'bulwark') enemy.shieldOpenTimer = Math.max(0, enemy.shieldOpenTimer - dt);
        if (enemy.starSlowTimer > 0) enemy.starSlowTimer = Math.max(0, enemy.starSlowTimer - dt);
        if (enemy.type === 'reactor' || enemy.type === 'anchor') continue;
        enemy.contactTimer = Math.max(0, enemy.contactTimer - dt);
        if (enemy.stunTimer > 0) { enemy.stunTimer -= dt; continue; }
        enemy.attackTimer -= dt;
        if (enemy.knockbackTimer > 0) {
          enemy.knockbackTimer = Math.max(0, enemy.knockbackTimer - dt);
          this._move(enemy, enemy.knockbackX * dt, enemy.knockbackY * dt);
          continue;
        }
        if (enemy.recoveryTimer > 0) { enemy.recoveryTimer = Math.max(0, enemy.recoveryTimer - dt); continue; }
        if (enemy.salvageHunt && this.salvage.hunt.status === 'patrolling') {
          const hunt = this.salvage.hunt;
          if (distance(enemy, player) <= 360 && !this.obstacles.some(rock => this._segmentHit(enemy.x, enemy.y, player.x - enemy.x, player.y - enemy.y, rock, 0) !== null)) this._alertSalvageHunt(enemy);
          else {
            const point = hunt.path[hunt.pathIndex], dx = point.x - enemy.x, dy = point.y - enemy.y, gap = vectorLength(dx, dy);
            if (gap <= enemy.speed * dt + 2) hunt.pathIndex = (hunt.pathIndex + 1) % hunt.path.length;
            if (gap > 0) { enemy.angle = Math.atan2(dy, dx); this._steerMove(enemy, dx / gap, dy / gap, Math.min(enemy.speed, gap / dt), dt); }
            continue;
          }
        }
        const decoy = this.tactical.decoy;
        const lured = decoy && decoy.remaining > 0 && ['crawler', 'charger', 'tank'].includes(enemy.type)
          && enemy.windup <= 0 && enemy.chargeTimer <= 0 && distance(decoy, enemy) <= decoy.radius;
        const target = lured ? decoy : player;
        const dx = target.x - enemy.x, dy = target.y - enemy.y, length = Math.max(1, vectorLength(dx, dy));
        enemy.angle = Math.atan2(dy, dx);
        if (enemy.type === 'bulwark') this._updateBulwark(enemy, dt, dx / length, dy / length, length);
        else if (enemy.type === 'breacher') this._updateBreacher(enemy, dt, dx / length, dy / length, length);
        else if (enemy.type === 'engineer') this._updateEngineer(enemy, dt, dx / length, dy / length, length);
        else if (enemy.type === 'boss') this._updateBoss(enemy, dt, dx / length, dy / length, length);
        else if (enemy.type === 'nest') {
          if (enemy.attackTimer <= 0 && length < 720) {
            enemy.attackTimer = 6;
            const brood = this.enemies.filter(item => item.hp > 0 && item.nestId === enemy.id);
            if (brood.length < 3) {
              const angle = this.random() * TAU;
              const child = this.spawnEnemy('crawler', { x: enemy.x + Math.cos(angle) * 65, y: enemy.y + Math.sin(angle) * 65 });
              if (child) { child.nestId = enemy.id; this._move(child, 0, 0); }
            }
          }
        }
        else if (enemy.type === 'mortar') {
          if (enemy.windup > 0) {
            enemy.windup = Math.max(0, enemy.windup - dt);
            if (enemy.windup === 0) { enemy.recoveryTimer = 1.2; enemy.attackKind = ''; }
          } else if (enemy.attackTimer <= 0 && length < 720) {
            enemy.windup = 1.25; enemy.attackTimer = 4.8; enemy.attackKind = 'bombard';
            this._addHazard('blast', player.x, player.y, 86, 1.25, enemy.damage, { sourceId: enemy.id, color: '#ffbc82', owner: 'enemy' });
          } else this._steerMove(enemy, dx / length, dy / length, enemy.speed * (length > 460 ? 1 : length < 230 ? -.6 : 0), dt);
        }
        else if (enemy.type === 'tank') {
          if (enemy.windup > 0) {
            enemy.windup = Math.max(0, enemy.windup - dt);
            if (enemy.windup === 0) { enemy.recoveryTimer = 1.5; enemy.attackKind = ''; }
          } else if (enemy.attackTimer <= 0 && length < 155) {
            enemy.windup = 0.95;
            enemy.attackKind = 'slam';
            enemy.attackTimer = 4.1;
            const difficulty = this.salvage ? SALVAGE_DIFFICULTIES.find(item => item.id === this.salvage.difficulty) : this.voyage ? VOYAGE_DIFFICULTIES.find(item => item.id === this.voyage.difficulty) : null;
            this._addHazard('blast', enemy.x, enemy.y, 125, 0.95, 23 * (difficulty ? difficulty.damage : 1), { sourceId: enemy.id, enemyType: 'tank', color: '#ffbd7b', owner: 'enemy' });
          } else this._steerMove(enemy, dx / length, dy / length, enemy.speed, dt);
        }
        else if (enemy.type === 'charger') {
          if (enemy.chargeTimer > 0) {
            enemy.chargeTimer = Math.max(0, enemy.chargeTimer - dt);
            this._move(enemy, enemy.chargeX * 440 * dt, enemy.chargeY * 440 * dt);
            if (enemy.chargeTimer === 0) enemy.recoveryTimer = 0.7;
          } else if (enemy.windup > 0) {
            enemy.windup = Math.max(0, enemy.windup - dt);
            if (enemy.windup === 0) enemy.chargeTimer = 0.63;
          } else if (enemy.attackTimer <= 0 && length < 400 && length > 85) {
            enemy.windup = 0.72;
            enemy.chargeX = dx / length; enemy.chargeY = dy / length;
            enemy.attackTimer = 4.2;
            this._addHazard('charge', enemy.x, enemy.y, 22, 0.72, 0, { angle: enemy.angle, length: 280, visualOnly: true, sourceId: enemy.id });
          } else this._steerMove(enemy, dx / length, dy / length, enemy.speed, dt);
        } else if (enemy.type === 'spitter') {
          const clearShot = !this.obstacles.some(rock => this._segmentHit(enemy.x, enemy.y, dx, dy, rock, 6) !== null);
          if (enemy.windup > 0) {
            enemy.windup = Math.max(0, enemy.windup - dt);
            enemy.angle = enemy.shotAngle;
            if (enemy.windup === 0) {
              this._enemyBullet(enemy, enemy.shotAngle, 270, enemy.damage);
              enemy.attackTimer = 2.25;
              enemy.recoveryTimer = 0.3;
            }
          } else if (enemy.attackTimer <= 0 && length < 700 && clearShot) {
            enemy.windup = 0.55;
            enemy.shotAngle = enemy.angle;
          } else {
            const move = !clearShot || length > 340 ? 1 : length < 230 ? -0.55 : 0;
            this._steerMove(enemy, dx / length, dy / length, enemy.speed * move, dt);
          }
        } else this._steerMove(enemy, dx / length, dy / length, enemy.speed, dt);
        if (enemy.windup <= 0 && enemy.recoveryTimer <= 0 && distance(player, enemy) < player.radius + enemy.radius && enemy.contactTimer <= 0) {
          this._damagePlayer(enemy.damage, this._enemyDamageSource(enemy));
          enemy.contactTimer = 0.8;
        }
      }
      // A light separation pass keeps large crowds readable without changing pursuit.
      for (let a = 0; a < this.enemies.length; a += 1) {
        const left = this.enemies[a];
        if (left.hp <= 0 || left.type === 'boss' || left.type === 'nest' || left.type === 'reactor' || left.type === 'anchor' || left.chargeTimer > 0 || left.windup > 0) continue;
        for (let b = a + 1; b < this.enemies.length; b += 1) {
          const right = this.enemies[b];
          if (right.hp <= 0 || right.type === 'boss' || right.type === 'nest' || right.type === 'reactor' || right.type === 'anchor' || right.chargeTimer > 0 || right.windup > 0) continue;
          const dx = left.x - right.x, dy = left.y - right.y, length = vectorLength(dx, dy);
          const gap = (left.radius + right.radius) * 0.96;
          if (length < gap) {
            const push = (gap - length) * Math.min(0.18, dt * 8);
            const nx = length > 0.01 ? dx / length : Math.cos(left.id + right.id);
            const ny = length > 0.01 ? dy / length : Math.sin(left.id + right.id);
            this._move(left, nx * push, ny * push);
            this._move(right, -nx * push, -ny * push);
          }
        }
      }
      this.enemies = this.enemies.filter(enemy => enemy.hp > 0);
    }

    _updateBulwark(enemy, dt, nx, ny, length) {
      const desired = enemy.windup > 0 ? enemy.shotAngle : enemy.angle;
      const turn = Math.atan2(Math.sin(desired - enemy.shieldAngle), Math.cos(desired - enemy.shieldAngle));
      enemy.shieldAngle += clamp(turn, -1.5 * dt, 1.5 * dt);
      if (enemy.windup > 0) {
        enemy.windup = Math.max(0, enemy.windup - dt); enemy.angle = enemy.shotAngle;
        if (enemy.windup === 0) {
          for (const offset of [-.16, 0, .16]) this._enemyBullet(enemy, enemy.shotAngle + offset, 300, enemy.damage);
          enemy.shieldOpenTimer = Math.max(enemy.shieldOpenTimer, 1.3); enemy.recoveryTimer = 1.2;
          this._emit('shield-open', enemy, { enemyId: enemy.id, duration: 1.3, color: '#9ad6ff' });
        }
      } else if (enemy.attackTimer <= 0 && length < 620 &&
        !this.obstacles.some(rock => this._segmentHit(enemy.x, enemy.y, nx * length, ny * length, rock, 6) !== null)) {
        enemy.windup = .75; enemy.shotAngle = enemy.angle; enemy.attackTimer = 3.8;
      } else this._steerMove(enemy, nx, ny, enemy.speed * (length > 300 ? 1 : length < 185 ? -.5 : 0), dt);
    }

    _updateBreacher(enemy, dt, nx, ny, length) {
      if (enemy.windup > 0 || enemy.chargeTimer > 0) enemy.angle = Math.atan2(enemy.chargeY, enemy.chargeX);
      if (enemy.chargeTimer > 0) {
        const time = Math.min(dt, enemy.chargeTimer), dx = enemy.chargeX * 520 * time, dy = enemy.chargeY * 520 * time;
        const hits = this.obstacles.map(rock => ({ rock, t: this._segmentHit(enemy.x, enemy.y, dx, dy, rock, enemy.radius) }))
          .filter(hit => hit.t !== null).sort((a, b) => a.t - b.t);
        if (hits.length) {
          const hit = hits[0];
          this._move(enemy, dx * Math.max(0, hit.t - .001), dy * Math.max(0, hit.t - .001));
          this._damageCover(hit.rock, hit.rock.maxHp || 95);
          enemy.chargeTimer = 0; enemy.stunTimer = 1.35; enemy.recoveryTimer = 0; enemy.attackKind = '';
          this._emit('breacher-crash', enemy, { enemyId: enemy.id, rockId: hit.rock.id, duration: 1.35, radius: 45, color: '#ffd29a' });
        } else {
          this._move(enemy, dx, dy); enemy.chargeTimer = Math.max(0, enemy.chargeTimer - time);
          if (enemy.chargeTimer === 0) { enemy.recoveryTimer = .65; enemy.attackKind = ''; }
        }
      } else if (enemy.windup > 0) {
        enemy.windup = Math.max(0, enemy.windup - dt);
        if (enemy.windup === 0) enemy.chargeTimer = .58;
      } else if (enemy.attackTimer <= 0 && length < 430 && length > 95) {
        enemy.windup = .8; enemy.chargeX = nx; enemy.chargeY = ny; enemy.attackKind = 'breach'; enemy.attackTimer = 4.4;
        this._addHazard('charge', enemy.x, enemy.y, enemy.radius, .8, 0,
          { angle: enemy.angle, length: 302, visualOnly: true, sourceId: enemy.id, color: '#ffc18a' });
      } else this._steerMove(enemy, nx, ny, enemy.speed, dt);
    }

    _updateEngineer(enemy, dt, nx, ny, length) {
      if (enemy.windup > 0) {
        enemy.windup = Math.max(0, enemy.windup - dt);
        if (enemy.windup === 0) {
          if (enemy.throwTarget) this._spawnMine(enemy.throwTarget, enemy.id);
          enemy.throwTarget = null; enemy.recoveryTimer = .8; enemy.attackKind = '';
        }
      } else if (enemy.attackTimer <= 0 && length < 650 && this.battlefield &&
        this.battlefield.mines.length < 12 && this.battlefield.mines.filter(item => item.engineerId === enemy.id).length < 2 &&
        !this.obstacles.some(rock => this._segmentHit(enemy.x, enemy.y, nx * length, ny * length, rock, 6) !== null)) {
        enemy.windup = .85; enemy.attackTimer = 5.2; enemy.attackKind = 'mine';
        enemy.throwTarget = { x: this.player.x, y: this.player.y };
        this._addHazard('blast', enemy.throwTarget.x, enemy.throwTarget.y, 32, 1.5, 0,
          { sourceId: enemy.id, owner: 'enemy', visualOnly: true, engineerLanding: true, color: '#ffc18a' });
      } else this._steerMove(enemy, nx, ny, enemy.speed * (length > 380 ? 1 : length < 210 ? -.6 : 0), dt);
    }

    _steerMove(enemy, nx, ny, speed, dt) {
      if (enemy.starSlowTimer > 0) speed *= .65;
      const corridor = this.railCorridor;
      if (corridor && corridor.remaining > 0 && enemy.type !== 'boss' && enemy.type !== 'reactor' && this._segmentHit(corridor.x, corridor.y, corridor.endX - corridor.x, corridor.endY - corridor.y, enemy, corridor.width / 2) !== null) speed *= 0.7;
      if (speed <= 0) { this._move(enemy, nx * speed * dt, ny * speed * dt); return; }
      let blocking = null;
      for (const rock of this.obstacles) {
        const dx = rock.x - enemy.x, dy = rock.y - enemy.y;
        const forward = dx * nx + dy * ny, side = dx * -ny + dy * nx;
        if (forward > 0 && forward < rock.radius + enemy.radius + 95 && Math.abs(side) < rock.radius + enemy.radius + 12) {
          blocking = rock;
          if (enemy.avoidRockId !== rock.id) {
            enemy.avoidRockId = rock.id;
            enemy.avoidSide = Math.abs(side) < 1 ? (enemy.id % 2 ? 1 : -1) : side > 0 ? -1 : 1;
          }
          break;
        }
      }
      if (blocking) {
        const sx = nx - ny * enemy.avoidSide * 1.8, sy = ny + nx * enemy.avoidSide * 1.8;
        const length = vectorLength(sx, sy);
        nx = sx / length; ny = sy / length;
      } else enemy.avoidRockId = null;
      this._move(enemy, nx * speed * dt, ny * speed * dt);
    }

    _updateBoss(boss, dt, nx, ny, length) {
      const variant = boss.variant || this.map.id;
      if (variant === 'siege') { this._updateSiegeBoss(boss, dt); return; }
      if (variant === 'voyage') { this._updateVoyageBoss(boss, dt, nx, ny, length); return; }
      if (variant === 'nexus') { this._updateNexusBoss(boss, dt, nx, ny, length); return; }
      if (boss.stage === 1 && boss.hp <= boss.maxHp * 0.5) {
        boss.stage = 2;
        boss.attackTimer = 1.6;
        boss.recoveryTimer = 1.2;
        boss.windup = 0;
        boss.chargeTimer = 0;
        boss.attackKind = '';
        boss.attackName = ''; boss.attackHint = '';
        this.hazards = this.hazards.filter(hazard => hazard.sourceId !== boss.id);
        this._emit('boss-phase', boss, { stage: 2 });
        for (let index = 0; index < 2; index += 1) this.spawnEnemy('charger');
        return;
      }
      if (boss.chargeTimer > 0) {
        boss.chargeTimer = Math.max(0, boss.chargeTimer - dt);
        this._move(boss, boss.chargeX * 550 * dt, boss.chargeY * 550 * dt);
        if (boss.chargeTimer === 0) { boss.recoveryTimer = 1.05; boss.attackKind = ''; boss.attackName = ''; boss.attackHint = ''; }
        return;
      }
      if (boss.windup > 0) {
        boss.windup = Math.max(0, boss.windup - dt);
        if (boss.windup === 0) {
          if (boss.attackKind === 'charge') boss.chargeTimer = 0.85;
          else {
            if (boss.attackKind === 'ring') {
              const count = boss.stage === 2 ? 20 : 14;
              for (let index = 0; index < count; index += 1) this._enemyBullet(boss, TAU * index / count + boss.attackCount * 0.22, boss.stage === 2 ? 220 : 180, 13);
              this._emit('boss-ring', boss, { radius: 80 });
            }
            if (boss.attackKind === 'fan') {
              const count = boss.stage === 2 ? 11 : 7;
              for (let index = 0; index < count; index += 1) this._enemyBullet(boss, boss.shotAngle + (index / (count - 1) - .5) * boss.spread, boss.stage === 2 ? 255 : 220, 11);
            }
            boss.recoveryTimer = 0.95;
            boss.attackKind = '';
            boss.attackName = ''; boss.attackHint = '';
          }
        }
        return;
      }
      if (length > 210) this._steerMove(boss, nx, ny, boss.speed, dt);
      if (boss.attackTimer > 0) return;
      boss.attackCount += 1;
      boss.attackTimer = variant === 'frontier' ? (boss.stage === 2 ? 3.5 : 4.4) : (boss.stage === 2 ? 4.2 : 5.2);
      const attack = boss.attackCount % 3;
      if (variant === 'ruins' && attack === 1) {
        boss.attackKind = 'ruins-lattice'; boss.windup = 1.4;
        boss.attackName = '双斜光刃'; boss.attackHint = '向上下左右移出双斜光带，不要沿带后退';
        for (const angle of [Math.PI / 4, -Math.PI / 4]) this._addHazard('lane', this.player.x - Math.cos(angle) * 340, this.player.y - Math.sin(angle) * 340, boss.stage === 2 ? 32 : 26, 1.4, 17,
          { sourceId: boss.id, enemyType: 'boss', owner: 'enemy', angle, length: 680, color: boss.color, name: boss.attackName, hint: boss.attackHint });
      } else if (variant === 'ruins' && attack === 2) {
        boss.attackKind = 'ruins-collapse'; boss.windup = 1.65;
        boss.attackName = '追星坍缩'; boss.attackHint = '三处落点已经固定，朝首领或背离首领移动脱离';
        for (const offset of [-150, 0, 150]) this._addHazard('blast', this.player.x - ny * offset, this.player.y + nx * offset, boss.stage === 2 ? 92 : 78, 1.65, 18,
          { sourceId: boss.id, enemyType: 'boss', owner: 'enemy', color: boss.color, name: boss.attackName, hint: boss.attackHint });
      } else if (variant === 'ruins') {
        boss.attackKind = 'fan'; boss.windup = 1.3; boss.shotAngle = Math.atan2(this.player.y - boss.y, this.player.x - boss.x); boss.spread = 1.8;
        boss.attackName = '守墓齐射'; boss.attackHint = '横向绕出锁定扇区，或用冲刺与 EMP 化解';
      } else if (variant === 'storm' && attack === 1) {
        boss.attackKind = 'storm-call'; boss.windup = 1.5;
        boss.attackName = '追身引雷'; boss.attackHint = '落点已固定，撤出雷圈；下次发招前靠近首领引雷';
        this._addHazard('blast', this.player.x, this.player.y, boss.stage === 2 ? 112 : 96, 1.5, 19,
          { sourceId: boss.id, backlashId: boss.id, enemyType: 'boss', owner: 'enemy', color: boss.color, name: boss.attackName, hint: boss.attackHint });
      } else if (variant === 'storm' && attack === 2) {
        boss.attackKind = 'storm-cross'; boss.windup = 1.5;
        boss.attackName = '交错雷网'; boss.attackHint = '向上下左右移出斜向雷带，别沿雷带后退';
        for (const angle of [Math.PI / 4, -Math.PI / 4]) this._addHazard('lane', this.player.x - Math.cos(angle) * 320, this.player.y - Math.sin(angle) * 320, boss.stage === 2 ? 31 : 25, 1.5, 17,
          { sourceId: boss.id, enemyType: 'boss', owner: 'enemy', angle, length: 640, color: boss.color, name: boss.attackName, hint: boss.attackHint });
      } else if (variant === 'storm') {
        boss.attackKind = 'fan'; boss.windup = 1.35; boss.shotAngle = Math.atan2(this.player.y - boss.y, this.player.x - boss.x); boss.spread = 1.8;
        boss.attackName = '雷锥齐射'; boss.attackHint = '离开扇区，或冲刺穿过雷锥弹幕';
      } else if (variant === 'foundry' && attack === 1) {
        boss.attackKind = 'heat-cross'; boss.windup = 1.5;
        boss.attackName = '十字热浪'; boss.attackHint = '斜向移出两条热浪带';
        for (const angle of [0, Math.PI / 2]) this._addHazard('lane', this.player.x - Math.cos(angle) * 320, this.player.y - Math.sin(angle) * 320, boss.stage === 2 ? 36 : 28, 1.5, 17,
          { sourceId: boss.id, enemyType: 'boss', owner: 'enemy', angle, length: 640, color: boss.color, name: boss.attackName, hint: boss.attackHint });
      } else if (variant === 'foundry' && attack === 2) {
        boss.attackKind = 'fan'; boss.windup = 1.3; boss.shotAngle = Math.atan2(this.player.y - boss.y, this.player.x - boss.x); boss.spread = 1.4;
        boss.attackName = '扇形熔弹'; boss.attackHint = '朝两侧移动，离开正面扇区';
      } else if (variant === 'frost' && attack === 1) {
        boss.attackKind = 'ice-ring'; boss.windup = 1.5;
        boss.attackName = '霜棘冰环'; boss.attackHint = '进入空心内圈，或远离整个冰环';
        this._addHazard('ring', boss.x, boss.y, boss.stage === 2 ? 245 : 215, 1.5, 18,
          { sourceId: boss.id, enemyType: 'boss', owner: 'enemy', innerRadius: boss.stage === 2 ? 140 : 125, color: boss.color, effect: 'slow', name: boss.attackName, hint: boss.attackHint });
      } else if (variant === 'frost' && attack === 2) {
        boss.attackKind = 'ice-hunt'; boss.windup = 1.5;
        boss.attackName = '冰爆追击'; boss.attackHint = '离开锁定蓝圈，冰缓时用冲刺脱离';
        this._addHazard('blast', this.player.x, this.player.y, boss.stage === 2 ? 120 : 95, 1.5, 16,
          { sourceId: boss.id, enemyType: 'boss', owner: 'enemy', color: boss.color, effect: 'slow', name: boss.attackName, hint: boss.attackHint });
      } else if (attack === 1) {
        boss.attackKind = 'blast';
        boss.attackName = '裂隙轰击'; boss.attackHint = '离开锁定爆圈';
        boss.windup = boss.stage === 2 ? 1.45 : 1.12;
        this._addHazard('blast', this.player.x, this.player.y, boss.stage === 2 ? 125 : 100, 1.12, 24, { sourceId: boss.id, enemyType: 'boss', owner: 'enemy', name: boss.attackName, hint: boss.attackHint });
        if (boss.stage === 2) {
          this._addHazard('blast', this.player.x + 190, this.player.y - 90, 90, 1.45, 20, { sourceId: boss.id, enemyType: 'boss', owner: 'enemy', name: boss.attackName, hint: boss.attackHint });
          this._addHazard('blast', this.player.x - 190, this.player.y + 90, 90, 1.45, 20, { sourceId: boss.id, enemyType: 'boss', owner: 'enemy', name: boss.attackName, hint: boss.attackHint });
        }
      } else if (attack === 2) {
        boss.attackKind = 'ring';
        boss.attackName = '环形弹幕'; boss.attackHint = '穿过弹幕间隙，冲刺可吸收敌弹';
        boss.windup = 0.85;
      } else {
        boss.windup = variant === 'frontier' ? 1 : 1.3;
        boss.attackKind = 'charge';
        boss.attackName = variant === 'foundry' ? '熔炉碾压' : variant === 'frost' ? '霜线突袭' : '断层冲锋';
        boss.attackHint = '横向移出冲锋路线';
        boss.chargeX = nx; boss.chargeY = ny;
        this._addHazard('charge', boss.x, boss.y, boss.radius, boss.windup, 0, { angle: boss.angle, length: 470, visualOnly: true, sourceId: boss.id, color: boss.color, name: boss.attackName, hint: boss.attackHint });
      }
      this._emit('boss-attack', boss, { name: boss.attackName, hint: boss.attackHint, color: boss.color });
    }

    _updateVoyageBoss(boss, dt, nx, ny, length) {
      const stage = boss.hp <= boss.maxHp / 3 ? 3 : boss.hp <= boss.maxHp * 2 / 3 ? 2 : 1;
      if (stage > boss.stage) {
        Object.assign(boss, { stage, attackCount: 0, attackTimer: 2, recoveryTimer: 1.4, windup: 0, attackKind: '', attackName: '', attackHint: '', teleportTarget: null });
        this.hazards = this.hazards.filter(hazard => hazard.sourceId !== boss.id);
        this._emit('voyage-boss-phase', boss, { stage, title: stage === 2 ? '折跃形态' : '合相终曲', color: boss.color });
        return;
      }
      if (boss.windup > 0) {
        boss.windup = Math.max(0, boss.windup - dt);
        if (boss.windup === 0) {
          if (boss.attackKind === 'voyage-ring') {
            const difficulty = VOYAGE_DIFFICULTIES.find(item => item.id === this.voyage.difficulty);
            for (let index = 0; index < boss.ringCount; index++) {
              const angle = boss.ringStartAngle + index * TAU / boss.ringCount;
              if (Math.acos(Math.cos(angle - boss.ringGapAngle)) <= boss.ringGapWidth / 2) continue;
              this._enemyBullet(boss, angle, 175 + (boss.stage - 1) * 20, 14 * difficulty.damage);
            }
            this._emit('boss-ring', boss, { radius: 85, gapAngle: boss.ringGapAngle, gapWidth: boss.ringGapWidth });
          }
          if (boss.attackKind === 'voyage-teleport' && boss.teleportTarget) {
            const old = { x: boss.x, y: boss.y };
            boss.x = boss.teleportTarget.x; boss.y = boss.teleportTarget.y; boss.teleportTarget = null;
            this._emit('voyage-boss-teleport', old, { toX: boss.x, toY: boss.y, radius: boss.radius, color: boss.color });
          }
          boss.recoveryTimer = boss.stage === 3 ? .8 : 1.2; boss.attackKind = ''; boss.attackName = ''; boss.attackHint = '';
        }
        return;
      }
      if (length > 350) this._steerMove(boss, nx, ny, boss.speed, dt);
      if (boss.attackTimer > 0) return;
      boss.attackCount++;
      boss.attackTimer = boss.stage === 3 ? 4.5 : boss.stage === 2 ? 4.8 : 5.2;
      const attack = boss.attackCount % (boss.stage === 2 ? 4 : 3);
      const difficulty = VOYAGE_DIFFICULTIES.find(item => item.id === this.voyage.difficulty);
      const extra = { sourceId: boss.id, enemyType: 'boss', owner: 'enemy', color: boss.color };
      if (boss.stage >= 2 && (attack === 0 && boss.stage === 2 || attack === 2 && boss.stage === 3)) {
        boss.attackKind = 'voyage-teleport'; boss.windup = 1.35;
        boss.attackName = '航界折跃'; boss.attackHint = '虚线圈是首领落点，离开落点并继续横移';
        const points = [{ x: 440, y: 290 }, { x: 1260, y: 290 }, { x: 420, y: 830 }, { x: 1280, y: 830 }]
          .filter(point => !this.obstacles.some(rock => distance(point, rock) < rock.radius + boss.radius + 15))
          .sort((a, b) => distance(b, this.player) - distance(a, this.player));
        boss.teleportTarget = points[0] || { x: 850, y: 300 };
        this._addHazard('blast', boss.teleportTarget.x, boss.teleportTarget.y, boss.radius + 20, boss.windup, 0,
          { ...extra, visualOnly: true, voyageTeleport: true, name: boss.attackName, hint: boss.attackHint });
        if (boss.stage === 3) this._addHazard('blast', this.player.x, this.player.y, 82, 1.8, 23 * difficulty.damage,
          { ...extra, name: '折跃余波', hint: '旧位置已经锁定，移出紫色爆圈。' });
      } else if (attack === 1) {
        boss.attackKind = boss.stage === 3 ? 'voyage-finale' : 'voyage-lattice'; boss.windup = 1.55;
        boss.attackName = boss.stage === 3 ? '合相终曲' : '双弦光栅';
        boss.attackHint = boss.stage === 3 ? '先侧移离开斜光带，再继续走出延迟爆圈' : '向上下左右移出两条斜向光带';
        for (const angle of [Math.PI / 4, -Math.PI / 4]) this._addHazard('lane', this.player.x - Math.cos(angle) * 375, this.player.y - Math.sin(angle) * 375, 22, 1.55, 22 * difficulty.damage,
          { ...extra, angle, length: 750, name: boss.attackName, hint: boss.attackHint });
        if (boss.stage === 3) this._addHazard('blast', this.player.x, this.player.y, 100, 2.05, 24 * difficulty.damage,
          { ...extra, name: '终曲坍缩', hint: '光栅之后旧位爆圈才爆发，保持移动。' });
      } else if (attack === 2) {
        boss.attackKind = 'voyage-collapse'; boss.windup = 1.6;
        boss.attackName = boss.stage === 1 ? '星核坍缩' : '三重坍缩'; boss.attackHint = '旧位置已经锁定，朝首领或背离首领方向撤出';
        for (const offset of boss.stage === 1 ? [0] : [-155, 0, 155]) this._addHazard('blast', this.player.x - ny * offset, this.player.y + nx * offset, 86, 1.6, 23 * difficulty.damage,
          { ...extra, name: boss.attackName, hint: boss.attackHint });
      } else {
        boss.attackKind = 'voyage-ring'; boss.windup = 1.35;
        boss.attackName = '留隙星环'; boss.attackHint = '面向你的一段安全缺口已锁定；保持该方向，或用冲刺与 EMP 化解弹幕';
        boss.ringCount = 12 + (boss.stage - 1) * 4; boss.ringStartAngle = boss.attackCount * .22;
        boss.ringGapAngle = Math.atan2(this.player.y - boss.y, this.player.x - boss.x); boss.ringGapWidth = Math.PI / 6;
      }
      this._emit('boss-attack', boss, { name: boss.attackName, hint: boss.attackHint, color: boss.color });
    }

    _updateNexusBoss(boss, dt, nx, ny, length) {
      if (boss.stage === 1 && boss.hp <= boss.maxHp * .5) {
        Object.assign(boss, { stage: 2, attackTimer: 2, recoveryTimer: 1.2, windup: 0, attackKind: '', attackName: '', attackHint: '' });
        this.hazards = this.hazards.filter(hazard => hazard.sourceId !== boss.id);
        this._emit('boss-phase', boss, { stage: 2 });
        return;
      }
      if (boss.windup > 0) {
        boss.windup = Math.max(0, boss.windup - dt);
        if (boss.windup === 0) {
          if (boss.attackKind === 'nexus-ring') {
            const count = boss.stage === 2 ? 20 : 16;
            for (let index = 0; index < count; index++) this._enemyBullet(boss, index * TAU / count + boss.attackCount * .18, boss.stage === 2 ? 215 : 185, 14);
            this._emit('boss-ring', boss, { radius: 85 });
          }
          boss.recoveryTimer = 1.2; boss.attackKind = ''; boss.attackName = ''; boss.attackHint = '';
        }
        return;
      }
      if (length > 330) this._steerMove(boss, nx, ny, boss.speed, dt);
      if (boss.attackTimer > 0) return;
      boss.attackCount++;
      boss.attackTimer = boss.stage === 2 ? 4.2 : 5;
      const attack = boss.attackCount % 3;
      if (attack === 1) {
        boss.attackKind = 'nexus-lattice'; boss.windup = 1.55;
        boss.attackName = '裂隙光栅'; boss.attackHint = '向上下左右移出两条斜向光带';
        for (const angle of [Math.PI / 4, -Math.PI / 4]) this._addHazard('lane', this.player.x - Math.cos(angle) * 360, this.player.y - Math.sin(angle) * 360,
          boss.stage === 2 ? 31 : 25, 1.55, 21, { sourceId: boss.id, enemyType: 'boss', owner: 'enemy', angle, length: 720, color: boss.color, name: boss.attackName, hint: boss.attackHint });
      } else if (attack === 2) {
        boss.attackKind = 'nexus-collapse'; boss.windup = 1.7;
        boss.attackName = '三重坍缩'; boss.attackHint = '三处落点已经锁定，朝首领或背离首领方向撤出';
        for (const offset of [-165, 0, 165]) this._addHazard('blast', this.player.x - ny * offset, this.player.y + nx * offset, boss.stage === 2 ? 100 : 86, 1.7, 23,
          { sourceId: boss.id, enemyType: 'boss', owner: 'enemy', color: boss.color, name: boss.attackName, hint: boss.attackHint });
      } else {
        boss.attackKind = 'nexus-ring'; boss.windup = 1.2;
        boss.attackName = '封界弹环'; boss.attackHint = '拉开距离穿过弹幕间隙，或用冲刺与 EMP 化解';
      }
      this._emit('boss-attack', boss, { name: boss.attackName, hint: boss.attackHint, color: boss.color });
    }

    _enemyBullet(enemy, angle, speed, damage) {
      const color = enemy.color || '#ff7791';
      this.bullets.push({ id: this._id(), type: 'bullet', owner: 'enemy', x: enemy.x + Math.cos(angle) * (enemy.radius + 8), y: enemy.y + Math.sin(angle) * (enemy.radius + 8), vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: 6, lifetime: 4.5, damage, pierce: 0, color, damageSource: this._enemyDamageSource(enemy, true) });
      this._emit('shot', enemy, { angle, owner: 'enemy', color });
    }

    _enemyDamageSource(enemy, projectile = false) {
      const names = { crawler: '裂隙爬行者', spitter: '孢子射手', charger: '冲锋兽', tank: '铁棘重甲', mortar: '炮击虫', nest: '孵化虫巢',
        bulwark: '棱盾卫', breacher: '破岩兽', engineer: '投雷工兵', boss: this.map.boss.name };
      const charge = !projectile && enemy.chargeTimer > 0;
      const attack = enemy.type === 'boss' && (projectile || charge) ? enemy.attackName : null;
      return {
        kind: projectile ? 'projectile' : 'contact',
        name: (enemy.name || names[enemy.type] || '敌人') + ' · ' + (attack || (projectile ? '远程射击' : charge ? '冲锋' : '近身接触')),
        hint: attack && enemy.attackHint || (projectile ? '躲到掩体后，或用冲刺穿过敌弹，将它们转化为星核能量。' : charge ? '看到冲锋预警后横向闪避，避开正面路线。' : '与敌人拉开距离；冲刺脱离包围，脉冲震荡可以打断近身威胁。')
      };
    }

    _updateSectorThreat(dt) {
      if (this.phase !== 'playing') return;
      if (this.delivery) {
        const cargo = this.delivery.cargos.find(item => item.id === this.delivery.carriedId);
        this.sectorThreat.active = !!cargo && !this.bossSpawned;
        if (!this.sectorThreat.active) return;
        this.sectorThreat.timer = Math.max(0, this.sectorThreat.timer - dt);
        if (this.sectorThreat.timer > 1e-9 || this.hazards.some(hazard => hazard.cargoPulse && !hazard.resolved)) return;
        this.sectorThreat.timer = 5.5; this.sectorThreat.count++;
        this._addHazard('blast', this.player.x, this.player.y, 95, 1.4, 16, { owner: 'environment', cargoPulse: true, cargoId: cargo.id,
          enemyDamage: 60, color: this.map.color, name: '星火追踪', hint: '落点已固定，移出金色爆圈；冲刺放下的星火可以回收。' });
        this._emit('sector-warning', this.player, { name: '星火追踪', hint: '落点已锁定，移出金色爆圈', cargoId: cargo.id, color: this.map.color });
        return;
      }
      const relay = this.relays.find(item => item.status === 'charging');
      this.sectorThreat.active = !!relay && !this.bossSpawned;
      if (!this.sectorThreat.active) { this.sectorThreat.timer = 6; return; }
      this.sectorThreat.timer = Math.max(0, this.sectorThreat.timer - dt);
      if (this.sectorThreat.timer > 0) return;
      if (this.breathingTimer > 0 || this.hazards.some(hazard => hazard.remaining > 0 && (relay.mode === 'conduction' ? hazard.conductionRelayId === relay.id : !hazard.visualOnly))) { this.sectorThreat.timer = .8; return; }
      this.sectorThreat.timer = this.sectorThreat.interval;
      this.sectorThreat.count += 1;
      const extra = { owner: 'environment', name: this.map.threat.name, hint: this.map.threat.description, color: this.map.color, enemyDamage: 60 };
      if (relay.mode === 'conduction') {
        this._addHazard('blast', this.player.x, this.player.y, 90, 1.35, 22, { ...extra, conductionRelayId: relay.id, capturedAtLock: distance(this.player, relay) <= relay.radius, enemyDamage: 90 });
      } else if (this.map.id === 'foundry') {
        const angle = this.sectorThreat.count % 2 ? 0 : Math.PI / 2;
        this._addHazard('lane', this.player.x - Math.cos(angle) * 260, this.player.y - Math.sin(angle) * 260, 32, 1.5, 14, { ...extra, angle, length: 520 });
      } else this._addHazard('blast', this.player.x, this.player.y, this.map.id === 'frost' ? 95 : 105, 1.5, this.map.id === 'frost' ? 10 : 12, { ...extra, ...(this.map.id === 'frost' ? { effect: 'slow' } : {}) });
      this._emit('sector-warning', this.player, { name: extra.name, hint: extra.hint, color: extra.color });
    }

    _addHazard(type, x, y, radius, duration, damage, extra = {}) {
      this.hazards.push({ id: this._id(), type, x, y, radius, duration, remaining: duration, damage, owner: 'enemy', ...extra });
    }

    _hazardHits(hazard, target) {
      if (hazard.type === 'lane') return this._segmentHit(hazard.x, hazard.y, Math.cos(hazard.angle) * hazard.length, Math.sin(hazard.angle) * hazard.length, target, hazard.radius) !== null;
      const gap = distance(target, hazard);
      if (hazard.type === 'ring') return gap <= hazard.radius + target.radius && gap + target.radius >= hazard.innerRadius;
      return gap <= hazard.radius + target.radius;
    }

    _updateHazards(dt) {
      for (const hazard of this.hazards) {
        if (this.phase !== 'playing') break;
        const source = hazard.sourceId && this.enemies.find(enemy => enemy.id === hazard.sourceId && enemy.hp > 0);
        if (hazard.sourceId && !source) { hazard.remaining = 0; continue; }
        hazard.remaining -= dt;
        const node = hazard.salvageNodeId && this.salvage?.nodes.find(item => item.id === hazard.salvageNodeId);
        if (node && hazard.remaining < 1e-9) hazard.remaining = 0;
        if (node) node.remaining = Math.max(0, hazard.remaining);
        if (hazard.remaining > 0 || hazard.visualOnly || hazard.resolved) continue;
        hazard.resolved = true;
        if (node) {
          node.status = 'spent';
          if (this.salvage.selectedId === node.id) this.salvage.selectedId = null;
        }
        if (!hazard.friendly && this._hazardHits(hazard, this.player) && this._damagePlayer(hazard.damage, {
          kind: hazard.owner === 'environment' ? 'environment' : 'hazard',
          name: hazard.name || (source ? this._enemyDamageSource(source).name.split(' · ')[0] + ' · ' + (source.type === 'tank' ? '震地重击' : '范围轰击') : '危险区域'),
          hint: hazard.hint || (hazard.type === 'ring' ? '进入空心内圈，或在预警结束前离开整个冰环。' : hazard.type === 'lane' ? '从预警带的侧边躲开，不要沿着危险带直线后退。' : '在地面预警结束前移出范围；掩体无法挡住范围爆炸。')
        }) && hazard.effect === 'slow' && this.phase === 'playing') this.player.slowTimer = 2;
        if (hazard.owner === 'environment') {
          for (const enemy of this.enemies) {
            if (this.phase !== 'playing') break;
            if (enemy.hp > 0 && enemy.type !== 'boss' && enemy.type !== 'reactor' && this._hazardHits(hazard, enemy)) {
              if (node && hazard.friendly && node.kind === 'ring') enemy.starSlowTimer = Math.max(enemy.starSlowTimer || 0, 1.4);
              this._damageEnemy(enemy, hazard.enemyDamage || 60);
            }
          }
        }
        if (this.phase !== 'playing') break;
        if (hazard.owner === 'environment' && hazard.conductionRelayId) {
          const relay = this.relays.find(item => item.id === hazard.conductionRelayId && item.mode === 'conduction' && item.status === 'charging');
          if (relay) {
            if (hazard.capturedAtLock) {
              relay.charges = Math.min(relay.chargeGoal, relay.charges + 1);
              relay.progress = relay.charges / relay.chargeGoal;
              this._emit('conduction-charge', relay, { relayId: relay.id, charges: relay.charges, chargeGoal: relay.chargeGoal, color: this.map.color, message: '导雷充能 · ' + relay.charges + '/' + relay.chargeGoal });
              if (relay.charges >= relay.chargeGoal) this._completeRelay(relay);
            } else this._emit('conduction-miss', relay, { relayId: relay.id, color: this.map.color, message: '落雷未入塔圈 · 返回塔圈重新引雷' });
          }
        }
        if (hazard.owner === 'enemy' && hazard.type === 'blast' && hazard.backlashId && source && source.id === hazard.backlashId && source.type === 'boss' && source.variant === 'storm' && this._hazardHits(hazard, source)) {
          const recovery = source.recoveryTimer;
          source.recoveryTimer = 0;
          this._damageEnemy(source, 240);
          if (this.phase !== 'playing') break;
          source.recoveryTimer = Math.max(recovery, 1.8);
          source.windup = 0; source.chargeTimer = 0; source.attackKind = ''; source.attackName = ''; source.attackHint = '';
          this._emit('boss-backlash', source, { enemyId: source.id, radius: 120, color: source.color, damage: 240, message: '引雷反噬 · 弱点暴露 1.8 秒' });
        }
        this._emit('hazard-burst', hazard, { hazardType: hazard.type, radius: hazard.radius, innerRadius: hazard.innerRadius, angle: hazard.angle, length: hazard.length, owner: hazard.owner, color: hazard.color, effect: hazard.effect, conductionRelayId: hazard.conductionRelayId, capturedAtLock: hazard.capturedAtLock, backlashId: hazard.backlashId, ...(node ? { salvageNodeId: node.id, friendly: hazard.friendly } : {}) });
      }
      this.hazards = this.hazards.filter(hazard => hazard.remaining > 0);
    }

    _segmentHit(x, y, dx, dy, target, radius) {
      const ox = x - target.x, oy = y - target.y, limit = target.radius + radius;
      const outside = ox * ox + oy * oy - limit * limit;
      if (outside <= 0) return 0;
      const square = dx * dx + dy * dy;
      if (square === 0) return null;
      const along = ox * dx + oy * dy;
      if (along >= 0) return null;
      const discriminant = along * along - square * outside;
      if (discriminant < 0) return null;
      // Sort impacts at the first surface crossed, rather than the nearest center.
      const amount = outside / (-along + Math.sqrt(discriminant));
      return amount <= 1 ? amount : null;
    }

    _returnBlade(bullet, rebound = false) {
      if (bullet.baseDamage === undefined) bullet.baseDamage = bullet.damage;
      bullet.returning = true;
      bullet.rockRebounded = rebound;
      bullet.relaySteerTimer = 0;
      bullet.hitIds = [];
      bullet.damage = bullet.baseDamage * (bullet.relayCount ? 1.2 : 1) * bullet.returnMultiplier * (rebound ? 1.35 : 1);
      const angle = Math.atan2(this.player.y - bullet.y, this.player.x - bullet.x), speed = rebound ? 1050 : 860;
      bullet.vx = Math.cos(angle) * speed; bullet.vy = Math.sin(angle) * speed;
      if (rebound) this._emit('secret-trigger', bullet, { secretId: 'rebound', message: '借势回锋', color: '#ffda8f', radius: 36, angle });
    }

    _steerRelayBlade(bullet, dt) {
      if (!bullet.relayCount || bullet.returning || !(bullet.relaySteerTimer > 0)) return;
      const elapsed = Math.min(dt, bullet.relaySteerTimer), angle = Math.atan2(bullet.vy, bullet.vx);
      const difference = Math.atan2(Math.sin(this.player.angle - angle), Math.cos(this.player.angle - angle));
      const limit = Math.min(bullet.relaySteerRemaining, Math.PI / 4 / 0.18 * elapsed);
      const turn = clamp(difference, -limit, limit), speed = vectorLength(bullet.vx, bullet.vy);
      bullet.vx = Math.cos(angle + turn) * speed; bullet.vy = Math.sin(angle + turn) * speed;
      bullet.relaySteerRemaining = Math.max(0, bullet.relaySteerRemaining - Math.abs(turn));
      bullet.relaySteerTimer = Math.max(0, bullet.relaySteerTimer - elapsed);
    }

    _extendRailCorridor(bullet, x, y) {
      const corridor = this.railCorridor;
      if (!corridor || corridor.bulletId !== bullet.id) return;
      const dx = x - corridor.x, dy = y - corridor.y;
      let amount = Math.min(1, dx > 0 ? (this.world.width - corridor.x) / dx : dx < 0 ? -corridor.x / dx : Infinity,
        dy > 0 ? (this.world.height - corridor.y) / dy : dy < 0 ? -corridor.y / dy : Infinity);
      amount = Math.max(0, amount);
      corridor.endX = corridor.x + dx * amount; corridor.endY = corridor.y + dy * amount;
      const length = distance(corridor, { x: corridor.endX, y: corridor.endY });
      if (length > 500) { corridor.x = corridor.endX - dx * amount / length * 500; corridor.y = corridor.endY - dy * amount / length * 500; }
    }

    _updateBullets(dt, dashWindow = Math.min(dt, this.player.dashTimer)) {
      for (const bullet of this.bullets) {
        if (this.phase !== 'playing') break;
        if (bullet.lifetime <= 0) {
          if (bullet.kind === 'grenade') this._burstGrenade(bullet);
          if (bullet.kind === 'starline') this._placeStarPin(bullet, bullet.x, bullet.y);
          continue;
        }
        let remaining = dt;
        while (remaining > 0 && bullet.lifetime > 0 && this.phase === 'playing') {
          const blade = bullet.kind === 'boomerang';
          if (blade && !bullet.returning && bullet.age >= bullet.returnAfter) this._returnBlade(bullet);
          let travelTime = Math.min(remaining, bullet.lifetime);
          let boundaryReached = false;
          if (bullet.kind === 'starline') {
            const boundaryTime = Math.max(0, Math.min(bullet.vx > 0 ? (this.world.width - bullet.x) / bullet.vx : bullet.vx < 0 ? -bullet.x / bullet.vx : Infinity,
              bullet.vy > 0 ? (this.world.height - bullet.y) / bullet.vy : bullet.vy < 0 ? -bullet.y / bullet.vy : Infinity));
            boundaryReached = boundaryTime <= travelTime;
            travelTime = Math.min(travelTime, boundaryTime);
          }
          if (blade && !bullet.returning) travelTime = Math.min(travelTime, bullet.returnAfter - bullet.age);
          if (blade && !bullet.returning && bullet.relaySteerTimer > 0) travelTime = Math.min(travelTime, bullet.relaySteerTimer);
          if (blade && bullet.returning) {
            const gap = distance(bullet, this.player), speed = bullet.rockRebounded ? 1050 : 860;
            bullet.vx = gap > 0 ? (this.player.x - bullet.x) / gap * speed : 0;
            bullet.vy = gap > 0 ? (this.player.y - bullet.y) / gap * speed : 0;
          }
          const dx = bullet.vx * travelTime, dy = bullet.vy * travelTime;
          const hits = [];
          if (!(blade && bullet.returning)) for (const rock of this.obstacles) {
            const t = this._segmentHit(bullet.x, bullet.y, dx, dy, rock, bullet.radius);
            if (t !== null) hits.push({ t, obstacle: true, target: rock });
          }
          if (bullet.owner === 'player') {
            if (this.battlefield) for (const field of [...this.battlefield.props, ...this.battlefield.mines]) {
              if (field.status !== 'idle' || field.hp <= 0 || bullet.hitIds.includes(field.id)) continue;
              const t = this._segmentHit(bullet.x, bullet.y, dx, dy, field, bullet.radius);
              if (t !== null) hits.push({ t, field: true, target: field });
            }
            if (this.salvage) for (const source of this.salvage.sources) {
              if (source.hp <= 0 || !['locked', 'flying'].includes(source.status) || bullet.hitIds.includes(source.id)) continue;
              const t = this._segmentHit(bullet.x, bullet.y, dx, dy, source, bullet.radius);
              if (t !== null) hits.push({ t, source: true, target: source });
            }
            if (this.salvage) for (const node of this.salvage.nodes) {
              if (node.status !== 'idle' || bullet.hitIds.includes(node.id)) continue;
              const t = this._segmentHit(bullet.x, bullet.y, dx, dy, node, bullet.radius);
              if (t !== null) hits.push({ t, node: true, target: node });
            }
            for (const enemy of this.enemies) {
              if (enemy.hp <= 0 || bullet.hitIds.includes(enemy.id)) continue;
              const t = this._segmentHit(bullet.x, bullet.y, dx, dy, enemy, bullet.radius);
              if (t !== null) hits.push({ t, target: enemy });
            }
            if (blade && bullet.returning) {
              const caught = this._segmentHit(bullet.x, bullet.y, dx, dy, this.player, bullet.radius);
              if (caught !== null) hits.push({ t: caught, caught: true });
            }
          } else {
            if (this.player.dashTimer > 0) {
              const capture = this._segmentHit(bullet.x, bullet.y, dx, dy, { ...this.player, radius: 0 }, 80);
              if (capture !== null) hits.push({ t: capture, capture: true });
            }
            const t = this._segmentHit(bullet.x, bullet.y, dx, dy, this.player, bullet.radius);
            if (t !== null) hits.push({ t, target: this.player });
          }
          hits.sort((a, b) => a.t - b.t);
          let redirected = false;
          for (const hit of hits) {
            if (this.phase !== 'playing') break;
            if (hit.obstacle && bullet.owner === 'player' && hit.target.fragile) this._damageCover(hit.target, bullet.damage);
            if (hit.node) {
              if (hit.target.status !== 'idle') continue;
              this._armSalvageNode(hit.target);
              bullet.hitIds.push(hit.target.id);
              continue;
            }
            if (hit.source) {
              if (hit.target.hp <= 0 || !['locked', 'flying'].includes(hit.target.status)) continue;
              const impact = { x: bullet.x + dx * hit.t, y: bullet.y + dy * hit.t };
              if (bullet.kind === 'grenade') { bullet.x = impact.x; bullet.y = impact.y; this._burstGrenade(bullet); break; }
              this._damageSalvageSource(hit.target, bullet.damage);
              if (bullet.kind === 'starline') this._placeStarPin(bullet, impact.x, impact.y);
              bullet.hitIds.push(hit.target.id);
              if (bullet.pierce > 0) { bullet.pierce--; continue; }
              bullet.lifetime = 0; break;
            }
            if (hit.field) {
              if (hit.target.status !== 'idle' || hit.target.hp <= 0) continue;
              const impact = { x: bullet.x + dx * hit.t, y: bullet.y + dy * hit.t };
              if (bullet.kind === 'grenade') {
                bullet.x = impact.x; bullet.y = impact.y; this._burstGrenade(bullet); break;
              }
              hit.target.hp = Math.max(0, hit.target.hp - bullet.damage);
              if (hit.target.hp === 0) this._armField(hit.target);
              this._emit('spark', impact, { color: '#ffc18a' });
              if (bullet.kind === 'starline') this._placeStarPin(bullet, impact.x, impact.y);
              bullet.hitIds.push(hit.target.id);
              if (bullet.pierce > 0) { bullet.pierce--; continue; }
              bullet.lifetime = 0; break;
            }
            if (hit.capture) {
              bullet.x += dx * hit.t; bullet.y += dy * hit.t;
              this._capturePhaseBullet(bullet);
              break;
            }
            if (hit.caught || (hit.obstacle && blade && !bullet.returning)) {
              const consumed = travelTime * hit.t;
              const caughtDuringDash = dashWindow > 0 && dt - remaining + consumed <= dashWindow;
              bullet.x += dx * hit.t; bullet.y += dy * hit.t;
              bullet.lifetime = Math.max(0, bullet.lifetime - consumed);
              this._steerRelayBlade(bullet, consumed);
              bullet.age += consumed; remaining = Math.max(0, remaining - consumed);
              if (hit.obstacle) this._returnBlade(bullet, true);
              else if (caughtDuringDash && (bullet.relayCount || 0) < 1) {
                const angle = this.player.angle, speed = WEAPONS[4].speed;
                if (bullet.baseDamage === undefined) bullet.baseDamage = bullet.damage / bullet.returnMultiplier;
                Object.assign(bullet, { relayCount: 1, returning: false, rockRebounded: false, reboundHit: false, hitIds: [], age: 0,
                  relaySteerTimer: 0.18, relaySteerRemaining: Math.PI / 4,
                  lifetime: WEAPONS[4].lifetime, damage: bullet.baseDamage * 1.2,
                  x: this.player.x + Math.cos(angle) * 22, y: this.player.y + Math.sin(angle) * 22,
                  vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
                this._discoverSecret('blade-relay', this.player);
                this._emit('secret-trigger', this.player, { secretId: 'blade-relay', message: '相位接力', color: '#c4b1ff', radius: 45, angle });
              } else {
                if (bullet.reboundHit && !bullet.relayCount && this.bladeRecoveryUsed < 2 && this.ammoByWeapon[4] < this._magSize(4)) {
                  this.ammoByWeapon[4] += 1; this.bladeRecoveryUsed += 1; this._syncWeapon();
                  this._emit('secret-recover', this.player, { secretId: 'rebound', ammo: 1, remaining: 2 - this.bladeRecoveryUsed, color: '#ffda8f' });
                }
                bullet.lifetime = 0;
              }
              redirected = true;
              break;
            }
            if (hit.obstacle) {
              const impact = { x: bullet.x + dx * hit.t, y: bullet.y + dy * hit.t };
              this._extendRailCorridor(bullet, impact.x, impact.y);
              if (bullet.evolutionId === 'piercer-mirror' && !bullet.ricocheted) {
                const nx = impact.x - hit.target.x, ny = impact.y - hit.target.y, length = vectorLength(nx, ny);
                const dot = length > 0 ? (bullet.vx * nx + bullet.vy * ny) / length : 0;
                if (dot < 0) {
                  const consumed = travelTime * hit.t;
                  bullet.vx -= 2 * dot * nx / length; bullet.vy -= 2 * dot * ny / length;
                  bullet.x = impact.x + nx / length * .05; bullet.y = impact.y + ny / length * .05;
                  bullet.lifetime = Math.max(0, bullet.lifetime - consumed);
                  remaining = Math.max(0, remaining - consumed);
                  bullet.ricocheted = true; bullet.damage *= .7;
                  bullet.originX = bullet.x; bullet.originY = bullet.y;
                  // The earlier corridor must end at the rock, not cut across the reflected path.
                  if (this.railCorridor?.bulletId === bullet.id) this.railCorridor.bulletId = null;
                  this._emit('evolution-trigger', impact, { evolutionId: bullet.evolutionId, stage: 'ricochet', angle: Math.atan2(bullet.vy, bullet.vx), radius: 30, color: bullet.color });
                  redirected = true;
                  break;
                }
              }
              bullet.lifetime = 0;
              if (bullet.kind === 'grenade') { bullet.x = impact.x; bullet.y = impact.y; this._burstGrenade(bullet); }
              else if (bullet.kind === 'starline') this._placeStarPin(bullet, impact.x, impact.y, hit.target.id);
              else this._emit('spark', impact, { color: bullet.color });
              break;
            }
            if (bullet.owner === 'player') {
              if (hit.target.hp <= 0 || bullet.hitIds.includes(hit.target.id)) continue;
              if (hit.target.phaseMarkTimer > 0) this._detonatePhase(hit.target);
              if (this.phase !== 'playing') break;
              if (bullet.kind === 'grenade') {
                bullet.x += dx * hit.t; bullet.y += dy * hit.t;
                this._burstGrenade(bullet);
                break;
              }
              if (hit.target.hp <= 0) continue;
              if (bullet.railResonanceEligible && !bullet.railResonating) {
                bullet.railHits = (bullet.railHits || 0) + 1;
                if (bullet.railHits === 3) {
                  bullet.railResonating = true; bullet.damage *= 1.25; bullet.pierce += 2;
                  this.railCorridor = { bulletId: bullet.id, x: bullet.originX, y: bullet.originY,
                    endX: bullet.originX, endY: bullet.originY, width: 36, remaining: 0.8 };
                  this._discoverSecret('rail-resonance', hit.target);
                  this._emit('secret-trigger', hit.target, { secretId: 'rail-resonance', message: '贯穿超频', color: '#d4b1ff', radius: 70, angle: Math.atan2(bullet.vy, bullet.vx) });
                }
              }
              this._extendRailCorridor(bullet, bullet.x + dx * hit.t, bullet.y + dy * hit.t);
              if (blade && bullet.returning && bullet.rockRebounded) { bullet.reboundHit = true; this._discoverSecret('rebound', hit.target); }
              this._interruptAwakening(bullet, hit.target);
              this._damageEnemy(hit.target, this._fieldDamage(hit.target, bullet), bullet.critical);
              if (this.phase !== 'playing') break;
              this._applySalvageRefitHit(bullet, hit.target);
              if (this.phase !== 'playing') break;
              if (bullet.kind === 'starline') this._placeStarPin(bullet, bullet.x + dx * hit.t, bullet.y + dy * hit.t);
              this._applyAmmoEffect(bullet, hit.target);
              bullet.hitIds.push(hit.target.id);
              if (bullet.pierce > 0) bullet.pierce -= 1;
              else { bullet.lifetime = 0; break; }
            } else { this._damagePlayer(bullet.damage, bullet.damageSource); bullet.lifetime = 0; break; }
          }
          if (this.phase !== 'playing' || bullet.lifetime <= 0) break;
          if (redirected) continue;
          bullet.x += dx; bullet.y += dy;
          this._extendRailCorridor(bullet, bullet.x, bullet.y);
          this._steerRelayBlade(bullet, travelTime);
          bullet.lifetime = Math.max(0, bullet.lifetime - travelTime);
          if (bullet.kind) bullet.age += travelTime;
          remaining = Math.max(0, remaining - travelTime);
          if (bullet.kind === 'starline' && (bullet.lifetime === 0 || boundaryReached)) {
            bullet.lifetime = 0; this._placeStarPin(bullet, bullet.x, bullet.y);
          }
          if (bullet.x < 0 || bullet.y < 0 || bullet.x > this.world.width || bullet.y > this.world.height) { bullet.lifetime = 0; break; }
          if (bullet.lifetime === 0 && bullet.kind === 'grenade') this._burstGrenade(bullet);
        }
      }
      this.bullets = this.bullets.filter(bullet => bullet.lifetime > 0);
    }

    _burstGrenade(bullet) {
      if (bullet.exploded || this.phase !== 'playing') return;
      const blockers = this.salvage || this.siege ? [...this.obstacles] : [];
      bullet.exploded = true;
      bullet.lifetime = 0;
      this._emit('grenade-burst', bullet, { radius: bullet.blastRadius, color: bullet.color });
      if (this.battlefield) {
        for (const field of [...this.battlefield.props, ...this.battlefield.mines]) {
          if (field.status !== 'idle' || distance(bullet, field) > bullet.blastRadius + field.radius) continue;
          field.hp = Math.max(0, field.hp - bullet.damage);
          if (field.hp === 0) this._armField(field);
        }
        for (const rock of [...this.obstacles]) if (rock.fragile && distance(bullet, rock) <= bullet.blastRadius + rock.radius)
          this._damageCover(rock, bullet.damage);
      }
      if (this.salvage) for (const source of this.salvage.sources) {
        if (this.phase !== 'playing') break;
        if (source.hp > 0 && distance(bullet, source) <= bullet.blastRadius + source.radius &&
          !blockers.some(rock => this._segmentHit(bullet.x, bullet.y, source.x - bullet.x, source.y - bullet.y, rock, 0) !== null)) this._damageSalvageSource(source, bullet.damage);
      }
      if (this.salvage) for (const node of this.salvage.nodes) {
        if (node.status === 'idle' && distance(bullet, node) <= bullet.blastRadius + node.radius &&
          !blockers.some(rock => this._segmentHit(bullet.x, bullet.y, node.x - bullet.x, node.y - bullet.y, rock, 0) !== null)) this._armSalvageNode(node);
      }
      for (const enemy of this.enemies) {
        if (this.phase !== 'playing') break;
        if (enemy.hp > 0 && distance(bullet, enemy) <= bullet.blastRadius + enemy.radius &&
            (!this.siege || !blockers.some(rock => this._segmentHit(bullet.x, bullet.y, enemy.x - bullet.x, enemy.y - bullet.y, rock, 0) !== null))) {
          this._siegeHeavyHit(enemy, bullet);
          this._interruptAwakening(bullet, enemy);
          this._damageEnemy(enemy, bullet.damage, bullet.critical);
          if (this.phase === 'playing') this._applySalvageRefitHit(bullet, enemy);
        }
      }
      if (this.phase === 'playing' && bullet.evolutionId === 'grenade-echo' && this.evolutionState.echoes.length < 8) {
        const echo = { x: bullet.x, y: bullet.y, radius: 110, damage: bullet.damage * .45, critical: bullet.critical,
          remaining: .55, duration: .55, color: bullet.color, evolutionId: bullet.evolutionId };
        this.evolutionState.echoes.push(echo);
        this._emit('evolution-trigger', echo, { evolutionId: bullet.evolutionId, stage: 'echo-armed', radius: echo.radius, duration: echo.duration, color: echo.color });
      }
    }

    _applyAmmoEffect(bullet, target) {
      if (bullet.arc) {
        bullet.arc = false;
        const chain = bullet.evolutionId === 'assault-chain', visited = new Set([target.id]);
        let origin = target;
        for (const [jump, multiplier] of (chain ? [.45, .32, .24] : [.45]).entries()) {
          if (this.phase !== 'playing') break;
          const nearby = this.enemies.filter(enemy => !visited.has(enemy.id) && enemy.hp > 0 && distance(enemy, origin) <= 160 && (!chain || !this.obstacles.some(rock => this._segmentHit(origin.x, origin.y, enemy.x - origin.x, enemy.y - origin.y, rock, 0) !== null))).sort((a, b) => distance(a, origin) - distance(b, origin))[0];
          if (!nearby) break;
          this._emit('arc', origin, { toX: nearby.x, toY: nearby.y, color: '#a4ffed', evolutionId: chain ? bullet.evolutionId : '', jump: jump + 1 });
          this._damageEnemy(nearby, bullet.damage * multiplier);
          visited.add(nearby.id); origin = nearby;
        }
      }
      if (bullet.shatter) {
        bullet.shatter = false;
        for (const enemy of this.enemies) {
          if (enemy.id !== target.id && enemy.hp > 0 && distance(enemy, target) <= 92 + enemy.radius * 0.3) this._damageEnemy(enemy, bullet.damage * 0.35);
        }
        this._emit('explosion', target, { radius: 92, owner: 'player', color: '#b3a5ff' });
      }
      if (bullet.repulsor && target.hp > 0 && target.type !== 'boss' && target.type !== 'nest' && target.type !== 'reactor' && target.type !== 'anchor') {
        const speed = vectorLength(bullet.vx, bullet.vy);
        if (target.type === 'tank') {
          if (target.windup <= 0) this._move(target, bullet.vx / speed * 3, bullet.vy / speed * 3);
        } else {
          target.windup = 0;
          target.chargeTimer = 0;
          target.attackTimer = Math.max(target.attackTimer, 0.8);
          target.knockbackX = bullet.vx / speed * 280;
          target.knockbackY = bullet.vy / speed * 280;
          target.knockbackTimer = 0.16;
          this.hazards = this.hazards.filter(hazard => hazard.sourceId !== target.id);
        }
      }
    }

    _applySalvageRefitHit(bullet, target) {
      const shot = bullet.refitShot;
      if (!shot || shot.triggered || this.phase !== 'playing' || !this.salvage) return;
      shot.triggered = true;
      if (shot.modId === 'frost') {
        for (const enemy of this.enemies) {
          if (enemy.hp <= 0 || ['boss', 'reactor', 'anchor', 'nest'].includes(enemy.type) || distance(target, enemy) > 85 + enemy.radius ||
            this.obstacles.some(rock => this._segmentHit(target.x, target.y, enemy.x - target.x, enemy.y - target.y, rock, 0) !== null)) continue;
          enemy.starSlowTimer = Math.max(enemy.starSlowTimer || 0, 1.4);
        }
        this._emit('salvage-refit-hit', target, { modId: shot.modId, shotId: shot.id, targetId: target.id, radius: 85, color: '#a8ddf4' });
      } else if (shot.modId === 'arc') {
        const visited = new Set([target.id]);
        const damage = (bullet.baseDamage ?? bullet.damage) / (bullet.critical ? 2 : 1);
        let origin = target;
        for (const [jump, multiplier] of [.35, .2].entries()) {
          const enemy = this.enemies.filter(item => item.hp > 0 && !visited.has(item.id) && distance(origin, item) <= 150 &&
            !this.obstacles.some(rock => this._segmentHit(origin.x, origin.y, item.x - origin.x, item.y - origin.y, rock, 0) !== null))
            .sort((a, b) => distance(origin, a) - distance(origin, b))[0];
          if (!enemy || this.phase !== 'playing') break;
          visited.add(enemy.id);
          this._emit('salvage-refit-hit', origin, { modId: shot.modId, shotId: shot.id, targetId: enemy.id, toX: enemy.x, toY: enemy.y, jump: jump + 1, color: '#c6bcff' });
          this._damageEnemy(enemy, damage * multiplier);
          origin = enemy;
        }
      }
    }

    _damageEnemy(enemy, amount, critical = false) {
      if (this.phase !== 'playing' || enemy.hp <= 0) return;
      if (enemy.salvageHunt && amount > 0) this._alertSalvageHunt(enemy);
      if (this.siege && enemy.id === this.siege.bossId && enemy.shielded) amount *= .45;
      const weakpoint = enemy.recoveryTimer > 0 && (enemy.type === 'tank' || enemy.type === 'boss') || enemy.type === 'breacher' && enemy.stunTimer > 0;
      if (enemy.type === 'boss' && enemy.variant === 'nexus' && enemy.shielded) amount *= .35;
      if (enemy.type === 'tank') amount *= weakpoint ? 1.5 : 0.8;
      else if (enemy.type === 'boss' && weakpoint) amount *= 1.15;
      else if (enemy.type === 'breacher' && weakpoint) amount *= 1.35;
      enemy.hp -= amount;
      enemy.hitFlash = 0.08;
      this._emit('hit', enemy, { enemyId: enemy.id, targetId: enemy.id, amount: Math.round(amount), critical, weakpoint, color: critical ? '#ffe098' : weakpoint ? '#8cdcff' : '#dcfff7' });
      if (this.siege && enemy.id === this.siege.bossId) this._checkSiegePhase(enemy);
      if (enemy.hp > 0) return;
      if (enemy.salvageHunt) {
        const hunt = this.salvage.hunt;
        hunt.status = 'defeated'; Object.assign(hunt.drop, { status: 'open', x: enemy.x, y: enemy.y });
        if (this.salvage.selectedId === enemy.id) this.salvage.selectedId = hunt.drop.id;
        this._emit('salvage-hunt-defeated', enemy, { enemyId: enemy.id, dropId: hunt.drop.id, modId: hunt.modId, value: hunt.drop.value, color: this.map.color });
      }
      if (this.siege && enemy.siegePart) this._siegePartKilled(enemy);
      if (this.voyage) this._voyageKill(enemy);
      this.kills += 1;
      this._chargeReactor(8);
      this.combo.count += 1;
      this.combo.timer = 4;
      this.combo.best = Math.max(this.combo.best, this.combo.count);
      this.score += Math.min(50, (this.combo.count - 1) * 2);
      this._emit('combo', enemy, { count: this.combo.count });
      if (enemy.contractId) {
        const contract = this.contracts.find(item => item.id === enemy.contractId && item.status === 'active');
        if (contract) this._advanceContract(contract);
      }
      if (enemy.encounterId) {
        const encounter = this.encounters.find(item => item.id === enemy.encounterId && item.kind === 'hunt' && item.status === 'active');
        if (encounter) {
          encounter.progress++;
          this._emit('encounter-progress', encounter, { encounterId: encounter.id, kind: encounter.kind, message: encounter.name + ' · ' + encounter.progress + '/' + encounter.goal });
          if (encounter.progress >= encounter.goal) this._readyEncounter(encounter);
        }
      }
      if (enemy.objectiveRelayId) this._completeRelay(this.relays.find(relay => relay.id === enemy.objectiveRelayId));
      this.hazards = this.hazards.filter(hazard => hazard.sourceId !== enemy.id);
      this.score += enemy.type === 'boss' ? 2500 : enemy.type === 'tank' ? 65 : 20;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.lifeOnKill);
      this._emit('kill', enemy, { enemyType: enemy.type, radius: enemy.radius, angle: enemy.angle });
      if (enemy.type === 'anchor') {
        this._emit('anchor-break', enemy, { enemyId: enemy.id, bossId: enemy.anchorBossId, radius: 85, color: enemy.color });
        const boss = this.enemies.find(item => item.id === enemy.anchorBossId && item.hp > 0);
        if (boss && !this.enemies.some(item => item.type === 'anchor' && item.anchorBossId === boss.id && item.hp > 0)) {
          Object.assign(boss, { shielded: false, recoveryTimer: 2, windup: 0, attackKind: '', attackName: '', attackHint: '', attackTimer: 2.5 });
          this.hazards = this.hazards.filter(hazard => hazard.sourceId !== boss.id);
          this._emit('nexus-shield-break', boss, { radius: 150, color: boss.color, message: '双锚已断 · 主宰护盾永久解除' });
        }
        this._objective();
        return;
      }
      if (enemy.type === 'boss' && !this.salvage) {
        if (this.siege) {
          this.siege.status = 'complete'; this.siege.selectedId = null;
          for (const part of this.siege.parts) part.hp = 0;
          this.enemies = []; this.bullets = []; this.echoBursts = [];
          this._emit('siege-complete', enemy, { seed: this.siege.seed, captures: this.siege.captures, shotsFired: this.siege.shotsFired, reflections: this.siege.reflections });
        }
        if (this.voyage) { this._finishVoyageRoom(true); return; }
        if (this.campaign) { this._finishCampaignStage(enemy); return; }
        this.phase = 'won';
        this._clearStarline(); this.delivery = null;
        this._clearBattlefield();
        this._clearSecretTechniques();
        this.evolutionState = { breachTimer: 0, echoes: [] };
        this.tactical = { decoy: null, mine: null, cooldown: 0 };
        if (this.trial) { this.trial.status = 'complete'; this.trial.completedWaves = 6; this.trial.remaining = 0; this._emit('trial-complete', enemy, { wave: 6, title: this.trial.title }); }
        this.hazards = [];
        this.player.slowTimer = 0;
        this.sectorThreat.active = false;
        this.bullets = this.bullets.filter(bullet => bullet.owner === 'player');
        this._objective();
        this._emit('win', enemy);
      } else {
        this._drop('xp', enemy.xp, enemy.x, enemy.y);
        if (this.random() < 0.34) this._drop('credits', enemy.type === 'tank' ? 8 : 3, enemy.x + 12, enemy.y);
        if (this.random() < 0.045) this._drop('heal', 16, enemy.x - 12, enemy.y);
      }
    }

    _damagePlayer(amount, source) {
      const player = this.player;
      if (this.phase !== 'playing' || player.invulnerable > 0) return false;
      const damage = Math.max(1, amount * (1 - player.resistance));
      const healthBefore = player.hp;
      player.hp = Math.max(0, player.hp - damage);
      this.lastDamage = {
        kind: source?.kind || 'unknown', name: source?.name || '未知伤害',
        hint: source?.hint || '保持移动，注意敌人的攻击预警，并留出冲刺的冷却时间。',
        healthLost: Math.round((healthBefore - player.hp) * 10) / 10, at: this.elapsed
      };
      player.invulnerable = 0.8;
      this._emit('damage', player, { amount: Math.round(damage) });
      if (player.hp <= 0) {
        this.phase = 'lost';
        if (this.siege) {
          this.siege.status = 'failed'; this.siege.selectedId = null;
          this.bullets = []; this.echoBursts = []; this.player.dashTimer = 0; this.reactor.timer = 0;
          this._emit('siege-failed', player, { seed: this.siege.seed });
        }
        if (this.salvage) {
          this._clearSalvageEffects();
          this.salvage.status = 'failed'; this.salvage.lostSamples = this.salvage.carried; this.salvage.carried = 0; this.salvage.pending = [];
          if (this.salvage.hotCargo.status === 'carried') { this.salvage.hotCargo.status = 'lost'; this.salvage.hotCargo.x = player.x; this.salvage.hotCargo.y = player.y; }
          this.bullets = []; this.pickups = []; this.echoBursts = [];
          this._clearAwakeningState(); this.dashMarkedIds.clear(); this.phaseDashRefund = 0; this.reactor.timer = 0; player.dashTimer = 0;
          this._emit('salvage-failed', player, { samples: this.salvage.lostSamples });
        }
        if (this.voyage) {
          this.voyage.status = 'failed'; this.voyage.routeChoices = []; this.voyage.deviceChoices = []; this.voyage.shopChoices = [];
          this._clearCampaignCombat(); this._clearVoyageEffects();
        }
        this._clearStarline(); this.delivery = null;
        this._clearBattlefield();
        if (this.campaign) {
          this.campaign.status = 'failed'; this.campaign.routeChoices = []; this.campaign.supplyChoices = [];
          this._clearCampaignCombat();
        }
        this._clearSecretTechniques();
        this.evolutionState = { breachTimer: 0, echoes: [] };
        this.tactical = { decoy: null, mine: null, cooldown: 0 };
        this.hazards = [];
        this.player.slowTimer = 0;
        this.sectorThreat.active = false;
        this._objective();
        this._emit('lose', player);
      }
      return true;
    }

    _drop(type, value, x, y) {
      this.pickups.push({ id: this._id(), type, value, x, y, radius: type === 'xp' ? 5 : 8, lifetime: 100 });
      if (this.pickups.length > 240) {
        const first = this.pickups.shift();
        const same = this.pickups.find(pickup => pickup.type === first.type);
        if (same) same.value += first.value;
      }
    }

    _updatePickups(dt) {
      const player = this.player;
      for (const pickup of this.pickups) {
        pickup.lifetime -= dt;
        const dx = player.x - pickup.x, dy = player.y - pickup.y, length = vectorLength(dx, dy);
        if (length < player.magnetRadius + pickup.radius && length > player.radius) {
          const step = Math.min(length, (320 + (player.magnetRadius - length) * 4) * dt);
          pickup.x += dx / length * step; pickup.y += dy / length * step;
        }
        if (distance(pickup, player) > player.radius + pickup.radius + 3) continue;
        pickup.lifetime = 0;
        if (pickup.type === 'xp') player.xp += pickup.value;
        else if (pickup.type === 'credits') player.credits += pickup.value;
        else player.hp = Math.min(player.maxHp, player.hp + pickup.value);
        this._emit('pickup', pickup, { kind: pickup.type, amount: pickup.value });
      }
      this.pickups = this.pickups.filter(pickup => pickup.lifetime > 0);
      if (this.phase === 'playing' && player.xp >= player.xpNeeded) this._levelUp();
    }

    _levelUp() {
      const player = this.player;
      player.xp -= player.xpNeeded;
      player.level += 1;
      player.xpNeeded = Math.round(32 + Math.pow(player.level - 1, 1.28) * 19);
      const evolutions = this.evolutionId ? [] : EVOLUTIONS.filter(upgrade => player.level >= upgrade.minLevel && this.upgradeStacks[upgrade.prerequisite] > 0);
      const available = UPGRADES.filter(upgrade => (this.upgradeStacks[upgrade.id] || 0) < upgrade.maxStacks);
      const shuffled = available.map(upgrade => ({ upgrade, value: this.random() })).sort((a, b) => a.value - b.value);
      const earlyMod = player.level <= 4 && (available.find(upgrade => upgrade.weapon === player.weapon) || available.find(upgrade => upgrade.weapon !== undefined));
      const featured = evolutions.find(upgrade => upgrade.weapon === player.weapon) || evolutions[0] || earlyMod;
      const selected = featured ? [featured, ...shuffled.map(item => item.upgrade).filter(upgrade => upgrade.id !== featured.id).slice(0, 2)] : shuffled.slice(0, 3).map(item => item.upgrade);
      this.upgradeChoices = selected.map(upgrade => ({ ...upgrade, stacks: this.upgradeStacks[upgrade.id] || 0 }));
      if (!this.upgradeChoices.length) { player.hp = player.maxHp; return; }
      this.phase = 'upgrade';
      this._emit('level-up', player, { level: player.level });
    }

    chooseUpgrade(id) {
      if (this.phase !== 'upgrade' || !this.upgradeChoices.some(upgrade => upgrade.id === id)) return false;
      const player = this.player;
      const evolution = EVOLUTIONS.find(upgrade => upgrade.id === id);
      if (evolution && (this.evolutionId || player.level < evolution.minLevel || !this.upgradeStacks[evolution.prerequisite])) return false;
      this.upgradeStacks[id] = (this.upgradeStacks[id] || 0) + 1;
      if (evolution) this.evolutionId = evolution.id;
      if (id === 'damage') player.damageMultiplier += 0.18;
      if (id === 'rapid') player.fireRateMultiplier += 0.14;
      if (id === 'health') { player.maxHp += 25; player.hp = Math.min(player.maxHp, player.hp + 35); }
      if (id === 'speed') player.speed *= 1.1;
      if (id === 'magnet') { player.magnetRadius += 70; player.credits += 12; }
      if (id === 'dash') { player.dashCooldownMax *= 0.78; player.dashMultiplier *= 1.1; }
      if (id === 'pulse') { player.skillDamage += 40; player.skillRadius += 30; player.skillCooldownMax *= 0.88; }
      if (id === 'reload') player.reloadMultiplier *= 0.78;
      if (id === 'crit') player.critChance += 0.12;
      if (id === 'vampire') player.lifeOnKill += 1;
      if (id === 'shield') { player.resistance += 0.12; player.hp = Math.min(player.maxHp, player.hp + 20); }
      if (id === 'capacity') player.magazineMultiplier += 0.25;
      if (id === 'arc') player.arcRounds = true;
      if (id === 'repulsor') player.repulsorRounds = true;
      if (id === 'shatter') player.shatterRounds = true;
      if (id === 'blast-radius') player.blastRadius = true;
      if (id === 'return-edge') player.returnEdge = true;
      if (id === 'star-capacitor') player.starCapacitor = true;
      if (id === 'reload' || id === 'capacity') {
        this._refillWeapons();
      }
      this.upgradeChoices = [];
      this.phase = 'playing';
      player.invulnerable = Math.max(player.invulnerable, 0.65);
      this._syncWeapon();
      this._emit('upgrade', player, { upgrade: id });
      if (evolution) this._emit('weapon-evolved', player, { evolutionId: evolution.id, weapon: evolution.weapon, color: evolution.color, message: evolution.title + ' · 武器进化完成' });
      if (player.xp >= player.xpNeeded) this._levelUp();
      return true;
    }
  }

  return { Game, WEAPONS, UPGRADES, EVOLUTIONS, ENEMIES, RELICS, TACTICS, MAPS, SECRETS, TRIAL_WAVES, CAMPAIGN_DOCTRINES, CAMPAIGN_AWAKENINGS, CAMPAIGN_CRISES, CAMPAIGN_SUPPLIES, CAMPAIGN_NEXUS,
    VOYAGE_DEVICES, VOYAGE_RESONANCES, VOYAGE_DIFFICULTIES, VOYAGE_ROOMS, VOYAGE_BIOMES, BATTLEFIELD_GUIDE, SALVAGE_DIFFICULTIES, SALVAGE_LOADOUTS, SALVAGE_MAP, SALVAGE_SECTORS, SALVAGE_MODS, SIEGE_DIFFICULTIES, SIEGE_MAP };
});
