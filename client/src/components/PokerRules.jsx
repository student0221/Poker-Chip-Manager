import { useState } from 'react';
import Card from './Card';

const HAND_RANKS = [
  { name: '皇家同花顺', emoji: '🃏🃏🃏🃏🃏', desc: '同一花色的 10-J-Q-K-A', prob: '1 / 649,740', rarity: 0.000154 },
  { name: '同花顺', emoji: '🂡🂢🂣🂤🂥', desc: '同一花色且连续的5张牌', prob: '1 / 72,193', rarity: 0.00139 },
  { name: '四条', emoji: '🂡🂱🃁🃑⭐', desc: '四张同点数的牌', prob: '1 / 4,165', rarity: 0.0240 },
  { name: '葫芦', emoji: '🂡🂱🃁⭐⭐', desc: '三条 + 一对', prob: '1 / 694', rarity: 0.144 },
  { name: '同花', emoji: '♠♠♠♠♠', desc: '同一花色的任意5张牌', prob: '1 / 505', rarity: 0.197 },
  { name: '顺子', emoji: 'A-2-3-4-5', desc: '点数连续的5张牌（不同花色）', prob: '1 / 255', rarity: 0.392 },
  { name: '三条', emoji: '🂡🂱🃁⭐⭐', desc: '三张同点数的牌', prob: '1 / 47', rarity: 2.11 },
  { name: '两对', emoji: '🂡🂱⭐⭐⭐', desc: '两个不同的对子', prob: '1 / 21', rarity: 4.75 },
  { name: '一对', emoji: '🂡🂱⭐⭐⭐', desc: '两张同点数的牌', prob: '1 / 2.36', rarity: 42.3 },
  { name: '高牌', emoji: 'A⭐⭐⭐⭐', desc: '无法组成以上任何牌型', prob: '1 / 2', rarity: 50.1 },
];

const GAME_RULES = [
  '每局分为四轮下注：翻牌前 → 翻牌圈 → 转牌圈 → 河牌圈',
  '每位玩家会获得2张底牌（只有自己可见）',
  '公共牌依次发出：3张（翻牌）→ 1张（转牌）→ 1张（河牌）',
  '每轮到你时可以选择：跟注、加注、或弃牌',
  '最终剩余未弃牌的玩家比大小，牌型大者赢得底池',
  '若公共牌组合出最大牌型，可能多人平分底池',
];

export default function PokerRules() {
  const [open, setOpen] = useState(false);

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">📖</span>
          <div className="text-left">
            <h3 className="font-bold text-slate-700">游戏规则 & 牌型胜率</h3>
            <p className="text-xs text-slate-400">点击查看德州扑克基本规则和牌型大小</p>
          </div>
        </div>
        <span className={`text-slate-400 text-lg transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-slate-100">
          {/* 游戏规则 */}
          <div className="mt-4">
            <h4 className="text-sm font-bold text-slate-600 mb-2 flex items-center gap-2">
              <span>🎮</span> 基本规则
            </h4>
            <ul className="space-y-1.5">
              {GAME_RULES.map((rule, i) => (
                <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5">•</span>
                  {rule}
                </li>
              ))}
            </ul>
          </div>

          {/* 牌型胜率表 */}
          <div className="mt-5">
            <h4 className="text-sm font-bold text-slate-600 mb-3 flex items-center gap-2">
              <span>🏆</span> 牌型大小 & 出现概率（7张牌中选5张）
            </h4>
            <div className="space-y-2">
              {HAND_RANKS.map((hand, i) => (
                <div
                  key={hand.name}
                  className={`flex items-center gap-3 p-2.5 rounded-lg text-sm ${
                    i < 3 ? 'bg-amber-50 border border-amber-100' : 'bg-slate-50'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    i === 0 ? 'bg-amber-400 text-white' :
                    i === 1 ? 'bg-slate-400 text-white' :
                    i === 2 ? 'bg-orange-400 text-white' :
                    'bg-slate-200 text-slate-500'
                  }`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-700">{hand.name}</div>
                    <div className="text-xs text-slate-400">{hand.desc}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs font-medium text-slate-500">{hand.prob}</div>
                    <div className="w-20 h-1.5 bg-slate-200 rounded-full mt-1 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          i < 3 ? 'bg-amber-400' : 'bg-blue-400'
                        }`}
                        style={{ width: `${Math.min(hand.rarity * 2, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              * 概率为在7张牌（2张底牌 + 5张公共牌）中形成该牌型的近似概率
            </p>
          </div>

          {/* 小提示 */}
          <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
            <div className="text-sm font-medium text-blue-700 mb-1">💡 新手提示</div>
            <p className="text-xs text-blue-600">
              德州扑克中，你的手牌是 <strong>2张底牌 + 5张公共牌中任选3张</strong> 组合而成的最大5张牌。
              不要只看自己的底牌，要观察公共牌能组成什么牌型！
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
