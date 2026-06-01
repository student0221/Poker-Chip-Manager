const SIZE_MAP = {
  xs: 'w-5 h-5 text-[9px]',
  sm: 'w-8 h-8 text-sm',
  md: 'w-10 h-10 text-base',
  lg: 'w-16 h-16 text-xl',
  xl: 'w-24 h-24 text-3xl',
};

// 根据昵称生成稳定的颜色
function getNicknameColor(nickname) {
  const colors = [
    'bg-red-100 text-red-600',
    'bg-orange-100 text-orange-600',
    'bg-amber-100 text-amber-600',
    'bg-green-100 text-green-600',
    'bg-emerald-100 text-emerald-600',
    'bg-teal-100 text-teal-600',
    'bg-cyan-100 text-cyan-600',
    'bg-sky-100 text-sky-600',
    'bg-blue-100 text-blue-600',
    'bg-indigo-100 text-indigo-600',
    'bg-violet-100 text-violet-600',
    'bg-purple-100 text-purple-600',
    'bg-fuchsia-100 text-fuchsia-600',
    'bg-pink-100 text-pink-600',
    'bg-rose-100 text-rose-600',
  ];
  let hash = 0;
  for (let i = 0; i < nickname.length; i++) {
    hash = nickname.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

export default function Avatar({ nickname, src, size = 'md', className = '' }) {
  const sizeClass = SIZE_MAP[size] || SIZE_MAP.md;
  const colorClass = getNicknameColor(nickname || '?');

  return (
    <div className="relative inline-block group">
      {src && (
        <img
          src={src}
          alt={nickname}
          className={`${sizeClass} rounded-full object-cover border border-slate-200 transition-transform duration-200 group-hover:scale-110 ${className}`}
          onError={(e) => {
            e.target.style.display = 'none';
            const fallback = e.target.nextElementSibling;
            if (fallback) fallback.style.display = 'flex';
          }}
        />
      )}
      <div
        className={`${sizeClass} ${colorClass} rounded-full items-center justify-center font-bold select-none transition-transform duration-200 group-hover:scale-110 ${className}`}
        style={{ display: src ? 'none' : 'flex' }}
      >
        {(nickname || '?').charAt(0).toUpperCase()}
      </div>
    </div>
  );
}
