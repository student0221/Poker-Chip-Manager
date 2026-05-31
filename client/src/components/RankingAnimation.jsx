import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Avatar from './Avatar';
import ProfitDisplay from './ProfitDisplay';
import { sanitizeText } from '../utils/safeRender';

export default function RankingAnimation({ rankings, onClose }) {
  const [revealedCount, setRevealedCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [showAgain, setShowAgain] = useState(false);
  const containerRef = useRef(null);

  const sorted = [...(rankings || [])].sort((a, b) => b.net_profit - a.net_profit);
  const total = sorted.length;

  // 倒序揭晓：从最后一名开始
  const revealed = sorted.slice(0, total - revealedCount).reverse();

  useEffect(() => {
    if (total === 0) return;
    setRevealedCount(0);
    setFinished(false);
    setShowAgain(false);

    const interval = setInterval(() => {
      setRevealedCount(prev => {
        if (prev >= total) {
          clearInterval(interval);
          setTimeout(() => setFinished(true), 800);
          return prev;
        }
        return prev + 1;
      });
    }, 600);

    return () => clearInterval(interval);
  }, [total, showAgain]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleReplay = (e) => {
    e.stopPropagation();
    setShowAgain(v => !v);
  };

  if (total === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* 顶部标题 */}
      <AnimatePresence>
        {finished && (
          <motion.div
            initial={{ opacity: 0, y: -30, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            className="mb-6 text-center"
          >
            <div className="text-4xl mb-2">🏆</div>
            <h2 className="text-3xl font-bold text-white">比赛结果揭晓</h2>
            <button
              onClick={handleReplay}
              className="mt-3 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-full text-sm transition-colors"
            >
              🎬 再看一次
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 排名列表 */}
      <div
        ref={containerRef}
        className="w-full max-w-md px-4 space-y-3 max-h-[70vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <AnimatePresence>
          {revealed.map((p, idx) => {
            const actualRank = sorted.findIndex(x => x.id === p.id) + 1;
            const isTop3 = actualRank <= 3;
            const glowColors = {
              1: 'shadow-[0_0_30px_rgba(234,179,8,0.5)] border-yellow-400/50',
              2: 'shadow-[0_0_25px_rgba(148,163,184,0.5)] border-slate-300/50',
              3: 'shadow-[0_0_25px_rgba(249,115,22,0.5)] border-orange-400/50',
            };

            return (
              <motion.div
                key={`${p.id}-${showAgain}`}
                initial={{ opacity: 0, y: 80, scale: 0.8 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  boxShadow: isTop3
                    ? [
                        '0 0 0px rgba(0,0,0,0)',
                        '0 0 30px rgba(0,0,0,0.2)',
                        '0 0 0px rgba(0,0,0,0)',
                      ]
                    : undefined,
                }}
                transition={{
                  type: 'spring',
                  stiffness: 300,
                  damping: 20,
                  delay: idx * 0.05,
                }}
                className={`flex items-center gap-4 p-4 rounded-2xl border ${
                  isTop3
                    ? `bg-gradient-to-r ${
                        actualRank === 1
                          ? 'from-yellow-900/80 to-amber-900/80'
                          : actualRank === 2
                          ? 'from-slate-800/80 to-gray-800/80'
                          : 'from-orange-900/80 to-amber-900/80'
                      } ${glowColors[actualRank] || ''}`
                    : 'bg-white/10 border-white/10'
                }`}
              >
                {/* 排名 */}
                <div className="flex-shrink-0 w-12 text-center">
                  {actualRank <= 3 ? (
                    <motion.div
                      animate={{ rotate: [0, -10, 10, -5, 5, 0] }}
                      transition={{ delay: 0.3, duration: 0.6 }}
                      className="text-3xl"
                    >
                      {actualRank === 1 ? '🥇' : actualRank === 2 ? '🥈' : '🥉'}
                    </motion.div>
                  ) : (
                    <span className="text-xl font-bold text-white/60">{actualRank}</span>
                  )}
                </div>

                {/* 头像 */}
                <div className="flex-shrink-0">
                  <Avatar
                    nickname={p.nickname}
                    src={p.avatar}
                    size={isTop3 ? 'xl' : 'lg'}
                  />
                </div>

                {/* 信息 */}
                <div className="flex-grow min-w-0">
                  <div className="font-bold text-white text-lg truncate">
                    {sanitizeText(p.nickname)}
                  </div>
                  <div className="text-sm text-white/60">
                    盈亏 <ProfitDisplay value={p.net_profit} className="text-sm" />
                  </div>
                </div>

                {/* 金额 */}
                <div className="text-right flex-shrink-0">
                  <div className="text-lg font-bold text-white">
                    <ProfitDisplay value={p.net_profit} />
                  </div>
                  <div className="text-xs text-white/40">元</div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* 提示文字 */}
      {!finished && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 text-white/40 text-sm"
        >
          按 ESC 或点击任意位置关闭
        </motion.div>
      )}
    </motion.div>
  );
}
